import { type KnowledgeShelf, formatKnowledge } from "@x10/agents";
import { type Database, and, asc, eq, kbDocuments, kbShelves } from "@x10/db";

/**
 * Загрузка базы знаний клиента для промптов конвейера.
 *
 * Живёт в воркере, а не в пакете агентов: агенты не должны знать про Postgres —
 * их вызывают из тестов и, в будущем, из ручного режима, где источник данных
 * другой. Здесь только запрос и передача в чистый форматтер.
 */

/**
 * Собрать блок знаний. Пустая строка означает «клиент о себе ещё ничего не
 * рассказал» — вызывающий по ней решает, добавлять ли раздел в промпт.
 *
 * Берём ТОЛЬКО `ready`: материал в разборе — ещё не знание, и подмешивать
 * недоразобранный файл значит кормить агента обрывками.
 */
export async function loadKnowledge(db: Database, budgetChars?: number): Promise<string> {
  const rows = await db
    .select({
      shelfId: kbShelves.id,
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

  // Группируем сохраняя порядок полок: он задан позицией и означает важность —
  // «чем занимаетесь» раньше «кейсов», а не по алфавиту.
  const byShelf = new Map<string, KnowledgeShelf>();
  for (const r of rows) {
    let shelf = byShelf.get(r.shelfId);
    if (!shelf) {
      shelf = { title: r.shelfTitle, documents: [] };
      byShelf.set(r.shelfId, shelf);
    }
    shelf.documents.push({ title: r.docTitle, body: r.docBody });
  }

  return formatKnowledge([...byShelf.values()], budgetChars);
}
