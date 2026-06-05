-- M4 (session 21) — надёжная дослыка ops-алертов. См.
-- packages/db/src/schema/pipeline.ts (costAlerts) и
-- apps/workers/pipeline/src/{lib/cost-ledger.ts,lib/ops-alert.ts,
-- inngest/functions/retry-ops-alerts.ts}.
--
-- Раньше claim строки (идемпотентность) и отправка в TG были связаны: если send
-- падал (сетевой хиккап / краш между claim и send), строка cost_alerts уже
-- существовала → claimAlert навсегда возвращал false → алерт терялся молча
-- (отказ самого механизма безопасности дневного $-потолка). Разделяем
-- «заклеймлен» и «доставлен»: delivered_at NULL = в очереди на дослыку; cron
-- retry-ops-alerts периодически дослыает по сохранённому message.

ALTER TABLE "cost_alerts" ADD COLUMN IF NOT EXISTS "message" text;
--> statement-breakpoint
ALTER TABLE "cost_alerts" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "cost_alerts" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "cost_alerts" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint

-- Пред-существующие строки (до колонки delivered_at) считаем уже обработанными,
-- чтобы sweeper не дослал старые алерты задним числом. message у них NULL →
-- дослать всё равно нельзя; помечаем delivered_at = created_at явно.
UPDATE "cost_alerts" SET "delivered_at" = "created_at" WHERE "delivered_at" IS NULL;
--> statement-breakpoint

-- Частичный индекс: sweeper сканит только недоставленные строки (обычно 0).
CREATE INDEX IF NOT EXISTS "cost_alerts_pending_idx"
  ON "cost_alerts" ("created_at") WHERE "delivered_at" IS NULL;
