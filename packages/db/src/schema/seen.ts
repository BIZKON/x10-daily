import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { sources } from "./sources";

/**
 * seen_items — реестр уже виденных ingest-сигналов для дедупа на входе.
 *
 * Walking Skeleton (ТЗ #1, N3): fingerprint = SimHash64 hex от title+lede,
 * external_id = RSS guid. Перед `inngest.send({name: "source.item.received"})`
 * cron-функция проверяет, нет ли уже строки по (source_id, external_id) —
 * если есть, событие не эмитится.
 *
 * Намеренно отделено от `ingest_items`: тот шире (status enum, raw_content,
 * metadata) и предназначен для будущей IngestPipeline таблицы. seen_items —
 * узкая дедуп-индексная структура.
 */
export const seenItems = pgTable(
  "seen_items",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 256 }).notNull(),
    /** SimHash64 hex (16 символов). NULL допустим если fingerprint считать пока нечем. */
    fingerprint: varchar("fingerprint", { length: 64 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("seen_items_source_extid_uidx").on(t.sourceId, t.externalId),
    index("seen_items_fingerprint_idx").on(t.fingerprint),
  ],
);

export type SeenItem = typeof seenItems.$inferSelect;
export type NewSeenItem = typeof seenItems.$inferInsert;
