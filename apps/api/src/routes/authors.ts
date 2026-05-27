import { zValidator } from "@hono/zod-validator";
import {
  and,
  articles,
  authors,
  desc,
  eq,
  lte,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Authors endpoints — brief §6 type Author.
 *
 * /v1/authors                — список авторов (фильтры staff/flagship)
 * /v1/authors/:slug          — автор + N последних статей этого автора
 */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  staff: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  flagship: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(80),
});

const slugQuerySchema = z.object({
  /** Сколько последних статей вернуть рядом с автором. */
  articlesLimit: z.coerce.number().int().min(0).max(20).default(5),
});

export const authorsRoute = new Hono<AppEnv>()
  /**
   * GET /v1/authors?staff=true&flagship=true&limit=
   */
  .get("/", zValidator("query", listQuerySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        id: authors.id,
        slug: authors.slug,
        name: authors.name,
        role: authors.role,
        bio: authors.bio,
        avatarUrl: authors.avatarUrl,
        bylineColor: authors.bylineColor,
        isStaff: authors.isStaff,
        isFlagship: authors.isFlagship,
        subscriberCount: authors.subscriberCount,
      })
      .from(authors)
      .where(
        and(
          q.staff !== undefined ? eq(authors.isStaff, q.staff) : undefined,
          q.flagship !== undefined ? eq(authors.isFlagship, q.flagship) : undefined,
        ),
      )
      // Flagship → staff → по подписчикам.
      .orderBy(desc(authors.isFlagship), desc(authors.isStaff), desc(authors.subscriberCount))
      .limit(q.limit);

    return c.json({ items: rows, count: rows.length });
  })

  /**
   * GET /v1/authors/:slug?articlesLimit=5
   * Returns: { author: Author, articles: ArticleSummary[] }
   */
  .get(
    "/:slug",
    zValidator("param", slugParamSchema),
    zValidator("query", slugQuerySchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const { slug } = c.req.valid("param");
      const { articlesLimit } = c.req.valid("query");

      const [author] = await db.select().from(authors).where(eq(authors.slug, slug)).limit(1);
      if (!author) return c.json({ error: "not_found", slug }, 404);

      const now = new Date();
      const recentArticles =
        articlesLimit === 0
          ? []
          : await db
              .select({
                id: articles.id,
                slug: articles.slug,
                category: articles.category,
                template: articles.template,
                tease: articles.tease,
                lede: articles.lede,
                readSeconds: articles.readSeconds,
                publishedAt: articles.publishedAt,
                isPaid: articles.isPaid,
              })
              .from(articles)
              .where(
                and(
                  eq(articles.authorId, author.id),
                  eq(articles.status, "published"),
                  lte(articles.publishedAt, now),
                ),
              )
              .orderBy(desc(articles.publishedAt))
              .limit(articlesLimit);

      return c.json({ author, articles: recentArticles });
    },
  );
