import { describe, expect, it } from "vitest";
import { buildCallbackData, parseCallbackData, reviewKeyboard } from "../src/lib/review-card";

/**
 * Карточка ревью (Спека 4). Формат кнопок пишет конвейер, а читает api —
 * приложения разные, поэтому совместимость держится тестами с обеих сторон.
 */

const CARD = "11111111-2222-3333-4444-555555555555";

describe("callback_data", () => {
  it("собирается и разбирается обратно", () => {
    for (const a of ["approve", "reject", "regenerate", "rewrite"] as const) {
      expect(parseCallbackData(buildCallbackData(a, CARD))).toEqual({
        action: a,
        cardId: CARD,
      });
    }
  });

  it("🔴 укладывается в лимит Telegram 64 байта", () => {
    for (const a of ["approve", "reject", "regenerate", "rewrite"] as const) {
      const bytes = new TextEncoder().encode(buildCallbackData(a, CARD)).length;
      expect(bytes).toBeLessThanOrEqual(64);
    }
  });

  it("ключом идёт карточка, а не статья: по ней видно, обработана ли она", () => {
    expect(buildCallbackData("approve", CARD)).toContain(CARD);
  });
});

describe("клавиатура", () => {
  it("четыре действия, все с одним id карточки", () => {
    const kb = reviewKeyboard(CARD);
    const all = kb.inline_keyboard.flat();
    expect(all).toHaveLength(4);
    for (const b of all) {
      expect(parseCallbackData(b.callback_data)?.cardId).toBe(CARD);
    }
  });

  it("подписи по-русски и говорят, что произойдёт", () => {
    const texts = reviewKeyboard(CARD)
      .inline_keyboard.flat()
      .map((b) => b.text);
    expect(texts.join(" ")).toMatch(/Одобрить/);
    expect(texts.join(" ")).toMatch(/картинк/i);
    expect(texts.join(" ")).toMatch(/Рерайт/);
  });
});
