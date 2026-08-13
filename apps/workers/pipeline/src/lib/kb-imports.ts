import type { KnowledgeProposal } from "@x10/agents";
import {
  type Database,
  type KbImportPage,
  and,
  asc,
  eq,
  isNotNull,
  kbDocuments,
  kbImports,
  kbShelves,
} from "@x10/db";

/**
 * Обход сайта клиента: работа со строкой задания и с предложениями
 * (спека «база знаний по ссылке», миграция 0030).
 *
 * Живёт в воркере, а не в пакете агентов: агенты не знают про Postgres. Здесь
 * запросы, в `crawl-site.ts` — обход, в агенте — раскладка по полкам.
 */

export type ImportJob = { id: string; siteUrl: string; status: string };

/** Полка в том виде, в каком её понимает агент раскладки. */
export type ExtractShelf = { slug: string; title: string; purpose: string; question: string };

export async function loadImportJob(db: Database, id: string): Promise<ImportJob | null> {
  const [row] = await db
    .select({ id: kbImports.id, siteUrl: kbImports.siteUrl, status: kbImports.status })
    .from(kbImports)
    .where(eq(kbImports.id, id))
    .limit(1);
  return row ?? null;
}

export async function markImportRunning(db: Database, id: string): Promise<void> {
  await db
    .update(kbImports)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(kbImports.id, id));
}

/**
 * Отказ с человеческой причиной. Отчёт о страницах сохраняем и здесь: на
 * вопрос «почему система ничего не нашла» отвечает именно он.
 */
export async function failImport(
  db: Database,
  id: string,
  reason: string,
  log?: KbImportPage[],
): Promise<void> {
  await db
    .update(kbImports)
    .set({
      status: "failed",
      statusReason: reason,
      ...(log ? { pages: log } : {}),
      updatedAt: new Date(),
    })
    .where(eq(kbImports.id, id));
}

/** Полки, по которым агент раскладывает найденное: только включённые. */
export async function loadExtractShelves(db: Database): Promise<ExtractShelf[]> {
  return db
    .select({
      slug: kbShelves.slug,
      title: kbShelves.title,
      purpose: kbShelves.purpose,
      question: kbShelves.question,
    })
    .from(kbShelves)
    .where(eq(kbShelves.enabled, true))
    .orderBy(asc(kbShelves.position));
}

/**
 * Какой статус сносит повторный обход.
 *
 * 🔴 Вынесено константой не ради красоты: это и есть решение владельца от
 * 12.08 — непринятое ещё не знание, терять там нечего, а принятое человеком
 * обход переписывать не вправе. Проверять вместо неё текст SQL бессмысленно:
 * такой тест подтверждал бы и вывернутый наизнанку смысл (грабля сессии 34).
 */
export const REPLACEABLE_STATUS = "proposed" as const;

/** Строка материала в том виде, в каком она ложится в базу. */
export type ProposalRow = {
  shelfId: string;
  title: string;
  body: string;
  source: "url";
  status: typeof REPLACEABLE_STATUS;
  sourceUrl: string | null;
  charCount: number;
  importId: string;
};

/**
 * Разложить предложения агента по полкам клиента.
 *
 * Чистая функция: сюда стекаются все решения о том, ЧТО ляжет в базу, и их
 * видно целиком, без поддельной базы вокруг. Документ на полку, которой нет,
 * молча отбрасывается — модель вернёт такой слаг, и это обычный день, а не
 * повод отменить весь обход, за который уже заплачено.
 */
export function buildProposalRows(
  documents: readonly KnowledgeProposal[],
  shelves: readonly { id: string; slug: string }[],
  importId: string,
): ProposalRow[] {
  const idBySlug = new Map(shelves.map((s) => [s.slug, s.id]));

  const rows: ProposalRow[] = [];
  for (const doc of documents) {
    const shelfId = idBySlug.get(doc.shelfSlug);
    if (!shelfId) continue;
    rows.push({
      shelfId,
      title: doc.title,
      body: doc.body,
      source: "url",
      status: REPLACEABLE_STATUS,
      sourceUrl: doc.sourceUrl,
      // Длину считает сервер: она производное от текста, и присланному числу
      // здесь верить незачем.
      charCount: doc.body.length,
      importId,
    });
  }
  return rows;
}

/**
 * Записать найденное как ПРЕДЛОЖЕНИЯ и закрыть задание.
 *
 * 🔴 Статус `proposed`, а не `ready`. Это и есть главное решение спеки:
 * `loadKnowledge` выбирает только `ready`, поэтому непринятое предложение
 * физически не может уехать в промпт агента, даже если про него забыли.
 *
 * 🔴 Прежние непринятые предложения сносятся ДО записи новых. Наоборот нельзя:
 * собственная же уборка удалила бы только что записанное.
 */
export async function saveProposals(
  db: Database,
  importId: string,
  payload: { documents: KnowledgeProposal[]; notes: string[]; log: KbImportPage[] },
): Promise<number> {
  const shelves = await db
    .select({ id: kbShelves.id, slug: kbShelves.slug })
    .from(kbShelves)
    .where(eq(kbShelves.enabled, true));

  await db
    .delete(kbDocuments)
    .where(and(eq(kbDocuments.status, REPLACEABLE_STATUS), isNotNull(kbDocuments.importId)));

  const rows = buildProposalRows(payload.documents, shelves, importId);
  if (rows.length > 0) await db.insert(kbDocuments).values(rows);

  await db
    .update(kbImports)
    .set({
      status: "ready",
      statusReason: null,
      pages: payload.log,
      notes: payload.notes,
      proposed: rows.length,
      updatedAt: new Date(),
    })
    .where(eq(kbImports.id, importId));

  return rows.length;
}
