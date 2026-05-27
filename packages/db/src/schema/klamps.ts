import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

/**
 * Klamps — сообщество Рыбакова, малые группы 6-10 человек (brief §2.1, §6 type Klamp).
 *
 * ~30 885 кламперов по 124 городам (см. CLAUDE.md §1, COMMUNITY_STATS mock).
 * Регулярные встречи (offline/online), лидер ведёт.
 */
export const klamps = pgTable(
  "klamps",
  {
    id: id(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    /** ISO-3166 страна — РФ, KZ, AE, KG и т.д. */
    country: varchar("country", { length: 4 }).notNull().default("РФ"),
    /** Имя лидера клампа (региональный кламп-лидер). */
    leadName: varchar("lead_name", { length: 120 }).notNull(),
    /** Контакт лидера — TG username, email или телефон. */
    leadContact: text("lead_contact"),
    memberCount: integer("member_count").notNull().default(0),
    /** Принимают ли новых участников (brief §6 isOpen). */
    isOpen: boolean("is_open").notNull().default(true),
    /** "каждый второй четверг 19:00", "ежемесячно последняя суббота" и т.д. */
    meetingSchedule: varchar("meeting_schedule", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    /** Опциональная цель клампа: "Запустить совместный AI-сервис за 90 дней" (см. MY_CLUMP mock). */
    goal: text("goal"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("klamps_slug_uidx").on(t.slug),
    index("klamps_city_idx").on(t.city),
    index("klamps_country_open_idx").on(t.country, t.isOpen),
  ],
);

export type Klamp = typeof klamps.$inferSelect;
export type NewKlamp = typeof klamps.$inferInsert;
