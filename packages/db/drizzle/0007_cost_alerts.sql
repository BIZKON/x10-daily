-- Пост-M0 hardening (session 20) — идемпотентный реестр $-алертов автономного
-- конвейера. См. packages/db/src/schema/pipeline.ts (costAlerts) и
-- apps/workers/pipeline/src/lib/cost-ledger.ts.
--
-- Назначение: «один алерт на (день МСК, порог)». draft-article клеймит строку
-- через INSERT ... ON CONFLICT DO NOTHING на (alert_date, threshold_kind);
-- уведомление шлётся только при реальной вставке → ретраи Inngest-шага и
-- параллельные раны не дублируют алерт. Счётчик дневного расхода — отдельно,
-- по sum(pipeline_runs.cost_usd) за календарный день МСК.

DO $$ BEGIN
  CREATE TYPE "cost_alert_kind" AS ENUM ('warn', 'exhausted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cost_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "alert_date" date NOT NULL,
  "threshold_kind" "cost_alert_kind" NOT NULL,
  "spend_usd" numeric(10, 6) NOT NULL DEFAULT '0',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cost_alerts_date_kind_uidx"
  ON "cost_alerts" ("alert_date", "threshold_kind");
