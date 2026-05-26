import { zValidator } from "@hono/zod-validator";
import { and, articles, desc, eq, lte } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  section: z
    .enum(["main", "numbers", "people", "playbook", "weekend", "longread", "newsletter"])
    .optional(),
});

export const feedRoute = new Hono<AppEnv>().get("/daily", zValidator("query", querySchema), async (c) => {
  const env = getEnv(c.env);
  const db = getDb(env.DATABASE_URL);
  const q = c.req.valid("query");
  const now = new Date();

  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      section: articles.section,
      tease: articles.tease,
      lede: articles.lede,
      readSeconds: articles.readSeconds,
      isPaid: articles.isPaid,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        lte(articles.publishedAt, now),
        q.section ? eq(articles.section, q.section) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(q.limit);

  return c.json({ items: rows, generatedAt: now.toISOString() });
});
