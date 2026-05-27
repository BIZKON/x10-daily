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
  fetchFeed,
  type ApiCategory,
  type ApiFeedItem,
  type ApiTemplate,
} from "./api";

/** brief §5 — категории первого уровня (rubrics). */
export type FeedSection = ApiCategory;

export type FeedCategoryLabel = string;

/** brief §3 — шаблоны материалов. UI выбирает компонент карточки по template. */
export type FeedTemplate = ApiTemplate;

export type FeedItem = {
  id: string;
  slug: string;
  category: FeedCategoryLabel;
  template: FeedTemplate;
  title: string;
  excerpt: string;
  imageUrl: string;
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

/** Картинка-заглушка per category. БД хранит coverImageUrl — используется при наличии. */
const CATEGORY_PLACEHOLDER_IMAGES: Record<ApiCategory, string> = {
  taxes: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
  money: "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&q=80",
  practice: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80",
  power: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
  tech: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80",
  rybakov: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80",
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
    template: row.template,
    title: row.tease,
    excerpt: row.lede,
    imageUrl: row.coverImageUrl ?? CATEGORY_PLACEHOLDER_IMAGES[row.category],
    readMinutes: Math.max(1, Math.round(row.readSeconds / 60)),
    reactions: totalReactions,
    reactionBreakdown: breakdown,
    bookmarkCount: detail.bookmarkCount ?? 0,
    comments: detail.commentCount ?? 0,
    badge: row.isPaid ? "PREMIUM" : null,
    hot: row.isFeatured,
    authorName: null, // М1 — будет приходить из API когда добавим Authors сущность.
  };
}

export const DAILY_DIGEST = {
  date: "Понедельник, 26 мая",
  title: "Утренний разбор от Рыбакова",
  videoMinutes: 8,
  bullets: [
    {
      n: "01",
      t: "ЦБ оставил ставку 17%. Рыбаков: «Кредитное окно закрыто, время своих денег».",
    },
    {
      n: "02",
      t: "Минфин предложил поднять порог УСН до 350 млн. Что делать малому бизнесу.",
    },
    {
      n: "03",
      t: "Wildberries купил три сервиса такси. Передел рынка логистики начался.",
    },
  ],
};

/** Mock feed для разработки без backend'a — покрывает все 3 template (M0 brief §10). */
const FEED: FeedItem[] = [
  {
    id: "00000000-0000-0000-0000-0000000000a1",
    slug: "usn-350mln-three-steps",
    category: "НАЛОГИ",
    template: "card-news",
    title: "Новый порог УСН 350 млн: кому грозит, кому выгодно",
    excerpt:
      "Разобрали с налоговым адвокатом, что меняется и какие три шага сделать сейчас.",
    imageUrl:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
    readMinutes: 12,
    reactions: 142,
    reactionBreakdown: { fire: 88, insight: 39, question: 15 },
    bookmarkCount: 47,
    comments: 38,
    badge: null,
    hot: true,
    authorName: null,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a2",
    slug: "rybakov-no-startup-2026",
    category: "РЫБАКОВ ГОВОРИТ",
    template: "daily-take",
    title: "Почему я не верю в стартап-инвестиции в 2026",
    excerpt:
      "«Хайп-экономика заканчивается. Что покупать вместо стартапов».",
    imageUrl:
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80",
    readMinutes: 1,
    reactions: 891,
    reactionBreakdown: { fire: 612, insight: 187, question: 92 },
    bookmarkCount: 124,
    comments: 214,
    badge: "PREMIUM",
    hot: false,
    authorName: "Игорь Рыбаков",
  },
  {
    id: "00000000-0000-0000-0000-0000000000a3",
    slug: "ruble-100-three-scenarios",
    category: "ДЕНЬГИ",
    template: "card-news",
    title: "Рубль по 100: три сценария на лето",
    excerpt:
      "Что говорят валютные стратеги Сбера, Тинькоффа и независимые аналитики.",
    imageUrl:
      "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&q=80",
    readMinutes: 4,
    reactions: 67,
    reactionBreakdown: { fire: 28, insight: 24, question: 15 },
    bookmarkCount: 19,
    comments: 12,
    badge: null,
    hot: false,
    authorName: null,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a4",
    slug: "wildberries-buys-taxi",
    category: "ПРАКТИКА",
    template: "deep-dive",
    title: "Wildberries собирает логистическую империю. Разбор сделки на три такси-сервиса",
    excerpt:
      "Маркетплейс купил три такси за квартал. Что это даёт WB, что теряют продавцы, и какие 5 уроков для российского ритейла.",
    imageUrl:
      "https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80",
    readMinutes: 9,
    reactions: 234,
    reactionBreakdown: { fire: 128, insight: 71, question: 35 },
    bookmarkCount: 56,
    comments: 56,
    badge: null,
    hot: false,
    authorName: null,
  },
];

export async function loadDailyFeed(limit = 20): Promise<FeedItem[]> {
  const api = await fetchFeed(limit);
  if (api && api.items.length > 0) {
    return api.items.map(mapApiItem);
  }
  return FEED.slice(0, limit);
}

export async function loadArticle(slug: string): Promise<FeedItem | null> {
  const api = await fetchArticle(slug);
  if (api) return mapApiItem(api);
  return FEED.find((i) => i.slug === slug) ?? null;
}

