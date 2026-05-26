/**
 * Mock data layer на M0. Структура зеркалит x10_news_mini_app_interactive_prototype.html;
 * после Layer 4 (workers + Inngest) — переключим на fetch к @x10/api.
 */

export type FeedSection =
  | "main"
  | "money"
  | "taxes"
  | "business"
  | "power"
  | "rybakov"
  | "x10";

export type FeedCategoryLabel = string;

export type FeedItem = {
  id: string;
  slug: string;
  category: FeedCategoryLabel;
  title: string;
  excerpt: string;
  imageUrl: string;
  readMinutes: number;
  reactions: number;
  comments: number;
  badge: "PREMIUM" | null;
  hot: boolean;
};

export const HOME_CATEGORIES: { id: FeedSection; label: string }[] = [
  { id: "main", label: "Главное" },
  { id: "money", label: "Деньги" },
  { id: "taxes", label: "Налоги" },
  { id: "business", label: "Бизнес" },
  { id: "power", label: "Власть" },
  { id: "rybakov", label: "Рыбаков говорит" },
  { id: "x10", label: "Х10" },
];

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

const FEED: FeedItem[] = [
  {
    id: "1",
    slug: "usn-350mln-three-steps",
    category: "НАЛОГИ",
    title: "Новый порог УСН 350 млн: кому грозит, кому выгодно",
    excerpt:
      "Разобрали с налоговым адвокатом, что меняется и какие три шага сделать сейчас.",
    imageUrl:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
    readMinutes: 12,
    reactions: 142,
    comments: 38,
    badge: null,
    hot: true,
  },
  {
    id: "2",
    slug: "rybakov-no-startup-2026",
    category: "РЫБАКОВ ГОВОРИТ",
    title: "Почему я не верю в стартап-инвестиции в 2026",
    excerpt:
      "Игорь Рыбаков: «Хайп-экономика заканчивается. Что покупать вместо стартапов».",
    imageUrl:
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80",
    readMinutes: 7,
    reactions: 891,
    comments: 214,
    badge: "PREMIUM",
    hot: false,
  },
  {
    id: "3",
    slug: "ruble-100-three-scenarios",
    category: "ДЕНЬГИ",
    title: "Рубль по 100: три сценария на лето",
    excerpt:
      "Что говорят валютные стратеги Сбера, Тинькоффа и независимые аналитики.",
    imageUrl:
      "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&q=80",
    readMinutes: 4,
    reactions: 67,
    comments: 12,
    badge: null,
    hot: false,
  },
  {
    id: "4",
    slug: "wildberries-buys-taxi",
    category: "БИЗНЕС",
    title: "Wildberries купил три такси-сервиса. Что это значит",
    excerpt:
      "Маркетплейс собирает логистическую империю. Разбираем сделку.",
    imageUrl:
      "https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80",
    readMinutes: 6,
    reactions: 234,
    comments: 56,
    badge: null,
    hot: false,
  },
];

export async function loadDailyFeed(limit = 20): Promise<FeedItem[]> {
  return FEED.slice(0, limit);
}

export async function loadArticle(slug: string): Promise<FeedItem | null> {
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

export const COMMUNITY_STATS = {
  members: 30_885,
  cities: 124,
  countries: 11,
};

export const MY_CLUMP = {
  name: "Кламп «Цифровой прорыв»",
  goal: "Запустить совместный AI-сервис за 90 дней",
  avatars: ["А", "М", "К", "И", "П"],
  extraCount: 3,
  progress: 0.67,
  nextMeet: "Завтра, 19:00",
};

export const EVENTS = [
  { city: "МОСКВА", date: "4", month: "апр", title: "X10 Business Meet Up by Rybakov", attendees: 420, tone: "red" as const },
  { city: "УФА", date: "12", month: "апр", title: "X10Talks: 7 историй о выходе из тени", attendees: 120, tone: "gold" as const },
  { city: "ИРКУТСК", date: "18", month: "апр", title: "Кламперский бизнес-завтрак", attendees: 28, tone: "steel" as const },
];

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
