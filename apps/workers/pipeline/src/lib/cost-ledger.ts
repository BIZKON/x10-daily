import { type Database, type NewPipelineRun, costAlerts, gte, pipelineRuns, sql } from "@x10/db";

/**
 * $-ledger автономного конвейера (session 20 hardening).
 *
 * Источник истины по расходу — таблица `pipeline_runs` (раньше была определена,
 * но в неё никто не писал). Теперь:
 *  - draft-article пишет одну агрегатную строку (agent='draft', cost=totalCost)
 *    на принятую статью;
 *  - process-source-item пишет строку гейта (agent='ingest') на каждый item,
 *    включая reject (status='skipped') — так виден и объём гейт-вызовов, и его $.
 *
 * Дневной потолок и алерты считают sum(cost_usd) за календарный день МСК.
 */

/** МСК = UTC+3 круглый год (РФ без переходов на летнее время с 2014). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** UTC-инстант полуночи МСК для календарного дня МСК, содержащего `now`. */
export function mskDayStartUtc(now: Date): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const flooredUtc = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  return new Date(flooredUtc - MSK_OFFSET_MS);
}

/** Календарный день МСК как YYYY-MM-DD — ключ идемпотентности алертов. */
export function mskDayString(now: Date): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Сумма $-расхода за текущий календарный день МСК (по pipeline_runs.cost_usd).
 * node-postgres возвращает numeric строкой → Number() парсит. coalesce → 0 на
 * пустом дне.
 */
export async function getTodaySpendUsd(db: Database, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${pipelineRuns.costUsd}), 0)` })
    .from(pipelineRuns)
    .where(gte(pipelineRuns.createdAt, mskDayStartUtc(now)));
  return row ? Number(row.total) : 0;
}

export type LedgerEntry = {
  articleId?: string | null;
  agent: NewPipelineRun["agent"];
  status: NewPipelineRun["status"];
  costUsd: number;
  modelUsed?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  durationMs?: number | null;
  /** Произвольные метрики строки (per-agent breakdown / decision) в output jsonb. */
  output?: Record<string, unknown> | null;
};

/** Записать строку в $-ledger. numeric → строка (toFixed) для drizzle. */
export async function recordRun(db: Database, entry: LedgerEntry): Promise<void> {
  await db.insert(pipelineRuns).values({
    articleId: entry.articleId ?? null,
    agent: entry.agent,
    status: entry.status,
    modelUsed: entry.modelUsed ?? null,
    inputTokens: entry.inputTokens ?? 0,
    outputTokens: entry.outputTokens ?? 0,
    cachedInputTokens: entry.cachedInputTokens ?? 0,
    costUsd: entry.costUsd.toFixed(6),
    durationMs: entry.durationMs ?? null,
    output: entry.output ?? null,
  });
}

export type AlertKind = "warn" | "exhausted";

/**
 * Идемпотентно «занять» алерт за (день МСК, порог). Возвращает true ровно один
 * раз — на первой вставке; конкурентные раны/ретраи получают false (конфликт по
 * uniqueIndex). Звонящий шлёт уведомление только при true.
 */
export async function claimAlert(
  db: Database,
  day: string,
  kind: AlertKind,
  spendUsd: number,
): Promise<boolean> {
  const inserted = await db
    .insert(costAlerts)
    .values({ alertDate: day, thresholdKind: kind, spendUsd: spendUsd.toFixed(6) })
    .onConflictDoNothing()
    .returning({ id: costAlerts.id });
  return inserted.length > 0;
}
