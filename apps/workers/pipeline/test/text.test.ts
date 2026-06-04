import { describe, expect, it } from "vitest";
import { normalizeNewlines } from "../src/lib/text";

/**
 * Фикс артефакта LLM: литеральные "\n" (бэкслеш+n) вместо переносов строк →
 * пост в TG слипается. normalizeNewlines гарантирует настоящие переносы.
 */
describe("normalizeNewlines", () => {
  it("литеральный \\n → настоящий перенос строки", () => {
    // В JS-исходнике "a\\nb" — это 3 символа: a, \, n, b → именно артефакт.
    expect(normalizeNewlines("a\\nb")).toBe("a\nb");
  });

  it("литеральные \\n\\n (абзацы) → пустая строка между абзацами", () => {
    const artifact = "Первый абзац.\\n\\nВторой абзац.";
    expect(normalizeNewlines(artifact)).toBe("Первый абзац.\n\nВторой абзац.");
  });

  it("точный кейс из скриншота (Binance-пост) разбивается на абзацы", () => {
    const post =
      "После 2022 года предприниматели отрезаны.\\nBinance готовит торговлю (РБК).\\n\\nЧитать на x10daily.";
    expect(normalizeNewlines(post)).toBe(
      "После 2022 года предприниматели отрезаны.\nBinance готовит торговлю (РБК).\n\nЧитать на x10daily.",
    );
    expect(normalizeNewlines(post)).not.toContain("\\n");
  });

  it("уже чистый текст с настоящими переносами не меняется (идемпотентность)", () => {
    const clean = "Абзац один.\n\nАбзац два.";
    expect(normalizeNewlines(clean)).toBe(clean);
    expect(normalizeNewlines(normalizeNewlines(clean))).toBe(clean);
  });

  it("CRLF и литеральный \\r\\n → LF", () => {
    expect(normalizeNewlines("a\r\nb")).toBe("a\nb");
    expect(normalizeNewlines("a\\r\\nb")).toBe("a\nb");
  });

  it("3+ переносов схлопываются до одного пустого абзаца", () => {
    expect(normalizeNewlines("a\n\n\n\nb")).toBe("a\n\nb");
    expect(normalizeNewlines("a\\n\\n\\n\\nb")).toBe("a\n\nb");
  });

  it("хвостовые пробелы перед переносом убираются, текст триммится", () => {
    expect(normalizeNewlines("  a   \nb  ")).toBe("a\nb");
  });
});
