import { zValidator } from "@hono/zod-validator";
import { and, articles, eq } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { tryExtractSession } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { hasPaidSubscription, stripPaidContent } from "../paywall";

// MEDIUM-1 (из аудита): валидация slug — длина и charset. Закрывает абуз
// через гигантские/мусорные slug'и + даёт раннюю 400 вместо 404.
const slugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "slug допускает только lowercase latin + digits + '-'"),
});

export const articlesRoute = new Hono<AppEnv>().get(
  "/:slug",
  zValidator("param", slugSchema),
  async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const { slug } = c.req.valid("param");

    const [row] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found", slug }, 404);
    }

    // HIGH-6: paywall enforcement. isPaid + user без active подписки →
    // strip body/citations/audio. Тизер (tease/lede/whyItMatters) остаётся.
    const session = await tryExtractSession(c);
    const hasAccess = await hasPaidSubscription(db, session?.userId ?? null);
    return c.json(stripPaidContent(row, hasAccess));
  },
);
