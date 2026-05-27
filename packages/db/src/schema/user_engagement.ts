import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { articles } from "./articles";
import { id, timestamps } from "./_shared";
import { users } from "./users";

/**
 * Brief §6 type Article.reactions: { fire, insight, question } — 3 типа реакций.
 * Каждый user может поставить любую комбинацию (отдельная реакция fire, insight, question).
 */
export const reactionKind = pgEnum("reaction_kind", ["fire", "insight", "question"]);
export type ReactionKind = (typeof reactionKind.enumValues)[number];

/**
 * Реакции пользователей на статьи. Composite PK = (user_id, article_id, kind):
 * один user может поставить fire + insight + question, но НЕ fire дважды.
 *
 * Денормализованные счётчики живут в articles.reactions (jsonb).
 * При INSERT/DELETE сюда — должен обновляться counter (через trigger или приложение).
 */
export const reactions = pgTable(
  "reactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    kind: reactionKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId, t.kind] }),
    /** Для backfill счётчиков и аналитики ScoreAgent. */
    index("reactions_article_kind_idx").on(t.articleId, t.kind),
  ],
);

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;

/**
 * Bookmarks — сохранённые статьи. Brief §11: «доля сохранивших хотя бы 1 материал ≥ 40%» —
 * ключевая метрика привычки.
 *
 * Composite PK (user_id, article_id) — статья либо сохранена, либо нет.
 */
export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId] }),
    /** Для list-view: "мои закладки" — последние сохранённые. */
    index("bookmarks_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

/**
 * Прогресс чтения статьи — brief §6 type UserProgress.
 *
 * Не composite PK (нужен отдельный id для аналитики), но (user_id, article_id) уникальны.
 * read_percent 0..100, completed = true если read_percent >= 90.
 *
 * Brief §11: «среднее время чтения карточки ≥ 60%», «доля дочитавших лонгрид ≥ 35%».
 */
export const userReadingHistory = pgTable(
  "user_reading_history",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** Процент прокрутки 0..100. */
    readPercent: smallint("read_percent").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** Время в секундах активного чтения (если miniapp шлёт heartbeats). */
    readSeconds: integer("read_seconds").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    /** (user, article) — уникальная пара: один запис прогресса на статью. */
    uniqueIndex("reading_history_user_article_uidx").on(t.userId, t.articleId),
    /** Для list-view: "история чтения" — последние просмотренные. */
    index("reading_history_user_last_idx").on(t.userId, t.lastReadAt),
    /** Для ScoreAgent: глубина прокрутки per article. */
    index("reading_history_article_idx").on(t.articleId),
  ],
);

export type UserReadingHistory = typeof userReadingHistory.$inferSelect;
export type NewUserReadingHistory = typeof userReadingHistory.$inferInsert;
