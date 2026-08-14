-- Партнёрская программа (спека 14.08.2026).
--
-- Партнёр приводит клиента, получает 20% с каждого ПОСТУПИВШЕГО платежа.
-- Наставник — тот, кто привёл самого партнёра, — получает 5% сверх, из нашей
-- маржи, в течение года с регистрации приведённого. Глубина строго один
-- уровень: наставник наставника не получает ничего.

-- ── 1. Партнёры ──────────────────────────────────────────────────────────
-- 🔴 Партнёр НЕ член команды: роли owner/editor/author/viewer открывают очередь,
-- конвейер и расходы, ему там нечего делать. Доступ в кабинет даёт эта строка,
-- а не роль, поэтому новых значений в enum `user_role` не добавляем.
CREATE TABLE IF NOT EXISTS "partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Адрес его версии КП: app.pro-agent-ai.ru/kp/<slug>/
  "slug" varchar(64),
  "name" varchar(160) NOT NULL,
  "contact" varchar(200),
  -- Ставка по умолчанию для НОВЫХ сделок. В сделку она копируется, поэтому
  -- правка здесь не переписывает прошлое.
  "rate_percent" numeric(5,2) NOT NULL DEFAULT 20,
  -- Кто пригласил. NULL — пришёл сам.
  "parent_id" uuid REFERENCES "partners"("id") ON DELETE SET NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  -- От этой даты живёт срок наставнических (12 месяцев).
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Один человек — один партнёрский аккаунт. Второй завёл бы вторую ветку дерева
-- на того же человека, и начисления разъехались бы между ними.
CREATE UNIQUE INDEX IF NOT EXISTS "partners_user_uidx" ON "partners" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "partners_slug_uidx" ON "partners" ("slug") WHERE "slug" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "partners_parent_idx" ON "partners" ("parent_id");

ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS "partners_status_chk";
ALTER TABLE "partners" ADD CONSTRAINT "partners_status_chk"
  CHECK ("status" IN ('active', 'paused'));

-- Наставником самому себе быть нельзя. Более глубокие циклы ловятся в коде:
-- SQL их проверить не может, а проверка при записи дешевле разбирательства.
ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS "partners_parent_not_self_chk";
ALTER TABLE "partners" ADD CONSTRAINT "partners_parent_not_self_chk"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- ── 2. Сделки ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "partner_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners"("id") ON DELETE RESTRICT,
  "client_name" varchar(200) NOT NULL,
  "client_contact" varchar(200),
  -- Пакет из КП: ручной режим или линия.
  "package" varchar(16) NOT NULL,
  "amount_rub" numeric(12,2) NOT NULL,
  -- 🔴 КОПИЯ ставки на момент сделки. Поднимем процент через полгода — старые
  -- сделки обязаны считаться по прежней, иначе отчёт партнёру изменится задним
  -- числом. Тот же приём, что с `cost_rub` в `pipeline_runs`.
  "rate_percent" numeric(5,2) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'negotiating',
  "signed_at" timestamptz,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "partner_deals_partner_idx" ON "partner_deals" ("partner_id", "created_at" DESC);

ALTER TABLE "partner_deals" DROP CONSTRAINT IF EXISTS "partner_deals_status_chk";
ALTER TABLE "partner_deals" ADD CONSTRAINT "partner_deals_status_chk"
  CHECK ("status" IN ('negotiating', 'awaiting_payment', 'signed', 'cancelled'));

ALTER TABLE "partner_deals" DROP CONSTRAINT IF EXISTS "partner_deals_package_chk";
ALTER TABLE "partner_deals" ADD CONSTRAINT "partner_deals_package_chk"
  CHECK ("package" IN ('manual', 'line'));

-- ── 3. Платежи клиента ───────────────────────────────────────────────────
-- Что клиент РЕАЛЬНО заплатил. Начисление считается отсюда, а не из суммы
-- договора: мы не платим партнёру раньше, чем получили сами.
CREATE TABLE IF NOT EXISTS "deal_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "partner_deals"("id") ON DELETE CASCADE,
  "amount_rub" numeric(12,2) NOT NULL,
  "paid_at" timestamptz NOT NULL,
  -- Идентификатор платежа ЮKassa, когда появится магазин. Пока платежи
  -- заводятся руками, и колонка пустая.
  "provider_payment_id" varchar(64),
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "deal_payments_deal_idx" ON "deal_payments" ("deal_id", "paid_at" DESC);
-- Один платёж провайдера — одна строка: повторный вебхук не должен начислить
-- партнёру дважды.
CREATE UNIQUE INDEX IF NOT EXISTS "deal_payments_provider_uidx"
  ON "deal_payments" ("provider_payment_id") WHERE "provider_payment_id" IS NOT NULL;

-- ── 4. Начисления ────────────────────────────────────────────────────────
-- 🔴 Отдельная таблица нужна из-за уровней: у одного платежа НЕСКОЛЬКО
-- получателей (продавец и наставник), и у каждого своя зафиксированная ставка.
-- Считать «на лету» уже нельзя.
CREATE TABLE IF NOT EXISTS "partner_accruals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners"("id") ON DELETE RESTRICT,
  "payment_id" uuid REFERENCES "deal_payments"("id") ON DELETE CASCADE,
  -- 0 — продавец, 1 — наставник. Третьего уровня нет по решению владельца.
  "level" integer NOT NULL DEFAULT 0,
  "rate_percent" numeric(5,2) NOT NULL,
  -- Возврат приходит ОТРИЦАТЕЛЬНОЙ суммой: иначе на возврате партнёрская сеть
  -- зарабатывает, а мы платим дважды.
  "amount_rub" numeric(12,2) NOT NULL,
  "reason" varchar(16) NOT NULL DEFAULT 'sale',
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "partner_accruals_partner_idx" ON "partner_accruals" ("partner_id", "created_at" DESC);

ALTER TABLE "partner_accruals" DROP CONSTRAINT IF EXISTS "partner_accruals_reason_chk";
ALTER TABLE "partner_accruals" ADD CONSTRAINT "partner_accruals_reason_chk"
  CHECK ("reason" IN ('sale', 'mentor', 'refund', 'manual'));

-- Одному получателю по одному платежу — одна строка на уровень. Защита от
-- двойного начисления при повторной обработке.
CREATE UNIQUE INDEX IF NOT EXISTS "partner_accruals_payment_uidx"
  ON "partner_accruals" ("payment_id", "partner_id", "level")
  WHERE "payment_id" IS NOT NULL AND "reason" IN ('sale', 'mentor');

-- ── 5. Выплаты ───────────────────────────────────────────────────────────
-- Что мы реально отдали партнёру. Перевод делает человек: PayPal, Stripe и Wise
-- в России не работают, интеграция писалась бы в пустоту.
CREATE TABLE IF NOT EXISTS "partner_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners"("id") ON DELETE RESTRICT,
  "amount_rub" numeric(12,2) NOT NULL,
  "paid_at" timestamptz NOT NULL,
  -- Свободный текст: карта, СБП, счёт ИП. Способов много, справочник устареет.
  "method" varchar(64),
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "partner_payouts_partner_idx" ON "partner_payouts" ("partner_id", "paid_at" DESC);
