-- Контент-план на месяц (обещание КП, реестр разрыва §3.3, спека 13.08).
--
-- Заявлен главной фишкой тарифа за 120 тысяч: «снимает главный вопрос — о чём
-- вообще писать и что зайдёт». Откладывался сознательно, пока вход был пуст:
-- качество плана упирается в ту же базу знаний, что и качество постов.
--
-- 🔴 План НЕ публикует сам. Тема — заготовка задания для раздела «Создать»:
-- человек нажимает «сделать», и материал идёт общим путём конвейера через
-- HumanGate. Второй трубы рядом не появляется.

-- ── Сборка ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "content_plans" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Первое число месяца, на который собран план.
  "period_start"  date NOT NULL,
  "status"        varchar(16) NOT NULL DEFAULT 'queued',
  "status_reason" text,
  -- 🔴 Что реально ушло в модель из базы знаний. База меняется, и без снимка на
  -- вопрос «почему такие темы» через неделю ответить нечем. Так же, как в
  -- `creations.knowledge_used`.
  "knowledge_used" text,
  "created_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "content_plans" DROP CONSTRAINT IF EXISTS "content_plans_status_chk";
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_status_chk"
  CHECK ("status" IN ('queued', 'running', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS "content_plans_period_idx"
  ON "content_plans" ("period_start" DESC, "created_at" DESC);

-- ── Темы ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "plan_items" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: тема без сборки бессмысленна, а сделанные темы защищены иначе —
  -- см. правило пересборки ниже.
  "plan_id"      uuid NOT NULL REFERENCES "content_plans"("id") ON DELETE CASCADE,
  "planned_for"  date NOT NULL,
  -- Время выхода МСК: 09:30 · 12:30 · 15:30 · 18:30. NULL — «день без времени»,
  -- слот подберёт очередь при отправке.
  "slot"         varchar(5),
  -- Тот же сквозной рубрикатор, что у статей: отдельный список рубрик у плана
  -- разошёлся бы с лентой на первой же правке.
  "category"     article_category NOT NULL DEFAULT 'news',
  -- Формат = слаг режима из `creation_modes`. Только доступные: обещать в плане
  -- карусель, которой нет, значит воспроизвести разрыв между КП и кодом.
  "mode_slug"    varchar(48) NOT NULL,
  "title"        varchar(240) NOT NULL,
  -- Под каким углом раскрывать. Вместе с заголовком уезжает в CreationAgent.
  "angle"        text NOT NULL,
  -- 🔴 Почему эта тема и на что опирается в базе знаний. Это и есть товар:
  -- тридцать заголовков придумает кто угодно, а связь с прайсом и возражениями
  -- клиента показывает только обоснование.
  "rationale"    text,
  "status"       varchar(16) NOT NULL DEFAULT 'planned',
  -- Материал, сделанный из темы.
  "creation_id"  uuid REFERENCES "creations"("id") ON DELETE SET NULL,
  "position"     integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "plan_items" DROP CONSTRAINT IF EXISTS "plan_items_status_chk";
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_status_chk"
  CHECK ("status" IN ('planned', 'running', 'done', 'dropped'));

-- Основная выборка — «темы периода по дням».
CREATE INDEX IF NOT EXISTS "plan_items_calendar_idx"
  ON "plan_items" ("planned_for", "slot");
CREATE INDEX IF NOT EXISTS "plan_items_plan_idx"
  ON "plan_items" ("plan_id", "status");
