import { describe, expect, it } from "vitest";
import { type KnowledgeRow, selectShelves } from "../src/lib/knowledge";

/**
 * Отбор полок базы знаний под режим создания (ручной режим, шаг 1).
 *
 * Почему отбор — чистая функция, а не только условие в SQL: именно здесь
 * решается, что клиент увидит в материале. Условие в запросе проверялось бы
 * подделкой драйвера, то есть моей же догадкой о форме вызова.
 */

function row(slug: string, position: number, docTitle: string, docBody: string): KnowledgeRow {
  return {
    shelfId: `id-${slug}`,
    shelfSlug: slug,
    shelfTitle: slug === "prices" ? "Цены и условия" : slug === "rules" ? "Правила" : "О бизнесе",
    position,
    docTitle,
    docBody,
  };
}

const ROWS: KnowledgeRow[] = [
  row("business", 10, "Чем занимаемся", "Внедряем ИИ-агентов малому бизнесу"),
  row("prices", 20, "Прайс", "Линия от 200 тысяч, ручной от 120 тысяч"),
  row("rules", 30, "Запреты", "Не обещать сроков без сметы"),
];

describe("отбор полок под режим", () => {
  it("без списка полок отдаёт всё — режим ничего не ограничил", () => {
    const shelves = selectShelves(ROWS);
    expect(shelves.map((s) => s.title)).toEqual(["О бизнесе", "Цены и условия", "Правила"]);
  });

  it("пустой список тоже значит «все» — так записано в миграции 0025", () => {
    expect(selectShelves(ROWS, []).length).toBe(3);
  });

  it("🔴 со списком берёт ТОЛЬКО указанные полки", () => {
    // Ради этого вся затея: у режима «Пост» нет полки цен, и прайс клиента не
    // должен попасть в публичный пост. Обратное — утечка коммерческих условий.
    const shelves = selectShelves(ROWS, ["business", "rules"]);
    expect(shelves.map((s) => s.title)).toEqual(["О бизнесе", "Правила"]);
    expect(JSON.stringify(shelves)).not.toContain("200 тысяч");
  });

  it("🔴 держит порядок по позиции сам, даже если строки пришли вперемешку", () => {
    // Позиция полки означает важность: «чем занимаетесь» раньше «кейсов».
    // Полагаться на ORDER BY вызывающего нельзя — тогда порядок в промпте
    // молча зависел бы от того, кто и каким запросом принёс строки.
    const reversed = [...ROWS].reverse();
    expect(selectShelves(reversed, ["rules", "business"]).map((s) => s.title)).toEqual([
      "О бизнесе",
      "Правила",
    ]);
  });

  it("несколько материалов одной полки собираются в неё же, а не в дубли", () => {
    const rows = [...ROWS, row("business", 10, "Ещё про нас", "Работаем с 2019 года")];
    const shelves = selectShelves(rows, ["business"]);
    expect(shelves.length).toBe(1);
    expect(shelves[0]?.documents.map((d) => d.title)).toEqual(["Чем занимаемся", "Ещё про нас"]);
  });

  it("неизвестный слаг в режиме не роняет отбор и не добавляет пустую полку", () => {
    // Клиент переименовал полку, а режим остался со старым слагом. Материал
    // выйдет беднее, но выйдет — падать из-за справочника нельзя.
    expect(selectShelves(ROWS, ["business", "нет-такой"]).map((s) => s.title)).toEqual([
      "О бизнесе",
    ]);
  });

  it("режим, чьих полок нет вовсе, даёт пусто — а не молча всю базу", () => {
    // 🔴 Разница принципиальная: «ничего не нашлось» превратить в «взять всё»
    // значит отдать в промпт полки, которые режим намеренно исключил.
    expect(selectShelves(ROWS, ["нет-такой"])).toEqual([]);
  });
});
