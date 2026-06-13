-- Tier-2 (session 25): настройки профиля — подписки на рубрики + расписание
-- дайджеста. Одна строка на пользователя. См.
-- packages/db/src/schema/user_preferences.ts и apps/api/src/routes/profile.ts.
--
-- ⚠️ Персист БЕЗ потребителя: персональный дайджест/push ещё не построены —
-- настройки сохраняются и готовы к подключению этих фич (preference-center).
-- IF NOT EXISTS / DO-block — идемпотентно (безопасно при повторном прогоне).

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "subscribed_categories" text[] NOT NULL DEFAULT '{}'::text[],
  "digest_schedule" jsonb NOT NULL DEFAULT '{"morning":true,"lunch":true,"evening":false}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_prefs_user_uidx" ON "user_preferences" USING btree ("user_id");
