import { type AgentContext, IngestAgent, createMasker } from "@x10/agents";
import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import {
  DEFAULT_CATEGORY,
  DEFAULT_SECTION,
  DEFAULT_TEMPLATE,
  sourceItemReceivedEvent,
  topicIngestedEvent,
} from "../../events";
import { recordRun } from "../../lib/cost-ledger";
import type { PipelineInngest } from "../client";

/**
 * IngestAgent gate: получает сырой RSS/API item, решает брать или нет.
 * Если decision="accept" → отправляет article/topic.ingested и dispatch draft-article.
 * Если decision="reject"|"duplicate" → шаг кончается без побочных эффектов.
 */
export function createProcessSourceItemFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
) {
  return inngest.createFunction(
    {
      id: "process-source-item",
      name: "Filter raw source item via IngestAgent",
      triggers: [{ event: sourceItemReceivedEvent }],
      retries: 2,
      concurrency: { limit: 10 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Ни AI_GATEWAY_API_KEY (Timeweb primary), ни ANTHROPIC_API_KEY (legacy direct) не задан — IngestAgent не запустится.",
        );
      }
      const masker = createMasker(env);
      const ctx: AgentContext = { apiKey, baseURL: env.AI_GATEWAY_BASE_URL, masker };

      const ingest = await step.run("ingest", () =>
        IngestAgent.run(
          {
            rawTitle: event.data.rawTitle,
            rawText: event.data.rawText,
            source: event.data.source,
            recentTeases: event.data.recentTeases,
          },
          ctx,
        ),
      );

      // $-ledger гейта (session 20): пишем строку на КАЖДЫЙ item, включая
      // reject/duplicate (status='skipped') — до раннего return ниже. Гейт
      // дешёвый (Haiku), но это и объём вызовов (детект флуда), и его $ в
      // дневном расходе. ДО ветвления по decision, чтобы reject тоже учитывался.
      await step.run("record-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        await recordRun(db, {
          articleId: null,
          agent: "ingest",
          status: ingest.output.decision === "accept" ? "succeeded" : "skipped",
          costUsd: ingest.costUsd,
          modelUsed: ingest.modelUsed,
          inputTokens: ingest.usage?.inputTokens ?? 0,
          outputTokens: ingest.usage?.outputTokens ?? 0,
          cachedInputTokens: ingest.usage?.cachedInputTokens ?? 0,
          output: {
            decision: ingest.output.decision,
            relevanceScore: ingest.output.relevanceScore,
            publisher: event.data.source.publisher,
          },
        });
      });

      if (ingest.output.decision !== "accept" || !ingest.output.topic || !ingest.output.context) {
        return {
          dispatched: false,
          decision: ingest.output.decision,
          rejectReason: ingest.output.rejectReason,
          duplicateOf: ingest.output.duplicateOf,
          relevanceScore: ingest.output.relevanceScore,
          costUsd: ingest.costUsd,
        };
      }

      // dispatch event для draft-article — пробрасываем brief-таксономию.
      await step.sendEvent("dispatch-topic", {
        name: topicIngestedEvent.event,
        data: {
          topic: ingest.output.topic,
          context: ingest.output.context,
          sources: [event.data.source],
          section: DEFAULT_SECTION, // legacy — оставлено для pipeline_runs
          category: ingest.output.category ?? DEFAULT_CATEGORY,
          subcategory: ingest.output.subcategory ?? undefined,
          template: ingest.output.template ?? DEFAULT_TEMPLATE,
          tags: ingest.output.tags,
          political: ingest.output.political,
        },
      });

      return {
        dispatched: true,
        decision: ingest.output.decision,
        topic: ingest.output.topic,
        category: ingest.output.category,
        template: ingest.output.template,
        subcategory: ingest.output.subcategory,
        tags: ingest.output.tags,
        political: ingest.output.political,
        relevanceScore: ingest.output.relevanceScore,
        costUsd: ingest.costUsd,
      };
    },
  );
}
