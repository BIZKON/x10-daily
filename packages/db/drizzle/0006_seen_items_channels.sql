-- Walking Skeleton (ТЗ #1) — узкий дедуп-реестр + per-channel Content Objects.
-- См. packages/db/src/schema/seen.ts и channels.ts.

CREATE TABLE IF NOT EXISTS "seen_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_id" uuid NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
  "external_id" varchar(256) NOT NULL,
  "fingerprint" varchar(64),
  "first_seen_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "seen_items_source_extid_uidx"
  ON "seen_items" ("source_id", "external_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "seen_items_fingerprint_idx"
  ON "seen_items" ("fingerprint");
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "channel_kind" AS ENUM ('tg', 'vk', 'dzen', 'linkedin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "channel" "channel_kind" NOT NULL,
  "text" text NOT NULL,
  "visual_ref" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "channels_article_channel_uidx"
  ON "channels" ("article_id", "channel");
