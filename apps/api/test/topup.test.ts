import { MIN_TOPUP_RUB, TOPUP_AMOUNTS_RUB } from "@x10/config";
import { describe, expect, it } from "vitest";
import { MAX_TOPUP_RUB, checkTopupAmount } from "../src/lib/topup";

describe("сумма пополнения баланса", () => {
  it("все номиналы с кнопок проходят", () => {
    for (const amount of TOPUP_AMOUNTS_RUB) {
      expect(checkTopupAmount(amount)).toEqual({ ok: true, amountRub: amount });
    }
  });

  it("сумма вне номиналов тоже проходит: кнопки — подсказка, а не ограничение", () => {
    expect(checkTopupAmount(12345)).toEqual({ ok: true, amountRub: 12345 });
  });

  it("ниже минимума отбивается", () => {
    const r = checkTopupAmount(MIN_TOPUP_RUB - 1);
    expect(r.ok).toBe(false);
  });

  it("🔴 лишний ноль отбивается", () => {
    // Миллион вместо ста тысяч замечаешь уже после списания, и возвращать его
    // придётся через поддержку ЮKassa.
    const r = checkTopupAmount(MAX_TOPUP_RUB + 1);
    expect(r).toEqual({
      ok: false,
      error: `Больше ${MAX_TOPUP_RUB} ₽ за раз не принимаем — проверь, не лишний ли ноль.`,
    });
  });

  it("копейки не принимаем", () => {
    expect(checkTopupAmount(5000.5).ok).toBe(false);
  });

  it("мусор не принимаем", () => {
    expect(checkTopupAmount("много").ok).toBe(false);
    expect(checkTopupAmount(null).ok).toBe(false);
    expect(checkTopupAmount(Number.NaN).ok).toBe(false);
    expect(checkTopupAmount(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it("отрицательная сумма не принимается", () => {
    expect(checkTopupAmount(-10000).ok).toBe(false);
  });
});
