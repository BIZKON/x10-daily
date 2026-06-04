import { zValidator } from "@hono/zod-validator";
import {
  and,
  articles,
  costAlerts,
  desc,
  eq,
  getPostingControl,
  isPostingPaused,
  mskHour,
  pipelineRuns,
  setPostingControl,
  sql,
} from "@x10/db";
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

const postingControlSchema = z
  .object({
    paused: z.boolean().optional(),
    quietEnabled: z.boolean().optional(),
    quietStartHour: z.coerce.number().int().min(0).max(23).optional(),
    quietEndHour: z.coerce.number().int().min(0).max(23).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Пустой patch" });

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
   * GET /v1/admin/pipeline-runs/stats
   * $-дашборд автономного конвейера (session 20). Агрегаты по pipeline_runs:
   * расход за день МСК vs потолок, разбивка по агентам, 7-дневный ряд, accept-rate
   * гейта, последние раны, алерты дня. Day-boundary — Europe/Moscow (UTC+3), как
   * в budget-gate (cost-ledger.ts mskDayStartUtc).
   */
  .get("/pipeline-runs/stats", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);

    const mskToday = sql`date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`;
    const msk7dStart = sql`(date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') - interval '6 days') AT TIME ZONE 'Europe/Moscow'`;
    const dayExpr = sql<string>`to_char(date_trunc('day', ${pipelineRuns.createdAt} AT TIME ZONE 'Europe/Moscow'), 'YYYY-MM-DD')`;

    const [todayAgg, byAgentRows, seriesRows, gateRows, recentRows, alertRows] = await Promise.all([
      db
        .select({
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${mskToday}`),
      db
        .select({
          agent: pipelineRuns.agent,
          runs: sql<number>`count(*)::int`,
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${mskToday}`)
        .groupBy(pipelineRuns.agent),
      db
        .select({
          day: dayExpr,
          spend: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)`,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.createdAt} >= ${msk7dStart}`)
        .groupBy(dayExpr)
        .orderBy(dayExpr),
      db
        .select({
          status: pipelineRuns.status,
          runs: sql<number>`count(*)::int`,
        })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.agent} = 'ingest' AND ${pipelineRuns.createdAt} >= ${mskToday}`)
        .groupBy(pipelineRuns.status),
      db
        .select({
          agent: pipelineRuns.agent,
          status: pipelineRuns.status,
          costUsd: pipelineRuns.costUsd,
          modelUsed: pipelineRuns.modelUsed,
          articleId: pipelineRuns.articleId,
          createdAt: pipelineRuns.createdAt,
        })
        .from(pipelineRuns)
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(20),
      db
        .select({
          kind: costAlerts.thresholdKind,
          spendUsd: costAlerts.spendUsd,
          createdAt: costAlerts.createdAt,
        })
        .from(costAlerts)
        .where(
          sql`${costAlerts.alertDate} = to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD')`,
        )
        .orderBy(desc(costAlerts.createdAt)),
    ]);

    const capUsd = env.DAILY_BUDGET_USD;
    const warnUsd = env.DAILY_BUDGET_WARN_USD;
    const todaySpendUsd = Number(todayAgg[0]?.spend ?? 0);
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

    return c.json({
      budget: {
        capUsd,
        warnUsd,
        todaySpendUsd,
        todayRuns: todayAgg[0]?.runs ?? 0,
        pct: capUsd > 0 ? Math.min(100, Math.round((todaySpendUsd / capUsd) * 100)) : 0,
      },
      byAgent: byAgentRows.map((r) => ({
        agent: r.agent,
        runs: r.runs,
        spendUsd: Number(r.spend),
      })),
      series7d: seriesRows.map((r) => ({ day: r.day, spendUsd: Number(r.spend), runs: r.runs })),
      gateToday: {
        accepted: gateRows.find((g) => g.status === "succeeded")?.runs ?? 0,
        skipped: gateRows.find((g) => g.status === "skipped")?.runs ?? 0,
      },
      recent: recentRows.map((r) => ({
        agent: r.agent,
        status: r.status,
        costUsd: Number(r.costUsd),
        modelUsed: r.modelUsed,
        articleId: r.articleId,
        createdAt: iso(r.createdAt),
      })),
      alertsToday: alertRows.map((r) => ({
        kind: r.kind,
        spendUsd: Number(r.spendUsd),
        createdAt: iso(r.createdAt),
      })),
    });
  })

  /**
   * GET /v1/admin/posting-control
   * Текущий стоп-кран автопостинга + вычисленное «сейчас на паузе?» (session 20).
   */
  .get("/posting-control", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const ctrl = await getPostingControl(db);
    const now = new Date();
    const state = isPostingPaused(ctrl, now);
    return c.json({
      paused: ctrl.paused,
      quietEnabled: ctrl.quietEnabled,
      quietStartHour: ctrl.quietStartHour,
      quietEndHour: ctrl.quietEndHour,
      updatedAt:
        ctrl.updatedAt instanceof Date ? ctrl.updatedAt.toISOString() : String(ctrl.updatedAt),
      currentlyPaused: state.paused,
      pauseReason: state.reason,
      mskHour: mskHour(now),
    });
  })

  /**
   * PUT /v1/admin/posting-control
   * Обновляет стоп-кран (ручная пауза / тихие часы). Конвейер читает это на лету.
   */
  .put("/posting-control", zValidator("json", postingControlSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requireRole(c, db, EDITOR_ROLES);
    const patch = c.req.valid("json");
    const ctrl = await setPostingControl(db, patch);
    return c.json({
      paused: ctrl.paused,
      quietEnabled: ctrl.quietEnabled,
      quietStartHour: ctrl.quietStartHour,
      quietEndHour: ctrl.quietEndHour,
      updatedAt:
        ctrl.updatedAt instanceof Date ? ctrl.updatedAt.toISOString() : String(ctrl.updatedAt),
    });
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

    const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);

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
