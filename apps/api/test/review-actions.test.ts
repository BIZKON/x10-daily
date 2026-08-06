import { describe, expect, it } from "vitest";
import { decisionNote, parseCallbackData } from "../src/lib/review-actions";

/**
 * Кнопки карточки ревью (Спека 4).
 *
 * Формат `callback_data` пишет конвейер, читает api — это разные приложения.
 * Тесты фиксируют совместимость и, главное, что мусор из внешнего мира не
 * роняет обработчик: вебхук обязан вернуть 200, иначе Telegram повторит
 * апдейт и действие выполнится дважды.
 */

const CARD = "11111111-2222-3333-4444-555555555555";

describe("разбор нажатия", () => {
  it("узнаёт все четыре действия", () => {
    expect(parseCallbackData(`ap:${CARD}`)).toEqual({ action: "approve", cardId: CARD });
    expect(parseCallbackData(`rj:${CARD}`)).toEqual({ action: "reject", cardId: CARD });
    expect(parseCallbackData(`rg:${CARD}`)).toEqual({ action: "regenerate", cardId: CARD });
    expect(parseCallbackData(`rw:${CARD}`)).toEqual({ action: "rewrite", cardId: CARD });
  });

  it("🔴 мусор не роняет, а даёт null", () => {
    for (const bad of [
      undefined,
      "",
      ":",
      "ap:",
      ":" + CARD,
      "xx:" + CARD,
      "ap:не-uuid",
      "ap",
      "'; drop table articles; --",
    ]) {
      expect(parseCallbackData(bad)).toBeNull();
    }
  });

  it("🔴 id карточки обязан быть uuid — иначе он уйдёт в запрос как есть", () => {
    expect(parseCallbackData("ap:12345")).toBeNull();
    expect(parseCallbackData(`ap:${CARD.toUpperCase()}`)).not.toBeNull();
  });

  it("укладывается в лимит callback_data (64 байта)", () => {
    const data = `ap:${CARD}`;
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
  });
});

describe("подпись решения", () => {
  it("называет и действие, и человека", () => {
    const note = decisionNote("approve", "Константин");
    expect(note).toContain("Одобрено");
    expect(note).toContain("Константин");
  });

  it("🔴 экранирует имя: его задаёт пользователь Telegram, а не мы", () => {
    // parse_mode=HTML: ник вида <b>x</b> иначе сломал бы разметку сообщения,
    // а Telegram отбил бы весь вызов по «can't parse entities».
    const note = decisionNote("reject", "<b>злой</b>");
    expect(note).toContain("&lt;b&gt;");
    expect(note).not.toContain("<b>злой");
  });
});
