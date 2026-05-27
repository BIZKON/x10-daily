import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./users";

/**
 * Authors — brief §6 type Author.
 *
 * Отличается от users: не все авторы зарегистрированы в системе (гостевые посты),
 * и не каждый user — автор. user_id опциональная связь, slug — публичный URL.
 *
 * isFlagship = true для Игоря Рыбакова (главный авторский голос медиа, brief §1.6).
 */
export const authors = pgTable(
  "authors",
  {
    id: id(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** "Главный редактор", "Журналист", "Гость", "Игорь Рыбаков". */
    role: varchar("role", { length: 80 }).notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    /** Hex или CSS-цвет для byline (brief §6 bylineColor). */
    bylineColor: varchar("byline_color", { length: 16 }),
    /** Сотрудник редакции (не гостевой автор). */
    isStaff: boolean("is_staff").notNull().default(false),
    /** Игорь Рыбаков — главный голос. */
    isFlagship: boolean("is_flagship").notNull().default(false),
    /** Подписчики на автора (brief §11 — engagement метрика). */
    subscriberCount: integer("subscriber_count").notNull().default(0),
    /** Опциональная связь с users — для авторов, которые есть в системе. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("authors_slug_uidx").on(t.slug),
    index("authors_flagship_idx").on(t.isFlagship),
    index("authors_user_idx").on(t.userId),
  ],
);

export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;
