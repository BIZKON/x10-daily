-- Два дефекта очереди публикаций (реестр разрыва §3.12, спека 13.08).
--
-- Оба тихие при одном канале и одном формате — и оба выстрелят на первом же
-- клиенте, которому продали КП.
--
-- Дефект 1: уникальный индекс (article_id, channel) физически запрещает вторую
-- строку. КП продаёт «пост, карусель, ролик и ролик с ведущим из одной темы,
-- без доплаты за переупаковку» — то есть ровно то, что нельзя было записать.
--
-- Дефект 2: состояние выводилось из `posted_at` — пусто «в очереди», заполнено
-- «опубликовано», третьего не дано. Снятый модерацией пост навсегда числился
-- опубликованным, и отчёт клиенту врал. ВКонтакте и Instagram снимают
-- регулярно, VK Клипы проходят премодерацию.

-- ── 1. Формат публикации ─────────────────────────────────────────────────
-- Четыре значения из КП. Дефолт `post` делает миграцию безопасной: всё, что
-- уже лежит в очереди, и есть посты.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "format" varchar(16) NOT NULL DEFAULT 'post';

ALTER TABLE "channels" DROP CONSTRAINT IF EXISTS "channels_format_chk";
ALTER TABLE "channels" ADD CONSTRAINT "channels_format_chk"
  CHECK ("format" IN ('post', 'carousel', 'video', 'host_video'));

-- ── 2. Явное состояние строки ────────────────────────────────────────────
-- 🔴 Состояние перестаёт выводиться из времени публикации. «Отклонено» через
-- `posted_at` не выразить вовсе, а третье состояние, пришитое второй нулевой
-- колонкой, читается только тем, кто помнит обе.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'queued';

-- Заполняем ДО смены индексов и до выката нового кода: опубликованное
-- определяется по той же колонке, по которой очередь жила до сих пор.
UPDATE "channels" SET "status" = 'posted' WHERE "posted_at" IS NOT NULL AND "status" = 'queued';

ALTER TABLE "channels" DROP CONSTRAINT IF EXISTS "channels_status_chk";
ALTER TABLE "channels" ADD CONSTRAINT "channels_status_chk"
  CHECK ("status" IN ('queued', 'posted', 'rejected'));

-- ── 3. Снятие площадкой ──────────────────────────────────────────────────
-- Причина обязательна на уровне интерфейса: «сняли» без причины не помогает ни
-- повторить, ни не повторить. В схеме колонка nullable — у строк, которые
-- никогда не снимали, её просто нет.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz;
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "rejected_reason" text;

-- ── 4. Уникальность с форматом ───────────────────────────────────────────
-- Это и есть починка первого дефекта: один материал живёт в площадке столько
-- раз, сколько у него форматов.
DROP INDEX IF EXISTS "channels_article_channel_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "channels_article_channel_format_uidx"
  ON "channels" ("article_id", "channel", "format");

-- Очередь теперь читается по статусу, а не по отсутствию времени публикации.
DROP INDEX IF EXISTS "channels_pending_idx";
CREATE INDEX IF NOT EXISTS "channels_queued_idx"
  ON "channels" ("created_at") WHERE "status" = 'queued';
