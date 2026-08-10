-- Ручной режим: раздел «Создать» (обещание КП от 10.08.2026, реестр разрыва §3.2).
--
-- Клиент выбирает, ЧТО создаём, коротко говорит, О ЧЁМ, и получает материал.
-- Разница с чатом ровно здесь: в чате человек стоит перед пустым полем и
-- вынужден описывать задачу целиком; тут «как делается правильно» уже прописано
-- внутри режима, а от человека нужна только тема.

-- ── Режимы ───────────────────────────────────────────────────────────────
-- Набор режимов — КОНФИГУРАЦИЯ ЭКЗЕМПЛЯРА, а не константа кода: одному клиенту
-- нужны карусели и ролики, другому — коммерческие предложения и письма.
CREATE TABLE IF NOT EXISTS "creation_modes" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"        varchar(48)  NOT NULL,
  "title"       varchar(120) NOT NULL,
  -- Подпись под названием на кнопке: «текст с обложкой», «до 10 слайдов».
  "subtitle"    varchar(160),
  -- «Зачем этот режим» по-русски — канон админки: экран объясняет себя без нас.
  "purpose"     text         NOT NULL,
  -- 🔴 Это и есть «внутри уже прописано, как делается правильно». Уходит в
  -- промпт вместе с базой знаний и темой от человека.
  "guidance"    text         NOT NULL,
  -- Какие полки базы знаний подставлять. Пустой массив = все доступные.
  -- Режиму «Пост» нужны продукты и правила, режиму «Документ» — ещё и цены.
  "shelf_slugs" text[]       NOT NULL DEFAULT '{}'::text[],
  "position"    integer      NOT NULL DEFAULT 0,
  -- 🔴 available=false — режим ВИДЕН, но честно помечен «готовится».
  -- Из шести обещанных в КП сегодня работает один. Показывать шесть одинаковых
  -- кнопок, из которых пять молчат, — хуже, чем показать одну работающую и
  -- сказать правду про остальные. Пустой экран читается как поломка, а
  -- неработающая кнопка — как обман.
  "available"   boolean      NOT NULL DEFAULT false,
  "enabled"     boolean      NOT NULL DEFAULT true,
  "created_at"  timestamptz  NOT NULL DEFAULT now(),
  "updated_at"  timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "creation_modes_slug_uidx" ON "creation_modes" ("slug");
CREATE INDEX IF NOT EXISTS "creation_modes_order_idx" ON "creation_modes" ("enabled", "position");

-- ── Задания ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "creations" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: удаление режима не должно уносить историю того, что им сделали.
  "mode_id"        uuid NOT NULL REFERENCES "creation_modes"("id") ON DELETE RESTRICT,
  -- О чём просил человек, дословно.
  "prompt"         text NOT NULL,
  "status"         varchar(16) NOT NULL DEFAULT 'queued',
  "status_reason"  text,
  -- Результат. jsonb, потому что форма у режимов разная: у поста заголовок и
  -- блоки, у карусели слайды, у ролика сцены.
  "result"         jsonb,
  -- 🔴 Что РЕАЛЬНО ушло в модель из базы знаний. Без этого на вопрос «почему
  -- получилось так» ответить нечем: база знаний меняется, и через неделю уже не
  -- восстановить, что система знала в момент создания.
  "knowledge_used" text,
  -- Если материал отправили в очередь публикации — ссылка на статью.
  "article_id"     uuid REFERENCES "articles"("id") ON DELETE SET NULL,
  "created_by"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

-- varchar + CHECK, а не pg enum: состояния ещё будут меняться, когда появятся
-- карусели и ролики, а из enum значение не выкинуть (CLAUDE.md §8).
ALTER TABLE "creations" DROP CONSTRAINT IF EXISTS "creations_status_chk";
ALTER TABLE "creations" ADD CONSTRAINT "creations_status_chk"
  CHECK ("status" IN ('queued', 'running', 'ready', 'failed'));

-- Основная выборка экрана: последние задания сверху.
CREATE INDEX IF NOT EXISTS "creations_recent_idx" ON "creations" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "creations_mode_idx" ON "creations" ("mode_id", "created_at" DESC);

-- ── Стартовые режимы ─────────────────────────────────────────────────────
-- Порядок — от того, что нужно каждый день, к тому, что нужно изредка.
INSERT INTO "creation_modes"
  ("slug", "title", "subtitle", "purpose", "guidance", "shelf_slugs", "position", "available")
VALUES
  ('post', 'Пост', 'текст с обложкой',
   'Обычная публикация в канал: короткий текст с цифрами и понятной пользой для читателя.',
   'Напиши пост для канала клиента. Короткий: 250–300 слов, чтение за полминуты. Начни с крючка — числа или конкретного факта, а не с общего вступления. Обязательно скажи, что это даёт бизнесу читателя: часы, деньги или конверсию. Цифры бери только из задания и из сведений о клиенте, не выдумывай. Без хайпа и без инфобиз-лексики.',
   ARRAY['business','products','audience','rules']::text[], 10, true),

  ('carousel', 'Карусель', 'до 10 слайдов',
   'Пост, который листают пальцем: разбор по шагам, чек-лист, сравнение «было — стало».',
   'Разбей материал на 2–10 слайдов. На каждом одна мысль и не больше двадцати слов. Первый слайд — крючок, последний — призыв.',
   ARRAY['business','products','rules']::text[], 20, false),

  ('video', 'Ролик', '9:16, озвучка и субтитры',
   'Вертикальное видео для Клипов, Reels и Shorts.',
   'Разрежь материал на сцены с таймкодами. Для каждой сцены дай текст озвучки и указание, что в кадре.',
   ARRAY['business','products','rules']::text[], 30, false),

  ('cover', 'Обложка', 'картинка в вашем стиле',
   'Брендовая картинка под материал: заголовок на фирменной подложке.',
   'Сделай обложку в фирменном стиле клиента: крупный заголовок, минимум текста, без мелких деталей.',
   ARRAY['business']::text[], 40, false),

  ('deck', 'Презентация', 'слайды для встречи',
   'Набор слайдов, с которым идут к клиенту или на выступление.',
   'Собери презентацию: титул, проблема, решение, доказательства с цифрами, следующий шаг.',
   ARRAY['business','products','prices','cases','rules']::text[], 50, false),

  ('doc', 'Документ', 'КП, письмо, ответ',
   'Коммерческое предложение, письмо клиенту, ответ на частый вопрос.',
   'Напиши документ деловым языком клиента. Опирайся на его цены и условия, ничего не обещай сверх того, что сказано в сведениях о нём.',
   ARRAY['business','products','prices','objections','rules']::text[], 60, false)
ON CONFLICT ("slug") DO NOTHING;
