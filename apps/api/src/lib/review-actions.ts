/**
 * Разбор нажатий на кнопки карточки ревью (Спека 4).
 *
 * Формат `callback_data` задаётся конвейером (`lib/review-card.ts`), а читается
 * здесь. Дублирование намеренное: это разные приложения, и связывать их общим
 * пакетом ради двух строк дороже, чем держать формат в одном месте на каждой
 * стороне. Тесты фиксируют совместимость.
 */

export const REVIEW_ACTIONS = {
  ap: "approve",
  rj: "reject",
  rg: "regenerate",
  rw: "rewrite",
} as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[keyof typeof REVIEW_ACTIONS];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `<код>:<uuid карточки>`. Мусор и неизвестные коды дают null — обработчик
 * ответит «не понимаю эту кнопку», а не упадёт.
 */
export function parseCallbackData(
  raw: string | undefined,
): { action: ReviewAction; cardId: string } | null {
  if (!raw) return null;
  const [code, cardId] = raw.split(":");
  if (!code || !cardId || !UUID_RE.test(cardId)) return null;
  const action = REVIEW_ACTIONS[code as keyof typeof REVIEW_ACTIONS];
  return action ? { action, cardId } : null;
}

/** Итог решения — отдельным сообщением под карточкой. */
export function decisionNote(action: ReviewAction, who: string): string {
  const label = {
    approve: "✅ Одобрено",
    reject: "🚫 Публикую без картинки",
    regenerate: "🖼 Рисую новую картинку",
    rewrite: "✍️ Жду правку",
  }[action];
  return `${label} — ${escapeHtml(who)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
