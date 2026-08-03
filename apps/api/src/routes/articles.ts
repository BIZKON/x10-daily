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

/**
 * 🔴 HumanGate на картинку (Спека 2), симметрично гейту в feed.ts: ИИ-обложка
 * отдаётся наружу ТОЛЬКО после одобрения редактором.
 *
 * Гейт обязателен именно на читалке: статья публикуется автоматически (persist
 * пишет `status='published'`), обложка доезжает к уже опубликованной статье, а
 * deep-link из каждого поста канала ведёт как раз сюда — это основная
 * поверхность чтения. `rejected` («без картинки») тоже обязан исчезнуть
 * отсюда, а не только из ленты, иначе решение редактора игнорируется навсегда.
 *
 * `none` пропускаем намеренно: это ручная/легаси обложка, к ИИ-генерации
 * отношения не имеющая.
 */
export function gateCoverByVisualStatus<
  T extends { visualStatus: string; coverImageUrl: string | null },
>(row: T): T {
  const visible = row.visualStatus === "approved" || row.visualStatus === "none";
  return visible ? row : { ...row, coverImageUrl: null };
}

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

    const gated = gateCoverByVisualStatus(row);

    // HIGH-6: paywall enforcement. isPaid + user без active подписки →
    // strip body/citations/audio. Тизер (tease/lede/whyItMatters) остаётся.
    const session = await tryExtractSession(c);
    const hasAccess = await hasPaidSubscription(db, session?.userId ?? null);
    return c.json(stripPaidContent(gated, hasAccess));
  },
);
