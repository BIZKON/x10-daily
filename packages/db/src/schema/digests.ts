import { sql } from "drizzle-orm";
import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

/**
 * Утренний дайджест (brief §3.7 + §6 type DailyDigest).
 *
 * Один digest = одна дата. Содержит:
 * - intro (приветствие + дата);
 * - top_article_ids: 5-7 главных за вчера-сегодня (порядок имеет значение);
 * - rybakov_take (опц.): короткое мнение Рыбакова;
 * - premium_teaser (опц.): тизер платной статьи;
 * - tomorrow: анонс того что будет завтра.
 *
 * NewsletterAssembleAgent (apps/workers/pipeline) генерирует digest →
 * редактор финалит в admin → отправляется в 07:00 локального времени.
 */
export type RybakovTake = {
  quote: string;
  context: string;
};

export type PremiumTeaser = {
  title: string;
  articleId: string;
};

export const digests = pgTable(
  "digests",
  {
    id: id(),
    /** Дата выпуска — ровно одна на день. */
    issueDate: date("issue_date").notNull(),
    intro: text("intro").notNull(),
    /** Порядок имеет значение — это очерёдность в дайджесте. */
    topArticleIds: jsonb("top_article_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    rybakovTake: jsonb("rybakov_take").$type<RybakovTake>(),
    premiumTeaser: jsonb("premium_teaser").$type<PremiumTeaser>(),
    tomorrow: text("tomorrow"),
    /** Когда был отправлен пуш/email. null = ещё не отправлен. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("digests_issue_date_uidx").on(t.issueDate),
    /** Для query "ещё не отправлен" — фильтрация по issueDate сортируя по sentAt. */
    index("digests_sent_idx").on(t.sentAt, t.issueDate),
  ],
);

export type Digest = typeof digests.$inferSelect;
export type NewDigest = typeof digests.$inferInsert;
