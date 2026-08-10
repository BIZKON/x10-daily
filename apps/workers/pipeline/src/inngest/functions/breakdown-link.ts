import { type AgentContext, BreakdownAgent, createMasker } from "@x10/agents";
import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import {
  DEFAULT_CATEGORY,
  DEFAULT_SECTION,
  DEFAULT_TEMPLATE,
  linkSubmittedEvent,
  topicIngestedEvent,
} from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { guardBilling } from "../../lib/billing-gate";
import { recordRun } from "../../lib/cost-ledger";
import { fetchArticle } from "../../lib/fetch-article";
import type { PipelineInngest } from "../client";

/**
 * Разбор материала по ссылке — ВТОРОЙ ВХОД конвейера (план 09.08.2026, п. 1).
 *
 * До этого темы приходили только из лент источников. Теперь человек может дать
 * ссылку на удачный чужой материал и получить свой — в своей рубрике и своим
 * голосом.
 *
 * 🔴 Ключевое архитектурное решение: на выходе функция шлёт ОБЫЧНОЕ
 * `article/topic.ingested` — ровно то событие, которое отдаёт гейт лент.
 * Поэтому всё после драфта (написание, цифры, голос, сжатие, обложка, карточка
 * ревью, слоты) работает без единой правки. Второй трубы рядом нет.
 *
 * Что делаем МЫ, а не модель: загрузка страницы с защитой от обращений во
 * внутреннюю сеть (lib/fetch-article.ts) и денежный гейт. Модель получает уже
 * извлечённый текст.
 */
export function createBreakdownLinkFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: { fetchImpl?: typeof fetch } = {},
) {
  return inngest.createFunction(
    {
      id: "breakdown-link",
      name: "Break down a submitted link into our own topic",
      triggers: [{ event: linkSubmittedEvent }],
      retries: 1,
      // Ссылки присылает человек руками — очередь короткая по определению.
      concurrency: { limit: 3 },
      // Защита от заливки событий мимо кабинета: разбор платный.
      rateLimit: { limit: 40, period: "1h" },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("Ни AI_GATEWAY_API_KEY, ни ANTHROPIC_API_KEY не задан — разбор невозможен.");
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

      // Загрузка ДО модели: если страницы нет или текста на ней нет, платить
      // за разбор не за что, и человек должен узнать это сразу.
      const page = await step.run("fetch-page", async () =>
        fetchArticle(event.data.url, opts.fetchImpl),
      );
      if (!page.ok) {
        return { skipped: true as const, reason: "fetch-failed" as const, message: page.reason };
      }

      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      const run = await step.run("breakdown", () =>
        BreakdownAgent.run(
          {
            url: page.url,
            title: page.title,
            text: page.text,
            clientContext: event.data.clientContext,
          },
          ctx,
        ),
      );

      // Прогон записываем ВСЕГДА, включая отказ: токены потрачены в обоих
      // случаях, и расход должен быть виден клиенту в «Расходах».
      await step.run("record-run", async () => {
        const db = createDb(env.DATABASE_URL);
        await recordRun(db, {
          articleId: null,
          agent: "breakdown",
          status: run.output.usable ? "succeeded" : "skipped",
          costUsd: run.costUsd,
          modelUsed: run.modelUsed,
          inputTokens: run.usage.inputTokens,
          outputTokens: run.usage.outputTokens,
          cachedInputTokens: run.usage.cachedInputTokens,
          output: {
            stage: "link-breakdown",
            url: page.url,
            usable: run.output.usable,
            whyItWorked: run.output.whyItWorked,
            // Каркас сохраняем целиком: он объясняет редактору, откуда взялась
            // тема, и переживает саму статью.
            beats: {
              hook: run.output.hook,
              proof: run.output.proof,
              arc: run.output.arc,
              cta: run.output.cta,
            },
          },
        });
      });

      if (!run.output.usable) {
        return {
          skipped: true as const,
          reason: "not-usable" as const,
          message: run.output.rejectReason ?? "Материал не годится для адаптации",
        };
      }

      // Каркас уезжает в context: DraftAgent должен писать ПО приёму, а не
      // просто на тему. Без этого разбор остаётся справкой, которую никто не
      // применил.
      const context = [
        run.output.context,
        "",
        "ПРИЁМ, КОТОРЫЙ ПЕРЕНОСИМ:",
        `Захват: ${run.output.hook.adapted}`,
        `Доказательство: ${run.output.proof.adapted}`,
        `Развитие: ${run.output.arc.adapted}`,
        `Призыв: ${run.output.cta.adapted}`,
        `Почему это работает: ${run.output.whyItWorked}`,
      ].join("\n");

      await step.sendEvent("dispatch-topic", {
        name: topicIngestedEvent.event,
        data: {
          topic: run.output.topic,
          context,
          sources: [{ title: page.title || page.url, url: page.url }],
          section: DEFAULT_SECTION,
          category: run.output.category ?? DEFAULT_CATEGORY,
          subcategory: run.output.subcategory ?? undefined,
          template: run.output.template ?? DEFAULT_TEMPLATE,
          tags: run.output.tags,
          political: run.output.political,
        },
      });

      return {
        dispatched: true as const,
        topic: run.output.topic,
        category: run.output.category,
        template: run.output.template,
        whyItWorked: run.output.whyItWorked,
        costUsd: run.costUsd,
      };
    },
  );
}
