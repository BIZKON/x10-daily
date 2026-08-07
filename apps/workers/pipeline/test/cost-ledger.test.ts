import { CLIENT_PRICE_MULTIPLIER, usdToRub } from "@x10/config";
import { type Database, balanceEntries, clientBalance, pipelineRuns } from "@x10/db";
import { describe, expect, it, vi } from "vitest";
import {
  chargeForRun,
  claimAlert,
  getTodaySpendUsd,
  listPendingAlerts,
  markAlertDelivered,
  mskDayStartUtc,
  mskDayString,
  recordAlertAttempt,
  recordRun,
} from "../src/lib/cost-ledger";

/**
 * $-ledger автономного конвейера (session 20). Чистые функции (МСК-день) +
 * ledger-запросы через fake-db (без реального pg).
 */

describe("mskDayStartUtc / mskDayString (МСК = UTC+3)", () => {
  it("днём МСК → полночь того же дня МСК (21:00 UTC прошлого дня)", () => {
    const now = new Date("2026-06-04T10:00:00.000Z"); // 13:00 МСК 4 июня
    expect(mskDayStartUtc(now).toISOString()).toBe("2026-06-03T21:00:00.000Z");
    expect(mskDayString(now)).toBe("2026-06-04");
  });

  it("поздний вечер UTC, но уже следующий день МСК → откатывает к МСК-полуночи", () => {
    const now = new Date("2026-06-04T21:30:00.000Z"); // 00:30 МСК 5 июня
    expect(mskDayStartUtc(now).toISOString()).toBe("2026-06-04T21:00:00.000Z");
    expect(mskDayString(now)).toBe("2026-06-05");
  });

  it("ровно МСК-полночь стабильна", () => {
    const now = new Date("2026-06-03T21:00:00.000Z"); // 00:00 МСК 4 июня
    expect(mskDayStartUtc(now).toISOString()).toBe("2026-06-03T21:00:00.000Z");
    expect(mskDayString(now)).toBe("2026-06-04");
  });
});

describe("getTodaySpendUsd", () => {
  it("парсит numeric-строку из coalesce(sum)", async () => {
    const where = vi.fn(async () => [{ total: "3.456789" }]);
    const db = {
      select: () => ({ from: () => ({ where }) }),
    } as unknown as Database;
    expect(await getTodaySpendUsd(db, new Date("2026-06-04T10:00:00Z"))).toBeCloseTo(3.456789, 6);
    expect(where).toHaveBeenCalledOnce();
  });

  it("пустой день → 0", async () => {
    const db = {
      select: () => ({ from: () => ({ where: async () => [{ total: "0" }] }) }),
    } as unknown as Database;
    expect(await getTodaySpendUsd(db, new Date())).toBe(0);
  });
});

describe("chargeForRun (Спека 6, шаг 1)", () => {
  it("платные статусы → себестоимость × наценка", () => {
    // ×3 по CLIENT_PRICE_MULTIPLIER.
    expect(chargeForRun("succeeded", 12.3456)).toBeCloseTo(37.0368, 4);
    expect(chargeForRun("skipped", 0.5)).toBeCloseTo(1.5, 4);
    expect(chargeForRun("halted", 4)).toBeCloseTo(12, 4);
  });

  it("failed НЕ выставляется клиенту — это наша авария, не его расход", () => {
    expect(chargeForRun("failed", 12.3456)).toBeNull();
  });

  it("незавершённые прогоны не списываются", () => {
    expect(chargeForRun("queued", 5)).toBeNull();
    expect(chargeForRun("running", 5)).toBeNull();
  });

  it("бесплатный прогон не создаёт движение на 0 ₽", () => {
    expect(chargeForRun("succeeded", 0)).toBeNull();
  });
});

