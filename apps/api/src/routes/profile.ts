import { zValidator } from "@hono/zod-validator";
import {
  and,
  articles,
  bookmarks,
  desc,
  eq,
  gte,
  sql,
  userPreferences,
  userReadingHistory,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { extractSession } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Profile endpoints — для экрана /profile.
 *
 * /v1/profile/bookmarks    — список сохранённых статей
 * /v1/profile/history      — последние прочитанные
 * /v1/profile/stats        — агрегат: streak, totals, weekly streak дни
 *
 * Все require Authorization: Bearer (HIGH-2).
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Рубрики первого уровня — рубрикатор ProAgent AI (решение Р4). */
const CATEGORIES = ["news", "cases", "howto", "tools", "business", "founder"] as const;
const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(CATEGORIES);
const DEFAULT_CATEGORIES: string[] = [...CATEGORIES];
const DEFAULT_SCHEDULE = { morning: true, lunch: true, evening: false };

/**
 * Санитизация ключей рубрик. subscribed_categories — text[] без enum-механики:
 * в строках юзеров (и в кэшах старых клиентов) могут жить ключи X10-рубрикатора
 * (taxes/money/practice/power/tech/rybakov). Неизвестные ключи молча фильтруем —
 * НЕ 400, иначе PATCH от старого клиента ломает сохранение настроек целиком.
 * Если после фильтра не осталось ничего, хотя ключи были (целиком легаси-набор) —
 * возвращаем дефолт (все рубрики). Осознанно пустой список ([]) сохраняем.
 */
function sanitizeCategories(raw: readonly string[]): string[] {
  const known = [...new Set(raw.filter((c) => KNOWN_CATEGORIES.has(c)))];
  if (known.length === 0 && raw.length > 0) return [...DEFAULT_CATEGORIES];
  return known;
}

const prefsPatchSchema = z
  .object({
    /** Открытые строки + пост-фильтр sanitizeCategories — см. коммент выше. */
    subscribedCategories: z.array(z.string().max(64)).max(24).optional(),
    digestSchedule: z
      .object({ morning: z.boolean(), lunch: z.boolean(), evening: z.boolean() })
      .optional(),
  })
  .refine((d) => d.subscribedCategories !== undefined || d.digestSchedule !== undefined, {
    message: "нужно хотя бы одно поле: subscribedCategories или digestSchedule",
  });

export const profileRoute = new Hono<AppEnv>()
  /**
   * GET /v1/profile/bookmarks?limit=
   * Returns: { items: Array<{ articleId, slug, tease, category, savedAt }>, count }
   */
  .get("/bookmarks", zValidator("query", querySchema), async (c) => {
    const { userId } = await extractSession(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        articleId: bookmarks.articleId,
        savedAt: bookmarks.createdAt,
        slug: articles.slug,
        category: articles.category,
        template: articles.template,
        tease: articles.tease,
        lede: articles.lede,
        readSeconds: articles.readSeconds,
        isPaid: articles.isPaid,
      })
      .from(bookmarks)
      .innerJoin(articles, eq(bookmarks.articleId, articles.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt))
      .limit(q.limit);

    return c.json({ items: rows, count: rows.length });
  })

  /**
   * GET /v1/profile/history?limit=
   * Returns: { items: ReadingHistoryItem[], count }
   */
  .get("/history", zValidator("query", querySchema), async (c) => {
    const { userId } = await extractSession(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const q = c.req.valid("query");

    const rows = await db
      .select({
        articleId: userReadingHistory.articleId,
        readPercent: userReadingHistory.readPercent,
        completed: userReadingHistory.completed,
        readSeconds: userReadingHistory.readSeconds,
        lastReadAt: userReadingHistory.lastReadAt,
        slug: articles.slug,
        category: articles.category,
        template: articles.template,
        tease: articles.tease,
      })
      .from(userReadingHistory)
      .innerJoin(articles, eq(userReadingHistory.articleId, articles.id))
      .where(eq(userReadingHistory.userId, userId))
      .orderBy(desc(userReadingHistory.lastReadAt))
      .limit(q.limit);

    return c.json({ items: rows, count: rows.length });
  })

  /**
   * GET /v1/profile/stats
   * Returns: {
   *   bookmarksTotal, readsTotal, completedTotal,
   *   ipsScore, streakDays,
   *   weekActivity: Array<{ day: "П"|"В"|..., on: boolean }>
   * }
   *
   * IPS (Intellectual Per Second) — синтетическая метрика на основе completed reads.
   * Streak — последовательные дни с reading_history.lastReadAt активностью.
   */
  .get("/stats", async (c) => {
    const { userId } = await extractSession(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    // 1. Параллельные агрегаты.
    const [bookmarksAgg, readsAgg, last7Days] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId)),
      db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`sum(case when ${userReadingHistory.completed} then 1 else 0 end)::int`,
          totalSeconds: sql<number>`coalesce(sum(${userReadingHistory.readSeconds}), 0)::int`,
        })
        .from(userReadingHistory)
        .where(eq(userReadingHistory.userId, userId)),
      // Активность за последние 7 дней — для weekActivity.
      db
        .select({
          day: sql<string>`to_char(${userReadingHistory.lastReadAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD')`,
        })
        .from(userReadingHistory)
        .where(
          and(
            eq(userReadingHistory.userId, userId),
            gte(userReadingHistory.lastReadAt, sql`now() - interval '7 days'`),
          ),
        )
        .groupBy(
          sql`to_char(${userReadingHistory.lastReadAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD')`,
        ),
    ]);

    const bookmarksTotal = bookmarksAgg[0]?.count ?? 0;
    const readsTotal = readsAgg[0]?.total ?? 0;
    const completedTotal = readsAgg[0]?.completed ?? 0;
    const totalSeconds = readsAgg[0]?.totalSeconds ?? 0;

    // IPS: формула из CLAUDE.md/прототипа — completed × 5 + bookmarks × 2. Условно.
    const ipsScore = completedTotal * 5 + bookmarksTotal * 2;

    // weekActivity — 7 дней назад от сегодня в МСК, для каждого: было ли чтение.
    const activeDays = new Set(last7Days.map((r) => r.day));
    const dayLabels = ["П", "В", "С", "Ч", "П", "С", "В"]; // Понедельник → Воскресенье
    const today = new Date();
    const weekActivity: Array<{ day: string; on: boolean }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const isoDay = d.toISOString().slice(0, 10);
      // dayLabels индексируется по weekday (0=Sun..6=Sat — пересчёт под пнд-первый)
      const weekdayMonFirst = (d.getDay() + 6) % 7;
      weekActivity.push({ day: dayLabels[weekdayMonFirst] ?? "?", on: activeDays.has(isoDay) });
    }

    // Streak: считаем подряд активные дни с конца weekActivity (наиболее свежие).
    let streakDays = 0;
    for (let i = weekActivity.length - 1; i >= 0; i--) {
      if (weekActivity[i]?.on) streakDays++;
      else break;
    }

    return c.json({
      bookmarksTotal,
      readsTotal,
      completedTotal,
      totalReadSeconds: totalSeconds,
      ipsScore,
      streakDays,
      weekActivity,
    });
  })

  /**
   * GET /v1/profile/preferences
   * Returns: { subscribedCategories: string[], digestSchedule: {morning,lunch,evening} }
   * Нет строки → дефолт (все рубрики + утро/обед вкл, вечер выкл).
   */
  .get("/preferences", async (c) => {
    const { userId } = await extractSession(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const [row] = await db
      .select({
        subscribedCategories: userPreferences.subscribedCategories,
        digestSchedule: userPreferences.digestSchedule,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    if (!row) {
      return c.json({
        subscribedCategories: DEFAULT_CATEGORIES,
        digestSchedule: DEFAULT_SCHEDULE,
      });
    }
    return c.json({
      // Легаси-строки могут содержать старые X10-ключи — отдаём только известные.
      subscribedCategories: sanitizeCategories(row.subscribedCategories),
      digestSchedule: row.digestSchedule,
    });
  })

  /**
   * PATCH /v1/profile/preferences
   * Body: { subscribedCategories?: string[], digestSchedule?: {...} } (полный набор).
   * Upsert одной строки на пользователя. Возвращает актуальное состояние.
   */
  .patch("/preferences", zValidator("json", prefsPatchSchema), async (c) => {
    const { userId } = await extractSession(c);
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const patch = c.req.valid("json");

    const [existing] = await db
      .select({
        subscribedCategories: userPreferences.subscribedCategories,
        digestSchedule: userPreferences.digestSchedule,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    // Дедуп + фильтр неизвестных ключей (sanitizeCategories): контракт допускает
    // дубли и старые X10-ключи — защищаемся от засорения данных для будущего
    // потребителя (персонального дайджеста), не отвечая 400 старым клиентам.
    const subscribedCategories = sanitizeCategories(
      patch.subscribedCategories ?? existing?.subscribedCategories ?? DEFAULT_CATEGORIES,
    );
    const digestSchedule = patch.digestSchedule ?? existing?.digestSchedule ?? DEFAULT_SCHEDULE;

    const [row] = await db
      .insert(userPreferences)
      .values({ userId, subscribedCategories, digestSchedule })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { subscribedCategories, digestSchedule, updatedAt: sql`now()` },
      })
      .returning({
        subscribedCategories: userPreferences.subscribedCategories,
        digestSchedule: userPreferences.digestSchedule,
      });

    return c.json({
      subscribedCategories: row?.subscribedCategories ?? subscribedCategories,
      digestSchedule: row?.digestSchedule ?? digestSchedule,
    });
  });
