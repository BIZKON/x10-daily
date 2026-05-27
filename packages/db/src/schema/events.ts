import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

/**
 * Brief §2.2 — типы событий Х10.
 */
export const eventType = pgEnum("event_type", [
  "kod-x10", // КОД Х10 — главное ежегодное событие
  "meet-up", // Business Meet Up в городах
  "breakfast", // Кламперский бизнес-завтрак
  "festival", // PRO Женщин и аналоги
  "webinar", // Онлайн-разбор
]);
export type EventTypeKind = (typeof eventType.enumValues)[number];

/**
 * Venue для offline событий. Хранится как jsonb для гибкости.
 */
export type EventVenue = {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

/**
 * Events — brief §6 type Event.
 * Поддерживает offline (с venue) и online (isOnline=true, venue=null).
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    type: eventType("type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    /** Если null → однодневное событие. */
    endDate: timestamp("end_date", { withTimezone: true }),
    /** IANA tz, по умолчанию Europe/Moscow. */
    timezone: varchar("timezone", { length: 40 }).notNull().default("Europe/Moscow"),
    /** Город, может быть null для onlineр. */
    city: varchar("city", { length: 80 }),
    venue: jsonb("venue").$type<EventVenue>(),
    isOnline: boolean("is_online").notNull().default(false),
    organizer: varchar("organizer", { length: 120 }).notNull(),
    /** Минимальная цена билета в рублях. null = бесплатно. */
    ticketPriceFrom: integer("ticket_price_from"),
    ticketUrl: text("ticket_url"),
    /** Спикеры — массив authors.id. Хранится как jsonb для совместимости с pgvector miragtions. */
    speakerIds: jsonb("speaker_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    description: text("description").notNull(),
    coverImageUrl: text("cover_image_url"),
    registeredCount: integer("registered_count").notNull().default(0),
    /** Capacity = null → без лимита. */
    capacity: integer("capacity"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("events_slug_uidx").on(t.slug),
    /** Ключевой индекс для UI: события по дате (показываем upcoming). */
    index("events_start_date_idx").on(t.startDate),
    index("events_city_start_idx").on(t.city, t.startDate),
    index("events_type_idx").on(t.type),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
