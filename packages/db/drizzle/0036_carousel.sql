-- Карусель: слайды материала, нарисованные кодом (КП §«форматы», реестр §3.5).
--
-- 🔴 Слайды лежат JSON-массивом в самой статье, а не отдельной таблицей.
-- Причина простая: слайд не живёт без материала, отдельно не ищется и не
-- переиспользуется — таблица дала бы join на каждый показ и каскад на каждое
-- удаление, не дав ничего взамен. Порядок слайдов — порядок элементов массива:
-- он и есть смысл карусели, отдельным полем его хранить негде.
--
-- Формат элемента: {"index":1,"kind":"cover","title":"…","body":"…",
-- "source":"…","url":"https://…/covers/<id>-<hash>.png"}
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "carousel" jsonb;

-- Состояние карусели — тот же путь, что у обложки (0014): none → generating →
-- pending_review → approved | rejected. В канал альбом уходит ТОЛЬКО при
-- approved: HumanGate обязателен на каждой публикации.
-- varchar+CHECK, не pg enum — enum не умеет DROP VALUE.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "carousel_status" varchar(20) NOT NULL DEFAULT 'none';

ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_carousel_status_chk";
ALTER TABLE "articles" ADD CONSTRAINT "articles_carousel_status_chk"
  CHECK ("carousel_status" IN ('none', 'generating', 'pending_review', 'approved', 'rejected'));

-- Очередь редактора: карусели, ждущие одобрения. Частичный индекс — строк с
-- этим состоянием единицы, а статей десятки тысяч.
CREATE INDEX IF NOT EXISTS "articles_carousel_pending_idx"
  ON "articles" ("created_at" DESC) WHERE "carousel_status" = 'pending_review';
