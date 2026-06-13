/**
 * Data layer для miniapp.
 *
 * Источник данных выбирается так:
 * 1. Если задан X10_API_BASE_URL — fetch к apps/api (Hono на CF Workers)
 * 2. Если env не задан или fetch вернул null — fallback на статичные моки ниже
 *
 * Mapper из ApiFeedItem (DB schema) в FeedItem (UI):
 * - section → category (русский label через SECTION_LABELS)
 * - tease → title, lede → excerpt
 * - readSeconds → readMinutes (round, min 1)
 * - isPaid → badge "PREMIUM" | null
 * - imageUrl, reactions, comments, hot — заглушки (в БД пока нет колонок)
 */
import {
  fetchArticle,
  fetchDigest,
  fetchFeed,
  fetchVideos,
  isApiConfigured,
  type ApiArticle,
  type ApiArticleBlock,
  type ApiCategory,
  type ApiFeedItem,
  type ApiTemplate,
} from "./api";

export type { ApiArticleBlock };

/** brief §5 — категории первого уровня (rubrics). */
export type FeedSection = ApiCategory;

export type FeedCategoryLabel = string;

/** brief §3 — шаблоны материалов. UI выбирает компонент карточки по template. */
export type FeedTemplate = ApiTemplate;

export type FeedItem = {
  id: string;
  slug: string;
  /** Русский label рубрики (для отображения). */
  category: FeedCategoryLabel;
  /** Сырой ключ рубрики (для брендовой обложки/фильтров). */
  categoryKey: ApiCategory;
  template: FeedTemplate;
  title: string;
  excerpt: string;
  /** Реальная обложка из БД; null → карточка рисует BrandedCover (не unsplash). */
  imageUrl: string | null;
  readMinutes: number;
  /** Агрегированный счётчик для list-карточек (sum по 3 kinds). */
  reactions: number;
  /** Структурированные counts — для EngagementBar в article reader. */
  reactionBreakdown: { fire: number; insight: number; question: number };
  /** Counter из articles row. В feed/daily пока не отдаётся — используем 0. */
  bookmarkCount: number;
  comments: number;
  badge: "PREMIUM" | null;
  hot: boolean;
  /** Автор — для DailyTakeCard. Имя + инициал для аватарки-заглушки. */
  authorName: string | null;
  /**
   * ISO момента публикации (МСК-эффективное: publishedAt ?? createdAt из API).
   * Рендерится под карточкой/в читалке как абсолютная дата+время (П1).
   */
  publishedAt: string | null;
};

/** brief §1 — порядок отражает приоритет, taxes первый (главная боль ЦА в 2026). */
export const HOME_CATEGORIES: { id: FeedSection; label: string }[] = [
  { id: "taxes", label: "Налоги" },
  { id: "money", label: "Деньги" },
  { id: "practice", label: "Практика" },
  { id: "power", label: "Власть" },
  { id: "tech", label: "Технологии" },
  { id: "rybakov", label: "Рыбаков говорит" },
];

/** Category → русский label для category-chip в карточке. */
const CATEGORY_LABELS: Record<ApiCategory, string> = {
  taxes: "НАЛОГИ",
  money: "ДЕНЬГИ",
  practice: "ПРАКТИКА",
  power: "ВЛАСТЬ",
  tech: "ТЕХНОЛОГИИ",
  rybakov: "РЫБАКОВ ГОВОРИТ",
};

function mapApiItem(row: ApiFeedItem): FeedItem {
  const breakdown = {
    fire: row.reactions?.fire ?? 0,
    insight: row.reactions?.insight ?? 0,
    question: row.reactions?.question ?? 0,
  };
  const totalReactions = breakdown.fire + breakdown.insight + breakdown.question;
  // bookmarkCount / commentCount доступны только в article-detail (см. ApiArticle).
  // В list-проекции feed/daily — fallback 0. Article reader использует articleDetail-mapper.
  const detail = row as Partial<{ bookmarkCount: number; commentCount: number }>;
  return {
    id: row.id,
    slug: row.slug,
    category: CATEGORY_LABELS[row.category],
    categoryKey: row.category,
    template: row.template,
    title: row.tease,
    excerpt: row.lede,
    imageUrl: row.coverImageUrl,
    readMinutes: Math.max(1, Math.round(row.readSeconds / 60)),
    reactions: totalReactions,
    reactionBreakdown: breakdown,
    bookmarkCount: detail.bookmarkCount ?? 0,
    comments: detail.commentCount ?? 0,
    badge: row.isPaid ? "PREMIUM" : null,
    hot: row.isFeatured,
    authorName: null, // М1 — будет приходить из API когда добавим Authors сущность.
    publishedAt: row.publishedAt,
  };
}

