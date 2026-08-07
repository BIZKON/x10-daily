import type { Env } from "@x10/config";
import type { Database } from "@x10/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Остановка по нулю и предупреждение о низком остатке (Спека 6, шаг 2).
 * Политика — чистой функцией; доставку алерта мокаем (её оркестрация проверена
 * в ops-alert.test.ts).
 */
type AlertParams = { day: string; kind: string; spendUsd: number; message: string };
const { deliverOpsAlert } = vi.hoisted(() => ({
  // Сигнатура важна: без неё mock.calls типизируется пустым кортежем и
  // проверить, ЧТО ушло в алерт, нельзя.
  deliverOpsAlert: vi.fn(async (_db: unknown, _env: unknown, _p: AlertParams) => ({
    claimed: true,
    delivered: true,
  })),
}));
vi.mock("../src/lib/ops-alert", () => ({ deliverOpsAlert }));

import {
  daysLeftPhrase,
  decideBillingState,
  emptyBalanceMessage,
  formatRub,
  guardBilling,
  lowBalanceMessage,
  readBillingState,
} from "../src/lib/billing-gate";

const env = {} as Env;

describe("decideBillingState — политика денег", () => {
  const base = { lowThresholdRub: 500, billingEnforced: true };

  it("остаток выше порога → работаем молча", () => {
    const s = decideBillingState({ ...base, balanceRub: 5000 });
    expect(s.blocked).toBe(false);
    expect(s.low).toBe(false);
  });

  it("остаток ниже порога, но положительный → предупреждаем, НЕ останавливаем", () => {
    const s = decideBillingState({ ...base, balanceRub: 412 });
    expect(s.blocked).toBe(false);
    expect(s.low).toBe(true);
  });

  it("ноль → останавливаем", () => {
    expect(decideBillingState({ ...base, balanceRub: 0 }).blocked).toBe(true);
  });

  it("минус → останавливаем", () => {
    expect(decideBillingState({ ...base, balanceRub: -120 }).blocked).toBe(true);
  });

  it("на нуле это уже не «заканчивается» — low не поднимается", () => {
    // Иначе клиент получил бы два разных предупреждения об одном событии.
    const s = decideBillingState({ ...base, balanceRub: 0 });
    expect(s.low).toBe(false);
  });

  it("🔴 контур выключен → ни остановки, ни предупреждений", () => {
    // Наша собственная копия: баланс всегда в минусе, потому что мы платим
    // шлюзу напрямую. Ежедневная ложная тревога отучает читать тревоги.
    const s = decideBillingState({ balanceRub: -9999, lowThresholdRub: 500, billingEnforced: false });
    expect(s.blocked).toBe(false);
    expect(s.low).toBe(false);
  });

  it("порог 0 → предупреждения нет, остановка на нуле остаётся", () => {
    const s = decideBillingState({ balanceRub: 10, lowThresholdRub: 0, billingEnforced: true });
    expect(s.low).toBe(false);
    expect(s.blocked).toBe(false);
  });
});

describe("readBillingState", () => {
  function fakeDb(rows: Array<Record<string, unknown>>) {
    return {
      select: () => ({ from: () => ({ limit: async () => rows }) }),
    } as unknown as Database;
  }

  it("numeric приходит строкой → парсится", async () => {
    const s = await readBillingState(
      fakeDb([{ balanceRub: "412.5000", lowThresholdRub: "500.0000", billingEnforced: true }]),
    );
    expect(s.balanceRub).toBeCloseTo(412.5, 4);
    expect(s.low).toBe(true);
  });

  it("🔴 строки баланса нет → контур выключен, работу не останавливаем", async () => {
    // Копия развёрнута до миграции. Неизвестное состояние — не повод глушить
    // чужой завод: цена ошибки в эту сторону несравнимо меньше.
    const s = await readBillingState(fakeDb([]));
    expect(s.billingEnforced).toBe(false);
    expect(s.blocked).toBe(false);
  });
});