describe("recordRun", () => {
  type Call = { table: unknown; values: Record<string, unknown>; conflict?: unknown };
  type InsertNode = Promise<undefined> & {
    returning: () => Promise<Array<Record<string, unknown>>>;
    onConflictDoUpdate: (cfg: unknown) => InsertNode;
  };

  /**
   * Фейковая транзакция: повторяет ровно те цепочки drizzle, которые вызывает
   * recordRun — `.values().returning()`, `.values().onConflictDoUpdate().returning()`
   * и голый await на `.values()`.
   */
  function fakeDb(balanceAfter = "-37.0368") {
    const calls: Call[] = [];
    const tx = {
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          const call: Call = { table, values };
          calls.push(call);
          const rows = table === pipelineRuns ? [{ id: "run-1" }] : [{ after: balanceAfter }];
          // Настоящий промис с довешенными звеньями цепочки: recordRun то
          // ждёт результат напрямую, то дотягивается до .returning().
          const node: InsertNode = Object.assign(Promise.resolve(undefined), {
            returning: async () => rows,
            onConflictDoUpdate: (cfg: unknown) => {
              call.conflict = cfg;
              return node;
            },
          });
          return node;
        },
      }),
    };
    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    } as unknown as Database;
    return { db, calls, of: (t: unknown) => calls.find((c) => c.table === t) };
  }

  it("пишет строку прогона: numeric cost → строка с 6 знаками, рубли зафиксированы", async () => {
    const { db, of } = fakeDb();

    await recordRun(db, {
      articleId: "art-1",
      agent: "draft",
      status: "succeeded",
      costUsd: 0.45,
      modelUsed: "anthropic/claude-sonnet-4-6",
      inputTokens: 1200,
      outputTokens: 600,
    });

    const run = of(pipelineRuns)!.values;
    expect(run.agent).toBe("draft");
    expect(run.status).toBe("succeeded");
    expect(run.costUsd).toBe("0.450000");
    expect(run.inputTokens).toBe(1200);
    expect(run.cachedInputTokens).toBe(0); // дефолт
    expect(run.costRub).toBe(usdToRub(0.45).toFixed(4));
  });

  it("списывает с баланса и пишет движение, привязанное к прогону", async () => {
    const { db, of } = fakeDb("-37.0368");
    const costUsd = 0.45;

    await recordRun(db, { agent: "visual", status: "succeeded", costUsd });

    const expected = chargeForRun("succeeded", Number(usdToRub(costUsd).toFixed(4)))!;

    // Остаток двигается арифметикой в базе (upsert), а не чтением-в-код.
    const balance = of(clientBalance)!;
    expect(balance.conflict).toBeDefined();
    expect(balance.values.id).toBe(true);

    const entry = of(balanceEntries)!.values;
    expect(entry.kind).toBe("charge");
    expect(entry.amountRub).toBe((-expected).toFixed(4)); // списание — со знаком минус
    expect(entry.balanceAfterRub).toBe("-37.0368");
    expect(entry.runId).toBe("run-1"); // движение указывает на свою причину
  });

  it("списание = ровно себестоимость × наценка из той же строки", async () => {
    const { db, of } = fakeDb();
    await recordRun(db, { agent: "draft", status: "succeeded", costUsd: 0.45 });

    const costRub = Number(of(pipelineRuns)!.values.costRub);
    const charged = -Number(of(balanceEntries)!.values.amountRub);
    expect(charged).toBeCloseTo(costRub * CLIENT_PRICE_MULTIPLIER, 4);
  });

  it("failed: строка прогона есть, списания нет", async () => {
    const { db, of, calls } = fakeDb();

    await recordRun(db, { agent: "draft", status: "failed", costUsd: 0.45, error: "boom" });

    expect(of(pipelineRuns)).toBeDefined();
    expect(of(clientBalance)).toBeUndefined();
    expect(of(balanceEntries)).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("нулевая стоимость: ни списания, ни движения", async () => {
    const { db, calls } = fakeDb();
    await recordRun(db, { agent: "ingest", status: "skipped", costUsd: 0 });
    expect(calls).toHaveLength(1);
  });
});

describe("claimAlert (идемпотентность + message)", () => {
  function dbReturning(rows: Array<{ id: string }>) {
    let captured: Record<string, unknown> | undefined;
    const db = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          captured = v;
          return { onConflictDoNothing: () => ({ returning: async () => rows }) };
        },
      }),
    } as unknown as Database;
    return { db, captured: () => captured };
  }

  it("вставка прошла (строка вернулась) → id; message сохранён", async () => {
    const { db, captured } = dbReturning([{ id: "row-1" }]);
    expect(await claimAlert(db, "2026-06-04", "warn", 9.5, "⚠️ warn")).toBe("row-1");
    expect(captured()!.message).toBe("⚠️ warn");
    expect(captured()!.spendUsd).toBe("9.500000");
  });

  it("конфликт (пусто) → null (уже заклеймлен сегодня)", async () => {
    const { db } = dbReturning([]);
    expect(await claimAlert(db, "2026-06-04", "exhausted", 15, "🛑")).toBeNull();
  });
});

describe("markAlertDelivered / recordAlertAttempt", () => {
  function dbUpdate() {
    let captured: Record<string, unknown> | undefined;
    let whereCalled = false;
    const db = {
      update: () => ({
        set: (v: Record<string, unknown>) => {
          captured = v;
          return {
            where: async () => {
              whereCalled = true;
            },
          };
        },
      }),
    } as unknown as Database;
    return { db, captured: () => captured, whereCalled: () => whereCalled };
  }

  it("markAlertDelivered ставит deliveredAt (Date) с фильтром по id", async () => {
    const { db, captured, whereCalled } = dbUpdate();
    await markAlertDelivered(db, "row-1");
    expect(captured()!.deliveredAt).toBeInstanceOf(Date);
    expect(whereCalled()).toBe(true);
  });

  it("recordAlertAttempt инкрементит attempts и пишет lastError", async () => {
    const { db, captured } = dbUpdate();
    await recordAlertAttempt(db, "row-1", "ETIMEDOUT");
    // attempts — SQL-выражение (attempts + 1), не число.
    expect(captured()!.attempts).toBeDefined();
    expect(captured()!.lastError).toBe("ETIMEDOUT");
  });
});

describe("listPendingAlerts", () => {
  function dbSelect(rows: Array<{ id: string; message: string | null }>) {
    let limitArg: number | undefined;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async (n: number) => {
                limitArg = n;
                return rows;
              },
            }),
          }),
        }),
      }),
    } as unknown as Database;
    return { db, limitArg: () => limitArg };
  }

  it("возвращает строки с message; передаёт limit", async () => {
    const { db, limitArg } = dbSelect([
      { id: "a", message: "alert A" },
      { id: "b", message: "alert B" },
    ]);
    const pending = await listPendingAlerts(
      db,
      { maxAttempts: 12, windowMs: 1000, limit: 20 },
      new Date(),
    );
    expect(pending).toEqual([
      { id: "a", message: "alert A" },
      { id: "b", message: "alert B" },
    ]);
    expect(limitArg()).toBe(20);
  });

  it("отсеивает строки без message (тип-сужение)", async () => {
    const { db } = dbSelect([
      { id: "a", message: null },
      { id: "b", message: "ok" },
    ]);
    const pending = await listPendingAlerts(
      db,
      { maxAttempts: 12, windowMs: 1000, limit: 20 },
      new Date(),
    );
    expect(pending).toEqual([{ id: "b", message: "ok" }]);
  });
});
