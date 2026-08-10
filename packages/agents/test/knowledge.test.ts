import { describe, expect, it } from "vitest";
import { type KnowledgeShelf, formatKnowledge, knowledgeSection } from "../src/knowledge";

const shelf = (title: string, ...bodies: string[]): KnowledgeShelf => ({
  title,
  documents: bodies.map((body, i) => ({ title: `Материал ${i + 1}`, body })),
});

describe("formatKnowledge", () => {
  it("без знаний возвращает пустую строку — вызывающий не добавит раздел в промпт", () => {
    expect(formatKnowledge([])).toBe("");
    expect(formatKnowledge([shelf("Цены")])).toBe("");
    expect(formatKnowledge([shelf("Цены", "   ")])).toBe("");
  });

  it("полки без материалов не попадают в блок — пустой заголовок только тратит окно", () => {
    const out = formatKnowledge([shelf("Продукты", "Ставим склады"), shelf("Возражения")]);
    expect(out).toContain("## Продукты");
    expect(out).not.toContain("## Возражения");
  });

  it("когда всё влезает, ничего не режет и не помечает сокращением", () => {
    const out = formatKnowledge([shelf("Цены", "Проект от 300 тысяч")], 1000);
    expect(out).toBe("## Цены\nМатериал 1: Проект от 300 тысяч");
    expect(out).not.toContain("сокращено");
  });

  it("держится в бюджете и честно помечает обрезку", () => {
    const out = formatKnowledge([shelf("Продукты", "я".repeat(5000))], 500);
    expect(out.length).toBeLessThanOrEqual(500 + "## Продукты\n".length);
    expect(out).toContain("(сокращено)");
  });

  /**
   * Главный инвариант. Если делить бюджет по порядку, огромный каталог
   * продуктов съест весь лимит, и «Правила» — то есть запреты клиента — не
   * попадут в промпт вовсе. Молча.
   */
  it("жадная полка не вытесняет скромную", () => {
    const out = formatKnowledge(
      [shelf("Продукты", "к".repeat(100_000)), shelf("Правила", "Не обещать сроки")],
      2000,
    );
    expect(out).toContain("## Правила");
    expect(out).toContain("Не обещать сроки");
    expect(out).toContain("## Продукты");
  });

  it("скромная полка отдаёт неизрасходованное жадной, а не теряет его", () => {
    const skimpy = formatKnowledge(
      [shelf("Правила", "коротко"), shelf("Продукты", "п".repeat(100_000))],
      2000,
    );
    // Продуктам достаётся своя половина плюс всё, что не понадобилось правилам.
    const products = skimpy.split("## Продукты")[1] ?? "";
    expect(products.length).toBeGreaterThan(1000);
  });

  it("делит поровну, когда всем не хватает одинаково", () => {
    const out = formatKnowledge([shelf("А", "а".repeat(10_000)), shelf("Б", "б".repeat(10_000))], 2000);
    const a = (out.match(/а/g) ?? []).length;
    const b = (out.match(/б/g) ?? []).length;
    // Допуск на служебные знаки и пометку обрезки, но перекос вдвое недопустим.
    expect(Math.abs(a - b)).toBeLessThan(Math.max(a, b) * 0.5);
  });

  it("нулевой и отрицательный бюджет не роняют и не отдают мусор", () => {
    expect(formatKnowledge([shelf("Цены", "текст")], 0)).toBe("");
    expect(formatKnowledge([shelf("Цены", "текст")], -100)).toBe("");
  });

  it("не обрывает предложение на полуслове, если есть где разрезать", () => {
    const text = "Первое предложение целиком. Второе предложение, которое точно не влезет в бюджет.";
    const out = formatKnowledge([shelf("Кейсы", text)], 80);
    expect(out).toContain("Первое предложение целиком.");
    expect(out).not.toContain("Второе предложение, которое точно не влезет");
  });

  it("материал без названия идёт как есть, а не «: текст»", () => {
    const out = formatKnowledge([{ title: "Цены", documents: [{ title: "", body: "от 300 тысяч" }] }]);
    expect(out).toBe("## Цены\nот 300 тысяч");
  });
});

describe("knowledgeSection", () => {
  it("пустой блок не превращается в раздел с одними правилами", () => {
    expect(knowledgeSection("")).toBe("");
  });

  it("к непустому блоку добавляет правила обращения со знанием", () => {
    const out = knowledgeSection("## Цены\nот 300 тысяч");
    expect(out).toContain("ЧТО ИЗВЕСТНО О БИЗНЕСЕ КЛИЕНТА");
    expect(out).toContain("не придумывай тех, которых здесь нет");
    expect(out).toContain("## Цены");
  });
});
