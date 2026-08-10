import { type AgentContext, CreationAgent, createMasker } from "@x10/agents";
import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { creationRunRequestedEvent } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { guardBilling } from "../../lib/billing-gate";
import { recordRun } from "../../lib/cost-ledger";
import {
  failCreation,
  finishCreation,
  loadCreationJob,
  markCreationRunning,
} from "../../lib/creations";
import { loadKnowledge } from "../../lib/knowledge";
import type { PipelineInngest } from "../client";

/**
 * Раздел «Создать»: человек выбрал режим, назвал тему — здесь из этого выходит
 * материал (ручной режим, реестр разрыва §3.2).
 *
 * Вся разница с чатом собирается ровно в этой функции: указание режима
 * (`guidance`) и полки базы знаний приходят из настройки режима, а от человека
 * нужна только тема. Поэтому «настроить клиента» здесь означает поправить строки
 * в `creation_modes`, а не править код.
 *
 * 🔴 Новый id функции. Inngest узнаёт о нём только после re-sync: PUT на
 * pipeline:8787 ИЗ КОНТЕЙНЕРА api, не с localhost (CLAUDE.md §8). Без этого
 * экран будет отправлять события в пустоту и молчать.
 */
export function createRunCreationFunction(inngest: PipelineInngest, bindings: PipelineBindings) {
  return inngest.createFunction(
    {
      id: "run-creation",
      name: "Create material on human request",
      triggers: [{ event: creationRunRequestedEvent }],
      retries: 1,
      concurrency: { limit: 5 },
      // Ручное действие естественно редкое, но событие можно залить и в обход
      // экрана. Потолок держит стоимость обхода в понятных рамках.
      rateLimit: { limit: 60, period: "1h" },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("AI_GATEWAY_API_KEY не задан — создание материалов невозможно.");
      }

      const creationId = event.data.creationId;

      const job = await step.run("load-job", async () => {
        const db = createDb(env.DATABASE_URL);
        return loadCreationJob(db, creationId);
      });

      // Строки нет — ретраить нечего, она не появится. Бросок здесь заставил бы
      // Inngest долбиться в пустоту и показал бы ран красным без причины.
      if (!job) {
        console.warn(`run-creation: задание ${creationId} не найдено`);
        return { status: "missing" as const, creationId };
      }

      // 🔴 Режим «готовится» не должен ничего писать. Иначе честная пометка
      // превращается в обман, а клиент получает счёт за материал, которого не
      // заказывал: из шести режимов сегодня работает один.
      if (!job.mode.available) {
        const reason = `Режим «${job.mode.title}» ещё готовится — материал по нему пока не создаётся.`;
        await step.run("fail-unavailable", async () => {
          const db = createDb(env.DATABASE_URL);
          await failCreation(db, creationId, reason);
        });
        return { status: "failed" as const, creationId, reason };
      }

      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      // Деньги клиента (Спека 6). Проверяем ДО запуска агента: платить нечем —
      // считать нечего.
      const money = await step.run("balance-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        return guardBilling(db, env, now);
      });
      if (money.blocked) {
        const reason =
          "Закончились средства на балансе — пополните счёт, и задание можно повторить.";
        await step.run("fail-no-balance", async () => {
          const db = createDb(env.DATABASE_URL);
          await failCreation(db, creationId, reason);
        });
        return { status: "failed" as const, creationId, reason };
      }

      await step.run("mark-running", async () => {
        const db = createDb(env.DATABASE_URL);
        await markCreationRunning(db, creationId);
      });

      // Знания ТОЛЬКО по полкам режима: посту не нужны цены, документу нужны.
      // Отказ базы не отменяет создание — материал выйдет более общим, но
      // выйдет; падение из-за справочника было бы хуже самой проблемы.
      const knowledge = await step.run("load-knowledge", async () => {
        try {
          const db = createDb(env.DATABASE_URL);
          return await loadKnowledge(db, { shelfSlugs: job.mode.shelfSlugs });
        } catch {
          return "";
        }
      });

      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      // 🔴 Держим результат агента ВНЕ try: модель могла ответить, деньги у
      // шлюза уже списаны, а упасть могла запись после неё. Записать в такой
      // ситуации нулевой расход значит подарить прогон и ослепить дневной учёт —
      // ровно та дыра, которую в конвейере закрывает массив `billed`.
      let created: Awaited<ReturnType<typeof CreationAgent.run>> | null = null;

      try {
        created = await step.run("create", () =>
          CreationAgent.run(
            {
              guidance: job.mode.guidance,
              topic: job.creation.prompt,
              knowledge: knowledge || undefined,
            },
            ctx,
          ),
        );
        // Отдельная const: сужение типа у `let` не переживает замыкания шагов
        // ниже — компилятор обязан допустить, что переменную успели поменять.
        const material = created;

        await step.run("save-result", async () => {
          const db = createDb(env.DATABASE_URL);
          await finishCreation(db, creationId, {
            result: {
              title: material.output.title,
              body: material.output.body,
              notes: material.output.notes,
            },
            knowledgeUsed: knowledge,
          });
        });

        await step.run("record-run", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "creation",
            status: "succeeded",
            costUsd: material.costUsd,
            modelUsed: material.modelUsed,
            inputTokens: material.usage?.inputTokens ?? 0,
            outputTokens: material.usage?.outputTokens ?? 0,
            cachedInputTokens: material.usage?.cachedInputTokens ?? 0,
            output: { mode: job.mode.slug, notes: material.output.notes.length },
          });
        });

        return {
          status: "ready" as const,
          creationId,
          mode: job.mode.slug,
          costUsd: material.costUsd,
        };
      } catch (err) {
        // Расход пишем ДО выхода: агент мог отработать и упасть на записи, и
        // тогда деньги уже потрачены. Строка failed не выставляется клиенту
        // (см. BILLABLE_STATUSES), но остаётся видна как наш расход.
        const message = err instanceof Error ? err.message : String(err);
        await step.run("record-run-failed", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "creation",
            status: "failed",
            costUsd: created?.costUsd ?? 0,
            modelUsed: created?.modelUsed ?? null,
            inputTokens: created?.usage?.inputTokens ?? 0,
            outputTokens: created?.usage?.outputTokens ?? 0,
            cachedInputTokens: created?.usage?.cachedInputTokens ?? 0,
            error: message,
            output: { mode: job.mode.slug, failed: true, agentRan: created !== null },
          });
        });
        await step.run("fail-creation", async () => {
          const db = createDb(env.DATABASE_URL);
          await failCreation(
            db,
            creationId,
            "Не удалось создать материал. Попробуйте повторить; если повторится — напишите нам.",
          );
        });
        // Возврат, а не бросок: причина уже записана и показана человеку, а
        // красный ран в дашборде добавил бы шума без нового знания.
        return { status: "failed" as const, creationId, error: message };
      }
    },
  );
}