/**
 * Home-hero «Главное сегодня» (brief §6 DailyDigest).
 *
 * Реальные данные приходят из GET /v1/digests/hero: редакционный выпуск, а
 * пока его нет — синтез из топ-статей дня. ⚠️ Никаких выдуманных цитат/
 * атрибуций здесь быть НЕ должно (ToV, кейс Романчук) — bullets = реальные
 * заголовки статей, ведущие в читалку.
 */
export type DigestBullet = {
  /** «01» / «02» / «03» — порядковый номер. */
  n: string;
  /** Slug статьи — bullet кликабелен, ведёт в читалку. */
  slug: string;
  /** Заголовок статьи (tease). */
  text: string;
};

export type Digest = {
  /** YYYY-MM-DD (МСК) — hero форматирует в «Среда, 11 июня». "" → eyebrow без даты. */
  issueDate: string;
  /** Короткая врезка-подзаголовок. */
  intro: string;
  bullets: DigestBullet[];
  /** CTA «Читать разбор» → slug топ-статьи; null → CTA скрыт. */
  ctaSlug: string | null;
};

/** Сколько сюжетов показываем в hero. */
const DIGEST_BULLET_COUNT = 3;

/** Mock feed для разработки без backend'a — покрывает все 3 template (M0 brief §10). */
const FEED: FeedItem[] = [
  {
    id: "00000000-0000-0000-0000-0000000000a1",
    slug: "usn-350mln-three-steps",
    category: "НАЛОГИ",
    categoryKey: "taxes",
    template: "card-news",
    title: "Новый порог УСН 350 млн: кому грозит, кому выгодно",
    excerpt:
      "Разобрали с налоговым адвокатом, что меняется и какие три шага сделать сейчас.",
    imageUrl: null,
    readMinutes: 12,
    reactions: 142,
    reactionBreakdown: { fire: 88, insight: 39, question: 15 },
    bookmarkCount: 47,
    comments: 38,
    badge: null,
    hot: true,
    authorName: null,
    publishedAt: "2026-06-13T08:15:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000a2",
    slug: "rybakov-no-startup-2026",
    category: "РЫБАКОВ ГОВОРИТ",
    categoryKey: "rybakov",
    template: "daily-take",
    title: "Почему я не верю в стартап-инвестиции в 2026",
    excerpt:
      "«Хайп-экономика заканчивается. Что покупать вместо стартапов».",
    imageUrl: null,
    readMinutes: 1,
    reactions: 891,
    reactionBreakdown: { fire: 612, insight: 187, question: 92 },
    bookmarkCount: 124,
    comments: 214,
    badge: "PREMIUM",
    hot: false,
    authorName: "Игорь Рыбаков",
    publishedAt: "2026-06-13T06:40:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000a3",
    slug: "ruble-100-three-scenarios",
    category: "ДЕНЬГИ",
    categoryKey: "money",
    template: "card-news",
    title: "Рубль по 100: три сценария на лето",
    excerpt:
      "Что говорят валютные стратеги Сбера, Тинькоффа и независимые аналитики.",
    imageUrl: null,
    readMinutes: 4,
    reactions: 67,
    reactionBreakdown: { fire: 28, insight: 24, question: 15 },
    bookmarkCount: 19,
    comments: 12,
    badge: null,
    hot: false,
    authorName: null,
    publishedAt: "2026-06-12T15:20:00Z",
  },
  {
    id: "00000000-0000-0000-0000-0000000000a4",
    slug: "wildberries-buys-taxi",
    category: "ПРАКТИКА",
    categoryKey: "practice",
    template: "deep-dive",
    title: "Wildberries собирает логистическую империю. Разбор сделки на три такси-сервиса",
    excerpt:
      "Маркетплейс купил три такси за квартал. Что это даёт WB, что теряют продавцы, и какие 5 уроков для российского ритейла.",
    imageUrl: null,
    readMinutes: 9,
    reactions: 234,
    reactionBreakdown: { fire: 128, insight: 71, question: 35 },
    bookmarkCount: 56,
    comments: 56,
    badge: null,
    hot: false,
    authorName: null,
    publishedAt: "2026-06-11T12:05:00Z",
  },
];

