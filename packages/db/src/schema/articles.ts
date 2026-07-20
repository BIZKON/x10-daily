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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { authors } from "./authors";
import { users } from "./users";

export const articleStatus = pgEnum("article_status", [
  "draft",
  "in_pipeline",
  "ready",
  "scheduled",
  "published",
  "archived",
]);

/**
 * Pipeline-internal section (наследие до Content Architecture Brief v1.0).
 * Используется только для совместимости с существующими pipeline_runs и legacy данными.
 * Не показывать в UI — для пользователя category важна.
 */
export const articleSection = pgEnum("article_section", [
  "main",
  "numbers",
  "people",
  "playbook",
  "weekend",
  "longread",
  "newsletter",
]);

/**
 * User-facing категории — рубрикатор ProAgent AI (ребрендинг Р4, июль 2026).
 * Актуальный набор: news «Новости ИИ» (дефолт) / cases «Кейсы» / howto
 * «Обучение» / tools «Инструменты» / business «Практика» / founder «От основателя».
 *
 * ⚠️ Первые 6 значений — мёртвое наследие X10: PG не умеет DROP VALUE из
 * enum, значения остаются в типе, но из кода/UI выведены (миграция 0012 —
 * ADD VALUE, 0013 — новый DEFAULT).
 */
export const articleCategory = pgEnum("article_category", [
  // — мёртвые значения X10 (в новых записях НЕ использовать) —
  "taxes",
  "money",
  "practice",
  "power",
  "tech",
  "rybakov",
  // — рубрикатор ProAgent AI —
  "news",
  "cases",
  "howto",
  "tools",
  "business",
  "founder",
]);

/**
 * Шаблон материала — по §3 brief'a.
 * Определяет ожидаемую длину, структуру и UI-рендеринг.
 */
export const articleTemplate = pgEnum("article_template", [
  "card-news",
  "deep-dive",
  "daily-take",
  "guide",
  "digest",
]);

export const articles = pgTable(
  "articles",
  {
    id: id(),
    slug: varchar("slug", { length: 160 }).notNull(),
    section: articleSection("section").notNull().default("main"),
    status: articleStatus("status").notNull().default("draft"),

    /** User-facing рубрика (рубрикатор ProAgent AI, дефолт — «Новости ИИ»). */
    category: articleCategory("category").notNull().default("news"),
    /** Подкатегория второго уровня — "news.agents", "cases.retail" и т.д. (открытая строка). */
    subcategory: varchar("subcategory", { length: 64 }),
    /** Шаблон материала — brief §3. */
    template: articleTemplate("template").notNull().default("card-news"),
    /** Открытый набор тегов — brief §5. */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),

    /** Обложка для DeepDive/Event-карточек (brief §6). */
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: text("cover_image_alt"),

    /** Автор статьи — ссылка на authors (богатый профиль), brief §6. */
    authorId: uuid("author_id").references(() => authors.id, { onDelete: "set null" }),
    /** Наследие: ссылка на users-аккаунт автора (для совместимости pipeline_runs). */
    legacyAuthorUserId: uuid("legacy_author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    editorId: uuid("editor_id").references(() => users.id, { onDelete: "set null" }),

    tease: text("tease").notNull(),
    lede: text("lede").notNull(),
    whyItMatters: text("why_it_matters"),
    body: jsonb("body").$type<ArticleBlock[]>().notNull().default(sql`'[]'::jsonb`),
    hooks: jsonb("hooks").$type<Hook[]>(),

    wordCount: integer("word_count").notNull().default(0),
    readSeconds: integer("read_seconds").notNull().default(0),

    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    citations: jsonb("citations").$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),

    audioUrl: text("audio_url"),
    audioDurationSec: integer("audio_duration_sec"),

    isPaid: boolean("is_paid").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),

    /** Engagement counters — brief §6. Денормализованные счётчики для list-view без JOIN. */
    reactions: jsonb("reactions")
      .$type<{ fire: number; insight: number; question: number }>()
      .notNull()
      .default(sql`'{"fire":0,"insight":0,"question":0}'::jsonb`),
    commentCount: integer("comment_count").notNull().default(0),
    bookmarkCount: integer("bookmark_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("articles_slug_uidx").on(t.slug),
    index("articles_status_idx").on(t.status, t.publishedAt),
    index("articles_section_pub_idx").on(t.section, t.publishedAt),
    /** Ключевой индекс для UI: лента по категории, отсортированная по дате публикации. */
    index("articles_category_pub_idx").on(t.category, t.publishedAt),
    index("articles_template_idx").on(t.template),
  ],
);

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "numbers"; items: Array<{ label: string; value: string; source?: string }> }
  | { type: "quote"; text: string; attribution: string }
  | { type: "callout"; kind: "why" | "yes-but" | "what-next" | "big-picture"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; url: string; alt: string; credit?: string };

export type Hook = {
  pattern:
    | "number-led"
    | "contrarian"
    | "transformation"
    | "authority"
    | "admission"
    | "future-shock";
  text: string;
  channel: "telegram" | "vk" | "dzen" | "linkedin" | "newsletter-subject";
};

export type Citation = {
  url: string;
  title: string;
  publisher: string;
  publishedAt?: string;
};

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
