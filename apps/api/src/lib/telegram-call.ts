/**
 * Минимальные вызовы Bot API из api (Спека 4).
 *
 * Отдельно от конвейерного `lib/telegram.ts`: тот живёт в другом приложении и
 * тянет за собой прокси/IPv6-логику постинга. Здесь нужны три метода и
 * поведение «не роняем обработчик, если Telegram ответил ошибкой» — вебхук
 * обязан вернуть 200, иначе Telegram повторит апдейт и действие выполнится
 * дважды.
 */

const API = "https://api.telegram.org";

type Tg = { token: string };

async function call(
  tg: Tg,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; messageId: number | null }> {
  const res = await fetch(`${API}/bot${tg.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
  } | null;
  return { ok: Boolean(json?.ok), messageId: json?.result?.message_id ?? null };
}

/**
 * Ответ на нажатие. Вызывается ВСЕГДА, включая отказ: кнопка без отклика
 * читается как сломанная. Telegram ждёт этот вызов не дольше нескольких секунд.
 */
export async function answerCallback(tg: Tg, callbackQueryId: string, text: string): Promise<void> {
  await call(tg, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  }).catch(() => undefined);
}

/** Снять или заменить кнопки под сообщением. */
export async function editReplyMarkup(
  tg: Tg,
  chatId: number,
  messageId: number,
  markup: unknown | null,
): Promise<void> {
  await call(tg, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/**
 * Сообщение в чат, опционально ответом на другое.
 *
 * Итог решения дописываем ОТДЕЛЬНЫМ сообщением, а не правкой подписи: подпись
 * фото у нас заполнена почти под лимит 1024, и `editMessageCaption` с
 * дописанным хвостом отбивался бы по длине ровно на длинных статьях.
 */
export async function sendMessage(
  tg: Tg,
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<{ messageId: number | null }> {
  const { messageId } = await call(tg, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
  });
  return { messageId };
}
