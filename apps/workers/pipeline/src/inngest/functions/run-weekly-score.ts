import { ScoreWeeklyAgent, createMasker, type AgentContext } from "@x10/agents";
import { loadEnv } from "@x10/config";
import { scoreWeeklyRequestedEvent } from "../../events";
import type { PipelineInngest } from "../client";

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
  bindings: CloudflareBindings,
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
      const env = loadEnv(bindings as unknown as Record<string, string | undefined>);
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY не задан — ScoreWeeklyAgent не запустится.",
        );
      }
      const masker = createMasker(env);
      const ctx: AgentContext = { apiKey: env.ANTHROPIC_API_KEY, masker };

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
