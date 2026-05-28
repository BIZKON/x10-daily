import { zValidator } from "@hono/zod-validator";
import {
  and,
  articles,
  bookmarks,
  eq,
  reactions,
  sql,
  userReadingHistory,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { extractSession, tryExtractSession } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { applyRateLimit } from "../rate-limit";

/**
 * Engagement endpoints — brief §6 reactions/bookmarks/UserProgress.
 *
 * POST /v1/articles/:id/reactions      — toggle per (user, article, kind)
 * POST /v1/articles/:id/bookmark       — toggle (user, article)
 * POST /v1/articles/:id/progress       — upsert прогресса чтения
 *
 * Все require Authorization: Bearer (HIGH-2). Counter триггеры в БД (миграция 0003)
 * автоматически обновляют articles.reactions / bookmark_count.
 */

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const reactionBodySchema = z.object({
  kind: z.enum(["fire", "insight", "question"]),
});

const progressBodySchema = z.object({
  readPercent: z.number().int().min(0).max(100),
  readSeconds: z.number().int().nonnegative().optional(),
});

async function getCurrentCounters(
  db: ReturnType<typeof getDb>,
  articleId: string,
): Promise<{
  reactions: { fire: number; insight: number; question: number };
  bookmarkCount: number;
}> {
  const [row] = await db
    .select({ reactions: articles.reactions, bookmarkCount: articles.bookmarkCount })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!row) {
    return { reactions: { fire: 0, insight: 0, question: 0 }, bookmarkCount: 0 };
  }
  return { reactions: row.reactions, bookmarkCount: row.bookmarkCount };
}

/** Pure-anonymous snapshot — без БД, для быстрого ответа гостям. */
const ANONYMOUS_USER_STATE = {
  userReactions: { fire: false, insight: false, question: false },
  isBookmarked: false,
  readPercent: 0,
} as const;