export async function loadDailyFeed(limit = 20): Promise<FeedItem[]> {
  "use cache";
  const api = await fetchFeed(limit);
  if (api && api.items.length > 0) {
    return api.items.map(mapApiItem);
  }
  // Бэкенд сконфигурирован, но ответ пуст/упал → честный empty (DailyFeed
  // покажет empty-state), НЕ мок со слагами-404. Мок — только dev/demo без бэкенда.
  if (isApiConfigured()) return [];
  return FEED.slice(0, limit);
}

/**
 * Лента одной рубрики (category-страница, напр. /taxes). Как loadDailyFeed, но
 * с фильтром по category. Кэш per-category. Dev/demo-fallback — мок-FEED той же
 * рубрики; prod-down — честный empty (НЕ мок со слагами-404).
 */
export async function loadCategoryFeed(
  category: ApiCategory,
  limit = 20,
): Promise<FeedItem[]> {
  "use cache";
  const api = await fetchFeed(limit, { category });
  if (api && api.items.length > 0) return api.items.map(mapApiItem);
  if (isApiConfigured()) return [];
  return FEED.filter((i) => i.categoryKey === category).slice(0, limit);
}

/**
 * Нейтральный link-safe fallback (api недоступен в рантайме). ⚠️ НЕ фабрикуем
 * статьи/слаги: иначе на первом экране появятся выдуманные заголовки и мёртвые
 * ссылки, ведущие в 404 (находка ревью s25 — мок-bullets запекались в статику).
 * Без bullets/CTA — честный пустой hero, направляющий в ленту ниже.
 */
function fallbackDigest(): Digest {
  return {
    issueDate: "",
    intro: "Свежие деловые материалы — в ленте ниже.",
    bullets: [],
    ctaSlug: null,
  };
}

/**
 * Данные home-hero (дайджест одинаков для всех — per-day), кэш 15м.
 * Динамическая граница — connection() в HeroDigest (чтобы build не запекал
 * fallback в статику); здесь только кэш результата живого fetch.
 */
export async function loadDigest(): Promise<Digest> {
  "use cache";
  const api = await fetchDigest();
  if (!api || api.topArticles.length === 0) return fallbackDigest();
  const top = api.topArticles.slice(0, DIGEST_BULLET_COUNT);
  return {
    issueDate: api.issueDate,
    intro: api.intro,
    bullets: top.map((a, i) => ({
      n: String(i + 1).padStart(2, "0"),
      slug: a.slug,
      text: a.tease,
    })),
    ctaSlug: api.topArticles[0]?.slug ?? null,
  };
}

/**
 * Полная статья для читалки (brief §3): FeedItem + тело (body-блоки),
 * «почему важно», источники, обложка (raw nullable — читалка решает рисовать
 * картинку или чистый хедер), дата.
 */
export type ArticleDetail = FeedItem & {
  whyItMatters: string | null;
  body: ApiArticleBlock[];
  /** Реальная обложка из БД (null = нет → читалка рисует типографский хедер). */
  coverImageUrl: string | null;
  citations: Array<{ url: string; title: string; publisher: string; publishedAt?: string }>;
  audioUrl: string | null;
};

function mapApiArticle(row: ApiArticle): ArticleDetail {
  return {
    ...mapApiItem(row), // publishedAt приходит отсюда (FeedItem)
    whyItMatters: row.whyItMatters,
    body: row.body ?? [],
    coverImageUrl: row.coverImageUrl,
    citations: row.citations ?? [],
    audioUrl: row.audioUrl,
  };
}

