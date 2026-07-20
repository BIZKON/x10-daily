/**
 * Data layer для /profile.
 *
 * Источник: /v1/profile/stats → ApiProfileStats.
 * Auth: session cookie x10_session → Authorization Bearer (HIGH-2).
 *
 * Источники (s25, все живые): stats → /v1/profile/stats; identity →
 * /v1/auth/me (loadProfileIdentity); подписки+расписание → /v1/profile/preferences
 * (loadPreferences). Fallback на дефолты при отсутствии auth (гость).
 */
import {
  type ApiCategory,
  type ApiPreferences,
  type ApiProfileStats,
  fetchAuthMe,
  fetchBookmarks,
  fetchPreferences,
  fetchProfileStats,
} from "./api";
import { formatPublishedAt } from "./format";

export type ProfileStatTone = "red" | "gold" | "success";
export type ProfileStatIcon = "flame" | "book" | "bookmark" | "crown";

export type ProfileStat = {
  icon: ProfileStatIcon;
  /** Большое число — "23", "1240". */
  k: string;
  /** Подпись — "дней стрик", "IPS". */
  v: string;
  tone: ProfileStatTone;
};

export type WeekDay = { d: string; on: boolean };

export type ProfileSnapshot = {
  stats: ProfileStat[];
  weekStreak: WeekDay[];
  /** Сколько дней до следующей ачивки стрика. Пока статично — 7. */
  daysToAchievement: number;
};

function fmtNumber(n: number): string {
  if (n >= 1000) return new Intl.NumberFormat("ru-RU").format(n);
  return String(n);
}

function mapApiStats(api: ApiProfileStats): ProfileSnapshot {
  return {
    stats: [
      { icon: "flame", k: fmtNumber(api.streakDays), v: "дней стрик", tone: "red" },
      { icon: "book", k: fmtNumber(api.readsTotal), v: "прочитано", tone: "gold" },
      { icon: "bookmark", k: fmtNumber(api.bookmarksTotal), v: "сохранено", tone: "success" },
      { icon: "crown", k: fmtNumber(api.ipsScore), v: "IPS", tone: "gold" },
    ],
    weekStreak: api.weekActivity.map((a) => ({ d: a.day, on: a.on })),
    daysToAchievement: Math.max(0, 30 - api.streakDays),
  };
}

/* ----------------------------------------------------------------
 * Mocks (fallback — нет env / API недоступен / 401)
 * ---------------------------------------------------------------- */

const MOCK_SNAPSHOT: ProfileSnapshot = {
  stats: [
    { icon: "flame", k: "23", v: "дней стрик", tone: "red" },
    { icon: "book", k: "312", v: "прочитано", tone: "gold" },
    { icon: "bookmark", k: "47", v: "сохранено", tone: "success" },
    { icon: "crown", k: "1240", v: "IPS", tone: "gold" },
  ],
  weekStreak: [
    { d: "П", on: true },
    { d: "В", on: true },
    { d: "С", on: true },
    { d: "Ч", on: true },
    { d: "П", on: true },
    { d: "С", on: false },
    { d: "В", on: false },
  ],
  daysToAchievement: 7,
};

export async function loadProfileSnapshot(): Promise<ProfileSnapshot> {
  const api = await fetchProfileStats();
  if (api) return mapApiStats(api);
  return MOCK_SNAPSHOT;
}

/* ----------------------------------------------------------------
 * Identity шапки профиля — из авторизованного юзера (/v1/auth/me).
 * Не авторизован (cookie ещё не выставлен / вне TG) → честный «Гость»,
 * НЕ выдуманный «Алексей Петров». Авто-логин в TG выставит сессию →
 * router.refresh() подтянет реальное имя (как у StatsAndStreak).
 * ---------------------------------------------------------------- */

export type ProfileIdentity = {
  /** Отображаемое имя (displayName → username → «Гость»). */
  name: string;
  /** @username или null. */
  handle: string | null;
  /** Реальный аватар Telegram или null (тогда рисуем инициал). */
  avatarUrl: string | null;
  /** Инициал для аватарки-заглушки. */
  initial: string;
  /** Авторизован ли (для UI-подсказки гостю). */
  authed: boolean;
};

export async function loadProfileIdentity(): Promise<ProfileIdentity> {
  const me = await fetchAuthMe();
  if (!me) {
    return { name: "Гость", handle: null, avatarUrl: null, initial: "Г", authed: false };
  }
  const name = me.displayName?.trim() || me.username?.trim() || "Читатель ProAgent AI";
  return {
    name,
    handle: me.username ? `@${me.username}` : null,
    avatarUrl: me.avatarUrl,
    initial: name.charAt(0).toUpperCase() || "P",
    authed: true,
  };
}

/** Дефолт настроек (нет авторизации / нет строки): все рубрики, утро+обед вкл. */
export const DEFAULT_PREFERENCES: ApiPreferences = {
  subscribedCategories: ["news", "cases", "howto", "tools", "business", "founder"],
  digestSchedule: { morning: true, lunch: true, evening: false },
};

export async function loadPreferences(): Promise<ApiPreferences> {
  const prefs = await fetchPreferences();
  return prefs ?? DEFAULT_PREFERENCES;
}

/* ----------------------------------------------------------------
 * Закладки (раздел «Сохранённое») — GET /v1/profile/bookmarks.
 * ---------------------------------------------------------------- */

const CATEGORY_LABELS: Record<ApiCategory, string> = {
  news: "НОВОСТИ ИИ",
  cases: "КЕЙСЫ",
  howto: "ОБУЧЕНИЕ",
  tools: "ИНСТРУМЕНТЫ",
  business: "ПРАКТИКА",
  founder: "ОТ ОСНОВАТЕЛЯ",
};

export type SavedArticle = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  /** «Сохранено 13 июня, 14:30» (МСК) или null. */
  savedAtLabel: string | null;
  isPremium: boolean;
};

export type BookmarksResult = {
  /** Авторизован ли (false → гость/недоступно → подсказка вместо пустого списка). */
  authed: boolean;
  items: SavedArticle[];
};

export async function loadBookmarks(): Promise<BookmarksResult> {
  const items = await fetchBookmarks(50);
  if (items === null) return { authed: false, items: [] };
  return {
    authed: true,
    items: items.map((b) => ({
      slug: b.slug,
      // Фолбэк на легаси-категории из прод-БД (см. feed.ts mapApiItem).
      category: (CATEGORY_LABELS as Record<string, string>)[b.category] ?? "НОВОСТИ ИИ",
      title: b.tease,
      excerpt: b.lede,
      readMinutes: Math.max(1, Math.round(b.readSeconds / 60)),
      savedAtLabel: formatPublishedAt(b.savedAt),
      isPremium: b.isPaid,
    })),
  };
}
