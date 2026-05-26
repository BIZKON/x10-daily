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
import { users } from "./users";

export const articleStatus = pgEnum("article_status", [
  "draft",
  "in_pipeline",
  "ready",
  "scheduled",
  "published",
  "archived",
]);

export const articleSection = pgEnum("article_section", [
  "main",
  "numbers",
  "people",
  "playbook",
  "weekend",
  "longread",
  "newsletter",
]);

export const articles = pgTable(
  "articles",
  {
    id: id(),
    slug: varchar("slug", { length: 160 }).notNull(),
    section: articleSection("section").notNull().default("main"),
    status: articleStatus("status").notNull().default("draft"),

    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    editorId: uuid("editor_id").references(() => users.id, { onDelete: "set null" }),

    tease: text("tease").notNull(),
    lede: text("lede").notNull(),
    whyItMatters: text("why_it_matters"),
    body: jsonb("body").$type<ArticleBlock[]>().notNull().default(sql`'[]'::jsonb`),
    hooks: jsonb("hooks").$type<Hook[]>(),

    wordCount: integer("word_count").notNull().default(0),
    readSeconds: integer("read_seconds").notNull().default(0),

    sourceIds: jsonb("source_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    citations: jsonb("citations")
      .$type<Citation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    audioUrl: text("audio_url"),
    audioDurationSec: integer("audio_duration_sec"),

    isPaid: boolean("is_paid").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("articles_slug_uidx").on(t.slug),
    index("articles_status_idx").on(t.status, t.publishedAt),
    index("articles_section_pub_idx").on(t.section, t.publishedAt),
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
