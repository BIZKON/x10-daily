-- Источники парсинга: adapter_type (тип адаптера) + status (жизненный цикл).
-- Ниша сместилась на «ИИ-разработка для бизнеса» → добавлены YouTube/GitHub/Reddit/
-- Blog/X-источники. Фетчер (rss-parser) универсален (RSS+Atom), поэтому YouTube/
-- GitHub/Reddit фетчатся как kind='rss'; adapter_type — семантика/доки/спец-хендлинг.
--
-- Обратимо: varchar-колонки с DEFAULT (не enum — enum необратим, DROP VALUE нельзя),
-- ADD COLUMN IF NOT EXISTS + бэкфилл, без потери данных. kind/enabled НЕ трогаем:
-- крон по-прежнему читает kind='rss' AND enabled=true. status — active/inactive/
-- pending (pending всегда enabled=false → в прогоне не участвует, но помечен).
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "adapter_type" varchar(16) NOT NULL DEFAULT 'rss';--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'active';--> statement-breakpoint
UPDATE "sources" SET "status" = CASE WHEN "enabled" THEN 'active' ELSE 'inactive' END;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_status_idx" ON "sources" ("status");
