-- Singleton-конфиг автопостинга (session 20) — ручная пауза + тихие часы (МСК).
-- См. packages/db/src/schema/posting_control.ts и posting-control.ts.
--
-- Гейтит автономный конвейер (ingest-rss + post-to-tg). Сидится одной строкой
-- id='global' с тихими часами 21→09 МСК ВКЛЮЧЕНЫ по умолчанию (по требованию:
-- ночью не постить). Меняется из админки /posting без редеплоя.

CREATE TABLE IF NOT EXISTS "posting_control" (
  "id" text PRIMARY KEY DEFAULT 'global',
  "paused" boolean NOT NULL DEFAULT false,
  "quiet_enabled" boolean NOT NULL DEFAULT false,
  "quiet_start_hour" integer NOT NULL DEFAULT 21,
  "quiet_end_hour" integer NOT NULL DEFAULT 9,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "posting_control" ("id", "paused", "quiet_enabled", "quiet_start_hour", "quiet_end_hour")
VALUES ('global', false, true, 21, 9)
ON CONFLICT ("id") DO NOTHING;
