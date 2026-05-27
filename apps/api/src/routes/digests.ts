import { zValidator } from "@hono/zod-validator";
import { articles, desc, digests, eq, inArray, isNotNull } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Digests endpoints — brief §3.7 + §6 type DailyDigest.
 *
 * /v1/digests/latest          — последний отправленный (по sent_at desc)
 * /v1/digests/:date           — конкретный выпуск (YYYY-MM-DD)
 *
 * Возвращает digest + раскрытые topArticles (id → tease/lede/slug),
 * чтобы miniapp мог отрендерить HeroDigest без второго запроса.
 */

const dateParamSchema = z.object({
  /** ISO YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

async function expandTopArticles(
  db: ReturnType<typeof getDb>,
  ids: string[],
): Promise<
  Array<{ id: string; slug: string; tease: string; lede: string; category: string }>
> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      tease: articles.tease,
      lede: articles.lede,
      category: articles.category,
    })
    .from(articles)
    .where(inArray(articles.id, ids));

  // Сохраняем порядок из top_article_ids (он значимый).
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter((x): x is (typeof rows)[number] => Boolean(x));
}

export const digestsRoute = new Hono<AppEnv>()
  /**
   * GET /v1/digests/latest
   * Returns: digest + expanded topArticles, либо 404 если ещё ничего не отправлено.
   */
  .get("/latest", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    const [row] = await db
      .select()
      .from(digests)
      .where(isNotNull(digests.sentAt))
      .orderBy(desc(digests.sentAt))
      .limit(1);

    if (!row) return c.json({ error: "no_digests" }, 404);

    const topArticles = await expandTopArticles(db, row.topArticleIds);
    return c.json({ ...row, topArticles });
  })

  /**
   * GET /v1/digests/:date
   */
  .get("/:date", zValidator("param", dateParamSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { date } = c.req.valid("param");

    const [row] = await db.select().from(digests).where(eq(digests.issueDate, date)).limit(1);
    if (!row) return c.json({ error: "not_found", date }, 404);

    const topArticles = await expandTopArticles(db, row.topArticleIds);
    return c.json({ ...row, topArticles });
  });
