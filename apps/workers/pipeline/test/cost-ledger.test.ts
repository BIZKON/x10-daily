import type { Database } from "@x10/db";
import { describe, expect, it, vi } from "vitest";
import {
  claimAlert,
  getTodaySpendUsd,
  mskDayStartUtc,
  mskDayString,
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

describe("claimAlert (идемпотентность)", () => {
  function dbReturning(rows: Array<{ id: string }>) {
    return {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => rows }),
        }),
      }),
    } as unknown as Database;
  }

  it("вставка прошла (строка вернулась) → true", async () => {
    expect(await claimAlert(dbReturning([{ id: "x" }]), "2026-06-04", "warn", 9.5)).toBe(true);
  });

  it("конфликт (пусто) → false (уже заклеймлен сегодня)", async () => {
    expect(await claimAlert(dbReturning([]), "2026-06-04", "exhausted", 15)).toBe(false);
  });
});
