/**
 * Ссылки, которые ведут ВНУТРЬ мини-аппа (спека 7, презентация партнёра).
 *
 * 🔴 Партнёрская ссылка обязана открывать приложение, а не сайт. Раньше партнёр
 * отправлял адрес статического КП: человек читал документ и в продукт не
 * попадал никогда — ни в ленту, ни в кейсы, ни в бота. Deep-link Telegram
 * решает это одним параметром.
 *
 * Тот же механизм уже носит посты канала (`?startapp=<slug>` → читалка статьи),
 * поэтому различаем назначение префиксом, а не вторым каналом ссылок.
 */

/** Префикс презентации партнёра: `p-ivanov` → `/p/ivanov`. */
export const PARTNER_PROMO_PREFIX = "p-";

/** Слаг статьи и слаг партнёра — один алфавит: латиница, цифры, дефис. */
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

/**
 * Куда вести человека по `start_param` из Telegram.
 *
 * ⚠️ Параметр приходит извне, поэтому проверяется как чужой ввод: `../`,
 * слэши и кириллица отвергаются. `null` — не роутим никуда, человек остаётся
 * в ленте.
 */
export function routeForStartParam(param: string | null | undefined): string | null {
  if (!param) return null;

  if (param.startsWith(PARTNER_PROMO_PREFIX)) {
    const slug = param.slice(PARTNER_PROMO_PREFIX.length);
    return SLUG_RE.test(slug) ? `/p/${slug}` : null;
  }

  return SLUG_RE.test(param) ? `/article/${param}` : null;
}

/**
 * Ссылка, которую партнёр отправляет клиенту.
 *
 * Открывает Mini App внутри Telegram. Требует настроенного Main Mini App у бота
 * (иначе Telegram откроет чат бота, а не приложение) — та же грабля, что с
 * кнопкой под постами канала.
 */
export function partnerPromoLink(botUsername: string, slug: string): string {
  const bot = botUsername.replace(/^@/, "");
  return `https://t.me/${bot}?startapp=${PARTNER_PROMO_PREFIX}${slug}`;
}

/** Запасная веб-ссылка: если партнёр пишет клиенту не в Telegram. */
export function partnerPromoWebLink(baseDomain: string, slug: string): string {
  return `https://app.${baseDomain}/p/${slug}`;
}
