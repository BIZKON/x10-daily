import { createDb } from "@x10/db";
import {
  type NormalizedItem,
  fetchRss,
  isSourceDue,
  listEnabledRssSources,
  markIfNew,
  markSourcePolled,
  simhash64,
} from "@x10/worker-ingest";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { sourceItemReceivedEvent } from "../../events";
import type { PipelineInngest } from "../client";

/**
 * Кап эмиссий на источник за один тик — страховка от бурста (например catch-up
 * после простоя cron'а или добавление неприминенного источника). draft-article
 * rateLimit (50/час) — глобальный потолок $; этот кап ограничивает фан-аут на входе.
 */
const MAX_EMIT_PER_SOURCE = 25;

/**
 * Multi-source RSS ingest (cron каждые 5 минут). Data-driven из таблицы
 * `sources`: перебирает ВСЕ enabled RSS-источники (vc.ru, РБК, Коммерсантъ,
 * Forbes, Habr, …), по каждому fetch → dedup (SimHash + seen_items) → emit
 * `source.item.received` с publisher = source.name.
 *
 * Изоляция: fetch+mark каждого источника — отдельный step с try/catch внутри,
 * поэтому битый источник (timeout/404/parse) НЕ роняет остальные.
 *
 * Анти-флуд: новые источники приминаются при засиде (seen_items заполняется
 * текущим фидом) → эмитятся только генуинно-новые items. MAX_EMIT_PER_SOURCE —
 * дополнительная страховка.
 *
 * Дальше по потоку: process-source-item (IngestAgent gate) → draft-article (B2)
 * → article.ready → post-to-tg. Эта функция не знает о шагах ниже.
 */
export function createIngestRssFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инъекция fetch для тестов (mock RSS body без сети). Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "ingest-rss",
      name: "Fetch enabled RSS sources and emit fresh items",
      triggers: [{ cron: "*/5 * * * *" }],
      retries: 1,
      // Один тик за раз: корректность dedup (меньше contention на seen_items)
      // + бережно к rate-limit'ам источников.
      concurrency: { limit: 1 },
    },
    async ({ step }) => {
      const env = loadPipelineEnv(bindings);
      const db = createDb(env.DATABASE_URL);

      // Один timestamp на тик (мемоизирован) — детерминизм gating при ретрае.
      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      const sources = await step.run("list-sources", () => listEnabledRssSources(db));

      const perSource: Array<{
        name: string;
        fetched: number;
        emitted: number;
        skipped?: boolean;
        error?: string;
      }> = [];

      for (const src of sources) {
        // Gating (session 20): cron тикает каждые 5 мин, но источник поллится не
        // чаще poll_interval_sec (default 900 = 15 мин). Бережёт rate-limit'ы
        // фидов и пустые гейт-вызовы на медленных лентах. lastPolledAt обновляем
        // только при успехе → битый источник ретраится каждый тик.
        if (!isSourceDue(src, now)) {
          perSource.push({ name: src.name, fetched: 0, emitted: 0, skipped: true });
          continue;
        }

        // fetch + mark всего фида в ОДНОМ step (Inngest мемоизирует → markIfNew
        // не повторяется при ретрае функции). Возвращаем только свежие items.
        const res = await step.run(`ingest-${src.id}`, async () => {
          try {
            const items = await fetchRss(src.url, { fetchImpl: opts.fetchImpl });
            const fresh: NormalizedItem[] = [];
            for (const item of items) {
              if (fresh.length >= MAX_EMIT_PER_SOURCE) break;
              const fp = simhash64(`${item.title}\n${item.text}`);
              const isNew = await markIfNew(db, {
                sourceId: src.id,
                externalId: item.externalId,
                fingerprint: fp,
              });
              if (isNew) fresh.push(item);
            }
            // Успешный полл — фиксируем время, чтобы gating отсчитывал интервал.
            await markSourcePolled(db, src.id, now);
            return {
              fetched: items.length,
              fresh,
              capped: fresh.length >= MAX_EMIT_PER_SOURCE,
              error: null as string | null,
            };
          } catch (e) {
            return {
              fetched: 0,
              fresh: [] as NormalizedItem[],
              capped: false,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        });

        if (res.error) {
          console.warn(`ingest-rss: источник ${src.name} (${src.url}) пропущен — ${res.error}`);
          perSource.push({ name: src.name, fetched: 0, emitted: 0, error: res.error });
          continue;
        }
        if (res.capped) {
          console.warn(
            `ingest-rss: ${src.name} упёрся в кап ${MAX_EMIT_PER_SOURCE} свежих/тик — остаток отложен до следующего тика.`,
          );
        }

        for (const [i, item] of res.fresh.entries()) {
          await step.sendEvent(`emit-${src.id}-${i}`, {
            name: sourceItemReceivedEvent.event,
            data: {
              rawTitle: item.title,
              rawText: item.text,
              source: {
                url: item.url,
                title: item.title,
                publisher: src.name,
                ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
              },
            },
          });
        }
        perSource.push({
          name: src.name,
          fetched: res.fetched,
          emitted: res.fresh.length,
        });
      }

      const totals = perSource.reduce(
        (a, s) => ({ fetched: a.fetched + s.fetched, emitted: a.emitted + s.emitted }),
        { fetched: 0, emitted: 0 },
      );
      return { sources: sources.length, ...totals, perSource };
    },
  );
}
