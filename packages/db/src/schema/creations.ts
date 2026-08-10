import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { articles } from "./articles";
import { users } from "./users";

/**
 * Ручной режим — раздел «Создать» (миграция 0025, реестр разрыва §3.2).
 *
 * Отличие от чата ровно в режимах. В чате человек стоит перед пустым полем и
 * обязан описать задачу целиком — отсюда общие тексты. Здесь «как делается
 * правильно» лежит в `guidance` самого режима, а от человека нужна только тема.
 */

/** Режим создания — конфигурация экземпляра, а не константа кода. */
export const creationModes = pgTable(
  "creation_modes",
  {
    id: id(),
    slug: varchar("slug", { length: 48 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    /** Подпись на кнопке: «текст с обложкой», «до 10 слайдов». */
    subtitle: varchar("subtitle", { length: 160 }),
    /** «Зачем этот режим» по-русски — канон админки. */
    purpose: text("purpose").notNull(),
    /** 🔴 То самое «внутри уже прописано». Уходит в промпт вместе со знаниями. */
    guidance: text("guidance").notNull(),
    /** Полки базы знаний для этого режима. Пусто = все доступные. */
    shelfSlugs: text("shelf_slugs").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    /**
     * 🔴 Режим виден всегда, но недоступный честно помечен «готовится».
     * Из шести обещанных в КП сегодня работает один. Неработающая кнопка
     * читается как обман, а её отсутствие — как невыполненное обещание.
     */
    available: boolean("available").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("creation_modes_slug_uidx").on(t.slug),
    index("creation_modes_order_idx").on(t.enabled, t.position),
  ],
);

export const CREATION_STATUSES = ["queued", "running", "ready", "failed"] as const;
export type CreationStatus = (typeof CREATION_STATUSES)[number];

/** Форма результата зависит от режима, поэтому jsonb, а не колонки. */
export type CreationResult = {
  title?: string;
  body?: string;
  /** Что ещё вернул режим — слайды, сцены, блоки. */
  [key: string]: unknown;
};

/** Одно задание человека и то, что из него вышло. */
export const creations = pgTable(
  "creations",
  {
    id: id(),
    /** RESTRICT: снос режима не должен уносить историю сделанного им. */
    modeId: uuid("mode_id")
      .notNull()
      .references(() => creationModes.id, { onDelete: "restrict" }),
    /** О чём просил человек, дословно. */
    prompt: text("prompt").notNull(),
    status: varchar("status", { length: 16 }).$type<CreationStatus>().notNull().default("queued"),
    statusReason: text("status_reason"),
    result: jsonb("result").$type<CreationResult>(),
    /**
     * 🔴 Что реально ушло в модель из базы знаний. База меняется, и без снимка
     * на вопрос «почему получилось так» через неделю ответить нечем.
     */
    knowledgeUsed: text("knowledge_used"),
    /** Если материал отправили в очередь публикации. */
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("creations_recent_idx").on(t.createdAt),
    index("creations_mode_idx").on(t.modeId, t.createdAt),
  ],
);

export type CreationMode = typeof creationModes.$inferSelect;
export type NewCreationMode = typeof creationModes.$inferInsert;
export type Creation = typeof creations.$inferSelect;
export type NewCreation = typeof creations.$inferInsert;
