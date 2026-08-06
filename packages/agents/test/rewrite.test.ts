import { describe, expect, it } from "vitest";
import { REWRITE_SYSTEM, rewriteInputSchema } from "../src/agents/rewrite";

/**
 * RewriteAgent (Спека 4, шаг 5). Проверяем не красоту промпта, а решения,
 * которые в нём закреплены: правка редактора НЕ отменяет канон издания.
 */

const BASE = { tease: "t", lede: "l", whyItMatters: "w", body: [] };

describe("правка не отменяет канон", () => {
  it("🔴 запрещает выдумывать цифры: «добавь цифру» не повод её сочинить", () => {
    expect(REWRITE_SYSTEM).toMatch(/НЕ выдумывай/);
    expect(REWRITE_SYSTEM).toMatch(/без источника/i);
  });

  it("🔴 несёт чёрный список ЦЕЛИКОМ, а не ссылку на него", () => {
    // Ссылка на канон в промпте бесполезна: модель не пойдёт её читать.
    expect(REWRITE_SYSTEM).toContain("революционный");
    expect(REWRITE_SYSTEM).toContain("магия нейросетей");
  });

  it("держит русский язык и запрет инфобиза", () => {
    expect(REWRITE_SYSTEM).toMatch(/Только русский/i);
    expect(REWRITE_SYSTEM).toMatch(/инфобиз/i);
  });

  it("🔴 требует сказать, что не выполнено, а не молчать", () => {
    expect(REWRITE_SYSTEM).toContain("refusedPart");
    expect(REWRITE_SYSTEM).toMatch(/Молча игнорировать/i);
  });

  it("велит менять только то, о чём просят", () => {
    expect(REWRITE_SYSTEM).toMatch(/не переписывай всё заново/i);
  });
});

describe("контракт агента", () => {
  it("🔴 правка ограничена по длине — простыню в промпт не пускаем", () => {
    expect(rewriteInputSchema.safeParse({ current: BASE, instruction: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("пустая правка не принимается: рерайт без инструкции бессмыслен", () => {
    expect(rewriteInputSchema.safeParse({ current: BASE, instruction: "" }).success).toBe(false);
  });

  it("обычная правка проходит", () => {
    expect(
      rewriteInputSchema.safeParse({ current: BASE, instruction: "короче, убери воду" }).success,
    ).toBe(true);
  });

  it("материал обязателен: рерайт «ничего» не имеет смысла", () => {
    expect(rewriteInputSchema.safeParse({ instruction: "короче" }).success).toBe(false);
  });
});
