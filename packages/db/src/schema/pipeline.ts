import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { articles } from "./articles";
import { id, timestamps } from "./_shared";

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

export const pipelineConfig = pgTable("pipeline_config", {
  id: id(),
  agent: agentKind("agent").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  modelOverride: varchar("model_override", { length: 64 }),
  confidenceThreshold: numeric("confidence_threshold", { precision: 4, scale: 3 })
    .notNull()
    .default("0.700"),
  params: jsonb("params")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...timestamps,
});

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
export type PipelineConfigRow = typeof pipelineConfig.$inferSelect;
