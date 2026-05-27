import {
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  HookGenAgent,
  NumbersAgent,
  PreviewScoreAgent,
  SocialAmplifyAgent,
  ToVAgent,
  createMasker,
  type AgentContext,
} from "@x10/agents";
import { loadEnv } from "@x10/config";
import { persistArticle, serializeDraftForNumbers } from "../../persist";
import {
  DEFAULT_SECTION,
  DEFAULT_TEMPLATE,
  topicIngestedEvent,
} from "../../events";
import type { PipelineInngest } from "../client";

/**
 * Pipeline DRAFT → (NUMBERS ∥ TOV) → BREVITY → [FACTCHECK if political] → (HOOKGEN ∥ SOCIAL ∥ SCORE ∥ PERSIST).
 * FactCheck шаг условный — запускается только если event.data.political === true.
 * Если FactCheck вернул status="halt" — функция бросает; статья не публикуется.
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
            template: event.data.template ?? DEFAULT_TEMPLATE,
            subcategory: event.data.subcategory,
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

      const brevity = await step.run("brevity", () =>
        BrevityAgent.run(
          {
            revised: tov.output.revised,
            template: event.data.template ?? DEFAULT_TEMPLATE,
          },
          ctx,
        ),
      );

      // Опциональный FactCheck для политических тем.
      // Inngest jsonify-ит результаты step.run, поэтому используем ReturnType вместо AgentResult.
      type FactCheckStep = Awaited<ReturnType<typeof FactCheckAgent.run>>;
      let factcheck: FactCheckStep | null = null;
      if (event.data.political === true) {
        const fc = (await step.run("factcheck", () =>
          FactCheckAgent.run(
            {
              draft: brevity.output.compressed,
              sources: event.data.sources,
              topicContext: event.data.context,
            },
            ctx,
          ),
        )) as FactCheckStep;
        if (fc.output.status === "halt") {
          throw new Error(
            `FactCheck halt: ${fc.output.haltReason ?? "противоречия в источниках"}`,
          );
        }
        factcheck = fc;
      }

      const [hookgen, social, score] = await Promise.all([
        step.run("hookgen", () =>
          HookGenAgent.run(
            { draft: brevity.output.compressed, channel: "tg-x10" },
            ctx,
          ),
        ),
        step.run("social", () =>
          SocialAmplifyAgent.run(
            {
              draft: brevity.output.compressed,
              channel: "tg-x10",
              authorName: event.data.authorName ?? null,
            },
            ctx,
          ),
        ),
        step.run("score", () =>
          PreviewScoreAgent.run({ draft: brevity.output.compressed }, ctx),
        ),
      ]);

      const totalCost =
        draft.costUsd +
        numbers.costUsd +
        tov.costUsd +
        brevity.costUsd +
        (factcheck?.costUsd ?? 0) +
        hookgen.costUsd +
        social.costUsd +
        score.costUsd;

      const pipelineMetadata = {
        brevity: {
          beforeWords: brevity.output.beforeWords,
          afterWords: brevity.output.afterWords,
          cuts: brevity.output.cuts,
        },
        score: {
          total: score.output.total,
          verdict: score.output.verdict,
          breakdown: {
            hookStrength: score.output.hookStrength,
            voiceMatch: score.output.voiceMatch,
            valueDensity: score.output.valueDensity,
            structureFormat: score.output.structureFormat,
            publishReadiness: score.output.publishReadiness,
          },
          fixes: score.output.fixes,
        },
        hooks: hookgen.output.hooks,
        social: {
          channel: social.output.channel,
          framework: social.output.framework,
          post: social.output.post,
          hookLine: social.output.hookLine,
          twistLine: social.output.twistLine,
          wordCount: social.output.wordCount,
          lineCount: social.output.lineCount,
        },
        factcheck: factcheck
          ? {
              status: factcheck.output.status,
              haltReason: factcheck.output.haltReason,
              claims: factcheck.output.claims,
            }
          : null,
        totalCostUsd: totalCost,
      };

      const persisted = await step.run("persist", () =>
        persistArticle({
          revised: brevity.output.compressed,
          section: (event.data.section ?? DEFAULT_SECTION),
          category: event.data.category,
          subcategory: event.data.subcategory,
          template: event.data.template,
          tags: event.data.tags,
          sources: event.data.sources,
          databaseUrl: env.DATABASE_URL,
          pipelineMetadata,
        }),
      );

      return {
        articleId: persisted.id,
        slug: persisted.slug,
        totalCostUsd: totalCost,
        agents: {
          draft: { modelUsed: draft.modelUsed, usage: draft.usage, costUsd: draft.costUsd },
          numbers: { modelUsed: numbers.modelUsed, usage: numbers.usage, costUsd: numbers.costUsd },
          tov: { modelUsed: tov.modelUsed, usage: tov.usage, costUsd: tov.costUsd },
          brevity: { modelUsed: brevity.modelUsed, usage: brevity.usage, costUsd: brevity.costUsd },
          ...(factcheck
            ? {
                factcheck: {
                  modelUsed: factcheck.modelUsed,
                  usage: factcheck.usage,
                  costUsd: factcheck.costUsd,
                },
              }
            : {}),
          hookgen: { modelUsed: hookgen.modelUsed, usage: hookgen.usage, costUsd: hookgen.costUsd },
          social: { modelUsed: social.modelUsed, usage: social.usage, costUsd: social.costUsd },
          score: { modelUsed: score.modelUsed, usage: score.usage, costUsd: score.costUsd },
        },
        unsourcedNumbers: numbers.output.hasUnsourcedNumbers,
        tovChanges: tov.output.changes,
        brevity: {
          beforeWords: brevity.output.beforeWords,
          afterWords: brevity.output.afterWords,
          cuts: brevity.output.cuts,
        },
        factcheck: factcheck
          ? {
              status: factcheck.output.status,
              haltReason: factcheck.output.haltReason,
              claims: factcheck.output.claims,
            }
          : null,
        hooks: hookgen.output.hooks,
        social: {
          channel: social.output.channel,
          framework: social.output.framework,
          post: social.output.post,
          hookLine: social.output.hookLine,
          twistLine: social.output.twistLine,
          wordCount: social.output.wordCount,
          lineCount: social.output.lineCount,
        },
        score: {
          total: score.output.total,
          verdict: score.output.verdict,
          breakdown: {
            hookStrength: score.output.hookStrength,
            voiceMatch: score.output.voiceMatch,
            valueDensity: score.output.valueDensity,
            structureFormat: score.output.structureFormat,
            publishReadiness: score.output.publishReadiness,
          },
          fixes: score.output.fixes,
        },
      };
    },
  );
}
