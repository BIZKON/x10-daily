import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./users";

/**
 * Настройки профиля (Tier-2, session 25): подписки на рубрики + расписание
 * дайджеста. Одна строка на пользователя.
 *
 * ⚠️ Персистится БЕЗ потребителя на данный момент: персональный дайджест и
 * push по расписанию ещё не построены. Настройки сохраняются (реальный
 * preference-center) и готовы к подключению этих фич. До тех пор это «твои
 * предпочтения сохранены», но рассылка их пока не использует.
 */
export type DigestSchedule = {
  /** 07:00 МСК — утренний разбор. */
  morning: boolean;
  /** 13:00 МСК — обеденная карусель. */
  lunch: boolean;
  /** 19:00 МСК — вечерний дайджест. */
  evening: boolean;
};

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Ключи рубрик: taxes/money/practice/power/tech/rybakov. */
    subscribedCategories: text("subscribed_categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    digestSchedule: jsonb("digest_schedule")
      .$type<DigestSchedule>()
      .notNull()
      .default(sql`'{"morning":true,"lunch":true,"evening":false}'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_prefs_user_uidx").on(t.userId)],
);

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
