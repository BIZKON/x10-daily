import { describe, expect, it } from "vitest";
import { formatDraftInput } from "../src/agents/draft";

const task = {
  topic: "Склад считает остатки сам",
  context: "WMS с ИИ сняла ручную сверку",
  sources: [{ url: "https://example.com/a", title: "Кейс", publisher: "example.com" }],
  section: "main" as const,
  template: "card-news" as const,
};

describe("formatDraftInput", () => {
  /**
   * Главный контракт. Подмешивание базы знаний не должно менять то, как агент
   * читает задание у клиентов с пустой базой, — иначе пришлось бы заново
   * проверять качество всех материалов, а не только тех, у кого база заполнена.
   */
  it("без знаний отдаёт ровно прежний JSON — побайтово", () => {
    expect(formatDraftInput(task)).toBe(JSON.stringify(task, null, 2));
  });

  it("пустая строка знаний считается отсутствием знаний", () => {
    expect(formatDraftInput({ ...task, knowledge: "" })).toBe(JSON.stringify(task, null, 2));
  });

  it("со знаниями задание остаётся тем же JSON, блок идёт после него", () => {
    const out = formatDraftInput({ ...task, knowledge: "## Цены\nПроект от 300 тысяч" });
    expect(out.startsWith(JSON.stringify(task, null, 2))).toBe(true);
    expect(out).toContain("ЧТО ИЗВЕСТНО О БИЗНЕСЕ КЛИЕНТА");
    expect(out).toContain("Проект от 300 тысяч");
  });

  /**
   * Если положить блок полем внутрь JSON, он превратится в одну строку с
   * экранированными переносами — модель читает такое заметно хуже. Заодно это
   * ловит дубль: блок не должен попасть и в JSON, и в текст.
   */
  it("блок не попадает внутрь JSON и не дублируется", () => {
    const out = formatDraftInput({ ...task, knowledge: "## Цены\nот 300 тысяч" });
    expect(out).not.toContain('"knowledge"');
    expect(out).not.toContain("\\n## Цены");
    expect(out.match(/от 300 тысяч/g)).toHaveLength(1);
  });
});
