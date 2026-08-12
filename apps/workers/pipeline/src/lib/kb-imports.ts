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
 * Записать найденное как ПРЕДЛОЖЕНИЯ и закрыть задание.
 *
 * 🔴 Статус `proposed`, а не `ready`. Это и есть главное решение спеки:
 * `loadKnowledge` выбирает только `ready`, поэтому непринятое предложение
 * физически не может уехать в промпт агента, даже если про него забыли.
 *
 * 🔴 Прежние непринятые предложения сносятся (решение владельца 12.08).
 * Непринятое ещё не знание, терять там нечего, а две копии одного и того же
 * превращают разбор в сверку. Принятое (`ready`) не трогаем никогда: оно уже
 * знание человека, и обход не вправе его переписывать.
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
  const idBySlug = new Map(shelves.map((s) => [s.slug, s.id]));

  await db
    .delete(kbDocuments)
    .where(and(eq(kbDocuments.status, "proposed"), isNotNull(kbDocuments.importId)));

  const rows = payload.documents
    .map((d) => ({ shelfId: idBySlug.get(d.shelfSlug), doc: d }))
    .filter((r): r is { shelfId: string; doc: KnowledgeProposal } => Boolean(r.shelfId))
    .map(({ shelfId, doc }) => ({
      shelfId,
      title: doc.title,
      body: doc.body,
      source: "url" as const,
      status: "proposed" as const,
      sourceUrl: doc.sourceUrl,
      charCount: doc.body.length,
      importId,
    }));

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
