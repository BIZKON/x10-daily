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

/**
 * Ступень, на которой отправка удалась. Пишется в `channels.post_mode` —
 * единственный след того, что картинка НЕ взлетела: деградация фото→текст
 * ошибкой не считается (пост уходит, `lastError` пуст, `attempts` не растёт),
 * и без этого поля факт был невосстановим уже через один деплой.
 */
export type PostMode = "photo" | "photo_plain" | "text_html" | "text_plain" | "vk";

export type SendOutcome =
  | { ok: true; postRef: string | null; mode: PostMode }
  | { ok: false; skipped: true; reason: string };

export type SendInput = {
  channel: PostableChannel;
  articleId: string;
  text: string;
  visualRef: string | null;
  /**
   * Форматированный Telegram-HTML для `sendMessage` + `parse_mode=HTML` (Слой 1,
   * session 27) — жирный заголовок/подзаг/выноска/блоки, как в миниапп. Рендерится
   * на ВСЕХ клиентах (Bot API 10.1 sendRichMessage показывает «обновитесь» на
   * клиентах без поддержки). Только tg и без visualRef. Пусто → плоский текст.
   * См. lib/telegram-html.ts.
   */
  html?: string | null;
  /**
   * URL для КАРТОЧКИ ПРЕВЬЮ поста (`link_preview_options.url`) — web-страница
   * статьи. Разведён со ссылкой В ТЕКСТЕ намеренно: текст ведёт на Mini App
   * (deep-link t.me), а превью строится по web-URL, иначе Telegram нарисовал бы
   * карточку бота вместо статьи с og-картинкой. По доке Bot API: «URL to use for
   * the link preview. If empty, then the first URL found in the message text will
   * be used». Только tg + sendMessage. Пусто → превью по ссылке из текста.
   */
  previewUrl?: string | null;
  /**
   * HTML-подпись фото-поста (Спека 2). Только вместе с `visualRef`. Уже
   * уложена в лимит Telegram 1024 по ВИДИМОЙ длине (см. lib/caption.ts).
   * Пусто → подписью идёт `captionPlain`/`text`.
   */
  captionHtml?: string | null;
  /**
   * Plain-подпись фото-поста — фолбэк, если Telegram отверг разметку (HTTP 400).
   * ⚠️ Обязана быть ≤1024: `text` (полный пост соцсети) в лимит подписи НЕ
   * укладывается и сам по себе дал бы 400.
   */
  captionPlain?: string | null;
};

