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
  fetchAuthMe,
  fetchPreferences,
  fetchProfileStats,
  type ApiPreferences,
  type ApiProfileStats,
} from "./api";

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
    return { name: "Гость", handle: null, avatarUrl: null, initial: "Х", authed: false };
  }
  const name = me.displayName?.trim() || me.username?.trim() || "Читатель Х10";
  return {
    name,
    handle: me.username ? `@${me.username}` : null,
    avatarUrl: me.avatarUrl,
    initial: name.charAt(0).toUpperCase() || "Х",
    authed: true,
  };
}

/** Дефолт настроек (нет авторизации / нет строки): все рубрики, утро+обед вкл. */
export const DEFAULT_PREFERENCES: ApiPreferences = {
  subscribedCategories: ["taxes", "money", "practice", "power", "tech", "rybakov"],
  digestSchedule: { morning: true, lunch: true, evening: false },
};

export async function loadPreferences(): Promise<ApiPreferences> {
  const prefs = await fetchPreferences();
  return prefs ?? DEFAULT_PREFERENCES;
}
