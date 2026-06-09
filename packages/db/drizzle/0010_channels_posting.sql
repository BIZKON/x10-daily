-- Слот-постинг (session 23) — расцепляем «статья готова» и «опубликована».
-- См. packages/db/src/schema/channels.ts и
-- apps/workers/pipeline/src/{lib/post-channel.ts,inngest/functions/drain-post-slots.ts}.
--
-- Раньше post-to-tg/post-to-vk постили КАЖДУЮ статью немедленно по article.ready.
-- Теперь channels — очередь: posted_at NULL = в очереди; cron drain-post-slots
-- забирает непостнутые строки по слотам (4/день МСК: 09:30/12:30/15:30/18:30) и
-- постит по одной. attempts/last_error — диагностика; post_ref — id поста (аудит).

ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "posted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "post_ref" text;
--> statement-breakpoint

-- ⚠️ КРИТИЧНО: пред-существующие channels-строки уже были опубликованы немедленно
-- (старая модель post-to-tg/vk по article.ready). Помечаем их posted_at =
-- created_at, иначе drain-post-slots перепостит ВЕСЬ исторический backlog на
-- первом же слоте.
UPDATE "channels" SET "posted_at" = "created_at" WHERE "posted_at" IS NULL;
--> statement-breakpoint

-- Частичный индекс: drain-post-slots сканит только непостнутые строки (обычно мало).
CREATE INDEX IF NOT EXISTS "channels_pending_idx"
  ON "channels" ("created_at") WHERE "posted_at" IS NULL;
