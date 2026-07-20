import { zValidator } from "@hono/zod-validator";
import { and, articles, desc, eq, gte, inArray, lte, sql } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Фильтр по user-facing категории (рубрикатор ProAgent AI). Главный фильтр для ленты. */
  category: z.enum(["news", "cases", "howto", "tools", "business", "founder"]).optional(),
  /** brief §3 — фильтр по шаблону. */
  template: z.enum(["card-news", "deep-dive", "daily-take", "guide", "digest"]).optional(),
  /** Legacy фильтр — оставлено для обратной совместимости. */
  section: z
    .enum(["main", "numbers", "people", "playbook", "weekend", "longread", "newsletter"])
    .optional(),
});

/**
 * Окно свежести ленты в днях: материалы старше не показываем — это ежедневный
 * новостной фид, не архив. Тюнингуемый компромисс между богатством ленты и
 * «не вчерашним». (session 24)
 */
const FEED_FRESH_WINDOW_DAYS = 14;

export const feedRoute = new Hono<AppEnv>().get(
  "/daily",
  zValidator("query", querySchema),
  async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");
    const now = new Date();
    const freshAfter = new Date(now.getTime() - FEED_FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Видимость miniapp-ленты РАСЦЕПЛЕНА от TG-слот-постинга (session 24). Пайплайн
    // пишет статьи как 'ready' (с полным body), а 'published' их делает ТОЛЬКО
    // drain-post-slots при отправке в TG-канал (4/день) — из-за чего в приложении
    // было видно лишь ~8 статей при сотнях готовых. Лента-приложение и broadcast-
    // канал — разные поверхности: показываем и 'ready', и 'published'. Эффективное
    // время публикации — publishedAt, а для ready (publishedAt=null) — createdAt.
    const effectiveAt = sql<Date>`coalesce(${articles.publishedAt}, ${articles.createdAt})`;

    const rows = await db
      .select({
        id: articles.id,
        slug: articles.slug,
        section: articles.section,
        category: articles.category,
        subcategory: articles.subcategory,
        template: articles.template,
        tags: articles.tags,
        coverImageUrl: articles.coverImageUrl,
        tease: articles.tease,
        lede: articles.lede,
        readSeconds: articles.readSeconds,
        wordCount: articles.wordCount,
        isPaid: articles.isPaid,
        isFeatured: articles.isFeatured,
        reactions: articles.reactions,
        publishedAt: effectiveAt,
      })
      .from(articles)
      .where(
        and(
          inArray(articles.status, ["ready", "published"]),
          lte(effectiveAt, now),
          gte(effectiveAt, freshAfter),
          q.category ? eq(articles.category, q.category) : undefined,
          q.template ? eq(articles.template, q.template) : undefined,
          q.section ? eq(articles.section, q.section) : undefined,
        ),
      )
      .orderBy(desc(effectiveAt))
      .limit(q.limit);

    return c.json({ items: rows, generatedAt: now.toISOString() });
  },
);
