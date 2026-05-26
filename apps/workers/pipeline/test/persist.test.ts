import { describe, expect, it } from "vitest";
import { countWords, serializeDraftForNumbers, slugify } from "../src/persist";

describe("slugify", () => {
  it("транслит русского", () => {
    expect(slugify("ЦБ держит ставку 17%")).toBe("tsb-derzhit-stavku-17");
  });
  it("обрезает до 80 символов", () => {
    const s = slugify("a".repeat(200));
    expect(s.length).toBeLessThanOrEqual(80);
  });
  it("чистит начальные/конечные дефисы", () => {
    expect(slugify("  hello world!  ")).toBe("hello-world");
  });
});

describe("countWords", () => {
  it("учитывает все блоки", () => {
    const wc = countWords({
      tease: "Один два",
      lede: "Три четыре пять.",
      whyItMatters: "Шесть.",
      body: [
        { type: "paragraph", text: "Семь восемь девять десять" },
        {
          type: "numbers",
          items: [{ label: "X", value: "1" }],
        },
        { type: "list", ordered: false, items: ["один два", "три"] },
      ],
    });
    expect(wc).toBe(2 + 3 + 1 + 4 + 2 + 2 + 1);
  });
});

describe("serializeDraftForNumbers", () => {
  it("раскрывает quote с атрибуцией", () => {
    const out = serializeDraftForNumbers({
      tease: "T",
      lede: "L",
      whyItMatters: "W",
      body: [{ type: "quote", text: "Quoted text", attribution: "Игорь Рыбаков" }],
    });
    expect(out).toContain('"Quoted text" — Игорь Рыбаков');
  });

  it("разворачивает numbers как label: value", () => {
    const out = serializeDraftForNumbers({
      tease: "T",
      lede: "L",
      whyItMatters: "W",
      body: [
        {
          type: "numbers",
          items: [
            { label: "Ставка", value: "17%" },
            { label: "GMV", value: "312 млрд ₽" },
          ],
        },
      ],
    });
    expect(out).toContain("Ставка: 17%");
    expect(out).toContain("GMV: 312 млрд ₽");
  });
});
