import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { listPendingAlerts } from "../../lib/cost-ledger";
import { attemptDelivery } from "../../lib/ops-alert";
import type { PipelineInngest } from "../client";

/**
 * Кап неудачных попыток на алерт. После стольких провалов перестаём дёргать
 * (вечно сломанный chat_id/токен не должен крутиться бесконечно). Строка остаётся
 * delivered_at IS NULL с last_error — видна в БД / на дашборде /cost.
 */
const MAX_ATTEMPTS = 12;

/**
 * Окно дослыки: алерты старше уже неактуальны (дневной потолок — событие «здесь
 * и сейчас»), дослать их задним числом смысла мало. Оставляем как есть.
 */
const RETRY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 48 ч

/** Сколько дослыаем за один тик. В норме недоставленных 0; кап — страховка. */
const MAX_PER_TICK = 20;

/**
 * M4: дослыка недоставленных ops-алертов. Cron каждые 10 минут сканит
 * cost_alerts с delivered_at IS NULL (частичный индекс) и повторяет отправку по
 * сохранённому message. Закрывает дыру, где транзиентный сбой TG (или краш между
 * claim и send) терял $-алерт навсегда — клейм-строка блокировала повторный
 * claimAlert, но уведомление не уходило.
 *
 * Намеренно НЕ гейтится posting-control: ops-алерты про безопасность бюджета
 * должны доходить даже когда контент-постинг на паузе/в тихих часах (и канал у
 * них отдельный — личка, не контент-канал).
 */
export function createRetryOpsAlertsFunction(inngest: PipelineInngest, bindings: PipelineBindings) {
  return inngest.createFunction(
    {
      id: "retry-ops-alerts",
      name: "Redeliver undelivered ops alerts",
      triggers: [{ cron: "*/10 * * * *" }],
      retries: 1,
      // Один тик за раз — меньше contention на cost_alerts, дослыка не срочная.
      concurrency: { limit: 1 },
    },
    async ({ step }) => {
      const env = loadPipelineEnv(bindings);

      // Мемоизированный timestamp — детерминизм окна дослыки при ретрае.
      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      const pending = await step.run("list-pending", async () => {
        const db = createDb(env.DATABASE_URL);
        return listPendingAlerts(
          db,
          { maxAttempts: MAX_ATTEMPTS, windowMs: RETRY_WINDOW_MS, limit: MAX_PER_TICK },
          now,
        );
      });
      if (pending.length === 0) return { pending: 0, delivered: 0 };

      let delivered = 0;
      for (const alert of pending) {
        // Отдельный step на алерт (Inngest мемоизирует доставленные → ретрай
        // функции не шлёт их повторно).
        const ok = await step.run(`redeliver-${alert.id}`, async () => {
          const db = createDb(env.DATABASE_URL);
          return attemptDelivery(db, env, alert);
        });
        if (ok) delivered++;
      }

      console.warn(
        `retry-ops-alerts: дослано ${delivered}/${pending.length} недоставленных алертов.`,
      );
      return { pending: pending.length, delivered };
    },
  );
}
