import { createDb, eq, sources } from "@x10/db";
import { type RedditCreds, fetchReddit, fetchRss, markIfNew, simhash64 } from "@x10/worker-ingest";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { SOURCE_PRIME_REQUESTED } from "../../events";
import type { PipelineInngest } from "../client";

/**
 * Приминание нового источника: прочитать фид целиком, записать всё в
 * `seen_items` и только после этого включить источник.
 *
 * 🔴 Без этого шага первый тик `ingest-rss` принимает весь исторический фид за
 * свежие новости и выстреливает в канал бэклогом за месяцы (CLAUDE.md §4).
 * Кап `MAX_EMIT_PER_SOURCE = 25` в ingest-rss — страховка, а не решение: он
 * лишь растягивает выстрел на несколько тиков.
 *
 * Порядок «сначала выключен, потом приминание, потом включение» выбран
 * намеренно. Обратный порядок (создать включённым и примять следом) оставляет
 * окно, в которое успевает попасть тик крона: он ходит каждые 5 минут и не
 * спрашивает разрешения. Здесь окна нет вовсе.
 *
 * Побочная выгода: источник обязан ДОКАЗАТЬ работоспособность, прежде чем
 * начать вещать. Опечатка в адресе, 404 и мёртвый фид отсекаются здесь, а не
 * сутками тишины, в которых непонятно, что сломалось.
 */
export function createPrimeSourceFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: { fetchImpl?: typeof fetch } = {},
) {
  return inngest.createFunction(
    {
      id: "prime-source",
      name: "Prime a new parsing source before enabling it",
      triggers: [{ event: SOURCE_PRIME_REQUESTED }],
      retries: 1,
      // Плоский лимит без ключа: ключи concurrency в этом конвейере не
      // используются нигде, и вводить их ради одной функции — риск уронить
      // re-sync ВСЕХ функций, то есть весь автономный контур.
      concurrency: { limit: 2 },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const db = createDb(env.DATABASE_URL);
      const sourceId = event.data.sourceId;

      const src = await step.run("load-source", async () => {
        const [row] = await db
          .select({
            id: sources.id,
            name: sources.name,
            url: sources.url,
            adapterType: sources.adapterType,
            enabled: sources.enabled,
            notes: sources.notes,
          })
          .from(sources)
          .where(eq(sources.id, sourceId))
          .limit(1);
        return row ?? null;
      });

      if (!src) {
        console.warn(`prime-source: источник ${sourceId} не найден — пропуск.`);
        return { skipped: true as const, reason: "source-not-found" as const };
      }

      // Уже включён — значит приминание прошло раньше. Повторное событие не
      // должно ни перечитывать фид, ни трогать состояние.
      if (src.enabled) {
        return { skipped: true as const, reason: "already-enabled" as const };
      }

      const redditCreds: RedditCreds | null =
        env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET
          ? {
              clientId: env.REDDIT_CLIENT_ID,
              clientSecret: env.REDDIT_CLIENT_SECRET,
              userAgent:
                env.REDDIT_USER_AGENT || "ProAgentAI-ingest/0.1 (+https://pro-agent-ai.ru)",
            }
          : null;

      // Чтение фида и запись в seen_items — ОДИН шаг: Inngest мемоизирует
      // результат, поэтому ретрай функции не перечитывает фид повторно.
      const primed = await step.run("prime", async () => {
        try {
          const items =
            src.adapterType === "reddit"
              ? await fetchReddit(src.url, redditCreds, { fetchImpl: opts.fetchImpl })
              : await fetchRss(src.url, { fetchImpl: opts.fetchImpl });

          let marked = 0;
          for (const item of items) {
            // external_id — varchar(256): длинный guid иначе ронял бы весь фид.
            await markIfNew(db, {
              sourceId: src.id,
              externalId: item.externalId.slice(0, 256),
              fingerprint: simhash64(`${item.title}\n${item.text}`),
            });
            marked++;
          }
          return { ok: true as const, fetched: items.length, marked, error: null };
        } catch (e) {
          return {
            ok: false as const,
            fetched: 0,
            marked: 0,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });

      if (!primed.ok) {
        // Источник остаётся ВЫКЛЮЧЕННЫМ. Ошибку кладём в notes — это
        // единственное место, где редактор её увидит: логи контейнера смывает
        // ближайший деплой.
        await step.run("mark-failed", async () => {
          await db
            .update(sources)
            .set({
              status: "pending",
              enabled: false,
              notes: `Не удалось прочитать фид: ${String(primed.error).slice(0, 400)}`,
            })
            .where(eq(sources.id, src.id));
          return { marked: true };
        });
        console.warn(`prime-source: ${src.name} (${src.url}) — ${primed.error}`);
        return { primed: false as const, sourceId, error: primed.error };
      }

      // 🔴 Пустой фид НЕ включаем: включённый источник, из которого ничего не
      // приходит, выглядит рабочим и молчит. Чаще всего это неверный адрес,
      // отдающий 200 и пустую ленту.
      if (primed.fetched === 0) {
        await step.run("mark-empty", async () => {
          await db
            .update(sources)
            .set({
              status: "pending",
              enabled: false,
              notes: "Фид прочитан, но в нём нет ни одной записи — проверь адрес.",
            })
            .where(eq(sources.id, src.id));
          return { marked: true };
        });
        return { primed: false as const, sourceId, error: "empty-feed" };
      }

      await step.run("enable", async () => {
        await db
          .update(sources)
          .set({
            enabled: true,
            status: "active",
            // lastPolledAt = сейчас: фид только что прочитан целиком, повторно
            // ходить за ним в ближайший тик незачем.
            lastPolledAt: new Date().toISOString(),
            notes: `Проверен при добавлении: прочитано записей — ${primed.fetched}.`,
          })
          .where(eq(sources.id, src.id));
        return { enabled: true };
      });

      return { primed: true as const, sourceId, fetched: primed.fetched, marked: primed.marked };
    },
  );
}
