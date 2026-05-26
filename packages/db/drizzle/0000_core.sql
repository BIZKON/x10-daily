CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."user_platform" AS ENUM('telegram', 'max', 'web');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('reader', 'subscriber', 'author', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('rss', 'api', 'scrape', 'telegram', 'manual');--> statement-breakpoint
CREATE TYPE "public"."source_tier" AS ENUM('primary', 'secondary', 'fringe');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('fetched', 'deduped', 'selected', 'dropped', 'errored');--> statement-breakpoint
CREATE TYPE "public"."article_section" AS ENUM('main', 'numbers', 'people', 'playbook', 'weekend', 'longread', 'newsletter');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'in_pipeline', 'ready', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_kind" AS ENUM('ingest', 'draft', 'numbers', 'factcheck', 'tov', 'brevity', 'audio', 'hookgen', 'social', 'visual', 'score', 'newsletter');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'halted', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."subscription_provider" AS ENUM('telegram_stars', 'yookassa', 'manual');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'cancelled', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'paid', 'premium');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "user_platform" NOT NULL,
	"platform_user_id" varchar(64) NOT NULL,
	"username" varchar(64),
	"display_name" varchar(128),
	"email" varchar(254),
	"role" "user_role" DEFAULT 'reader' NOT NULL,
	"locale" varchar(8) DEFAULT 'ru' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"kind" "source_kind" NOT NULL,
	"tier" "source_tier" DEFAULT 'secondary' NOT NULL,
	"url" text NOT NULL,
	"locale" varchar(8) DEFAULT 'ru' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"poll_interval_sec" integer DEFAULT 900 NOT NULL,
	"last_polled_at" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" varchar(256) NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"raw_content" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"status" "ingest_status" DEFAULT 'fetched' NOT NULL,
	"dedupe_key" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"section" "article_section" DEFAULT 'main' NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"author_id" uuid,
	"editor_id" uuid,
	"tease" text NOT NULL,
	"lede" text NOT NULL,
	"why_it_matters" text,
	"body" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hooks" jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"read_seconds" integer DEFAULT 0 NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_url" text,
	"audio_duration_sec" integer,
	"is_paid" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" "agent_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"model_override" varchar(64),
	"confidence_threshold" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid,
	"agent" "agent_kind" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"model_used" varchar(64),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" "subscription_provider" DEFAULT 'manual' NOT NULL,
	"provider_subscription_id" varchar(128),
	"price_rub" integer,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"model" varchar(64) NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_embeddings" ADD CONSTRAINT "article_embeddings_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_platform_uid_idx" ON "users" USING btree ("platform","platform_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled","tier");--> statement-breakpoint
CREATE INDEX "sources_kind_idx" ON "sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ingest_source_extid_idx" ON "ingest_items" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "ingest_status_idx" ON "ingest_items" USING btree ("status","fetched_at");--> statement-breakpoint
CREATE INDEX "ingest_dedupe_idx" ON "ingest_items" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_uidx" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_section_pub_idx" ON "articles" USING btree ("section","published_at");--> statement-breakpoint
CREATE INDEX "runs_article_agent_idx" ON "pipeline_runs" USING btree ("article_id","agent");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "pipeline_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subs_user_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subs_period_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "embeddings_article_idx" ON "article_embeddings" USING btree ("article_id","chunk_index");