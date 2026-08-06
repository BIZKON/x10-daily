import {
  type AgentContext,
  BrevityAgent,
  DRAFT_TEMPLATES,
  type DraftTemplate,
  RewriteAgent,
  createMasker,
  draftShapeSchema,
} from "@x10/agents";
import { articles, createDb, eq, reviewCards } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { ARTICLE_REWRITE_REQUESTED, REVIEW_CARD_REQUESTED } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { recordRun } from "../../lib/cost-ledger";
import { countWords } from "../../persist";
import type { PipelineInngest } from "../client";

/**
 * Рерайт материала по правке редактора (Спека 4, шаг 5).
 *
 * Редактор жмёт «Рерайт», отвечает в треде своими словами — сюда приходит
 * инструкция. RewriteAgent выполняет её поверх канона голоса, BrevityAgent
 * возвращает результат в лимиты шаблона, и в группу уходит НОВАЯ карточка.
 *
 * 🔴 Старая карточка помечается `superseded`, а не `decided`: решение по
 * материалу так и не принято. Но и ворота она больше не держит — их подхватит
 * новая карточка, созданная следом.
 *
 * ⚠️ Сжатие вторым шагом, а не одним промптом: у BrevityAgent свои лимиты на
 * шаблон, и дублировать их в промпте рерайта значило бы завести второй
 * источник истины про длину.
 */
export function createRewriteArticleFunction(inngest: PipelineInngest, bindings: PipelineBindings) {
  return inngest.createFunction(
    {
      id: "rewrite-article",
      name: "Rewrite an article by editor instruction",
      triggers: [{ event: ARTICLE_REWRITE_REQUESTED }],
      retries: 1,
      concurrency: { limit: 2 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const { articleId, instruction, cardId } = event.data;

      const article = await step.run("load-article", async () => {
        const db = createDb(env.DATABASE_URL);
        const [a] = await db
          .select({
            tease: articles.tease,
            lede: articles.lede,
            whyItMatters: articles.whyItMatters,
            body: articles.body,
            template: articles.template,
            status: articles.status,
          })
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        return a ?? null;
      });

      if (!article) {
        return { skipped: true as const, reason: "article-not-found" as const };
      }

      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("rewrite-article: не задан ключ LLM (AI_GATEWAY_API_KEY).");
      }

      // 🔴 Тело статьи из БД валидируем схемой агента, а не приводим типом.
      // В колонке жанрово шире: там допустим блок `image`, которого агент не
      // знает. Молча выкинуть его при сохранении значило бы потерять кусок
      // материала, поэтому при несовпадении честно отказываемся от рерайта.
      const parsedCurrent = draftShapeSchema.safeParse({
        tease: article.tease,
        lede: article.lede,
        whyItMatters: article.whyItMatters ?? "",
        body: Array.isArray(article.body) ? article.body : [],
      });
      if (!parsedCurrent.success) {
        console.warn(
          `rewrite-article: статья ${articleId} содержит блоки, которых агент не знает — рерайт пропущен.`,
        );
        return { skipped: true as const, reason: "unsupported-blocks" as const };
      }
      const current = parsedCurrent.data;

      const result = await step.run("rewrite", async () => {
        const ctx: AgentContext = {
          apiKey,
          baseURL: env.AI_GATEWAY_BASE_URL,
          masker: createMasker(env),
          models: modelsFromEnv(env),
        };

        const rewritten = await RewriteAgent.run({ current, instruction }, ctx);

        // Сжатие возвращает результат в лимиты шаблона: правка «добавь абзац»
        // легко выносит материал за 300 слов, а канал этого не прощает.
        // `digest` в колонке есть, а у Brevity его нет: у выпуска свои лимиты
        // и свой сборщик. Неизвестный шаблон не передаём — агент возьмёт свой
        // дефолт, а не упадёт на валидации.
        const template = DRAFT_TEMPLATES.includes(article.template as DraftTemplate)
          ? (article.template as DraftTemplate)
          : undefined;
        const compressed = await BrevityAgent.run(
          { revised: rewritten.output.revised, ...(template ? { template } : {}) },
          ctx,
        );

        return {
          draft: compressed.output.compressed,
          changes: rewritten.output.changes,
          refusedPart: rewritten.output.refusedPart,
          costUsd: rewritten.costUsd + compressed.costUsd,
          usage: {
            inputTokens: rewritten.usage.inputTokens + compressed.usage.inputTokens,
            outputTokens: rewritten.usage.outputTokens + compressed.usage.outputTokens,
            cachedInputTokens:
              (rewritten.usage.cachedInputTokens ?? 0) + (compressed.usage.cachedInputTokens ?? 0),
          },
          modelUsed: rewritten.modelUsed,
        };
      });

      await step.run("save", async () => {
        const db = createDb(env.DATABASE_URL);
        const wordCount = countWords(result.draft);
        await db
          .update(articles)
          .set({
            tease: result.draft.tease,
            lede: result.draft.lede,
            whyItMatters: result.draft.whyItMatters,
            body: result.draft.body,
            wordCount,
            // Та же формула, что при первичном сохранении (persist.ts): 200
            // слов в минуту, не меньше 20 секунд.
            readSeconds: Math.max(20, Math.round((wordCount / 200) * 60)),
          })
          .where(eq(articles.id, articleId));
        return { saved: true };
      });

      // Старая карточка больше не актуальна: решение по ней не принято, но
      // показывает она уже прошлый текст.
      if (cardId) {
        await step.run("supersede-card", async () => {
          const db = createDb(env.DATABASE_URL);
          await db
            .update(reviewCards)
            .set({ state: "superseded" })
            .where(eq(reviewCards.id, cardId));
          return { superseded: true };
        });
      }

      await step.run("record-run", async () => {
        const db = createDb(env.DATABASE_URL);
        await recordRun(db, {
          articleId,
          agent: "rewrite",
          status: "succeeded",
          costUsd: result.costUsd,
          modelUsed: result.modelUsed,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cachedInputTokens: result.usage.cachedInputTokens,
          output: { instruction, changes: result.changes, refusedPart: result.refusedPart },
        });
        return { recorded: true };
      });

      // Новая карточка с переписанным текстом. Она же снова закрывает ворота.
      await step.sendEvent("request-review-card", {
        name: REVIEW_CARD_REQUESTED,
        data: { articleId },
      });

      return {
        rewritten: true as const,
        articleId,
        changes: result.changes,
        refusedPart: result.refusedPart,
      };
    },
  );
}
