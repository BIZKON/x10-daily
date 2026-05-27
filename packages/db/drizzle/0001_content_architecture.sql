-- Content Architecture Brief v1.0 (§3, §5, §6) — добавляем user-facing таксономию.
-- section остаётся как pipeline-internal, category становится главной осью для UI.

CREATE TYPE "public"."article_category" AS ENUM('taxes', 'money', 'practice', 'power', 'tech', 'rybakov');--> statement-breakpoint
CREATE TYPE "public"."article_template" AS ENUM('card-news', 'deep-dive', 'daily-take', 'guide', 'digest');--> statement-breakpoint

ALTER TABLE "articles"
  ADD COLUMN "category" "article_category" NOT NULL DEFAULT 'practice',
  ADD COLUMN "subcategory" varchar(64),
  ADD COLUMN "template" "article_template" NOT NULL DEFAULT 'card-news',
  ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN "cover_image_url" text,
  ADD COLUMN "cover_image_alt" text,
  ADD COLUMN "is_featured" boolean NOT NULL DEFAULT false,
  ADD COLUMN "reactions" jsonb NOT NULL DEFAULT '{"fire":0,"insight":0,"question":0}'::jsonb,
  ADD COLUMN "comment_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "bookmark_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "share_count" integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- Backfill category из legacy section для уже существующих статей.
-- main/numbers → practice (общая бизнес-категория), people → rybakov (если автор Рыбаков, обычно так),
-- остальное → practice. Это обратимо: редактор сможет переклассифицировать через admin UI.
UPDATE "articles" SET "category" =
  CASE "section"
    WHEN 'numbers'    THEN 'money'::article_category
    WHEN 'people'     THEN 'practice'::article_category
    WHEN 'playbook'   THEN 'practice'::article_category
    WHEN 'weekend'    THEN 'practice'::article_category
    WHEN 'longread'   THEN 'practice'::article_category
    WHEN 'newsletter' THEN 'practice'::article_category
    ELSE 'practice'::article_category
  END
WHERE TRUE;--> statement-breakpoint

-- Backfill template: legacy всё было card-news. Лонгриды (longread/weekend) → deep-dive.
UPDATE "articles" SET "template" =
  CASE "section"
    WHEN 'longread' THEN 'deep-dive'::article_template
    WHEN 'weekend'  THEN 'deep-dive'::article_template
    ELSE 'card-news'::article_template
  END
WHERE TRUE;--> statement-breakpoint

CREATE INDEX "articles_category_pub_idx" ON "articles" USING btree ("category","published_at");--> statement-breakpoint
CREATE INDEX "articles_template_idx" ON "articles" USING btree ("template");