// ---------- Taxes (rubric) ----------

export type TaxesItem = {
  tag: string;
  title: string;
  minutes: number;
  hot: boolean;
};

export const TAXES_ITEMS: TaxesItem[] = [
  { tag: "РАЗБОР", title: "УСН 350 млн: 3 шага на этой неделе", minutes: 8, hot: true },
  { tag: "ИНСТРУКЦИЯ", title: "Как платить меньше дивидендного НДФЛ в 2026", minutes: 12, hot: false },
  { tag: "НОВОСТЬ", title: "ФНС начала рассылать требования по самозанятым", minutes: 4, hot: false },
  { tag: "КЕЙС", title: "Производство в Беларуси: реальные цифры", minutes: 15, hot: true },
  { tag: "ГИД", title: "Налоговый календарь 2026: 18 ключевых дат", minutes: 6, hot: false },
];

export const TAXES_METRICS = [
  { icon: "chart-bar" as const, k: "247", v: "материалов" },
  { icon: "trending-up" as const, k: "+18%", v: "охват/мес" },
  { icon: "calendar" as const, k: "2/нед", v: "разборов" },
];

export const TAXES_FILTERS = ["Все", "УСН", "НДС", "НДФЛ", "Самозанятые", "Релокация"];

// ---------- Video ----------

export type VideoItem = {
  title: string;
  views: string;
  date: string;
  duration: string;
  imageUrl: string;
  live: boolean;
};

export const VIDEOS: VideoItem[] = [
  {
    title: "Россия 2026: катастрофа или прорыв?",
    views: "847K",
    date: "23 мая",
    duration: "14:22",
    imageUrl:
      "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
    live: false,
  },
  {
    title: "Почему я не оставляю наследство детям",
    views: "1.2M",
    date: "21 мая",
    duration: "8:45",
    imageUrl:
      "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80",
    live: false,
  },
  {
    title: "ПРЯМОЙ ЭФИР: Разбор недели",
    views: "12K",
    date: "сейчас",
    duration: "LIVE",
    imageUrl:
      "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80",
    live: true,
  },
  {
    title: "Налоговая реформа 2026: вся правда",
    views: "534K",
    date: "19 мая",
    duration: "21:08",
    imageUrl:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
    live: false,
  },
];

export const VIDEO_TABS = ["Все", "Утренний разбор", "Подкасты", "Shorts", "Интервью", "Эфиры"];

export const PODCAST_OF_WEEK = {
  title: "Разбор недели: что случилось в экономике",
  hosts: "Игорь Рыбаков + Олег Хархордин",
  durationLabel: "47 минут",
  currentTime: "14:23",
  totalTime: "47:08",
  progress: 0.3,
};

// ---------- Community (Х10) ----------
// COMMUNITY_STATS и EVENTS переехали в @/lib/community (Этап 3c — подключены к API).
// MY_CLUMP остаётся моком до auth + user_clump_memberships (3d/4).
// COMMUNITY_PATHS — статичный onboarding, не data-driven.

export const MY_CLUMP = {
  name: "Кламп «Цифровой прорыв»",
  goal: "Запустить совместный AI-сервис за 90 дней",
  avatars: ["А", "М", "К", "И", "П"],
  extraCount: 3,
  progress: 0.67,
  nextMeet: "Завтра, 19:00",
};

export const COMMUNITY_PATHS = [
  { icon: "🚀", title: "Создать свой кламп", description: "Собрать команду 6-10 человек" },
  { icon: "🔍", title: "Найти кламп рядом", description: "По теме или городу" },
  { icon: "⚡", title: "Стать кламперам", description: "Лидер малой группы" },
  { icon: "🌐", title: "Региональный лидер", description: "Развивать Х10 в городе" },
];

// ---------- Profile ----------

export const PROFILE = {
  name: "Алексей Петров",
  role: "Клампер",
  city: "Краснодар",
  avatarInitial: "А",
};

export const PROFILE_STATS = [
  { icon: "flame" as const, k: "23", v: "дней стрик", tone: "red" as const },
  { icon: "book" as const, k: "312", v: "прочитано", tone: "gold" as const },
  { icon: "bookmark" as const, k: "47", v: "сохранено", tone: "success" as const },
  { icon: "crown" as const, k: "1240", v: "IPS", tone: "gold" as const },
];

export const WEEK_STREAK = [
  { d: "П", on: true },
  { d: "В", on: true },
  { d: "С", on: true },
  { d: "Ч", on: true },
  { d: "П", on: true },
  { d: "С", on: false },
  { d: "В", on: false },
];

export const SUBSCRIPTIONS = [
  "Налоги",
  "Деньги",
  "Рыбаков говорит",
  "Х10 Краснодар",
  "Подкаст: Разбор недели",
];

export const SCHEDULE = [
  { time: "07:00", name: "Утренний разбор Рыбакова", on: true },
  { time: "13:00", name: "Smart-карусель за обедом", on: true },
  { time: "19:00", name: "Что обсуждают в Х10", on: false },
];

export const PROFILE_MENU = [
  { title: "Сохранённое", icon: "bookmark" as const },
  { title: "История чтения", icon: "book" as const },
  { title: "Скачанные подкасты", icon: "headphones" as const },
  { title: "Х10 Premium", icon: "crown" as const },
  { title: "Настройки", icon: "settings" as const },
];