/**
 * `"use cache"` (Next 16 Cache Components): статья — статичный per-slug контент,
 * кэшируется. Это ОБЯЗАТЕЛЬНО здесь — без кэша uncached-fetch в теле страницы
 * читалки (вне <Suspense>) роняет рендер («blocking route»). Per-user state
 * (реакции/закладки) грузится отдельно в Suspense (ArticleEngagement).
 */
export async function loadArticle(slug: string): Promise<ArticleDetail | null> {
  "use cache";
  const api = await fetchArticle(slug);
  if (api) return mapApiArticle(api);
  const mock = FEED.find((i) => i.slug === slug);
  if (!mock) return null;
  return {
    ...mock, // publishedAt приходит отсюда (FeedItem)
    whyItMatters: null,
    body: [],
    coverImageUrl: null,
    citations: [],
    audioUrl: null,
  };
}

// ---------- Taxes (rubric) — теперь живая лента через loadCategoryFeed("taxes") ----------
// (мок TAXES_ITEMS/METRICS/FILTERS удалён в s25 — /taxes рендерит реальные статьи)

// ---------- Video (живая лента YouTube-канала Рыбакова) ----------
// Мок VIDEOS/VIDEO_TABS/PODCAST_OF_WEEK удалён в s25. Подкасты — post-M0 (AudioAgent).

export type Video = {
  id: string;
  title: string;
  /** Реальный YouTube URL (watch/shorts) — карточка ведёт туда. */
  url: string;
  thumbnailUrl: string;
  /** Локализованная дата «7 июня». */
  dateLabel: string;
};

function formatVideoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(d);
}

/**
 * Видео канала — реальные данные из API (YouTube RSS на бэкенде). `"use cache"`
 * (per-15м) — YouTube дёргается редко. Возвращает ПОЛНЫЕ видео (Shorts-тизеры
 * отфильтрованы). API down / dev без бэкенда → [] (честный empty, не фейк).
 */
export async function loadVideos(): Promise<Video[]> {
  "use cache";
  const api = await fetchVideos();
  if (!api) return [];
  return api
    .filter((v) => !v.isShort)
    .map((v) => ({
      id: v.youtubeId,
      title: v.title,
      url: v.url,
      thumbnailUrl: v.thumbnailUrl,
      dateLabel: formatVideoDate(v.publishedAt),
    }));
}

// ---------- Community (Х10) ----------
// COMMUNITY_STATS и EVENTS — в @/lib/community (Этап 3c, API). MY_CLUMP-мок удалён
// (s25): «Твой кламп» → честный join-state (нет membership/данных клампов).
// COMMUNITY_PATHS — статичный onboarding, не data-driven.

export const COMMUNITY_PATHS = [
  { icon: "🚀", title: "Создать свой кламп", description: "Собрать команду 6-10 человек" },
  { icon: "🔍", title: "Найти кламп рядом", description: "По теме или городу" },
  { icon: "⚡", title: "Стать кламперам", description: "Лидер малой группы" },
  { icon: "🌐", title: "Региональный лидер", description: "Развивать Х10 в городе" },
];

// ---------- Profile ----------
// PROFILE/PROFILE_STATS/WEEK_STREAK → реальные (loadProfileIdentity/Snapshot).
// SUBSCRIPTIONS/SCHEDULE-моки удалены (s25) → реальные настройки через
// loadPreferences + PreferenceToggles (таблица user_preferences). PROFILE_MENU —
// статичная навигация (пункты ведут на ещё не построенные экраны).

export const PROFILE_MENU: Array<{
  title: string;
  icon: "bookmark" | "book" | "headphones" | "crown" | "settings";
  /** Если задан — пункт ведёт на готовый экран (Link). Иначе пока заглушка. */
  href?: string;
}> = [
  { title: "Сохранённое", icon: "bookmark", href: "/profile/saved" },
  { title: "История чтения", icon: "book" },
  { title: "Скачанные подкасты", icon: "headphones" },
  { title: "Х10 Premium", icon: "crown" },
  { title: "Настройки", icon: "settings" },
];
