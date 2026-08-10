import { boolean, index, integer, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./users";

/**
 * База знаний клиента (миграция 0024, реестр разрыва §3.1).
 *
 * Смысл раздела одной фразой: в чате контекст — часть запроса, здесь контекст —
 * часть системы. Клиент один раз рассказывает о своём бизнесе, дальше все
 * агенты пишут, зная его продукты, цены, возражения и запреты.
 *
 * 🔴 Векторного поиска нет намеренно — обоснование в шапке миграции.
 * Коротко: эмбеддингов в проекте не существует вовсе, а база знаний клиента
 * мала и структурирована полками. Нужную полку кладём в промпт целиком.
 */

/**
 * Полка — смысловой раздел знания, а не папка файлов.
 *
 * Набор полок — конфигурация экземпляра: у стоматологии и у логистики они
 * разные. Стартовые семь засеяны миграцией, клиент правит их сам.
 */
export const kbShelves = pgTable(
  "kb_shelves",
  {
    id: id(),
    slug: varchar("slug", { length: 48 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    /** «Зачем эта полка» по-русски — канон админки: объяснять себя без нас. */
    purpose: text("purpose").notNull(),
    /** Вопрос анкеты: пока полки пусты, экран спрашивает, а не молчит формой. */
    question: text("question").notNull(),
    hint: text("hint"),
    position: integer("position").notNull().default(0),
    /** Обязательная попадает в анкету и считается в прогрессе заполнения. */
    required: boolean("required").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("kb_shelves_slug_uidx").on(t.slug),
    index("kb_shelves_order_idx").on(t.enabled, t.position),
  ],
);

/** Откуда пришёл материал. */
export const KB_SOURCES = ["answer", "file", "url"] as const;
export type KbSource = (typeof KB_SOURCES)[number];

/**
 * Состояние материала. `ready` — можно класть в промпт; `parsing` — файл
 * разбирается; `failed` — текста из файла не достали.
 */
export const KB_STATUSES = ["ready", "parsing", "failed"] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

/**
 * Материал на полке.
 *
 * 🔴 Ответ человека в анкете и загруженный файл — ОДНА сущность, различаются
 * полем `source`. Две таблицы означали бы два хранилища одного знания и две
 * выборки для промпта, которые неизбежно разъедутся.
 */
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: id(),
    /** RESTRICT: удаление полки не должно молча уносить знание вместе с ней. */
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => kbShelves.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 240 }).notNull(),
    source: varchar("source", { length: 16 }).$type<KbSource>().notNull().default("answer"),
    /** Текст, который реально уедет в промпт. Для `answer` — сам ответ. */
    body: text("body").notNull(),
    fileName: varchar("file_name", { length: 240 }),
    fileBytes: integer("file_bytes"),
    sourceUrl: text("source_url"),
    status: varchar("status", { length: 16 }).$type<KbStatus>().notNull().default("ready"),
    statusReason: text("status_reason"),
    charCount: integer("char_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("kb_documents_shelf_idx").on(t.shelfId, t.createdAt),
    index("kb_documents_ready_idx").on(t.status, t.shelfId),
  ],
);

export type KbShelf = typeof kbShelves.$inferSelect;
export type NewKbShelf = typeof kbShelves.$inferInsert;
export type KbDocument = typeof kbDocuments.$inferSelect;
export type NewKbDocument = typeof kbDocuments.$inferInsert;
