import { zValidator } from "@hono/zod-validator";
import {
  and,
  articles,
  desc,
  digests,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Digests endpoints — brief §3.7 + §6 type DailyDigest.
 *
 * /v1/digests/latest          — последний отправленный (по sent_at desc) — для admin
 * /v1/digests/hero            — для miniapp home-hero: редакционный выпуск, а если
 *                               его ещё нет — СИНТЕЗ из реальных топ-статей дня
 * /v1/digests/:date           — конкретный выпуск (YYYY-MM-DD)
 *
 * Возвращает digest + раскрытые topArticles (id → tease/lede/slug),
 * чтобы miniapp мог отрендерить HeroDigest без второго запроса.
 */

const dateParamSchema = z.object({
  /** ISO YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

/** Раскрытая топ-статья дайджеста (форма для рендера hero без второго запроса). */
export type HeroArticle = {
  id: string;
  slug: string;
  tease: string;
  lede: string;
  category: string;
};

/**
 * Окно свежести для синтез-hero (дней) — совпадает с FEED_FRESH_WINDOW_DAYS:
 * hero собирается из той же поверхности, что и лента, не из архива.
 */
const HERO_FRESH_WINDOW_DAYS = 14;
/** Сколько сюжетов берём в синтез-дайджест (hero рисует 3, запас на курацию). */
const HERO_TOP_LIMIT = 5;

/** Текст-врезка синтез-дайджеста. Честный, без атрибуции и выдуманных цитат. */
export const SYNTHETIC_DIGEST_INTRO =
  "Главные деловые сюжеты дня — коротко, со ссылками на разборы.";

/**
 * Календарная дата «сегодня» в МСК (Europe/Moscow), YYYY-MM-DD.
 * en-CA даёт ISO-формат; timeZone фиксирует именно московский календарный день.
 */
export function todayMskIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Чистая сборка синтетического дайджеста из топ-статей. Та же форма, что и у
 * редакционного выпуска (поля DailyDigest), но `synthetic: true`, без
 * rybakovTake/premiumTeaser (их не выдумываем). Не персистится — считается на лету.
 */
export function buildSyntheticDigest(args: {
  issueDate: string;
  topArticles: HeroArticle[];
}) {
  return {
    issueDate: args.issueDate,
    intro: SYNTHETIC_DIGEST_INTRO,
    rybakovTake: null,
    premiumTeaser: null,
    tomorrow: null,
    sentAt: null,
    synthetic: true as const,
    topArticles: args.topArticles,
  };
}

async function expandTopArticles(
  db: ReturnType<typeof getDb>,
  ids: string[],
): Promise<HeroArticle[]> {
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

/**
 * Топ-статьи для синтез-hero: published+ready в окне свежести, курируем по
 * (featured → сумма реакций → свежесть). До-launch реакции ~0 → решает
 * featured+свежесть; после launch вес получит engagement. SQL-курация
 * (как в feed.ts) проверяется живьём, не юнит-тестами.
 */
async function selectHeroArticles(
  db: ReturnType<typeof getDb>,
  now: Date,
): Promise<HeroArticle[]> {
  const freshAfter = new Date(now.getTime() - HERO_FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const effectiveAt = sql<Date>`coalesce(${articles.publishedAt}, ${articles.createdAt})`;
  const reactionScore = sql<number>`
    coalesce((${articles.reactions}->>'fire')::int, 0)
    + coalesce((${articles.reactions}->>'insight')::int, 0)
    + coalesce((${articles.reactions}->>'question')::int, 0)`;

  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      tease: articles.tease,
      lede: articles.lede,
      category: articles.category,
    })
    .from(articles)
    .where(
      and(
        inArray(articles.status, ["ready", "published"]),
        lte(effectiveAt, now),
        gte(effectiveAt, freshAfter),
      ),
    )
    .orderBy(desc(articles.isFeatured), desc(reactionScore), desc(effectiveAt))
    .limit(HERO_TOP_LIMIT);
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
   * GET /v1/digests/hero
   *
   * Источник home-hero для miniapp. Приоритет — редакционный выпуск (editor
   * собрал в admin и пометил sent). Пока его нет — СИНТЕЗИРУЕМ дайджест из
   * реальных топ-статей дня (не персистим: таблица digests остаётся чисто
   * редакционной, newsletter-агент сюда не пишет). Когда редактор начнёт
   * выпускать настоящие дайджесты, hero апгрейдится автоматически — клиент
   * не меняется. 404 только если в БД вообще нет контента.
   */
  .get("/hero", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);

    const [editorial] = await db
      .select()
      .from(digests)
      .where(isNotNull(digests.sentAt))
      .orderBy(desc(digests.sentAt))
      .limit(1);

    if (editorial) {
      const topArticles = await expandTopArticles(db, editorial.topArticleIds);
      // Явная проекция под контракт hero (как в buildSyntheticDigest): без утечки
      // id/createdAt/updatedAt/topArticleIds — обе ветки /hero отдают одну форму.
      return c.json({
        issueDate: editorial.issueDate,
        intro: editorial.intro,
        rybakovTake: editorial.rybakovTake,
        premiumTeaser: editorial.premiumTeaser,
        tomorrow: editorial.tomorrow,
        sentAt: editorial.sentAt,
        synthetic: false,
        topArticles,
      });
    }

    const now = new Date();
    const topArticles = await selectHeroArticles(db, now);
    if (topArticles.length === 0) return c.json({ error: "no_content" }, 404);
    return c.json(buildSyntheticDigest({ issueDate: todayMskIsoDate(now), topArticles }));
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
