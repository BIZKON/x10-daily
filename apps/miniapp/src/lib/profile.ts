/**
 * Data layer для /profile.
 *
 * Источник: /v1/profile/stats → ApiProfileStats.
 * Auth: session cookie x10_session → Authorization Bearer (HIGH-2).
 *
 * Fallback на мок-цифры из прототипа (CLAUDE.md §1, прототип fonts.ts).
 * PROFILE/SUBSCRIPTIONS/SCHEDULE остаются мок до auth + user_topic_subscriptions (3d/4).
 */
import { fetchProfileStats, type ApiProfileStats } from "./api";

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
