-- X10ContentArchitectureBrief v1.0 §2, §6 — community, events, authors + M1 engagement.
-- Шесть новых таблиц + один enum reaction_kind + перенос articles.author_id.

CREATE TYPE "public"."event_type" AS ENUM('kod-x10', 'meet-up', 'breakfast', 'festival', 'webinar');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('fire', 'insight', 'question');--> statement-breakpoint

-- ============================================================
-- Authors (brief §6) — отдельная сущность от users.
-- ============================================================
CREATE TABLE "authors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "role" varchar(80) NOT NULL,
  "bio" text NOT NULL DEFAULT '',
  "avatar_url" text,
  "byline_color" varchar(16),
  "is_staff" boolean NOT NULL DEFAULT false,
  "is_flagship" boolean NOT NULL DEFAULT false,
  "subscriber_count" integer NOT NULL DEFAULT 0,
  "user_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "authors_slug_uidx" ON "authors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "authors_flagship_idx" ON "authors" USING btree ("is_flagship");--> statement-breakpoint
CREATE INDEX "authors_user_idx" ON "authors" USING btree ("user_id");--> statement-breakpoint

-- ============================================================
-- Articles.author_id: переезд с users → authors.
-- ============================================================
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "articles" RENAME COLUMN "author_id" TO "legacy_author_user_id";--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "author_id" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_authors_id_fk"
  FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_legacy_author_user_id_users_id_fk"
  FOREIGN KEY ("legacy_author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ============================================================
-- Klamps (brief §2.1, §6) — сообщество.
-- ============================================================
CREATE TABLE "klamps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "city" varchar(80) NOT NULL,
  "country" varchar(4) NOT NULL DEFAULT 'РФ',
  "lead_name" varchar(120) NOT NULL,
  "lead_contact" text,
  "member_count" integer NOT NULL DEFAULT 0,
  "is_open" boolean NOT NULL DEFAULT true,
  "meeting_schedule" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "goal" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX "klamps_slug_uidx" ON "klamps" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "klamps_city_idx" ON "klamps" USING btree ("city");--> statement-breakpoint
CREATE INDEX "klamps_country_open_idx" ON "klamps" USING btree ("country", "is_open");--> statement-breakpoint

-- ============================================================
-- Events (brief §2.2, §6) — КОД Х10, Meet Up, бизнес-завтраки.
-- ============================================================
CREATE TABLE "events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(120) NOT NULL,
  "title" varchar(200) NOT NULL,
  "type" "event_type" NOT NULL,
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone,
  "timezone" varchar(40) NOT NULL DEFAULT 'Europe/Moscow',
  "city" varchar(80),
  "venue" jsonb,
  "is_online" boolean NOT NULL DEFAULT false,
  "organizer" varchar(120) NOT NULL,
  "ticket_price_from" integer,
  "ticket_url" text,
  "speaker_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "description" text NOT NULL,
  "cover_image_url" text,
  "registered_count" integer NOT NULL DEFAULT 0,
  "capacity" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX "events_slug_uidx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_city_start_idx" ON "events" USING btree ("city", "start_date");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint

-- ============================================================
-- Digests (brief §3.7, §6) — утренний дайджест.
-- ============================================================
CREATE TABLE "digests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issue_date" date NOT NULL,
  "intro" text NOT NULL,
  "top_article_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rybakov_take" jsonb,
  "premium_teaser" jsonb,
  "tomorrow" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX "digests_issue_date_uidx" ON "digests" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "digests_sent_idx" ON "digests" USING btree ("sent_at", "issue_date");--> statement-breakpoint

-- ============================================================
-- Reactions (brief §6 Article.reactions) — fire/insight/question per user per article.
-- ============================================================
CREATE TABLE "reactions" (
  "user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "kind" "reaction_kind" NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "article_id", "kind")
);--> statement-breakpoint

ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_article_id_articles_id_fk"
  FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "reactions_article_kind_idx" ON "reactions" USING btree ("article_id", "kind");--> statement-breakpoint

-- ============================================================
-- Bookmarks (brief §11 — ≥40% сохранили хотя бы 1 материал).
-- ============================================================
CREATE TABLE "bookmarks" (
  "user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "article_id")
);--> statement-breakpoint

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_article_id_articles_id_fk"
  FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "bookmarks_user_created_idx" ON "bookmarks" USING btree ("user_id", "created_at");--> statement-breakpoint

-- ============================================================
-- User reading history (brief §6 UserProgress + §11 метрики чтения).
-- ============================================================
CREATE TABLE "user_reading_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "read_percent" smallint NOT NULL DEFAULT 0,
  "completed" boolean NOT NULL DEFAULT false,
  "last_read_at" timestamp with time zone NOT NULL DEFAULT now(),
  "read_seconds" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

ALTER TABLE "user_reading_history" ADD CONSTRAINT "user_reading_history_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_history" ADD CONSTRAINT "user_reading_history_article_id_articles_id_fk"
  FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "reading_history_user_article_uidx" ON "user_reading_history" USING btree ("user_id", "article_id");--> statement-breakpoint
CREATE INDEX "reading_history_user_last_idx" ON "user_reading_history" USING btree ("user_id", "last_read_at");--> statement-breakpoint
CREATE INDEX "reading_history_article_idx" ON "user_reading_history" USING btree ("article_id");
