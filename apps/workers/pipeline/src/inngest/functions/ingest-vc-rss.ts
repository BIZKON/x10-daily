import { createDb } from "@x10/db";
import { loadPipelineEnv } from "../../env";
import {
  ensureSource,
  fetchVcRss,
  markIfNew,
  simhash64,
  VC_RSS_URL,
} from "@x10/worker-ingest";
import { sourceItemReceivedEvent } from "../../events";
import type { PipelineInngest } from "../client";
import type { PipelineBindings } from "../../bindings";

/**
 * Walking Skeleton (ТЗ #1, N2): cron каждые 5 минут.
 *
 * 1. Lazy-upsert sources row для vc.ru.
 * 2. fetchVcRss() → нормализованные items.
 * 3. Для каждого: SimHash → markIfNew (атомарно через INSERT ON CONFLICT) →
 *    если запись свежая, эмитим `source.item.received` в существующий конвейер.
 *
 * Дальше: process-source-item (IngestAgent gate) → draft-article (B2 цепочка)
 * → article.ready → post-to-tg. Эта функция не знает о шагах ниже по потоку.
 */
export function createIngestVcRssFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инжекция fetch для тестов (мок RSS body без сети). Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "ingest-vc-rss",
      name: "Fetch vc.ru RSS and emit fresh items",
      triggers: [{ cron: "*/5 * * * *" }],
      retries: 1,
      // Не больше одного fetch'а в момент — vc.ru rate limit + чтобы dedup был
      // корректным (race на seen_items uniqueness и так покрывает, но lower contention).
      concurrency: { limit: 1 },
    },
    async ({ step }) => {
      const env = loadPipelineEnv(bindings);
      const db = createDb(env.DATABASE_URL);

      const sourceId = await step.run("ensure-source", () =>
        ensureSource(db, {
          name: "vc.ru",
          kind: "rss",
          tier: "secondary",
          url: VC_RSS_URL,
          locale: "ru",
        }),
      );

      const items = await step.run("fetch-rss", () =>
        fetchVcRss({ fetchImpl: opts.fetchImpl }),
      );

      let emitted = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const fp = simhash64(`${item.title}\n${item.text}`);
        const fresh = await step.run(`mark-${i}`, () =>
          markIfNew(db, {
            sourceId,
            externalId: item.externalId,
            fingerprint: fp,
          }),
        );
        if (!fresh) continue;

        await step.sendEvent(`emit-${i}`, {
          name: sourceItemReceivedEvent.event,
          data: {
            rawTitle: item.title,
            rawText: item.text,
            source: {
              url: item.url,
              title: item.title,
              publisher: "vc.ru",
              ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
            },
          },
        });
        emitted++;
      }

      return { fetched: items.length, emitted };
    },
  );
}
