import {
  type AgentContext,
  PLAN_HORIZON_DAYS,
  PLAN_TOPICS_TARGET,
  PlanAgent,
  createMasker,
  sanitizePlanItems,
} from "@x10/agents";
import { PLAN_CATEGORIES } from "@x10/config";
import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { planBuildRequestedEvent } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { guardBilling } from "../../lib/billing-gate";
import { recordRun } from "../../lib/cost-ledger";
import {
  failPlan,
  loadPlanContext,
  loadPlanJob,
  markPlanRunning,
  savePlanItems,
} from "../../lib/plans";
import type { PipelineInngest } from "../client";

/**
 * Контент-план на месяц: 30 тем с датами и форматами (спека 13.08).
 *
 * Обещан главной фишкой тарифа за 120 тысяч: «снимает главный вопрос — о чём
 * вообще писать и что зайдёт».
 *
 * 🔴 Новый id функции. Inngest узнаёт о нём только после re-sync: PUT на
 * `pipeline:8787/inngest` ИЗ КОНТЕЙНЕРА api (CLAUDE.md §8; путь именно
 * `/inngest`, не `/api/inngest` — проверено 12.08).
 */

/** Слоты выхода МСК. Совпадают с расписанием `drain-post-slots`. */
const SLOTS = ["09:30", "12:30", "15:30", "18:30"];

export function createBuildContentPlanFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
) {
  return inngest.createFunction(
    {
      id: "build-content-plan",
      name: "Build monthly content plan",
      triggers: [{ event: planBuildRequestedEvent }],
      retries: 1,
      // Сборка на месяц — редкое действие. Два прогона разом означали бы два
      // счёта и два набора тем на один календарь.
      concurrency: { limit: 1 },
      rateLimit: { limit: 12, period: "1h" },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("AI_GATEWAY_API_KEY не задан — сборка плана невозможна.");
      }

      const planId = event.data.planId;

      const job = await step.run("load-job", async () => {
        const db = createDb(env.DATABASE_URL);
        return loadPlanJob(db, planId);
      });

      // Строки нет — ретраить нечего, она не появится.
      if (!job) {
        console.warn(`build-content-plan: сборка ${planId} не найдена`);
        return { status: "missing" as const, planId };
      }

      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      const money = await step.run("balance-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        return guardBilling(db, env, now);
      });
      if (money.blocked) {
        const reason = "Закончились средства на балансе — пополните счёт, и план можно собрать.";
        await step.run("fail-no-balance", async () => {
          const db = createDb(env.DATABASE_URL);
          await failPlan(db, planId, reason);
        });
        return { status: "failed" as const, planId, reason };
      }

      const context = await step.run("load-context", async () => {
        const db = createDb(env.DATABASE_URL);
        return loadPlanContext(db);
      });

      /**
       * 🔴 Главный гейт фичи. План из пустой базы знаний — это тридцать тем про
       * отрасль вообще, за которые клиент заплатит и которые выбросит. Ровно тот
       * урок, ради которого строилась база знаний: промпт не рычаг, рычаг —
       * вход.
       */
      if (!context.knowledge.trim()) {
        const reason =
          "В базе знаний пока пусто — плану не на что опереться. Заполните хотя бы одну полку, и соберём план по вашим услугам, ценам и возражениям.";
        await step.run("fail-no-knowledge", async () => {
          const db = createDb(env.DATABASE_URL);
          await failPlan(db, planId, reason);
        });
        return { status: "failed" as const, planId, reason };
      }

      // Без единого рабочего формата агент придумает свой, и план пообещает то,
      // чего система не делает.
      if (context.formats.length === 0) {
        const reason = "Ни один формат не включён — план собирать не из чего.";
        await step.run("fail-no-formats", async () => {
          const db = createDb(env.DATABASE_URL);
          await failPlan(db, planId, reason);
        });
        return { status: "failed" as const, planId, reason };
      }

      await step.run("mark-running", async () => {
        const db = createDb(env.DATABASE_URL);
        await markPlanRunning(db, planId);
      });

      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      // 🔴 Результат агента держим ВНЕ try: модель могла ответить, деньги у
      // шлюза уже списаны, а упасть могла запись после неё.
      let built: Awaited<ReturnType<typeof PlanAgent.run>> | null = null;

      try {
        built = await step.run("build-plan", () =>
          PlanAgent.run(
            {
              knowledge: context.knowledge,
              recentTitles: context.recentTitles,
              categories: [...PLAN_CATEGORIES],
              formats: context.formats,
              slots: SLOTS,
              days: PLAN_HORIZON_DAYS,
              count: PLAN_TOPICS_TARGET,
            },
            ctx,
          ),
        );
        // Отдельная const: сужение типа у `let` не переживает замыкания шагов.
        const result = built;

        const clean = sanitizePlanItems(result.output, {
          categorySlugs: PLAN_CATEGORIES.map((c) => c.slug),
          modeSlugs: context.formats.map((f) => f.slug),
          slots: SLOTS,
          days: PLAN_HORIZON_DAYS,
          recentTitles: context.recentTitles,
        });

        const saved = await step.run("save-items", async () => {
          const db = createDb(env.DATABASE_URL);
          return savePlanItems(db, planId, {
            topics: clean.items,
            knowledgeUsed: context.knowledge,
            periodStart: job.periodStart,
          });
        });

        await step.run("record-run", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "plan",
            status: "succeeded",
            costUsd: result.costUsd,
            modelUsed: result.modelUsed,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
            output: { topics: saved, dropped: clean.dropped, period: job.periodStart },
          });
        });

        return { status: "ready" as const, planId, topics: saved, costUsd: result.costUsd };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await step.run("record-run-failed", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "plan",
            status: "failed",
            costUsd: built?.costUsd ?? 0,
            modelUsed: built?.modelUsed ?? null,
            inputTokens: built?.usage?.inputTokens ?? 0,
            outputTokens: built?.usage?.outputTokens ?? 0,
            cachedInputTokens: built?.usage?.cachedInputTokens ?? 0,
            error: message,
            output: { failed: true, agentRan: built !== null },
          });
        });
        await step.run("fail-plan", async () => {
          const db = createDb(env.DATABASE_URL);
          await failPlan(
            db,
            planId,
            "Не удалось собрать план. Попробуйте повторить; если повторится — напишите нам.",
          );
        });
        return { status: "failed" as const, planId, error: message };
      }
    },
  );
}
