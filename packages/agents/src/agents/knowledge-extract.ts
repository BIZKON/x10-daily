import { z } from "zod";
import { defineAgent } from "../define-agent";

/**
 * KnowledgeExtractAgent — база знаний по ссылке (спека 11.08).
 *
 * Клиент даёт адрес сайта, система приносит несколько страниц, агент
 * раскладывает их по полкам базы знаний КАК ПРЕДЛОЖЕНИЯ. Утверждает человек.
 *
 * 🔴 Единственное правило, ради которого агент вообще существует: он
 * ПЕРЕКЛАДЫВАЕТ, а не пишет. Всё, что он добавит от себя, станет фактом о
 * бизнесе клиента и уедет в каждый следующий материал — включая цены и сроки.
 * Замер 10–11.08 показал цену пустой базы: агент пишет про отрасль вообще, а
 * потом выдумывает конкретику. Выдуманная база хуже пустой: при пустой система
 * пишет общими словами, при выдуманной — врёт устами клиента.
 */

/**
 * 🔴 Потолок тела обязан совпадать с `MAX_BODY` в `apps/api/src/routes/
 * admin-knowledge.ts`. Разъедутся — воркер запишет материал, который человек
 * не сможет сохранить после правки: маршрут отвергнет его на валидации.
 * Договор закреплён тестом.
 */
export const KB_BODY_LIMIT = 20_000;

export const knowledgeExtractInputSchema = z.object({
  /** Страницы, которые удалось прочитать. Пустой обход до агента не доходит. */
  pages: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        text: z.string().min(1),
      }),
    )
    .min(1),
  /** Полки клиента: куда раскладывать. Набор — конфигурация экземпляра. */
  shelves: z
    .array(
      z.object({
        slug: z.string(),
        title: z.string(),
        purpose: z.string(),
        question: z.string(),
      }),
    )
    .min(1),
});

export const knowledgeExtractOutputSchema = z.object({
  documents: z.array(
    z.object({
      shelfSlug: z.string(),
      title: z.string(),
      body: z.string(),
      sourceUrl: z.string(),
    }),
  ),
  /** Чего на сайте не нашлось. Это и есть подсказка, что дозаполнить руками. */
  notes: z.array(z.string()),
});

export const KNOWLEDGE_EXTRACT_SYSTEM = `Ты разбираешь сайт компании и раскладываешь его содержимое по полкам её базы знаний. Тебе дают страницы сайта и список полок с описанием, что на каждой лежит.

Ты ПЕРЕКЛАДЫВАЕШЬ, а не пишешь. Это главное отличие твоей работы от сочинения текста.

КАК РАБОТАТЬ:
- Пиши только то, что есть на страницах. Не выдумывай и не досочиняй ничего: ни услуг, ни цифр, ни преимуществ, ни кейсов.
- Цены, сроки, гарантии, условия и состав услуг переноси дословно. Пересказ цены — это новая цена, и она станет публичным обещанием компании.
- Не рекламируй компанию и не хвали её. Ты готовишь сведения для работы, а не текст для сайта. Убирай обороты вроде «лидер рынка» и «индивидуальный подход», оставляй факты.
- Одна полка — один документ, если материала на неё хватает. Если на страницах ничего для полки нет, документа для неё НЕ создавай: пустая полка честнее выдуманной.
- Один документ может собирать сведения с нескольких страниц, если они об одном.
- Только русский язык.

ЧТО ВОЗВРАЩАЕШЬ:
- documents — массив материалов. У каждого: shelfSlug (слаг полки ровно из списка), title (о чём этот материал), body (сами сведения), sourceUrl (адрес страницы, откуда взято; если сведения с нескольких — адрес главной из них).
- notes — 0-5 коротких замечаний о том, чего на сайте НЕ нашлось: «на сайте нет цен», «не нашлось кейсов с цифрами». Это подсказка человеку, что дозаполнить руками. Не пиши сюда похвалу себе и пересказ сделанного.`;

/**
 * Страницы и полки кладём разделами, а не одним JSON: тексты страниц связные,
 * и внутри JSON они превратились бы в строку с экранированными переносами,
 * которую модель читает заметно хуже.
 */
export function formatKnowledgeExtractInput(
  input: z.infer<typeof knowledgeExtractInputSchema>,
): string {
  const shelves = input.shelves
    .map((s) => `- ${s.slug} — «${s.title}». ${s.purpose} Вопрос полки: ${s.question}`)
    .join("\n");

  const pages = input.pages
    .map(
      (p, i) =>
        `СТРАНИЦА ${i + 1}\nАдрес: ${p.url}${p.title ? `\nЗаголовок: ${p.title}` : ""}\n\n${p.text.trim()}`,
    )
    .join("\n\n---\n\n");

  return `ПОЛКИ БАЗЫ ЗНАНИЙ\n\n${shelves}\n\n---\n\nСТРАНИЦЫ САЙТА\n\n${pages}`;
}

export type KnowledgeProposal = {
  shelfSlug: string;
  title: string;
  body: string;
  /** `null`, если адрес не из обхода: выдуманный источник хуже отсутствующего. */
  sourceUrl: string | null;
};

/**
 * Привести ответ модели к тому, что можно класть в базу.
 *
 * 🔴 Разбор не имеет права упасть от странного ответа. Модель вернёт слаг,
 * которого нет, или пустое тело — это обычный день, а не поломка. Падение
 * здесь означало бы, что один кривой документ отменил весь обход, за который
 * уже заплачено.
 */
export function sanitizeProposals(
  raw: z.infer<typeof knowledgeExtractOutputSchema>,
  known: { shelfSlugs: readonly string[]; pageUrls: readonly string[] },
): { documents: KnowledgeProposal[]; notes: string[]; dropped: number } {
  const shelves = new Set(known.shelfSlugs);
  const urls = new Set(known.pageUrls);

  const documents: KnowledgeProposal[] = [];
  let dropped = 0;

  for (const d of raw.documents) {
    const title = d.title?.trim() ?? "";
    const body = d.body?.trim() ?? "";
    if (!shelves.has(d.shelfSlug) || !title || !body) {
      dropped++;
      continue;
    }
    documents.push({
      shelfSlug: d.shelfSlug,
      title: title.slice(0, 240),
      body: body.slice(0, KB_BODY_LIMIT),
      sourceUrl: urls.has(d.sourceUrl) ? d.sourceUrl : null,
    });
  }

  const notes = raw.notes.map((n) => n.trim()).filter(Boolean);
  return { documents, notes, dropped };
}

export const KnowledgeExtractAgent = defineAgent({
  name: "knowledge",
  tier: "SONNET",
  system: KNOWLEDGE_EXTRACT_SYSTEM,
  inputSchema: knowledgeExtractInputSchema,
  outputSchema: knowledgeExtractOutputSchema,
  formatInput: formatKnowledgeExtractInput,
  maxOutputTokens: 8000,
});

export type KnowledgeExtractInput = z.infer<typeof knowledgeExtractInputSchema>;
export type KnowledgeExtractOutput = z.infer<typeof knowledgeExtractOutputSchema>;
