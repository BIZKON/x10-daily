import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { articles } from "./articles";

export const agentKind = pgEnum("agent_kind", [
  "ingest",
  "draft",
  "numbers",
  "factcheck",
  "tov",
  "brevity",
  "audio",
  "hookgen",
  "social",
  "visual",
  "score",
  "newsletter",
]);

export const runStatus = pgEnum("run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "halted",
  "skipped",
]);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: id(),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "cascade" }),
    agent: agentKind("agent").notNull(),
    status: runStatus("status").notNull().default("queued"),
    modelUsed: varchar("model_used", { length: 64 }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("runs_article_agent_idx").on(t.articleId, t.agent),
    index("runs_status_idx").on(t.status, t.createdAt),
  ],
);

export const pipelineConfig = pgTable(
  "pipeline_config",
  {
    id: id(),
    agent: agentKind("agent").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    modelOverride: varchar("model_override", { length: 64 }),
    confidenceThreshold: numeric("confidence_threshold", { precision: 4, scale: 3 })
      .notNull()
      .default("0.700"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  /**
   * MEDIUM-7: один effective row на agent. Закрывает race при concurrent PUT
   * /v1/admin/pipeline-config/:agent — теперь второй PUT попадёт в
   * onConflictDoUpdate вместо создания дубликата.
   */
  (t) => [uniqueIndex("pipeline_config_agent_uidx").on(t.agent)],
);

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
export type PipelineConfigRow = typeof pipelineConfig.$inferSelect;

/**
 * Порог дневного $-алерта. `warn` — расход пересёк предупредительную планку
 * (DAILY_BUDGET_WARN_USD); `exhausted` — достигнут жёсткий потолок
 * (DAILY_BUDGET_USD) и draft-article перестаёт драфтить до полуночи МСК.
 */
export const costAlertKind = pgEnum("cost_alert_kind", ["warn", "exhausted"]);

/**
 * Идемпотентность $-алертов: «один алерт на (день, порог)». Запись клеймится
 * через INSERT ... ON CONFLICT DO NOTHING на uniqueIndex(alert_date,
 * threshold_kind) — алерт шлётся только если INSERT реально вставил строку,
 * поэтому ретраи Inngest-шага и параллельные draft-article-раны не дублируют
 * уведомление. `alert_date` — календарный день МСК (YYYY-MM-DD), сбрасывает
 * счётчик в полночь МСК. См. apps/workers/pipeline/src/lib/cost-ledger.ts.
 */
export const costAlerts = pgTable(
  "cost_alerts",
  {
    id: id(),
    alertDate: date("alert_date").notNull(),
    thresholdKind: costAlertKind("threshold_kind").notNull(),
    spendUsd: numeric("spend_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("cost_alerts_date_kind_uidx").on(t.alertDate, t.thresholdKind)],
);

export type CostAlert = typeof costAlerts.$inferSelect;
export type NewCostAlert = typeof costAlerts.$inferInsert;
