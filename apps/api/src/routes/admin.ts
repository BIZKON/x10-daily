import { zValidator } from "@hono/zod-validator";
import { and, articles, desc, eq, sql } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { EDITOR_ROLES, requireRole } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Admin endpoints для HumanGate.
 *
 * Все endpoints закрыты `requireRole(["editor","admin"])` (см. auth.ts).
 * Закрывает CRITICAL-1 из docs/SECURITY-AUDIT.md — `/publish` ранее был без auth.
 * HIGH-2: auth basis — Telegram-issued JWT в Authorization Bearer (Login Widget
 * для admin или Mini App initData для editor-кламперов).
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** brief §5 — фильтр по user-facing категории. Используется на странице /rubrics. */
  category: z.enum(["taxes", "money", "practice", "power", "tech", "rybakov"]).optional(),
  /** Подкатегория второго уровня — "taxes.news" и т.д. brief §1. */
  subcategory: z.string().max(64).optional(),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const adminRoute = new Hono<AppEnv>()
  /**
   * GET /v1/admin/queue
   * Список статей со status='ready' (pipeline закончил, ждёт ревью).
   * Возвращает компактный list-view; полная metadata — на детальной странице.
   */
  .get("/queue", zValidator("query", querySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        id: articles.id,
        slug: articles.slug,
        section: articles.section,
        category: articles.category,
        subcategory: articles.subcategory,
        template: articles.template,
        tags: articles.tags,
        tease: articles.tease,
        lede: articles.lede,
        wordCount: articles.wordCount,
        readSeconds: articles.readSeconds,
        createdAt: articles.createdAt,
        metadata: articles.metadata,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "ready"),
          q.category ? eq(articles.category, q.category) : undefined,
          q.subcategory ? eq(articles.subcategory, q.subcategory) : undefined,
        ),
      )
      .orderBy(desc(articles.createdAt))
      .limit(q.limit);

    // Достаём score.total из metadata в отдельное поле для list-view.
    const items = rows.map((r) => {
      const meta = (r.metadata ?? {}) as {
        score?: { total: number; verdict: string };
        factcheck?: { status: string } | null;
      };
      return {
        id: r.id,
        slug: r.slug,
        section: r.section,
        category: r.category,
        subcategory: r.subcategory,
        template: r.template,
        tags: r.tags,
        tease: r.tease,
        lede: r.lede,
        wordCount: r.wordCount,
        readSeconds: r.readSeconds,
        createdAt: r.createdAt,
        scoreTotal: meta.score?.total ?? null,
        scoreVerdict: meta.score?.verdict ?? null,
        factcheckStatus: meta.factcheck?.status ?? null,
      };
    });

    return c.json({ items, count: items.length });
  })

  /**
   * GET /v1/admin/article/:id
   * Полная статья с pipeline metadata для UI ревью.
   * В отличие от /v1/articles/:slug — доступна на любом status (не только published).
   */
  .get("/article/:id", zValidator("param", paramsSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [row] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!row) return c.json({ error: "not_found", id }, 404);
    return c.json(row);
  })

  /**
   * POST /v1/admin/publish/:id
   * Переводит статью из ready → published, ставит publishedAt = now().
   * Идемпотентно: если уже published — возвращает текущее состояние без изменений.
   */
  .post("/publish/:id", zValidator("param", paramsSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const { id } = c.req.valid("param");

    const [existing] = await db
      .select({ id: articles.id, status: articles.status, slug: articles.slug })
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "not_found", id }, 404);
    if (existing.status === "published") {
      return c.json({ id: existing.id, slug: existing.slug, status: "published", changed: false });
    }
    if (existing.status !== "ready") {
      return c.json(
        {
          error: "invalid_state",
          status: existing.status,
          message: `Publish allowed only from status="ready"; current="${existing.status}"`,
        },
        409,
      );
    }

    const [updated] = await db
      .update(articles)
      .set({
        status: "published",
        publishedAt: sql`now()`,
      })
      .where(eq(articles.id, id))
      .returning({ id: articles.id, slug: articles.slug, status: articles.status });

    if (!updated) return c.json({ error: "update_failed", id }, 500);
    return c.json({ ...updated, changed: true });
  });
