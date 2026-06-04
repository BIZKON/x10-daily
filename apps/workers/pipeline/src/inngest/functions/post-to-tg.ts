import { and, channels, createDb, eq, getPostingControl, isPostingPaused } from "@x10/db";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { articleReadyEvent } from "../../events";
import { callTelegram } from "../../lib/telegram";
import { cleanPostText } from "../../lib/text";
import type { PipelineInngest } from "../client";

/**
 * Walking Skeleton (ТЗ #1, N5 + N6): реальный outbound в Telegram Bot API.
 *
 * Триггер: article.ready с channel='tg'. Функция:
 *  1. Читает row из channels WHERE article_id=$1 AND channel='tg' (записан
 *     в draft-article.ts после persist).
 *  2. Если visual_ref задан → sendPhoto (photo=visual_ref, caption=text).
 *     Иначе → sendMessage (text=text).
 *  3. Реальный HTTP POST на api.telegram.org/bot<TOKEN>/<method>. Это НЕ
 *     `UPDATE articles SET status='published'` — это исходящий вызов.
 *
 * Конфиг через env:
 *  - TELEGRAM_BOT_TOKEN — required, формат `<id>:<secret>`
 *  - TG_TEST_CHANNEL_ID — required, `@username` или numeric chat_id
 */

export function createPostToTgFunction(
  inngest: PipelineInngest,
  bindings: PipelineBindings,
  opts: {
    /** Инжекция fetch для тестов. Prod — globalThis.fetch. */
    fetchImpl?: typeof fetch;
  } = {},
) {
  return inngest.createFunction(
    {
      id: "post-to-tg",
      name: "Post ready article to Telegram channel",
      triggers: [{ event: articleReadyEvent }],
      retries: 2,
      concurrency: { limit: 3 },
    },
    async ({ event, step }) => {
      if (event.data.channel !== "tg") {
        return { skipped: true, reason: "channel-mismatch", channel: event.data.channel };
      }

      const env = loadPipelineEnv(bindings);
      const token = env.TELEGRAM_BOT_TOKEN;
      const chatId = env.TG_TEST_CHANNEL_ID;
      if (!token) {
        throw new Error("post-to-tg: TELEGRAM_BOT_TOKEN не задан в env.");
      }
      if (!chatId) {
        throw new Error("post-to-tg: TG_TEST_CHANNEL_ID не задан в env.");
      }

      const db = createDb(env.DATABASE_URL);

      // Стоп-кран (session 20): не публикуем при ручной паузе / в тихие часы.
      // Гейт ingest-rss останавливает генерацию; этот — страховка, чтобы статья,
      // начатая до начала окна, не «утекла» постом внутри тихих часов.
      const gate = await step.run("posting-control", async () => {
        const ctrl = await getPostingControl(db);
        return { ctrl, nowMs: Date.now() };
      });
      const pause = isPostingPaused(gate.ctrl, new Date(gate.nowMs));
      if (pause.paused) {
        return {
          skipped: true as const,
          reason: `posting-paused:${pause.reason}`,
          articleId: event.data.articleId,
          channel: "tg" as const,
        };
      }

      const row = await step.run("load-channel", async () => {
        const [r] = await db
          .select({ text: channels.text, visualRef: channels.visualRef })
          .from(channels)
          .where(and(eq(channels.articleId, event.data.articleId), eq(channels.channel, "tg")))
          .limit(1);
        if (!r) {
          throw new Error(
            `post-to-tg: channels row не найден для article_id=${event.data.articleId} channel=tg`,
          );
        }
        return r;
      });

      // Защитный слой: чистим текст (переносы + английские лейблы) даже у уже
      // сохранённых channels-строк (посты, записанные до фикса). Идемпотентно.
      const text = cleanPostText(row.text);
      const visualRef = row.visualRef;

      const result = await step.run("send-tg", async () => {
        const method = visualRef ? "sendPhoto" : "sendMessage";
        const body = visualRef
          ? { chat_id: chatId, photo: visualRef, caption: text }
          : { chat_id: chatId, text };

        // На Timeweb ru-1 api.telegram.org молча таймаутится по IPv4 → доступен
        // только по IPv6 (NAT66) или через прокси. callTelegram резолвит fetch:
        // тестовый override → TELEGRAM_PROXY_URL → direct (IPv6). См. lib/telegram.ts.
        return callTelegram(method, body, {
          token,
          proxyUrl: env.TELEGRAM_PROXY_URL || undefined,
          fetchImpl: opts.fetchImpl,
        });
      });

      return {
        articleId: event.data.articleId,
        channel: "tg" as const,
        ...result,
      };
    },
  );
}
