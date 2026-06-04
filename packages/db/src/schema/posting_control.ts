import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton-конфиг автопостинга (session 20). Одна строка id='global'.
 *
 * Гейтит автономный конвейер на входе (ingest-rss) и на выходе (post-to-tg):
 *  - paused — ручной kill-switch («пауза сейчас» из админки);
 *  - quiet_enabled + quiet_start_hour/quiet_end_hour — тихие часы (МСК, UTC+3),
 *    окно с переносом через полночь (напр. 21→09). В окне конвейер не работает:
 *    ни генерации, ни постинга, ни трат.
 * См. packages/db/src/posting-control.ts (isPostingPaused) и гейты воркеров.
 */
export const postingControl = pgTable("posting_control", {
  id: text("id").primaryKey().default("global"),
  paused: boolean("paused").notNull().default(false),
  quietEnabled: boolean("quiet_enabled").notNull().default(false),
  /** Час начала тихого окна, МСК 0-23. */
  quietStartHour: integer("quiet_start_hour").notNull().default(21),
  /** Час конца тихого окна (эксклюзивно), МСК 0-23. */
  quietEndHour: integer("quiet_end_hour").notNull().default(9),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export type PostingControl = typeof postingControl.$inferSelect;
export type NewPostingControl = typeof postingControl.$inferInsert;
