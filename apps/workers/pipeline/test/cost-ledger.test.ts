import type { Database } from "@x10/db";
import { describe, expect, it, vi } from "vitest";
import {
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

describe("recordRun", () => {
  it("пишет строку, numeric cost → строка с 6 знаками", async () => {
    let captured: Record<string, unknown> | undefined;
    const db = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          captured = v;
          return Promise.resolve();
        },
      }),
    } as unknown as Database;

    await recordRun(db, {
      articleId: "art-1",
      agent: "draft",
      status: "succeeded",
      costUsd: 0.45,
      modelUsed: "anthropic/claude-sonnet-4-6",
      inputTokens: 1200,
      outputTokens: 600,
    });

    expect(captured).toBeDefined();
    expect(captured!.agent).toBe("draft");
    expect(captured!.status).toBe("succeeded");
    expect(captured!.costUsd).toBe("0.450000");
    expect(captured!.inputTokens).toBe(1200);
    expect(captured!.cachedInputTokens).toBe(0); // дефолт
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
