import { type AgentContext, CarouselAgent, createMasker, normalizeCarousel } from "@x10/agents";
import { type CarouselSlide, articles, createDb, eq } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { ARTICLE_CAROUSEL_REQUESTED } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { guardBilling } from "../../lib/billing-gate";
import { renderCarousel } from "../../lib/carousel-render";
import { recordRun } from "../../lib/cost-ledger";
import { coversEnabled, saveCover } from "../../lib/cover-storage";
import type { PipelineInngest } from "../client";

/**
 * generate-carousel — материал превращается в слайды (реестр §3.5).
 *
 * Цепочка: load-article → slides (CarouselAgent на текстовой модели) →
 * render-and-store (satori → resvg → PNG → диск) → mark-pending-review.
 *
 * 🔴 HumanGate: функция НИКОГДА не ставит `approved`. Альбом в канал пускает
 * редактор из админки — как и обложку (CLAUDE.md §4).
 *
 * ⚠️ Рисование и запись — ОДИН шаг, ровно по той же причине, что у обложки:
 * Inngest сериализует результат шага в JSON, и десять PNG по 150 КБ ушли бы
 * через границу шага объектом вида {"0":137,…}. Наружу отдаются только URL.
 *
 * Дешевле обложки на порядок: слайды рисует код, а модель отдаёт только текст.
 * Поэтому ретраев с паузой здесь нет — падать нечему, кроме сети.
 */

/** Сколько слайдов просим, если не сказано иное. */
const DEFAULT_TARGET = 6;

export function createGenerateCarouselFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
) {
  return inngest.createFunction(
    {
      id: "generate-carousel",
      name: "Render a carousel of slides for an article",
      triggers: [{ event: ARTICLE_CAROUSEL_REQUESTED }],
      retries: 1,
      concurrency: { limit: 2 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const articleId = event.data.articleId;
      const force = event.data.force === true;
      const target = event.data.target ?? DEFAULT_TARGET;

      // Слайды ложатся туда же, куда обложки: тот же том, та же раздача Caddy.
      if (!coversEnabled(env)) {
        return { skipped: true as const, reason: "storage-disabled" as const };
      }

      const nowMs = await step.run("now", async () => Date.now());
      const money = await step.run("balance-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        return guardBilling(db, env, new Date(nowMs));
      });
      if (money.blocked) {
        return {
          skipped: true as const,
          reason: "client-balance-exhausted" as const,
          balanceRub: money.balanceRub,
        };
      }

      const article = await step.run("load-article", async () => {
        const db = createDb(env.DATABASE_URL);
        const [a] = await db
          .select({
            tease: articles.tease,
            lede: articles.lede,
            whyItMatters: articles.whyItMatters,
            body: articles.body,
            category: articles.category,
            carouselStatus: articles.carouselStatus,
          })
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        return a ?? null;
      });

      if (!article) {
        console.warn(`generate-carousel: статья ${articleId} не найдена — пропуск.`);
        return { skipped: true as const, reason: "article-not-found" as const };
      }

      // Готовая карусель повторным событием не переписывается: перерисовка
      // приходит из админки с force=true.
      const ready =
        article.carouselStatus === "pending_review" || article.carouselStatus === "approved";
      if (ready && !force) {
        return { skipped: true as const, reason: "carousel-already-exists" as const };
      }

      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("generate-carousel: не задан ключ LLM (AI_GATEWAY_API_KEY).");

      const category = article.category ?? "news";

      const crafted = await step.run("slides", async () => {
        const ctx: AgentContext = {
          apiKey,
          baseURL: env.AI_GATEWAY_BASE_URL,
          masker: createMasker(env),
          models: modelsFromEnv(env),
        };
        const res = await CarouselAgent.run(
          {
            draft: {
              tease: article.tease,
              lede: article.lede,
              whyItMatters: article.whyItMatters ?? "",
              // Блоки статьи лежат в jsonb и типизированы схемой статьи, а агент ждёт
              // свою форму того же массива — на входе её проверит zod.
              // biome-ignore lint/suspicious/noExplicitAny: форму массива проверяет zod агента
              body: (article.body ?? []) as any,
            },
            category,
            target,
          },
          ctx,
        );
        return {
          slides: res.output.slides,
          costUsd: res.costUsd,
          modelUsed: res.modelUsed,
          usage: res.usage,
        };
      });

      // Правила карусели — на нашей стороне, а не в промпте: модель отдаёт
      // одиннадцать слайдов, забывает последний и называет цифрой фразу без
      // источника примерно так же часто, как делает всё правильно.
      const normalized = normalizeCarousel({ slides: crafted.slides, category });
      if (!normalized.ok) {
        await step.run("mark-failed", async () => {
          const db = createDb(env.DATABASE_URL);
          await db
            .update(articles)
            .set({ carouselStatus: "rejected" })
            .where(eq(articles.id, articleId));
          return { marked: true };
        });
        return { skipped: true as const, reason: "too-few-slides" as const };
      }

      const stored = await step.run("render-and-store", async () => {
        const pngs = await renderCarousel(normalized.slides, category);
        const slides: CarouselSlide[] = [];
        for (const [i, png] of pngs.entries()) {
          const s = normalized.slides[i];
          if (!s) continue;
          const url = await saveCover(env, articleId, png, "image/png");
          slides.push({
            index: s.index,
            kind: s.kind,
            title: s.title,
            ...(s.body ? { body: s.body } : {}),
            ...(s.source ? { source: s.source } : {}),
            url,
          });
        }
        return { slides, bytes: pngs.reduce((n, p) => n + p.length, 0) };
      });

      // 🔴 pending_review, НЕ approved — HumanGate.
      await step.run("mark-pending-review", async () => {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(articles)
          .set({ carousel: stored.slides, carouselStatus: "pending_review" })
          .where(eq(articles.id, articleId));
        return { marked: true };
      });

      // Расход — одна строка: рисование бесплатное, платим только за текст.
      await step.run("record-run", async () => {
        const db = createDb(env.DATABASE_URL);
        await recordRun(db, {
          articleId,
          agent: "carousel",
          status: "succeeded",
          costUsd: crafted.costUsd,
          modelUsed: crafted.modelUsed,
          inputTokens: crafted.usage.inputTokens,
          outputTokens: crafted.usage.outputTokens,
          cachedInputTokens: crafted.usage.cachedInputTokens,
          output: { slides: stored.slides.length, bytes: stored.bytes, force },
        });
        return { recorded: true };
      });

      return { ok: true as const, slides: stored.slides.length };
    },
  );
}
