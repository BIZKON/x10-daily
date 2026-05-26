import { and, articles, eq } from "@x10/db";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

export const articlesRoute = new Hono<AppEnv>().get("/:slug", async (c) => {
  const env = getEnv(c.env);
  const db = getDb(env.DATABASE_URL);
  const slug = c.req.param("slug");

  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);

  if (!row) {
    return c.json({ error: "not_found", slug }, 404);
  }

  return c.json(row);
});
