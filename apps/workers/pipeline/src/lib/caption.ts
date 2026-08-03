import { escapeTelegramHtml } from "./telegram-html";

/**
 * Подпись к фото-посту в канал (Спека 2).
 *
 * Когда у статьи есть ОДОБРЕННАЯ редактором обложка, пост уходит `sendPhoto` —
 * крупная картинка + короткая подпись; богатый формат остаётся в Mini App.
 *
 * ⚠️ Лимит Telegram: 1024 символа ПОСЛЕ разбора сущностей. То есть теги
 * `<b>`/`<a>` в лимит НЕ входят, а `&amp;` считается за один символ («&»).
 * Поэтому режем по ВИДИМОЙ длине (visibleCaptionLength), а не по length сырой
 * строки — иначе либо теряли бы место зря, либо ловили HTTP 400.
 *
 * Отдаём две версии: `html` (основная) и `plain` (фолбэк, если Telegram отверг
 * разметку — золотое правило skill telegram-rich-text: бот НЕ молчит). Обе
 * укладываются в лимит.
 */

/** Лимит подписи sendPhoto (символов после разбора сущностей). */
export const CAPTION_LIMIT = 1024;

/** Текст ссылки — тот же, что в текстовых постах (решение владельца, s29). */
const LINK_TEXT = "Подробнее читай в блоге ProAgent AI →";

/** Разделитель блоков подписи (пустая строка — Telegram уважает \n). */
const SEP = "\n\n";

/**
 * Экранирование значения АТРИБУТА href.
 *
 * ⚠️ Общий `escapeTelegramHtml` покрывает только `& < >` — этого хватает для
 * текста, но НЕ для атрибута: кавычка в URL закрыла бы `href="…"` и позволила
 * дописать произвольные атрибуты. URL мы строим сами (deep-link бота + слаг),
 * но полагаться на это нельзя — слаг производен от текста статьи.
 */
function escapeHrefAttr(url: string): string {
  return escapeTelegramHtml(url).replace(/"/g, "&quot;");
}

/**
 * Видимая длина Telegram-HTML: без тегов, с сущностями, схлопнутыми в один
 * символ. Ровно так Telegram считает лимит подписи.
 */
export function visibleCaptionLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, "x").length;
}

/**
 * Обрезка по границе слова с многоточием. Возвращает строку, видимая длина
 * которой ≤ max (многоточие включено).
 */
function truncateWords(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  // Место под «…» — один символ.
  const hard = text.slice(0, Math.max(0, max - 1));
  const lastSpace = hard.lastIndexOf(" ");
  // Если слово одно и длиннее лимита (нет пробела) — режем жёстко, иначе
  // подпись осталась бы пустой.
  const cut = lastSpace > 0 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}

/**
 * Поля допускают null/undefined намеренно: `lede` в схеме бывает пустым, а
 * падение билдера здесь означало бы крэш шага постинга — канал бы замолчал.
 * Пустая подпись лучше молчания (Telegram принимает sendPhoto без caption).
 */
export type CaptionArticle = {
  tease?: string | null;
  lede?: string | null;
};

/**
 * Собирает подпись фото-поста: жирный заголовок → вводка → ссылка.
 *
 * Приоритет при нехватке места: ссылка неприкосновенна (без неё пост теряет
 * вход в Mini App), затем заголовок, вводка режется первой.
 */
export function buildPhotoCaption(
  article: CaptionArticle,
  opts: { linkUrl: string | null },
): { html: string; plain: string } {
  const linkUrl = opts.linkUrl;
  // Хвост со ссылкой занимает место и в видимой длине (текст ссылки), и в plain
  // (там печатается сам URL — он длиннее, считаем по нему, чтобы plain тоже влез).
  const htmlTailLen = linkUrl ? SEP.length + LINK_TEXT.length : 0;
  const plainTailLen = linkUrl ? SEP.length + linkUrl.length : 0;
  const tailLen = Math.max(htmlTailLen, plainTailLen);

  const budget = CAPTION_LIMIT - tailLen;

  // Заголовку отдаём не больше половины бюджета — иначе гигантский tease
  // вытеснил бы вводку целиком.
  const tease = truncateWords((article.tease ?? "").trim(), Math.floor(budget / 2));
  const ledeBudget = budget - tease.length - SEP.length;
  const lede = truncateWords((article.lede ?? "").trim(), ledeBudget);

  const htmlParts: string[] = [];
  const plainParts: string[] = [];
  if (tease) {
    htmlParts.push(`<b>${escapeTelegramHtml(tease)}</b>`);
    plainParts.push(tease);
  }
  if (lede) {
    htmlParts.push(escapeTelegramHtml(lede));
    plainParts.push(lede);
  }
  if (linkUrl) {
    htmlParts.push(`<a href="${escapeHrefAttr(linkUrl)}">${LINK_TEXT}</a>`);
    plainParts.push(linkUrl);
  }

  return { html: htmlParts.join(SEP), plain: plainParts.join(SEP) };
}
