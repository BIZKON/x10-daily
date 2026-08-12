import {
  type AgentContext,
  KnowledgeExtractAgent,
  createMasker,
  sanitizeProposals,
} from "@x10/agents";
import { createDb } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { knowledgeImportRequestedEvent } from "../../events";
import { modelsFromEnv } from "../../lib/agent-context";
import { guardBilling } from "../../lib/billing-gate";
import { recordRun } from "../../lib/cost-ledger";
import { crawlSite } from "../../lib/crawl-site";
import { fetchArticle, fetchRaw } from "../../lib/fetch-article";
import {
  failImport,
  loadExtractShelves,
  loadImportJob,
  markImportRunning,
  saveProposals,
} from "../../lib/kb-imports";
import type { PipelineInngest } from "../client";

/**
 * База знаний по ссылке: клиент дал адрес сайта — система читает его и
 * предлагает материалы по полкам (спека 11.08).
 *
 * Зачем это первым, а не контент-план: замер на проде 10–11.08 показал 257
 * статей, 11 реакций и ОДИН материал в базе знаний. При пустой базе агент
 * пишет про отрасль вообще, а потом выдумывает конкретику. Промпт — не рычаг,
 * рычаг — вход. У новой копии клиента база пуста по определению, значит это
 * первое, обо что спотыкается каждый покупатель.
 *
 * 🔴 Новый id функции. Inngest узнаёт о нём только после re-sync: PUT на
 * pipeline:8787 ИЗ КОНТЕЙНЕРА api, не с localhost (CLAUDE.md §8). Без этого
 * экран будет отправлять события в пустоту и молчать.
 */
export function createImportKnowledgeFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
) {
  return inngest.createFunction(
    {
      id: "import-knowledge",
      name: "Import knowledge from client site",
      triggers: [{ event: knowledgeImportRequestedEvent }],
      retries: 1,
      // Обход — разовая настройка, а не поток. Больше одного одновременно не
      // нужно никому, а чужой сайт не должен получить от нас веер запросов.
      concurrency: { limit: 1 },
      rateLimit: { limit: 12, period: "1h" },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("AI_GATEWAY_API_KEY не задан — разбор сайта невозможен.");
      }

      const importId = event.data.importId;

      const job = await step.run("load-job", async () => {
        const db = createDb(env.DATABASE_URL);
        return loadImportJob(db, importId);
      });

      // Строки нет — ретраить нечего, она не появится.
      if (!job) {
        console.warn(`import-knowledge: задание ${importId} не найдено`);
        return { status: "missing" as const, importId };
      }

      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      /**
       * 🔴 Деньги считаем ДО обхода, а не перед прогоном агента. Обход бесплатен
       * только на первый взгляд: за ним сразу идёт модель. Ходить по чужому
       * сайту, зная, что заплатить нечем, значит тратить чужой канал ради
       * нашего отказа.
       */
      const money = await step.run("balance-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        return guardBilling(db, env, now);
      });
      if (money.blocked) {
        const reason = "Закончились средства на балансе — пополните счёт, и обход можно повторить.";
        await step.run("fail-no-balance", async () => {
          const db = createDb(env.DATABASE_URL);
          await failImport(db, importId, reason);
        });
        return { status: "failed" as const, importId, reason };
      }

      await step.run("mark-running", async () => {
        const db = createDb(env.DATABASE_URL);
        await markImportRunning(db, importId);
      });

      // Обход одним шагом: внутри паузы между запросами, и дробить его на шаги
      // Inngest значило бы платить накладными за каждую страницу.
      const crawl = await step.run("crawl", () =>
        crawlSite(job.siteUrl, {
          fetchRaw: (url) => fetchRaw(url),
          fetchArticle: (url) => fetchArticle(url),
        }),
      );

      if (!crawl.ok) {
        // Модель не звали — расходу взяться неоткуда, строки в счёте не будет.
        const reason = crawl.reason;
        await step.run("fail-crawl", async () => {
          const db = createDb(env.DATABASE_URL);
          await failImport(db, importId, reason, crawl.log);
        });
        return { status: "failed" as const, importId, reason };
      }

      const shelves = await step.run("load-shelves", async () => {
        const db = createDb(env.DATABASE_URL);
        return loadExtractShelves(db);
      });

      if (shelves.length === 0) {
        const reason = "В базе знаний нет ни одной полки — раскладывать найденное некуда.";
        await step.run("fail-no-shelves", async () => {
          const db = createDb(env.DATABASE_URL);
          await failImport(db, importId, reason, crawl.log);
        });
        return { status: "failed" as const, importId, reason };
      }

      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      // 🔴 Результат агента держим ВНЕ try: модель могла ответить, деньги у
      // шлюза уже списаны, а упасть могла запись после неё. Нулевой расход в
      // такой ситуации подарил бы прогон и ослепил дневной учёт.
      let extracted: Awaited<ReturnType<typeof KnowledgeExtractAgent.run>> | null = null;

      try {
        extracted = await step.run("extract", () =>
          KnowledgeExtractAgent.run({ pages: crawl.pages, shelves }, ctx),
        );
        // Отдельная const: сужение типа у `let` не переживает замыкания шагов.
        const result = extracted;

        const clean = sanitizeProposals(result.output, {
          shelfSlugs: shelves.map((s) => s.slug),
          pageUrls: crawl.pages.map((p) => p.url),
        });

        const saved = await step.run("save-proposals", async () => {
          const db = createDb(env.DATABASE_URL);
          return saveProposals(db, importId, {
            documents: clean.documents,
            notes: clean.notes,
            log: crawl.log,
          });
        });

        await step.run("record-run", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "knowledge",
            status: "succeeded",
            costUsd: result.costUsd,
            modelUsed: result.modelUsed,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
            output: { pages: crawl.pages.length, proposed: saved, dropped: clean.dropped },
          });
        });

        return { status: "ready" as const, importId, proposed: saved, costUsd: result.costUsd };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await step.run("record-run-failed", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: null,
            agent: "knowledge",
            status: "failed",
            costUsd: extracted?.costUsd ?? 0,
            modelUsed: extracted?.modelUsed ?? null,
            inputTokens: extracted?.usage?.inputTokens ?? 0,
            outputTokens: extracted?.usage?.outputTokens ?? 0,
            cachedInputTokens: extracted?.usage?.cachedInputTokens ?? 0,
            error: message,
            output: { pages: crawl.pages.length, failed: true, agentRan: extracted !== null },
          });
        });
        await step.run("fail-extract", async () => {
          const db = createDb(env.DATABASE_URL);
          await failImport(
            db,
            importId,
            "Не удалось разобрать страницы сайта. Попробуйте повторить; если повторится — напишите нам.",
            crawl.log,
          );
        });
        // Возврат, а не бросок: причина записана и показана, а красный ран в
        // дашборде добавил бы шума без нового знания.
        return { status: "failed" as const, importId, error: message };
      }
    },
  );
}
