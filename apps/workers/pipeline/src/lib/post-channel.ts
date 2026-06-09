import { type Database, and, channels, eq, sql } from "@x10/db";
import type { PipelineEnv } from "../env";
import { callTelegram } from "./telegram";
import { cleanPostText } from "./text";
import { NON_RETRYABLE_VK_CODES, VkApiError, vkWallPost } from "./vk";

/**
 * Общая send-логика постинга (session 23) — выделена из бывших post-to-tg.ts /
 * post-to-vk.ts. Раньше каждый канал постил немедленно по article.ready; теперь
 * channels — очередь, а cron drain-post-slots забирает строки по слотам.
 *
 * Разделение `sendToChannel` (чистый сетевой вызов, БЕЗ записи в БД) и
 * `markChannelPosted` по РАЗНЫМ Inngest-step'ам в drain-post-slots закрывает
 * ЧАСТЫЙ сценарий: send успешно завершился (мемоизирован), но упал ПОСЛЕДУЮЩИЙ
 * шаг (mark / mark-published) → при ретрае функции send реплеится из кэша, без
 * переотправки.
 *
 * ⚠️ Граница at-least-once: если САМ send-шаг бросит ПОСЛЕ сетевой записи (read-
 * таймаут к api.telegram.org по IPv6 / краш между записью и фиксацией шага) —
 * Inngest НЕ мемоизирует бросивший шаг и переисполнит его (retries:1) → для TG
 * это РЕДКИЙ дубль (у sendMessage/sendPhoto нет ключа идемпотентности). VK этот
 * случай закрывает сам: guid=articleId → VK дедуплицирует в окне ~1ч. Принятый
 * риск: окно узкое, ретрай ценнее (почти все сбои send = «пост не ушёл» → ретрай
 * доставляет; молчаливая потеря поста хуже редкого дубля).
 */

export type PostableChannel = "tg" | "vk";

export type SendOutcome =
  | { ok: true; postRef: string | null }
  | { ok: false; skipped: true; reason: string };

export type SendInput = {
  channel: PostableChannel;
  articleId: string;
  text: string;
  visualRef: string | null;
};

/**
 * Отправляет пост в канал. Текст чистится `cleanPostText` (идемпотентно).
 *  - tg: callTelegram (sendPhoto если visualRef, иначе sendMessage; IPv6/proxy
 *    резолвится внутри callTelegram — см. lib/telegram.ts §сеть).
 *  - vk: vkWallPost (+ guid=articleId без дефисов для VK-дедупликации в окне ~1ч).
 *    На NON_RETRYABLE_VK_CODES (captcha/flood/access-denied) ВОЗВРАЩАЕТ skipped —
 *    НЕ бросает (ретрай вреден). Прочие ошибки бросает → Inngest ретраит шаг.
 */
export async function sendToChannel(
  env: PipelineEnv,
  input: SendInput,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<SendOutcome> {
  const text = cleanPostText(input.text);

  if (input.channel === "tg") {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TG_TEST_CHANNEL_ID;
    if (!token || !chatId) {
      throw new Error("sendToChannel(tg): TELEGRAM_BOT_TOKEN / TG_TEST_CHANNEL_ID не заданы.");
    }
    const method = input.visualRef ? "sendPhoto" : "sendMessage";
    const body = input.visualRef
      ? { chat_id: chatId, photo: input.visualRef, caption: text }
      : { chat_id: chatId, text };
    const res = await callTelegram(method, body, {
      token,
      proxyUrl: env.TELEGRAM_PROXY_URL || undefined,
      fetchImpl: opts.fetchImpl,
    });
    return { ok: true, postRef: res.messageId != null ? String(res.messageId) : null };
  }

  // channel === "vk"
  const accessToken = env.VK_ACCESS_TOKEN;
  const ownerId = env.VK_OWNER_ID;
  if (!accessToken || !ownerId) {
    throw new Error("sendToChannel(vk): VK_ACCESS_TOKEN / VK_OWNER_ID не заданы.");
  }
  try {
    const res = await vkWallPost(text, {
      accessToken,
      ownerId,
      guid: input.articleId.replace(/-/g, ""),
      fetchImpl: opts.fetchImpl,
    });
    return { ok: true, postRef: String(res.postId) };
  } catch (e) {
    if (e instanceof VkApiError && NON_RETRYABLE_VK_CODES.has(e.code)) {
      return { ok: false, skipped: true, reason: `vk-error-${e.code}` };
    }
    throw e;
  }
}

/** Помечает channels-row опубликованной: posted_at + post_ref. */
export async function markChannelPosted(
  db: Database,
  args: { articleId: string; channel: PostableChannel; postRef: string | null; at: Date },
): Promise<void> {
  await db
    .update(channels)
    .set({ postedAt: args.at, postRef: args.postRef })
    .where(and(eq(channels.articleId, args.articleId), eq(channels.channel, args.channel)));
}

/** Инкремент attempts + last_error непостнутой строки (диагностика, не блокирует). */
export async function recordChannelFailure(
  db: Database,
  args: { articleId: string; channel: PostableChannel; error: string },
): Promise<void> {
  await db
    .update(channels)
    .set({ attempts: sql`${channels.attempts} + 1`, lastError: args.error.slice(0, 500) })
    .where(and(eq(channels.articleId, args.articleId), eq(channels.channel, args.channel)));
}
