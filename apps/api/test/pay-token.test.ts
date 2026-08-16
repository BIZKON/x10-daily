import { describe, expect, it } from "vitest";
import { PAY_TOKEN_LENGTH, generatePayToken, isPayToken } from "../src/lib/pay-token";

/**
 * Код ссылки на оплату живёт в чужой переписке и защищает заказ на 350 000 ₽:
 * страница публичная, входа по Telegram у клиента нет.
 */

describe("код ссылки на оплату", () => {
  it("одинаковой длины и из безопасных для адреса символов", () => {
    // 🔴 Кириллица и знаки вроде «+» превращаются в процентное кодирование, а
    // такую ссылку человек перешлёт клиенту как есть — и она сломается.
    for (let i = 0; i < 200; i++) {
      const t = generatePayToken();
      expect(t).toHaveLength(PAY_TOKEN_LENGTH);
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(t)).toBe(t);
    }
  });

  it("не повторяется", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generatePayToken()));
    expect(seen.size).toBe(2000);
  });

  it("проверка формата отсеивает мусор до похода в базу", () => {
    expect(isPayToken(generatePayToken())).toBe(true);
    expect(isPayToken("")).toBe(false);
    expect(isPayToken("короткий")).toBe(false);
    expect(isPayToken("../../etc/passwd")).toBe(false);
    expect(isPayToken("заказ1042заказ10")).toBe(false);
    expect(isPayToken("a".repeat(64))).toBe(false);
  });
});
