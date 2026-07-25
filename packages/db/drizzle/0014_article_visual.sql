-- ИИ-обложки статей (Спека 2). Генерация Nano Banana 2 через Timeweb AI Gateway,
-- публикация ТОЛЬКО после ревью редактора в админке (HumanGate на картинку).
--
-- `visual_status` — varchar + CHECK, а НЕ pg enum: обратимо и не требует ADD VALUE.
-- Грабля s28: drizzle-kit оборачивает всю пачку pending-миграций в ОДНУ
-- транзакцию, поэтому ADD VALUE + использование значения в разных файлах не
-- спасает («unsafe use of new value»). varchar этой проблемы лишён.
--
-- `cover_image_url` уже существует (используется лентой) — переиспользуем его как
-- адрес готовой картинки, здесь не трогаем.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "visual_status" varchar(20) DEFAULT 'none' NOT NULL;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "visual_prompt" text;

-- Ограничение целостности: только известные состояния конвейера обложки.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'articles_visual_status_check'
  ) THEN
    ALTER TABLE "articles" ADD CONSTRAINT "articles_visual_status_check"
      CHECK ("visual_status" IN ('none', 'generating', 'pending_review', 'approved', 'rejected'));
  END IF;
END $$;

-- Очередь ревью в админке селектит по статусу.
CREATE INDEX IF NOT EXISTS "articles_visual_status_idx" ON "articles" ("visual_status");
