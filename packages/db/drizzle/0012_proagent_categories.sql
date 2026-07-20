-- Ребрендинг X10 Daily → ProAgent AI (решение Р4, июль 2026): новый рубрикатор.
-- news «Новости ИИ» (дефолт) / cases «Кейсы» / howto «Обучение» /
-- tools «Инструменты» / business «Практика» / founder «От основателя».
--
-- PG не умеет DROP VALUE из enum → старые значения (taxes/money/practice/
-- power/tech/rybakov) остаются в типе мёртвыми, из кода/UI выведены.
-- ADD VALUE IF NOT EXISTS — идемпотентно (безопасно при повторном прогоне).
--
-- ⚠️ Только ADD VALUE, БЕЗ использования новых значений (SET DEFAULT и т.п.):
-- PG запрещает использовать enum-значение в ТОЙ ЖЕ транзакции, где оно добавлено,
-- а drizzle-kit migrate прогоняет ВСЮ пачку pending-миграций в ОДНОЙ транзакции
-- (drizzle-orm PgDialect.migrate). Поэтому смены DB-DEFAULT здесь нет — колоночный
-- дефолт не нужен (persist.ts всегда пишет category явно; INSERT без category нет).
-- ADD VALUE в транзакции допустим на PG 12+ (значение просто нельзя тут же читать).
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'news';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'cases';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'howto';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'tools';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'business';--> statement-breakpoint
ALTER TYPE "public"."article_category" ADD VALUE IF NOT EXISTS 'founder';
