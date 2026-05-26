import {
  DraftAgent,
  NumbersAgent,
  ToVAgent,
  createMasker,
  type AgentContext,
} from "@x10/agents";
import { loadEnv } from "@x10/config";
import { persistArticle, serializeDraftForNumbers } from "../../persist";
import { DEFAULT_SECTION, topicIngestedEvent } from "../../events";
import type { PipelineInngest } from "../client";

/**
 * Pipeline DRAFT → (NUMBERS ∥ TOV) → PERSIST.
 * Каждый шаг — Inngest step.run, retry'ится независимо.
 * env передаётся через factory closure (Inngest steps не имеют доступа к CF bindings).
 */
export function createDraftArticleFunction(
  inngest: PipelineInngest,
  bindings: CloudflareBindings,
) {
  return inngest.createFunction(
    {
      id: "draft-article",
      name: "Draft article from ingested topic",
      triggers: [{ event: topicIngestedEvent }],
      retries: 2,
      concurrency: { limit: 5 },
    },
    async ({ event, step }) => {
      const env = loadEnv(bindings as unknown as Record<string, string | undefined>);
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY не задан — невозможно вызвать pipeline. " +
            "См. CLAUDE.md §7 (ZDR-контракт обязателен в prod).",
        );
      }
      const masker = createMasker(env);
      const ctx: AgentContext = { apiKey: env.ANTHROPIC_API_KEY, masker };

      const draft = await step.run("draft", () =>
        DraftAgent.run(
          {
            topic: event.data.topic,
            context: event.data.context,
            sources: event.data.sources,
            section: (event.data.section ?? DEFAULT_SECTION),
          },
          ctx,
        ),
      );

      const [numbers, tov] = await Promise.all([
        step.run("numbers", () =>
          NumbersAgent.run(
            {
              text: serializeDraftForNumbers(draft.output),
              sources: event.data.sources,
            },
            ctx,
          ),
        ),
        step.run("tov", () =>
          ToVAgent.run(
            {
              draft: draft.output,
              authorName: event.data.authorName ?? null,
            },
            ctx,
          ),
        ),
      ]);

      const persisted = await step.run("persist", () =>
        persistArticle({
          revised: tov.output.revised,
          section: (event.data.section ?? DEFAULT_SECTION),
          sources: event.data.sources,
          databaseUrl: env.DATABASE_URL,
        }),
      );

      const totalCost = draft.costUsd + numbers.costUsd + tov.costUsd;

      return {
        articleId: persisted.id,
        slug: persisted.slug,
        totalCostUsd: totalCost,
        agents: {
          draft: { modelUsed: draft.modelUsed, usage: draft.usage, costUsd: draft.costUsd },
          numbers: { modelUsed: numbers.modelUsed, usage: numbers.usage, costUsd: numbers.costUsd },
          tov: { modelUsed: tov.modelUsed, usage: tov.usage, costUsd: tov.costUsd },
        },
        unsourcedNumbers: numbers.output.hasUnsourcedNumbers,
        tovChanges: tov.output.changes,
      };
    },
  );
}
