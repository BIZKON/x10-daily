/**
 * Deep-link на Main Mini App бота: `https://t.me/<bot>?startapp=<slug>`.
 *
 * Тап по такой ссылке (url-кнопка под постом канала) открывает Mini App ВНУТРИ
 * Telegram, а не сайт во внешнем браузере. `slug` приходит в Mini App как
 * `start_param` — StartParamRouter (miniapp) роутит на читалку статьи.
 *
 * Слаги статей — транслит (`^[a-z0-9-]+$`), укладываются в разрешённый набор
 * `startapp` (A-Za-z0-9_-, ≤512). Требует разовой настройки Main Mini App у бота
 * в @BotFather (иначе Telegram откроет чат бота, а не приложение).
 */
export function buildMiniAppDeepLink(botUsername: string, slug: string): string {
  const bot = botUsername.replace(/^@/, "");
  return `https://t.me/${bot}?startapp=${slug}`;
}
