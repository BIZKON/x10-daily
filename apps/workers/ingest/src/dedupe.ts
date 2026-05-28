import { and, eq } from "drizzle-orm";
import { seenItems, sources, type Database, type NewSource } from "@x10/db";

/**
 * Атомарно отмечает item как seen. Возвращает true если запись свежая
 * (нужно отправлять событие), false если конфликт по (source_id, external_id)
 * — дубль, пропускаем.
 *
 * Walking Skeleton (ТЗ #1, N3): pgvector/cosine не задействован — только
 * exact-match по RSS guid. SimHash сохраняем в колонку под будущий cosine-слой.
 */
export async function markIfNew(
  db: Database,
  args: { sourceId: string; externalId: string; fingerprint: string | null },
): Promise<boolean> {
  const inserted = await db
    .insert(seenItems)
    .values({
      sourceId: args.sourceId,
      externalId: args.externalId,
      fingerprint: args.fingerprint,
    })
    .onConflictDoNothing()
    .returning({ id: seenItems.id });
  return inserted.length > 0;
}

/**
 * Lazy-upsert row в sources по уникальному имени. На уровне схемы UNIQUE
 * на sources.name нет (chosen — допускается одноимённость через kind/locale),
 * поэтому используем select-then-insert с минимальным risk'ом race'а при cron каждые 5 минут.
 */
export async function ensureSource(db: Database, def: NewSource): Promise<string> {
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.name, def.name), eq(sources.url, def.url)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [row] = await db.insert(sources).values(def).returning({ id: sources.id });
  if (!row) throw new Error(`ensureSource: insert returned no rows for ${def.name}`);
  return row.id;
}
