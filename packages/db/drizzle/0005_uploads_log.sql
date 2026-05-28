-- HIGH-7 из docs/SECURITY-AUDIT.md — per-user upload quota + audit trail.
-- См. packages/db/src/schema/uploads.ts и apps/api/src/upload-quota.ts.
--
-- Назначение:
--   1. Rolling 24h counter для cap 100 файлов / 500 MB per editor/admin.
--   2. Audit trail — кто/что/когда залил для редколлегии.

CREATE TABLE IF NOT EXISTS "uploads_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" varchar(256) NOT NULL,
  "content_type" varchar(64) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "r2_key" text NOT NULL,
  "public_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Composite (user_id, created_at) для quota check:
--   SELECT count(*), sum(size_bytes) FROM uploads_log
--   WHERE user_id = $1 AND created_at > now() - interval '24 hours';
CREATE INDEX IF NOT EXISTS "uploads_log_user_created_idx"
  ON "uploads_log" ("user_id", "created_at");
