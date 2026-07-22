import { type Database, type NewSource, seenItems, sources } from "@x10/db";
import { and, asc, eq } from "drizzle-orm";

export interface RssSource {
  id: string;
  name: string;
  url: string;
  /** Тип адаптера (миграция 0013): rss(default)/youtube/github/reddit/x. Диспетч
   *  в ingest-rss: reddit → OAuth-fetch, остальное → generic fetchRss (rss-parser). */
  adapterType: string;
  /** Минимальный интервал между поллами источника, сек (session 20 gating). */
  pollIntervalSec: number;
  /** ISO-время последнего успешного полла; null → ещё ни разу. */
  lastPolledAt: string | null;
}

/**
 * Активные RSS-источники для автопостинга. Multi-source ingest (session 18+)
 * читает их из таблицы `sources` (data-driven, без хардкода) вместо
 * единственного vc.ru. Поля poll_interval_sec/last_polled_at используются
 * ingest-rss (session 20) для gating: cron тикает каждые 5 мин, но источник
 * поллится не чаще своего интервала (по умолчанию 900 сек = 15 мин).
 */
export async function listEnabledRssSources(db: Database): Promise<RssSource[]> {
  return db
    .select({
      id: sources.id,
      name: sources.name,
      url: sources.url,
      adapterType: sources.adapterType,
      pollIntervalSec: sources.pollIntervalSec,
      lastPolledAt: sources.lastPolledAt,
    })
    .from(sources)
    .where(and(eq(sources.enabled, true), eq(sources.kind, "rss")))
    .orderBy(asc(sources.createdAt));
}

/**
 * Источник «созрел» для полла? null/невалидный lastPolledAt → да (ещё не
 * поллили). Иначе — прошло ли >= pollIntervalSec с прошлого полла. Чистая
 * функция → юнит-тестируется без БД.
 */
export function isSourceDue(src: RssSource, now: Date): boolean {
  if (!src.lastPolledAt) return true;
  const last = Date.parse(src.lastPolledAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= src.pollIntervalSec * 1000;
}

/** Отметить успешный полл источника (last_polled_at = at). */
export async function markSourcePolled(db: Database, sourceId: string, at: Date): Promise<void> {
  await db.update(sources).set({ lastPolledAt: at.toISOString() }).where(eq(sources.id, sourceId));
}

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
