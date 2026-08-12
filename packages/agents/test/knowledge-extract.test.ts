import { describe, expect, it } from "vitest";
import {
  KB_BODY_LIMIT,
  KNOWLEDGE_EXTRACT_SYSTEM,
  formatKnowledgeExtractInput,
  knowledgeExtractInputSchema,
  sanitizeProposals,
} from "../src/agents/knowledge-extract";

/**
 * KnowledgeExtractAgent — база знаний по ссылке (спека 11.08, §5).
 *
 * Проверяем решения, а не формулировки. Главное из них: агент раскладывает по
 * полкам ТО, ЧТО НАШЁЛ, и ничего не добавляет от себя. Пустая полка честнее
 * выдуманной — при пустой базе система пишет общими словами, при выдуманной
 * врёт клиентскими устами.
 */

const PAGES = [
  { url: "https://veles.ru/about", title: "О компании", text: "Возим сборные грузы по России." },
];

const SHELVES = [
  {
    slug: "business",
    title: "Чем вы занимаетесь",
    purpose: "Основа основ.",
    question: "Чем занимается ваша компания?",
  },
];

describe("канон промпта", () => {
  it("🔴 писать только то, что есть на страницах", () => {
    // То же правило, что вытащило режим «Пост» после трёх итераций: модель,
    // которой не хватает факта, склонна его дописать.
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/только то, что есть на страниц/i);
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/не выдумывай|не досочин/i);
  });

  it("🔴 цены, сроки и условия — дословно", () => {
    // Пересказ цены — это новая цена, и она уедет клиенту в канал.
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/дословн/i);
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/цен/i);
  });

  it("полке нечего дать — документа не создавать", () => {
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/пуст(ая|ой)/i);
  });

  it("каждый документ несёт адрес страницы-источника", () => {
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/sourceUrl/);
  });

  it("notes — что осталось непокрытым, а не похвала себе", () => {
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/notes/);
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/не нашл|не наш(ло|лось)|нет на сайте/i);
  });

  it("только русский язык", () => {
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/русск/i);
  });

  it("🔴 чужое на сайте клиента — не знание о клиенте", () => {
    // Найдено живым прогоном 12.08 на нашем же сайте: агент положил на полку
    // «Кейсы» чужой проект (мы о нём писали, но не делали его) и САМ ЖЕ написал
    // в notes, что это не наша работа. Полка спрашивает «что вы сделали», а
    // медиа-сайт отвечает «вот что мы опубликовали» — на таких сайтах эти
    // вопросы не совпадают, и агент обязан различать.
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/чуж/i);
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(/о самой компании|о клиенте|её собственн/i);
  });

  it("🔴 сомневаешься — пиши в notes, а не предлагай документ", () => {
    // Прямое следствие той же находки: оговорка в notes не отменяет документа,
    // который человек всё равно увидит кнопкой «принять».
    expect(KNOWLEDGE_EXTRACT_SYSTEM).toMatch(
      /вместо документа|не создавай документ.*notes|напиши об этом в notes/i,
    );
  });
});

describe("вход агента", () => {
  it("без страниц раскладывать нечего", () => {
    expect(knowledgeExtractInputSchema.safeParse({ pages: [], shelves: SHELVES }).success).toBe(
      false,
    );
  });

  it("без полок неизвестно, куда класть", () => {
    expect(knowledgeExtractInputSchema.safeParse({ pages: PAGES, shelves: [] }).success).toBe(
      false,
    );
  });

  it("обычный вход проходит", () => {
    expect(knowledgeExtractInputSchema.safeParse({ pages: PAGES, shelves: SHELVES }).success).toBe(
      true,
    );
  });
});

describe("formatKnowledgeExtractInput", () => {
  it("страницы кладутся с адресами — иначе агенту нечем заполнить sourceUrl", () => {
    const text = formatKnowledgeExtractInput({ pages: PAGES, shelves: SHELVES });
    expect(text).toContain("https://veles.ru/about");
    expect(text).toContain("Возим сборные грузы");
  });

  it("полки приходят со слагом и назначением", () => {
    const text = formatKnowledgeExtractInput({ pages: PAGES, shelves: SHELVES });
    expect(text).toContain("business");
    expect(text).toContain("Чем вы занимаетесь");
    expect(text).toContain("Основа основ.");
  });
});

describe("sanitizeProposals — разбор не должен падать от ответа модели", () => {
  const known = { shelfSlugs: ["business", "prices"], pageUrls: ["https://veles.ru/about"] };

  const doc = (over: Partial<Record<string, string>> = {}) => ({
    shelfSlug: "business",
    title: "Сборные грузы",
    body: "Возим сборные грузы по России между 42 городами.",
    sourceUrl: "https://veles.ru/about",
    ...over,
  });

  it("нормальный документ проходит целиком", () => {
    const r = sanitizeProposals({ documents: [doc()], notes: [] }, known);
    expect(r.documents).toHaveLength(1);
    expect(r.documents[0]?.shelfSlug).toBe("business");
  });

  it("🔴 неизвестная полка не роняет разбор — документ отбрасывается, остальные живут", () => {
    // Модель вернёт слаг, которого нет, и это нормальный день. Падение здесь
    // означало бы, что один странный документ отменил весь обход.
    const r = sanitizeProposals(
      { documents: [doc({ shelfSlug: "vydumannaya" }), doc()], notes: [] },
      known,
    );
    expect(r.documents).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });

  it("пустой документ отбрасывается", () => {
    const r = sanitizeProposals(
      { documents: [doc({ body: "   " }), doc({ title: "" })], notes: [] },
      known,
    );
    expect(r.documents).toHaveLength(0);
    expect(r.dropped).toBe(2);
  });

  it("🔴 тело режется по тому же потолку, что и в маршрутах базы знаний", () => {
    // Разъедутся — воркер запишет материал, который человек потом не сможет
    // сохранить после правки: маршрут отвергнет его на валидации.
    expect(KB_BODY_LIMIT).toBe(20_000);
    const r = sanitizeProposals(
      { documents: [doc({ body: "я".repeat(30_000) })], notes: [] },
      known,
    );
    expect(r.documents[0]?.body).toHaveLength(KB_BODY_LIMIT);
  });

  it("🔴 адрес, которого не было в обходе, обнуляется, а текст остаётся", () => {
    // Выдуманный источник хуже отсутствующего: он выглядит доказательством.
    const r = sanitizeProposals(
      { documents: [doc({ sourceUrl: "https://veles.ru/pridumannaya-stranica" })], notes: [] },
      known,
    );
    expect(r.documents).toHaveLength(1);
    expect(r.documents[0]?.sourceUrl).toBeNull();
  });

  it("заметки чистятся от пустых строк", () => {
    const r = sanitizeProposals(
      { documents: [doc()], notes: ["На сайте нет цен", "  ", ""] },
      known,
    );
    expect(r.notes).toEqual(["На сайте нет цен"]);
  });
});
