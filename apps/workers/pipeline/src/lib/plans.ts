import type { PlanTopic } from "@x10/agents";
import {
  type Database,
  and,
  articles,
  contentPlans,
  creationModes,
  desc,
  eq,
  gte,
  lte,
  ne,
  planItems,
  sql,
} from "@x10/db";
import { loadKnowledge } from "./knowledge";

/**
 * Контент-план: работа со строкой сборки и с темами (миграция 0031).
 *
 * Живёт в воркере, а не в пакете агентов: агенты не знают про Postgres. Здесь
 * запросы, в агенте — раскладка тем.
 */

export type PlanJob = { id: string; periodStart: string; status: string };

/** Что уходит в модель: знания клиента, повестка и доступные форматы. */
export type PlanContext = {
  knowledge: string;
  recentTitles: string[];
  formats: Array<{ slug: string; title: string }>;
};

/** Сколько заголовков берём как повестку и как стоп-лист одновременно. */
const RECENT_LIMIT = 100;
/** За какой срок. Месяц — столько же, сколько планируем вперёд. */
const RECENT_DAYS = 30;

export async function loadPlanJob(db: Database, id: string): Promise<PlanJob | null> {
  const [row] = await db
    .select({
      id: contentPlans.id,
      periodStart: contentPlans.periodStart,
      status: contentPlans.status,
    })
    .from(contentPlans)
    .where(eq(contentPlans.id, id))
    .limit(1);
  return row ?? null;
}

export async function markPlanRunning(db: Database, id: string): Promise<void> {
  await db
    .update(contentPlans)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(contentPlans.id, id));
}

export async function failPlan(db: Database, id: string, reason: string): Promise<void> {
  await db
    .update(contentPlans)
    .set({ status: "failed", statusReason: reason, updatedAt: new Date() })
    .where(eq(contentPlans.id, id));
}

/**
 * Собрать вход для агента.
 *
 * 🔴 Повестку отрасли берём из СВОИХ опубликованных статей, а не из
 * `seen_items`: там лежат только отпечатки для дедупа, ни заголовков, ни
 * текстов (разведка 13.08). Наши статьи пришли из тех же лент клиента и уже
 * отобраны конвейером — он отсеивает девять из десяти.
 *
 * Один и тот же список работает и повесткой, и стоп-листом: писать о том, о чём
 * уже написали, — самый частый способ испортить план.
 */
export async function loadPlanContext(db: Database): Promise<PlanContext> {
  const knowledge = await loadKnowledge(db);

  const recent = await db
    .select({ title: articles.tease })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        gte(articles.publishedAt, sql`now() - interval '${sql.raw(String(RECENT_DAYS))} days'`),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(RECENT_LIMIT);

  const formats = await db
    .select({ slug: creationModes.slug, title: creationModes.title })
    .from(creationModes)
    .where(and(eq(creationModes.enabled, true), eq(creationModes.available, true)))
    .orderBy(creationModes.position);

  return {
    knowledge,
    recentTitles: recent.map((r) => r.title).filter((t): t is string => Boolean(t)),
    formats,
  };
}

/**
 * Записать темы и закрыть сборку.
 *
 * 🔴 Пересборка месяца сносит прежние темы, КРОМЕ сделанных. Тема со статусом
 * `done` привязана к материалу, который уже вышел или стоит в очереди, — снести
 * её значит порвать связь и соврать в отчёте. Остальное уходит: это ещё не
 * работа, а предложение. Правило и причина те же, что у повторного обхода сайта.
 */
export async function savePlanItems(
  db: Database,
  planId: string,
  payload: {
    topics: PlanTopic[];
    knowledgeUsed: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<number> {
  await db
    .delete(planItems)
    .where(
      and(
        ne(planItems.planId, planId),
        ne(planItems.status, "done"),
        gte(planItems.plannedFor, payload.periodStart),
        lte(planItems.plannedFor, payload.periodEnd),
      ),
    );

  const month = payload.periodStart.slice(0, 7);
  const rows = payload.topics.map((topic, index) => ({
    planId,
    plannedFor: `${month}-${String(topic.day).padStart(2, "0")}`,
    slot: topic.slot,
    category: topic.categorySlug as (typeof planItems.$inferInsert)["category"],
    modeSlug: topic.modeSlug,
    title: topic.title,
    angle: topic.angle,
    rationale: topic.rationale,
    position: index,
  }));

  if (rows.length > 0) await db.insert(planItems).values(rows);

  await db
    .update(contentPlans)
    .set({
      status: "ready",
      statusReason: null,
      knowledgeUsed: payload.knowledgeUsed,
      updatedAt: new Date(),
    })
    .where(eq(contentPlans.id, planId));

  return rows.length;
}
