import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { sources } from "./sources";

export const ingestStatus = pgEnum("ingest_status", [
  "fetched",
  "deduped",
  "selected",
  "dropped",
  "errored",
]);

export const ingestItems = pgTable(
  "ingest_items",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 256 }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    rawContent: text("raw_content"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    status: ingestStatus("status").notNull().default("fetched"),
    dedupeKey: varchar("dedupe_key", { length: 128 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    index("ingest_source_extid_idx").on(t.sourceId, t.externalId),
    index("ingest_status_idx").on(t.status, t.fetchedAt),
    index("ingest_dedupe_idx").on(t.dedupeKey),
  ],
);

export type IngestItem = typeof ingestItems.$inferSelect;
export type NewIngestItem = typeof ingestItems.$inferInsert;
