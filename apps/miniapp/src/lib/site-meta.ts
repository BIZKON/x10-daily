/**
 * Бренд-константы для превью ссылок (og/twitter) — ЕДИНЫЙ источник.
 *
 * Зачем отдельный модуль: Next Metadata API мержит метадату по ВЕРХНЕУРОВНЕВЫМ
 * ключам, поэтому свой `openGraph` в generateMetadata замещает родительский
 * ЦЕЛИКОМ — не только то, что ты переопределил. Страница статьи вынуждена
 * повторять siteName/locale/картинку, и если держать их строками по месту, при
 * следующем ребрендинге корень и статья разъедутся молча (ни tsc, ни тесты
 * этого не видят — только глаза в Telegram).
 *
 * Статья — единственная страница, ссылки на которую реально расходятся: канал
 * постит 4 штуки в день («Читать в ProAgent AI →»).
 */

export const SITE_NAME = "ProAgent AI";
export const SITE_TITLE = "ProAgent AI — ИИ работает на вас";
export const SITE_DESCRIPTION =
  "Кейсы, методики и новости внедрения ИИ-агентов для малого и среднего бизнеса. Без хайпа, с цифрами выгоды.";
export const SITE_LOCALE = "ru_RU";

/**
 * Origin мини-аппа. Домен параметризован по всему стеку (Caddy, compose,
 * постер строит ссылку как `https://app.${X10_BASE_DOMAIN}`), поэтому и здесь
 * читаем env, а не литерал: иначе смена домена тихо сломает превью — og:url и
 * og:image продолжат указывать на старый хост, без ошибки сборки.
 *
 * ⚠️ Статически пререндеренные маршруты (/, /cases, /learn) запекают это
 * значение НА БИЛДЕ — поэтому X10_BASE_DOMAIN проброшен и build-arg'ом, и
 * рантайм-env (см. apps/miniapp/Dockerfile + docker-compose.prod.yml).
 */
export const SITE_ORIGIN = `https://app.${process.env.X10_BASE_DOMAIN || "pro-agent-ai.ru"}`;

/**
 * Брендовая картинка превью (лежит рядом с layout как `app/opengraph-image.jpg`,
 * file-convention Next). Путь задаём строкой, а не через file-convention, чтобы
 * одинаково подставлять его и в корне, и в статье.
 *
 * ⚠️ `?v=` — ручной cache-busting: Telegram/VK кэшируют превью по URL картинки
 * агрессивно и надолго. Заменил картинку — ОБЯЗАТЕЛЬНО инкрементируй версию,
 * иначе в каналах ещё долго будет висеть старая обложка.
 */
export const OG_IMAGE_VERSION = 1;
export const OG_IMAGE_PATH = `/opengraph-image.jpg?v=${OG_IMAGE_VERSION}`;
export const OG_IMAGE_ALT =
  "ProAgent AI — ИИ работает на вас. Кейсы, методики и внедрение ИИ-агентов для малого и среднего бизнеса.";

/** Готовый блок картинки — одинаковый для корня и статьи. Размеры обязательны:
 *  без них краулеры чаще рисуют мелкую карточку вместо крупной. */
export const OG_IMAGE = {
  url: OG_IMAGE_PATH,
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: OG_IMAGE_ALT,
} as const;
