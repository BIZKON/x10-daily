import { type AgentContext, VisualAgent, buildImagePrompt, createMasker } from "@x10/agents";
import { articles, createDb, eq } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { ARTICLE_COVER_REQUESTED } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { recordRun } from "../../lib/cost-ledger";
import { coversEnabled, saveCover } from "../../lib/cover-storage";
import { generateCoverImage } from "../../lib/gemini-image";
import type { PipelineInngest } from "../client";

/**
 * generate-cover (Спека 2) — ИИ-обложка статьи.
 *
 * Цепочка: load-article → visual-prompt (VisualAgent крафтит сцену на DeepSeek,
 * РФ-шлюз) → generate-and-store (Nano Banana 2 → байты → диск) →
 * mark-pending-review.
 *
 * 🔴 HumanGate: функция НИКОГДА не ставит `approved` — только `pending_review`.
 * Картинку в канал пускает только редактор из админки (CLAUDE.md §4).
 *
 * ⚠️ Генерация и запись — ОДИН шаг намеренно. Inngest сериализует результаты
 * step.run в JSON; ~800 КБ байтов картинки через границу шага (а) распухли бы в
 * объект вида {"0":255,…}, (б) уперлись бы в лимит размера вывода шага. Поэтому
 * байты живут внутри одного шага, а наружу отдаётся только публичный URL.
 * Плата за это — ретрай шага перегенерирует картинку (retries:1 → максимум два
 * вызова модели). Это дешевле и честнее, чем возить байты через Inngest.
 *
 * Фолбэк железный: любой сбой → visual_status НЕ становится pending_review →
 * drain-post-slots отправит текстовый пост, лента покажет BrandedCover.
 */
export function createGenerateCoverFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инъекция fetch для тестов (мок шлюза без сети). Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "generate-cover",
      name: "Generate AI cover image for an article",
      triggers: [{ event: ARTICLE_COVER_REQUESTED }],
      retries: 1,
      // Плоский лимит, БЕЗ concurrency-ключа по статье. Ключи — единственное
      // место во всём конвейере, где мы полагались бы на фичу, не используемую
      // остальными функциями; если self-hosted Inngest её не примет, упадёт
      // re-sync ВСЕХ функций, то есть весь автономный контур.
      // Что теряем: гард `cover-already-exists` ниже отсекает повторные
      // АВТОМАТИЧЕСКИЕ события, но два ручных «Перегенерировать» подряд
      // (force:true) его обходят → лишний платный вызов модели. Цена ошибки
      // (~$0.07) несопоставима с риском уронить синхронизацию конвейера.
      concurrency: { limit: 2 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const articleId = event.data.articleId;
      const force = event.data.force === true;

      // Гард конфигурации: пусто → фича выключена, конвейер работает как раньше.
      if (!coversEnabled(env)) {
        return { skipped: true as const, reason: "covers-disabled" as const };
      }

      const article = await step.run("load-article", async () => {
        const db = createDb(env.DATABASE_URL);
        const [a] = await db
          .select({
            tease: articles.tease,
            lede: articles.lede,
            category: articles.category,
            visualStatus: articles.visualStatus,
            coverImageUrl: articles.coverImageUrl,
          })
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        return a ?? null;
      });

      if (!article) {
        console.warn(`generate-cover: статья ${articleId} не найдена — пропуск.`);
        return { skipped: true as const, reason: "article-not-found" as const };
      }

      // Обложка уже сгенерирована и ждёт/прошла ревью → повторное событие не
      // тратит деньги. Перегенерация из админки приходит с force=true.
      const alreadyHasCover =
        Boolean(article.coverImageUrl) &&
        (article.visualStatus === "pending_review" || article.visualStatus === "approved");
      if (alreadyHasCover && !force) {
        return { skipped: true as const, reason: "cover-already-exists" as const };
      }

      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("generate-cover: не задан ключ LLM (AI_GATEWAY_API_KEY).");
      }

      // Крафт сцены. VisualAgent возвращает ТОЛЬКО SUBJECT; стиль, негатив и
      // тех-параметры канона дописывает buildImagePrompt (packages/voice/visual.md).
      const crafted = await step.run("visual-prompt", async () => {
        const ctx: AgentContext = {
          apiKey,
          baseURL: env.AI_GATEWAY_BASE_URL,
          masker: createMasker(env),
          models: modelsFromEnv(env),
        };
        const res = await VisualAgent.run(
          { tease: article.tease, lede: article.lede, category: article.category ?? "news" },
          ctx,
        );
        return {
          imagePrompt: buildImagePrompt({
            scene: res.output.scene,
            category: article.category ?? "news",
          }),
          costUsd: res.costUsd,
          modelUsed: res.modelUsed,
          usage: res.usage,
        };
      });

      // Генерация + запись на диск одним шагом (см. докблок выше — байты не
      // должны пересекать границу Inngest-шага).
      const stored = await step.run("generate-and-store", async () => {
        const img = await generateCoverImage(env, crafted.imagePrompt, {
          fetchImpl: opts.fetchImpl,
        });
        const url = await saveCover(env, articleId, img.bytes, img.mime);
        return { coverUrl: url, mime: img.mime, byteLength: img.bytes.length };
      });

      // 🔴 pending_review, НЕ approved — HumanGate.
      await step.run("mark-pending-review", async () => {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(articles)
          .set({
            coverImageUrl: stored.coverUrl,
            visualPrompt: crafted.imagePrompt,
            visualStatus: "pending_review",
          })
          .where(eq(articles.id, articleId));
        return { marked: true };
      });

      // $-ledger: расход VisualAgent виден дневному потолку. Стоимость самой
      // картинки шлюз в usage не отдаёт (спайк: только image_tokens) — считаем
      // по факту в отчётах, здесь фиксируем крафт промпта.
      await step.run("record-run", async () => {
        const db = createDb(env.DATABASE_URL);
        await recordRun(db, {
          articleId,
          agent: "visual",
          status: "succeeded",
          costUsd: crafted.costUsd,
          modelUsed: crafted.modelUsed,
          inputTokens: crafted.usage.inputTokens,
          outputTokens: crafted.usage.outputTokens,
          cachedInputTokens: crafted.usage.cachedInputTokens,
          output: { imageModel: env.IMAGE_MODEL, byteLength: stored.byteLength, force },
        });
        return { recorded: true };
      });

      console.warn(
        `generate-cover: статья ${articleId} — обложка ${stored.coverUrl} (${stored.byteLength} Б), ждёт ревью.`,
      );
      return {
        articleId,
        coverImageUrl: stored.coverUrl,
        visualStatus: "pending_review" as const,
      };
    },
  );
}