/** Успешный исход одной ступени: message_id + чем именно ушло. */
function ok(res: { messageId?: number | null }, mode: PostMode): SendOutcome {
  return { ok: true, postRef: res.messageId != null ? String(res.messageId) : null, mode };
}

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
    const tgOpts = {
      token,
      proxyUrl: env.TELEGRAM_PROXY_URL || undefined,
      fetchImpl: opts.fetchImpl,
    };

    // Превью-карточка поста строится по web-URL статьи (og-картинка), тогда как
    // ссылка в тексте ведёт в Mini App. Отдельной inline-кнопки НЕТ — решение
    // владельца: две точки входа (кнопка + ссылка) путали, вход должен быть один
    // — тап по тексту. Только sendMessage: у sendPhoto своя картинка.
    const withPreview = <T extends Record<string, unknown>>(body: T) =>
      input.previewUrl ? { ...body, link_preview_options: { url: input.previewUrl } } : body;

    // Порядок деградации (золотое правило skill telegram-rich-text: бот НЕ
    // молчит): фото с HTML-подписью → фото с plain-подписью → rich-HTML текстом
    // → плоский текст. Каждый переход — только по HTTP 400 (битая разметка,
    // лимит, недоступная картинка); сеть и 5xx пробрасываем, их ретраит Inngest.
    //
    // visualRef → sendPhoto: крупная картинка + короткая подпись (Спека 2).
    // Картинка попадает сюда ТОЛЬКО после одобрения редактором (HumanGate) —
    // drain-post-slots не проставляет visualRef неодобренной обложке.
    if (input.visualRef) {
      // ⚠️ `text` — полный пост соцсети, в лимит подписи (1024) он не влезает.
      // Поэтому подпись берём из caption-полей; на `text` падаем только для
      // обратной совместимости с уже лежащими в очереди строками.
      // `||`, не `??`: пустая построенная подпись (нет ни заголовка, ни
      // вводки, ни ссылки) не должна глушить фолбэк на текст очереди.
      const plainCaption = input.captionPlain || text;
      if (input.captionHtml) {
        try {
          const res = await callTelegram(
            "sendPhoto",
            {
              chat_id: chatId,
              photo: input.visualRef,
              caption: input.captionHtml,
              parse_mode: "HTML",
            },
            tgOpts,
          );
          return ok(res, "photo");
        } catch (e) {
          // Золотое правило (skill telegram-rich-text): бот НЕ молчит. Битая
          // разметка/лимит (400) → шлём ту же картинку с plain-подписью.
          // Сеть/5xx пробрасываем — их ретраит Inngest.
          if (!(e instanceof Error) || !/HTTP 400/.test(e.message)) throw e;
          console.warn(`sendToChannel(tg): подпись HTML 400 → фолбэк на plain. ${e.message}`);
        }
      }
      try {
        const res = await callTelegram(
          "sendPhoto",
          { chat_id: chatId, photo: input.visualRef, caption: plainCaption },
          tgOpts,
        );
        // `photo_plain` только если HTML-подпись РЕАЛЬНО пробовали и её отбили.
        // Когда captionHtml не строился вовсе (старые строки очереди), никакой
        // деградации не было — это обычный `photo`, и врать в аудите нельзя.
        return ok(res, input.captionHtml ? "photo_plain" : "photo");
      } catch (e) {
        // 🔴 400 уже ПОСЛЕ plain-подписи = проблема самой КАРТИНКИ (Telegram не
        // смог скачать URL, IMAGE_PROCESS_FAILED, слишком большой файл), а не
        // разметки. Раньше здесь бросок уходил наружу и слот терялся целиком:
        // channels-строка оставалась непостнутой, а выборка FIFO брала бы её
        // снова каждый следующий слот в пределах STALE_HOURS — до четырёх
        // молчащих слотов подряд. Поэтому деградируем в ТЕКСТОВЫЙ пост: он
        // ушёл бы и без обложки, канал молчать не должен.
        if (!(e instanceof Error) || !/HTTP 400/.test(e.message)) throw e;
        console.warn(`sendToChannel(tg): sendPhoto 400 → деградация в текст. ${e.message}`);
      }
    }

    // Текстовый пост. Сюда попадаем и штатно (нет обложки), и как деградация
    // фото-ветки выше. Rich-HTML пробуем первым, при 400 — плоский текст.
    if (input.html) {
      try {
        const res = await callTelegram(
          "sendMessage",
          withPreview({ chat_id: chatId, text: input.html, parse_mode: "HTML" }),
          tgOpts,
        );
        return ok(res, "text_html");
      } catch (e) {
        if (!(e instanceof Error) || !/HTTP 400/.test(e.message)) throw e;
        console.warn(`sendToChannel(tg): HTML 400 → фолбэк на plain. ${e.message}`);
      }
    }

    const res = await callTelegram("sendMessage", withPreview({ chat_id: chatId, text }), tgOpts);
    return ok(res, "text_plain");
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
    return { ok: true, postRef: String(res.postId), mode: "vk" };
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
  args: {
    articleId: string;
    channel: PostableChannel;
    postRef: string | null;
    at: Date;
    /** Ступень успеха. Единственный след деградации фото→текст — см. `PostMode`. */
    mode: PostMode;
  },
): Promise<void> {
  await db
    .update(channels)
    .set({ postedAt: args.at, postRef: args.postRef, postMode: args.mode })
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
