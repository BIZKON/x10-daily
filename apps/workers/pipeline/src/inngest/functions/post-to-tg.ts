import { and, channels, createDb, eq } from "@x10/db";
import { loadEnv } from "@x10/config";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { articleReadyEvent } from "../../events";
import type { PipelineInngest } from "../client";
import type { PipelineBindings } from "../../bindings";

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

const TG_API_BASE = "https://api.telegram.org";

interface TgOkResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

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

      const env = loadEnv(bindings as unknown as Record<string, string | undefined>);
      const token = env.TELEGRAM_BOT_TOKEN;
      const chatId = env.TG_TEST_CHANNEL_ID;
      if (!token) {
        throw new Error("post-to-tg: TELEGRAM_BOT_TOKEN не задан в env.");
      }
      if (!chatId) {
        throw new Error("post-to-tg: TG_TEST_CHANNEL_ID не задан в env.");
      }

      const db = createDb(env.DATABASE_URL);

      const row = await step.run("load-channel", async () => {
        const [r] = await db
          .select({ text: channels.text, visualRef: channels.visualRef })
          .from(channels)
          .where(
            and(
              eq(channels.articleId, event.data.articleId),
              eq(channels.channel, "tg"),
            ),
          )
          .limit(1);
        if (!r) {
          throw new Error(
            `post-to-tg: channels row не найден для article_id=${event.data.articleId} channel=tg`,
          );
        }
        return r;
      });

      // Resolution priority: тестовый override → прокси (если задан) → direct.
      // На Timeweb ru-1 api.telegram.org молча таймаутится; TELEGRAM_PROXY_URL
      // прокидывает через HTTP-прокси вне РФ (undici.ProxyAgent). См. env.ts.
      const proxyUrl = env.TELEGRAM_PROXY_URL;
      const fetchImpl: typeof fetch = opts.fetchImpl
        ?? (proxyUrl
          ? (((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
              undiciFetch(input as Parameters<typeof undiciFetch>[0], {
                ...(init as Parameters<typeof undiciFetch>[1]),
                dispatcher: new ProxyAgent(proxyUrl),
              })) as unknown as typeof fetch)
          : globalThis.fetch);
      const text = row.text;
      const visualRef = row.visualRef;

      const result = await step.run("send-tg", async () => {
        const method = visualRef ? "sendPhoto" : "sendMessage";
        const url = `${TG_API_BASE}/bot${token}/${method}`;
        const body = visualRef
          ? { chat_id: chatId, photo: visualRef, caption: text }
          : { chat_id: chatId, text };

        const res = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json()) as TgOkResponse;
        if (!res.ok || !json.ok) {
          throw new Error(
            `Telegram API ${method} failed: HTTP ${res.status} ${json.description ?? ""}`,
          );
        }
        return {
          ok: json.ok,
          method,
          messageId: json.result?.message_id ?? null,
        };
      });

      return {
        articleId: event.data.articleId,
        channel: "tg" as const,
        ...result,
      };
    },
  );
}
