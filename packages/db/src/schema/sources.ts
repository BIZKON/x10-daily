import { boolean, index, integer, pgEnum, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

export const sourceKind = pgEnum("source_kind", ["rss", "api", "scrape", "telegram", "manual"]);

export const sourceTier = pgEnum("source_tier", ["primary", "secondary", "fringe"]);

export const sources = pgTable(
  "sources",
  {
    id: id(),
    name: varchar("name", { length: 128 }).notNull(),
    kind: sourceKind("kind").notNull(),
    tier: sourceTier("tier").notNull().default("secondary"),
    url: text("url").notNull(),
    locale: varchar("locale", { length: 8 }).notNull().default("ru"),
    enabled: boolean("enabled").notNull().default(true),
    pollIntervalSec: integer("poll_interval_sec").notNull().default(900),
    lastPolledAt: text("last_polled_at"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("sources_enabled_idx").on(t.enabled, t.tier), index("sources_kind_idx").on(t.kind)],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
