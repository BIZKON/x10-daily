-- Карточки ревью в Telegram (Спека 4).
--
-- Связь «статья ↔ сообщение с кнопками в группе». Нужна, чтобы редактировать
-- сообщение, снимать кнопки после решения и находить статью по ответу в треде
-- (кнопка «Рерайт» просит прислать правку ответом).
--
-- Отдельная таблица, а не колонки в articles: карточек у статьи может быть
-- несколько (после рерайта приходит новая), а история решений — это аудит
-- HumanGate, затирать его нельзя.
--
-- 🔴 tenant_id нет: каждый клиент получает отдельную копию системы.
CREATE TABLE IF NOT EXISTS "review_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  -- Адрес сообщения для editMessage*. chat_id — bigint: id супергрупп
  -- отрицательные и выходят за int4 (-100...).
  "chat_id" bigint NOT NULL,
  "message_id" bigint NOT NULL,
  -- awaiting — ждёт решения; decided — решение принято; superseded — заменена
  -- новой карточкой после рерайта или перегенерации.
  "state" varchar(16) DEFAULT 'awaiting' NOT NULL,
  -- Что решили: approve / reject / regenerate / rewrite. NULL пока ждём.
  "decision" varchar(16),
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  -- id сообщения «пришли правку ответом» — по ответу на него ищем статью.
  "prompt_message_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Поиск карточки по сообщению: приходит callback_query с message_id.
CREATE UNIQUE INDEX IF NOT EXISTS "review_cards_chat_message_uidx"
  ON "review_cards" ("chat_id", "message_id");

-- Поиск по ответу в треде (кнопка «Рерайт»).
CREATE INDEX IF NOT EXISTS "review_cards_prompt_idx"
  ON "review_cards" ("chat_id", "prompt_message_id")
  WHERE "prompt_message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "review_cards_article_idx" ON "review_cards" ("article_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_cards_state_check') THEN
    ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_state_check"
      CHECK ("state" IN ('awaiting', 'decided', 'superseded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_cards_decision_check') THEN
    ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_decision_check"
      CHECK ("decision" IS NULL OR "decision" IN ('approve', 'reject', 'regenerate', 'rewrite'));
  END IF;
END $$;
