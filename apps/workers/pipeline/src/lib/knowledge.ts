import { type KnowledgeShelf, formatKnowledge } from "@x10/agents";
import { type Database, and, asc, eq, kbDocuments, kbShelves } from "@x10/db";

/**
 * Загрузка базы знаний клиента для промптов конвейера.
 *
 * Живёт в воркере, а не в пакете агентов: агенты не должны знать про Postgres —
 * их вызывают из тестов и из ручного режима, где источник данных другой. Здесь
 * запрос, чистый отбор и передача в чистый форматтер.
 */

/** Строка выборки: одна пара «полка × материал». */
export type KnowledgeRow = {
  shelfId: string;
  shelfSlug: string;
  shelfTitle: string;
  position: number;
  docTitle: string;
  docBody: string;
};

/**
 * Отобрать и сгруппировать полки под запрошенный набор слагов.
 *
 * 🔴 Пустой список (или его отсутствие) значит «все доступные» — так записано в
 * миграции 0025. А вот список, не совпавший ни с одной полкой, даёт ПУСТО:
 * превращать «ничего не нашлось» во «взять всё» нельзя, иначе режим получит в
 * промпт ровно те полки, которые из него намеренно исключили — например, цены
 * в публичном посте.
 *
 * Порядок держим сами, по позиции полки: позиция означает важность, и зависеть
 * от `ORDER BY` вызывающего значит однажды получить другой порядок в промпте
 * из-за правки чужого запроса.
 */
export function selectShelves(
  rows: readonly KnowledgeRow[],
  shelfSlugs?: readonly string[],
): KnowledgeShelf[] {
  const wanted = shelfSlugs && shelfSlugs.length > 0 ? new Set(shelfSlugs) : null;

  const byShelf = new Map<string, { position: number; shelf: KnowledgeShelf }>();
  for (const r of rows) {
    if (wanted && !wanted.has(r.shelfSlug)) continue;
    let entry = byShelf.get(r.shelfId);
    if (!entry) {
      entry = { position: r.position, shelf: { title: r.shelfTitle, documents: [] } };
      byShelf.set(r.shelfId, entry);
    }
    entry.shelf.documents.push({ title: r.docTitle, body: r.docBody });
  }

  return [...byShelf.values()].sort((a, b) => a.position - b.position).map((e) => e.shelf);
}

/**
 * Собрать блок знаний. Пустая строка означает «клиент о себе ещё ничего не
 * рассказал» — вызывающий по ней решает, добавлять ли раздел в промпт.
 *
 * Берём ТОЛЬКО `ready`: материал в разборе — ещё не знание, и подмешивать
 * недоразобранный файл значит кормить агента обрывками.
 *
 * `shelfSlugs` ограничивает выборку полками режима создания; без него берутся
 * все включённые полки — этим путём ходит конвейер.
 */
export async function loadKnowledge(
  db: Database,
  opts: { budgetChars?: number; shelfSlugs?: readonly string[] } = {},
): Promise<string> {
  const rows = await db
    .select({
      shelfId: kbShelves.id,
      shelfSlug: kbShelves.slug,
      shelfTitle: kbShelves.title,
      position: kbShelves.position,
      docTitle: kbDocuments.title,
      docBody: kbDocuments.body,
    })
    .from(kbShelves)
    .innerJoin(
      kbDocuments,
      and(eq(kbDocuments.shelfId, kbShelves.id), eq(kbDocuments.status, "ready")),
    )
    .where(eq(kbShelves.enabled, true))
    .orderBy(asc(kbShelves.position), asc(kbDocuments.createdAt));

  return formatKnowledge(selectShelves(rows, opts.shelfSlugs), opts.budgetChars);
}
