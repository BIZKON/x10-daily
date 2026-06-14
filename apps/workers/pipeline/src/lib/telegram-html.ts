import type { ArticleBlock } from "@x10/db";

/**
 * Билдер форматированного Telegram-HTML для `sendMessage` с `parse_mode: "HTML"`
 * (Слой 1, skill telegram-rich-text). Рендерится на ВСЕХ клиентах сегодня — в
 * отличие от Bot API 10.1 `sendRichMessage`, который на клиентах без поддержки
 * (а это пока почти все, июнь 2026) показывает «Сообщение не поддерживается…
 * обновитесь». Поэтому канал форматируем именно так.
 *
 * Telegram HTML умеет ТОЛЬКО: <b>/<i>/<u>/<s>/<code>/<pre>/<a>/<blockquote>/
 * <tg-spoiler>. Заголовков (<h1>) и списков (<ul>) НЕТ → заголовок делаем <b>,
 * буллеты — символом «• ». Воздух между блоками — пустая строка (Telegram уважает \n).
 *
 * Формат как в миниапп (session 27): крупная (жирная) подача + подзаголовок +
 * выноска «Почему важно» + ключевые блоки + ссылка «Читать в Х10». Тизер, не весь
 * body — сохраняем click-through в миниапп.
 */

/** Экранирование под Telegram parse_mode=HTML: & < > (анти-инъекция тегов из текста). */
export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Подпись выноски по виду callout-блока (gold-акцент <b>, как steel-блок миниапп). */
const CALLOUT_LABEL: Record<string, string> = {
  why: "Почему важно.",
  "yes-but": "Да, но.",
  "what-next": "Что дальше.",
  "big-picture": "Контекст.",
};

/** Один body-блок статьи → Telegram-HTML. */
function blockToTelegramHtml(block: ArticleBlock): string {
  switch (block.type) {
    case "paragraph":
      return escapeTelegramHtml(block.text);
    case "callout":
      return `<blockquote><b>${escapeTelegramHtml(CALLOUT_LABEL[block.kind] ?? "")}</b> ${escapeTelegramHtml(block.text)}</blockquote>`;
    case "quote":
      return `<blockquote>${escapeTelegramHtml(block.text)} — <i>${escapeTelegramHtml(block.attribution)}</i></blockquote>`;
    case "numbers":
      // <ul> нет → буллеты «• », значение жирным (вместо JetBrains Mono в миниапп).
      return block.items
        .map((n) => `• ${escapeTelegramHtml(n.label)}: <b>${escapeTelegramHtml(n.value)}</b>`)
        .join("\n");
    case "list":
      return block.items.map((i) => `• ${escapeTelegramHtml(i)}`).join("\n");
    case "image":
      // Картинки в тизере пропускаем (полная статья — в миниапп).
      return "";
  }
}

export type TelegramArticle = {
  tease: string;
  lede: string;
  /** В схеме articles колонка nullable — выноску рендерим только если заполнено. */
  whyItMatters: string | null;
  body: ArticleBlock[];
  slug: string;
};

/**
 * Структура статьи + базовый URL миниапп → форматированный Telegram-HTML.
 * baseUrl — напр. `https://app.pro-agent-ai.ru` (из X10_BASE_DOMAIN).
 */
export function articleToTelegramHtml(article: TelegramArticle, baseUrl: string): string {
  const parts: string[] = [
    `<b>${escapeTelegramHtml(article.tease)}</b>`,
    escapeTelegramHtml(article.lede),
  ];

  // «Почему важно» — выноска (steel-блок), gold-акцент <b>. Поле в схеме nullable.
  if (article.whyItMatters) {
    parts.push(
      `<blockquote><b>Почему важно.</b> ${escapeTelegramHtml(article.whyItMatters)}</blockquote>`,
    );
  }

  // Ключевые блоки тизера: цифры (by the numbers) + первый абзац тела (если есть).
  const numbers = article.body.find((b) => b.type === "numbers");
  const firstParagraph = article.body.find((b) => b.type === "paragraph");
  for (const block of [numbers, firstParagraph]) {
    if (block) {
      const html = blockToTelegramHtml(block);
      if (html) parts.push(html);
    }
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/article/${article.slug}`;
  parts.push(`<a href="${escapeTelegramHtml(url)}">Читать в Х10 →</a>`);

  return parts.join("\n\n");
}
