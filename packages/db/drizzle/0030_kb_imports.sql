-- Обход сайта: строка задания (спека 11.08, §7.1 — решение вычитки 12.08).
--
-- В первой редакции спеки этой таблицы не было, и вычитка нашла дыру: экран
-- обещает показывать ход обхода, причину отказа и заметки агента, а места под
-- них не заведено. Обход живёт минуту-две (до 12 загрузок с паузами плюс прогон
-- агента) — HTTP-запрос столько не ждёт, значит работа уходит в Inngest, значит
-- состояние обязано лежать в базе. Без строки экран показывал бы вечное «идёт»,
-- а отказ «сайт закрыт от роботов» до человека не доехал бы вовсе.
--
-- Образец — `creations` из раздела «Создать»: там строка заводится ДО события и
-- она же есть то, что человек видит. Событие несёт только её id, поэтому второго
-- источника правды не возникает.
CREATE TABLE IF NOT EXISTS "kb_imports" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Что обходили. Храним как дал человек, нормализованным при приёме.
  "site_url"      text NOT NULL,
  "status"        varchar(16) NOT NULL DEFAULT 'queued',
  -- Человеческая причина отказа: «сайт закрыт от роботов», «на страницах не
  -- нашлось текста». Показывается как есть — клиент не читает наши логи.
  "status_reason" text,
  -- Какие адреса взяли, какие отсеяли и почему. Отвечает на вопрос «почему
  -- система не нашла мои цены» без похода в логи воркера.
  "pages"         jsonb,
  -- Чего на сайте не нашлось. Подсказка человеку, что дозаполнить руками.
  "notes"         jsonb,
  -- Сколько материалов предложено этим обходом.
  "proposed"      integer NOT NULL DEFAULT 0,
  "created_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

-- varchar + CHECK, как в 0024 и 0025: набор состояний ещё будет меняться, а из
-- pg enum значение не выкинуть (CLAUDE.md §8).
ALTER TABLE "kb_imports" DROP CONSTRAINT IF EXISTS "kb_imports_status_chk";
ALTER TABLE "kb_imports" ADD CONSTRAINT "kb_imports_status_chk"
  CHECK ("status" IN ('queued', 'running', 'ready', 'failed'));

-- Основная выборка — «последние обходы, свежие сверху».
CREATE INDEX IF NOT EXISTS "kb_imports_recent_idx" ON "kb_imports" ("created_at" DESC);

-- ── Связь предложения с обходом ──────────────────────────────────────────
-- Нужна для двух вещей: показать разбор одного обхода и снести прежние
-- непринятые предложения при повторном (решение владельца 12.08, §6.1).
-- SET NULL, а не CASCADE: принятый человеком материал — уже его знание, и
-- удаление истории обхода не вправе его уносить.
ALTER TABLE "kb_documents"
  ADD COLUMN IF NOT EXISTS "import_id" uuid REFERENCES "kb_imports"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "kb_documents_import_idx"
  ON "kb_documents" ("import_id", "status");
