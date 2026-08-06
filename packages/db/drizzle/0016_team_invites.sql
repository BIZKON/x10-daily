-- Приглашения в команду клиента (Спека 5).
--
-- Зачем ссылка, а не ручной ввод @username: опечатка в нике даёт «человек не
-- может войти, и непонятно почему» — самый дорогой вид ошибки в чужих руках.
-- При ссылке заранее знать о человеке не нужно вообще.
--
-- 🔴 token хранится ХЕШЕМ (sha256 hex), а не открытым текстом. Секрет ссылки
-- знает только тот, кому её отправили; из базы восстановить ссылку нельзя.
-- Утечка дампа не даёт войти в чужой кабинет.
--
-- 🔴 tenant_id НЕТ намеренно. Каждый клиент получает отдельную копию системы
-- (решение владельца 06.08.2026), поэтому команда — это команда данного
-- экземпляра. Мультиарендность решается новой копией, а не колонкой.
CREATE TABLE IF NOT EXISTS "team_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- sha256 от секрета ссылки, hex — 64 символа.
  "token_hash" varchar(64) NOT NULL,
  -- Роль в терминах интерфейса: owner/editor/author/viewer. Значение user_role
  -- (admin/editor/author/subscriber) выводится картой прав в коде, чтобы enum
  -- БД и язык интерфейса не срастались.
  "role" varchar(16) NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  -- По умолчанию одноразовая. Многоразовая — осознанный выбор владельца
  -- (позвать сразу отдел), в интерфейсе помечается явно.
  "max_uses" integer DEFAULT 1 NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "revoked_at" timestamp with time zone,
  -- Аудит: кто вошёл по ссылке последним. Для одноразовой — единственный.
  "accepted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_at" timestamp with time zone
);

-- Активация ищет строго по хешу — уникальность обязательна, иначе два
-- приглашения с одним секретом стали бы неразличимы.
CREATE UNIQUE INDEX IF NOT EXISTS "team_invites_token_hash_uidx"
  ON "team_invites" ("token_hash");

-- Список активных приглашений в кабинете.
CREATE INDEX IF NOT EXISTS "team_invites_active_idx"
  ON "team_invites" ("expires_at")
  WHERE "revoked_at" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_invites_role_check') THEN
    ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_role_check"
      CHECK ("role" IN ('owner', 'editor', 'author', 'viewer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_invites_uses_check') THEN
    ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_uses_check"
      CHECK ("max_uses" >= 1 AND "used_count" >= 0 AND "used_count" <= "max_uses");
  END IF;
END $$;
