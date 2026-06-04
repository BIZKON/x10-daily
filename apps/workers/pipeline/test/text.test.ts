import { describe, expect, it } from "vitest";
import { cleanPostText, normalizeNewlines, stripStructuralLabels } from "../src/lib/text";

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

describe("stripStructuralLabels — английские лейблы стадий/блоков", () => {
  it("инлайн BAB-лейблы (Before/After/Bridge) срезаются, контент остаётся", () => {
    expect(stripStructuralLabels("BEFORE. Автономные агенты тестировались вне рынка.")).toBe(
      "Автономные агенты тестировались вне рынка.",
    );
    expect(stripStructuralLabels("BRIDGE. MOEX строит инфраструктуру.")).toBe(
      "MOEX строит инфраструктуру.",
    );
  });

  it("Smart Brevity лейблы (Yes, but / What's next) срезаются", () => {
    expect(stripStructuralLabels("Yes, but. Виртуальная среда не равна рынку.")).toBe(
      "Виртуальная среда не равна рынку.",
    );
    expect(stripStructuralLabels("What's next: запуск осенью.")).toBe("запуск осенью.");
  });

  it("лейбл отдельной строкой удаляется целиком", () => {
    expect(stripStructuralLabels("AFTER.\nТекст абзаца.")).toBe("\nТекст абзаца.");
  });

  it("русские заголовки (Следим:) и обычный текст НЕ трогаются", () => {
    expect(stripStructuralLabels("Следим: откроет ли MOEX песочницу.")).toBe(
      "Следим: откроет ли MOEX песочницу.",
    );
    expect(stripStructuralLabels("Москва. Главное за день.")).toBe("Москва. Главное за день.");
  });

  it("стэкнутые лейблы в одной строке срезаются полностью (audit L13, фикс-точка)", () => {
    expect(stripStructuralLabels("Before. After. Текст абзаца.")).toBe("Текст абзаца.");
    // идемпотентность: повторный прогон ничего не меняет
    const once = stripStructuralLabels("Before. After. Текст абзаца.");
    expect(stripStructuralLabels(once)).toBe(once);
  });
});

describe("cleanPostText — полный конвейер очистки поста", () => {
  it("кейс из прода (MOEX): литеральные \\n + BAB/Yes-but лейблы → чистая проза", () => {
    const raw =
      "5 из 50 ИИ-агентов обогнали IMOEX.\\n\\nBEFORE. Агенты тестировались вне рынка.\\n\\nAFTER. Хакатон стал первым тестом.\\n\\nBRIDGE. MOEX строит инфраструктуру.\\n\\nYes, but. Виртуальная среда не равна рынку.\\n\\nСледим: откроет ли MOEX песочницу.";
    const out = cleanPostText(raw);
    expect(out).not.toContain("\\n");
    expect(out).not.toMatch(/^(BEFORE|AFTER|BRIDGE|Yes, but)/m);
    expect(out).toContain("Агенты тестировались вне рынка.");
    expect(out).toContain("Следим: откроет ли MOEX песочницу.");
    // абзацы разделены пустой строкой
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(5);
  });

  it("идемпотентна на уже чистом посте", () => {
    const clean = "Заголовок-крючок.\n\nПервый абзац.\n\nЧитать на x10daily.";
    expect(cleanPostText(clean)).toBe(clean);
  });
});