export const engagementRoute = new Hono<AppEnv>()
  /**
   * GET /v1/articles/:id/me
   * Per-user snapshot: какие реакции этот user поставил, в закладках ли, прогресс чтения.
   * Anonymous (без Authorization) — мгновенно возвращает нули, без обращения к БД.
   * Используется client-side для initial state в optimistic UI.
   */
  .get("/articles/:id/me", zValidator("param", paramsSchema), async (c) => {
    const session = await tryExtractSession(c);
    if (!session) return c.json(ANONYMOUS_USER_STATE);
    const { userId } = session;

    const { id: articleId } = c.req.valid("param");
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    const [myReactions, myBookmark, myProgress] = await Promise.all([
      db
        .select({ kind: reactions.kind })
        .from(reactions)
        .where(and(eq(reactions.userId, userId), eq(reactions.articleId, articleId))),
      db
        .select({ userId: bookmarks.userId })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.articleId, articleId)))
        .limit(1),
      db
        .select({ readPercent: userReadingHistory.readPercent })
        .from(userReadingHistory)
        .where(
          and(
            eq(userReadingHistory.userId, userId),
            eq(userReadingHistory.articleId, articleId),
          ),
        )
        .limit(1),
    ]);

    const kinds = new Set(myReactions.map((r) => r.kind));
    return c.json({
      userReactions: {
        fire: kinds.has("fire"),
        insight: kinds.has("insight"),
        question: kinds.has("question"),
      },
      isBookmarked: myBookmark.length > 0,
      readPercent: myProgress[0]?.readPercent ?? 0,
    });
  })

  /**
   * POST /v1/articles/:id/reactions
   * Body: { kind: "fire" | "insight" | "question" }
   * Если реакция существовала — удаляет (toggle off). Иначе — добавляет (toggle on).
   * Counter триггер обновит articles.reactions jsonb.
   */
  .post(
    "/articles/:id/reactions",
    zValidator("param", paramsSchema),
    zValidator("json", reactionBodySchema),
    async (c) => {
      const { userId } = await extractSession(c);
      // HIGH-3: 30 req/мин per (userId+IP). Защищает Neon pool и engagement-сигнал.
      await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "reactions", userId);
      const { id: articleId } = c.req.valid("param");
      const { kind } = c.req.valid("json");
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);

      // MEDIUM-6: фильтр status=published — нельзя реагировать на draft/scheduled
      // (UUID мог утечь через admin queue endpoint, до C1-fix это было открыто).
      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.status, "published")))
        .limit(1);
      if (!article) return c.json({ error: "not_found", id: articleId }, 404);

      // MEDIUM-9: toggle race-safe через PK constraint + onConflictDoNothing.
      // Без транзакции (neon-http one-shot), но конкурентный INSERT теперь не
      // бросает 500 — racer получит no-op, оба видят корректную "added".
      const deleted = await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.userId, userId),
            eq(reactions.articleId, articleId),
            eq(reactions.kind, kind),
          ),
        )
        .returning({ kind: reactions.kind });

      let action: "added" | "removed";
      if (deleted.length > 0) {
        action = "removed";
      } else {
        // Возможен PK race (concurrent INSERT) — onConflictDoNothing → no-op,
        // row уже существует, состояние "added" корректно для UI.
        await db
          .insert(reactions)
          .values({ userId, articleId, kind })
          .onConflictDoNothing();
        action = "added";
      }

      const counts = await getCurrentCounters(db, articleId);
      return c.json({
        action,
        kind,
        userReacted: action === "added",
        reactions: counts.reactions,
      });
    },
  )

  /**
   * POST /v1/articles/:id/bookmark
   * Body: пусто (toggle).
   * Returns: { action, isBookmarked, bookmarkCount }
   */
  .post("/articles/:id/bookmark", zValidator("param", paramsSchema), async (c) => {
    const { userId } = await extractSession(c);
    await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "bookmark", userId);
    const { id: articleId } = c.req.valid("param");
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    // MEDIUM-6: фильтр published.
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.id, articleId), eq(articles.status, "published")))
      .limit(1);
    if (!article) return c.json({ error: "not_found", id: articleId }, 404);

    // MEDIUM-9: race-safe toggle через PK + onConflictDoNothing.
    const deleted = await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.articleId, articleId)))
      .returning({ userId: bookmarks.userId });

    let action: "added" | "removed";
    if (deleted.length > 0) {
      action = "removed";
    } else {
      await db
        .insert(bookmarks)
        .values({ userId, articleId })
        .onConflictDoNothing();
      action = "added";
    }

    const counts = await getCurrentCounters(db, articleId);
    return c.json({
      action,
      isBookmarked: action === "added",
      bookmarkCount: counts.bookmarkCount,
    });
  })

  /**
   * POST /v1/articles/:id/progress
   * Body: { readPercent: 0..100, readSeconds?: int }
   * Upsert: при существующей записи — overwrite (только если readPercent больше — не откатываем).
   * Триггер mark_reading_completed выставит completed=true если ≥90%.
   */
  .post(
    "/articles/:id/progress",
    zValidator("param", paramsSchema),
    zValidator("json", progressBodySchema),
    async (c) => {
      const { userId } = await extractSession(c);
      // Progress шлётся каждые 5с при чтении — лимит чуть выше, но всё равно
      // защищаем общий counter shared с reactions/bookmark.
      await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "progress", userId);
      const { id: articleId } = c.req.valid("param");
      const { readPercent, readSeconds } = c.req.valid("json");
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);

      // MEDIUM-6: фильтр published — progress на draft бессмысленен.
      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.status, "published")))
        .limit(1);
      if (!article) return c.json({ error: "not_found", id: articleId }, 404);

      // ON CONFLICT — берём максимальный readPercent (не откатываем прогресс).
      // readSeconds — суммируем (если задан).
      const [row] = await db
        .insert(userReadingHistory)
        .values({
          userId,
          articleId,
          readPercent,
          readSeconds: readSeconds ?? 0,
          lastReadAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [userReadingHistory.userId, userReadingHistory.articleId],
          set: {
            readPercent: sql`GREATEST(${userReadingHistory.readPercent}, EXCLUDED.read_percent)`,
            readSeconds: sql`${userReadingHistory.readSeconds} + EXCLUDED.read_seconds`,
            lastReadAt: sql`now()`,
            updatedAt: sql`now()`,
          },
        })
        .returning({
          readPercent: userReadingHistory.readPercent,
          readSeconds: userReadingHistory.readSeconds,
          completed: userReadingHistory.completed,
          lastReadAt: userReadingHistory.lastReadAt,
        });

      if (!row) return c.json({ error: "upsert_failed" }, 500);
      return c.json(row);
    },
  );
