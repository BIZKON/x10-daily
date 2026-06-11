/**
 * Data layer для экрана /community.
 *
 * Источники:
 * - CommunityStats: /v1/community/stats → ApiCommunityStats. Fallback на мок-цифры из CLAUDE.md §1.
 * - Events: /v1/events?scope=upcoming → ApiEvent[]. Fallback на мок-список ниже.
 *
 * MY_CLUMP остаётся моком (нужна auth + user_clump_memberships — этап 3d/4).
 * COMMUNITY_PATHS — статический onboarding, не data-driven.
 */
import {
  type ApiCommunityStats,
  type ApiEvent,
  type ApiEventType,
  fetchCommunityStats,
  fetchEvents,
} from "./api";

export type CommunityStats = {
  members: number;
  cities: number;
  countries: number;
};

export type CommunityEventTone = "red" | "gold" | "steel";

export type CommunityEvent = {
  id: string;
  slug: string;
  city: string;
  /** День месяца — "4", "12", "18". */
  date: string;
  /** Сокращённый месяц — "апр", "мая". */
  month: string;
  title: string;
  attendees: number;
  tone: CommunityEventTone;
};

/** Маппинг event.type → визуальный тон карточки. */
const TYPE_TO_TONE: Record<ApiEventType, CommunityEventTone> = {
  "kod-x10": "red",
  "meet-up": "red",
  festival: "gold",
  webinar: "gold",
  breakfast: "steel",
};

const MONTH_SHORT_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function mapApiEvent(row: ApiEvent): CommunityEvent {
  const start = new Date(row.startDate);
  return {
    id: row.id,
    slug: row.slug,
    city: (row.city ?? "ONLINE").toUpperCase(),
    date: String(start.getDate()),
    month: MONTH_SHORT_RU[start.getMonth()] ?? "",
    title: row.title,
    attendees: row.registeredCount,
    tone: TYPE_TO_TONE[row.type] ?? "steel",
  };
}

function mapStats(row: ApiCommunityStats): CommunityStats {
  return {
    members: row.totalMembers,
    cities: row.cities,
    countries: row.countries,
  };
}

/* ----------------------------------------------------------------
 * Mocks (fallback когда X10_API_BASE_URL не задан или API недоступен)
 * Цифры — из CLAUDE.md §1 + текущего mock-набора.
 * ---------------------------------------------------------------- */

const MOCK_STATS: CommunityStats = {
  members: 30_885,
  cities: 124,
  countries: 11,
};

const MOCK_EVENTS: CommunityEvent[] = [
  {
    id: "mock-1",
    slug: "x10-meet-up-moscow-apr",
    city: "МОСКВА",
    date: "4",
    month: "апр",
    title: "X10 Business Meet Up by Rybakov",
    attendees: 420,
    tone: "red",
  },
  {
    id: "mock-2",
    slug: "x10-talks-ufa",
    city: "УФА",
    date: "12",
    month: "апр",
    title: "X10Talks: 7 историй о выходе из тени",
    attendees: 120,
    tone: "gold",
  },
  {
    id: "mock-3",
    slug: "klamp-breakfast-irkutsk",
    city: "ИРКУТСК",
    date: "18",
    month: "апр",
    title: "Кламперский бизнес-завтрак",
    attendees: 28,
    tone: "steel",
  },
];

/* ----------------------------------------------------------------
 * Loaders
 * ---------------------------------------------------------------- */

export async function loadCommunityStats(): Promise<CommunityStats> {
  const api = await fetchCommunityStats();
  if (api && api.totalKlamps > 0) return mapStats(api);
  return MOCK_STATS;
}

export async function loadCommunityEvents(limit = 10): Promise<CommunityEvent[]> {
  const api = await fetchEvents(limit);
  if (api && api.items.length > 0) return api.items.map(mapApiEvent);
  return MOCK_EVENTS;
}
