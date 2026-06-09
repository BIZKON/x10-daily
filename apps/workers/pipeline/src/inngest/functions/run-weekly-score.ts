import { ScoreWeeklyAgent, createMasker, type AgentContext } from "@x10/agents";
import { loadPipelineEnv } from "../../env";
import { modelsFromEnv } from "../../lib/agent-context";
import { scoreWeeklyRequestedEvent } from "../../events";
import type { PipelineInngest } from "../client";
import type { PipelineBindings } from "../../bindings";

/**
 * Еженедельный анализ engagement. Триггер:
 * - cron Mon 09:00 МСК (отдельная cron-функция)
 * - POST /v1/score/weekly с готовыми статистиками (api fetch'ит PostHog)
 *
 * Этот worker НЕ применяет рекомендации к pipeline_config — это решает редактор
 * через apps/admin UI (Layer 5c).
 */
export function createRunWeeklyScoreFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
) {
  return inngest.createFunction(
    {
      id: "run-weekly-score",
      name: "Run weekly engagement score via ScoreWeeklyAgent",
      triggers: [{ event: scoreWeeklyRequestedEvent }],
      retries: 2,
      concurrency: { limit: 1 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Ни AI_GATEWAY_API_KEY (Timeweb primary), ни ANTHROPIC_API_KEY (legacy direct) не задан — ScoreWeeklyAgent не запустится.",
        );
      }
      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      const scored = await step.run("score-weekly", () =>
        ScoreWeeklyAgent.run(
          {
            weekISO: event.data.weekISO,
            articles: event.data.articles,
            currentConfig: event.data.currentConfig,
          },
          ctx,
        ),
      );

      return {
        weekISO: event.data.weekISO,
        weekSummary: scored.output.weekSummary,
        topArticleIds: scored.output.topArticleIds,
        bottomArticleIds: scored.output.bottomArticleIds,
        hookPatternRanking: scored.output.hookPatternRanking,
        recommendations: scored.output.recommendations,
        previewScoreCorrelation: scored.output.previewScoreCorrelation,
        costUsd: scored.costUsd,
        modelUsed: scored.modelUsed,
      };
    },
  );
}