describe("тексты для клиента", () => {
  it("рубли без копеечного хвоста", () => {
    expect(formatRub(412.4567)).toBe("412 ₽");
    expect(formatRub(5000)).toContain("5");
  });

  it("«на N дней» склоняется по-русски", () => {
    expect(daysLeftPhrase(100, 100)).toContain("1 день");
    expect(daysLeftPhrase(300, 100)).toContain("3 дня");
    expect(daysLeftPhrase(900, 100)).toContain("9 дней");
    expect(daysLeftPhrase(1100, 100)).toContain("11 дней");
  });

  it("нет данных о расходе → оценку не выдумываем", () => {
    expect(daysLeftPhrase(500, 0)).toBe("");
  });

  it("меньше суток — говорим прямо, а не «0 дней»", () => {
    expect(daysLeftPhrase(50, 100)).toContain("меньше суток");
  });

  it("предупреждение обещает, что одобренное выйдет", () => {
    const m = lowBalanceMessage(412, 45);
    expect(m).toContain("412 ₽");
    expect(m).toContain("Уже одобренное");
    expect(m).toContain("Расходы");
  });

  it("остановка объясняет, что именно встало", () => {
    const m = emptyBalanceMessage(0);
    expect(m).toContain("остановлена");
    expect(m).toContain("оплачено");
  });
});

describe("guardBilling", () => {
  beforeEach(() => vi.clearAllMocks());

  function fakeDb(row: Record<string, unknown> | null, charges = "0") {
    return {
      select: () => ({
        from: () => ({
          limit: async () => (row ? [row] : []),
          where: async () => [{ total: charges }],
        }),
      }),
    } as unknown as Database;
  }

  const now = new Date("2026-08-07T10:00:00Z");

  it("денег хватает → тишина, алерт не шлётся", async () => {
    const s = await guardBilling(
      fakeDb({ balanceRub: "5000", lowThresholdRub: "500", billingEnforced: true }),
      env,
      now,
    );
    expect(s.blocked).toBe(false);
    expect(deliverOpsAlert).not.toHaveBeenCalled();
  });

  it("низкий остаток → предупреждение вида balance_low", async () => {
    await guardBilling(
      fakeDb({ balanceRub: "412", lowThresholdRub: "500", billingEnforced: true }, "700"),
      env,
      now,
    );
    expect(deliverOpsAlert).toHaveBeenCalledOnce();
    const params = deliverOpsAlert.mock.calls[0]![2];
    expect(params.kind).toBe("balance_low");
    // День МСК: 10:00 UTC = 13:00 МСК того же дня.
    expect(params.day).toBe("2026-08-07");
  });

  it("ноль → остановка + алерт balance_empty", async () => {
    const s = await guardBilling(
      fakeDb({ balanceRub: "0", lowThresholdRub: "500", billingEnforced: true }),
      env,
      now,
    );
    expect(s.blocked).toBe(true);
    const params = deliverOpsAlert.mock.calls[0]![2];
    expect(params.kind).toBe("balance_empty");
  });

  it("🔴 сбой чтения баланса НЕ останавливает конвейер", async () => {
    // Денежный контур не должен становиться новой причиной падения завода.
    const broken = {
      select: () => ({
        from: () => ({
          limit: async () => {
            throw new Error("база недоступна");
          },
        }),
      }),
    } as unknown as Database;
    const s = await guardBilling(broken, env, now);
    expect(s.blocked).toBe(false);
  });

  it("🔴 сбой доставки предупреждения НЕ отменяет остановку", async () => {
    // Остановка — это про деньги, а не про то, дошло ли сообщение.
    deliverOpsAlert.mockRejectedValueOnce(new Error("telegram лежит"));
    const s = await guardBilling(
      fakeDb({ balanceRub: "-5", lowThresholdRub: "500", billingEnforced: true }),
      env,
      now,
    );
    expect(s.blocked).toBe(true);
  });
});
