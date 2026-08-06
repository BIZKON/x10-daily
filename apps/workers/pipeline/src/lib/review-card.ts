import { escapeTelegramHtml } from "./telegram-html";

/**
 * Карточка ревью в группе «Редакция» (Спека 4).
 *
 * Содержимое — ДУБЛЬ будущего поста: то же фото, та же подпись, что уйдут в
 * канал. Никакой отдельной «админской» вёрстки: смысл ревью в том, что
 * редактор видит ровно то, что увидит читатель. Служебное (что решить и чем это
 * кончится) добавляется отдельной строкой снизу, а не подменяет пост.
 */

/** Действия под карточкой. Коды короткие: callback_data ограничен 64 байтами. */
export const REVIEW_ACTIONS = {
  approve: "ap",
  reject: "rj",
  regenerate: "rg",
  rewrite: "rw",
} as const;

export type ReviewAction = keyof typeof REVIEW_ACTIONS;

const ACTION_BY_CODE: Record<string, ReviewAction> = Object.fromEntries(
  Object.entries(REVIEW_ACTIONS).map(([k, v]) => [v, k as ReviewAction]),
);

/**
 * `<код>:<id карточки>` — 2 + 1 + 36 = 39 байт, вдвое меньше лимита Telegram.
 *
 * Ключом идёт КАРТОЧКА, а не статья: по ней сразу видно состояние (ждёт /
 * решено / заменена), поэтому повторное нажатие на старое сообщение не
 * выполнит действие второй раз.
 */
export function buildCallbackData(action: ReviewAction, cardId: string): string {
  return `${REVIEW_ACTIONS[action]}:${cardId}`;
}

export function parseCallbackData(
  raw: string | undefined,
): { action: ReviewAction; cardId: string } | null {
  if (!raw) return null;
  const [code, cardId] = raw.split(":");
  if (!code || !cardId) return null;
  const action = ACTION_BY_CODE[code];
  return action ? { action, cardId } : null;
}

/**
 * Кнопки под карточкой, ждущей решения.
 *
 * ⚠️ «Рерайт» здесь ПОКА НЕТ намеренно. Разбор ответа с правкой и сам агент
 * переписывания — следующий шаг Спеки 4; кнопка, которая просит правку и
 * ничего с ней не делает, хуже отсутствующей. Формат её callback_data уже
 * поддержан с обеих сторон, поэтому включение — одна строка.
 */
export function reviewKeyboard(cardId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Одобрить", callback_data: buildCallbackData("approve", cardId) },
        { text: "🖼 Другая картинка", callback_data: buildCallbackData("regenerate", cardId) },
      ],
      [{ text: "🚫 Без картинки", callback_data: buildCallbackData("reject", cardId) }],
    ],
  };
}

/**
 * Служебный хвост карточки. Отделён пустой строкой от дубля поста, чтобы
 * редактор не спутал его с текстом публикации.
 */
export function reviewFooter(hasCover: boolean): string {
  return hasCover
    ? "\n\n<i>Одобрите — уйдёт в канал сразу, вместе с этой картинкой.</i>"
    : "\n\n<i>Картинки нет — одобрите, и пост уйдёт текстом.</i>";
}

/** Итог решения дописывается к карточке вместо кнопок. */
export function decisionNote(action: ReviewAction, who: string): string {
  const at = {
    approve: "✅ Одобрено",
    reject: "🚫 Без картинки",
    regenerate: "🖼 Отправлено на перерисовку",
    rewrite: "✍️ Отправлено на рерайт",
  }[action];
  return `\n\n<b>${at}</b> — ${escapeTelegramHtml(who)}`;
}
