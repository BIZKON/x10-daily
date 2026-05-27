/**
 * HTTP-клиент к apps/api (Hono на Cloudflare Workers).
 * Только server-side: использует X10_API_BASE_URL — серверный env, в браузер не уходит.
 *
 * Локально: http://localhost:8788 (api worker)
 * Prod: deployed CF Workers URL
 *
 * Если env не задан или fetch упал → возвращаем null. Caller использует mock-fallback.
 */

const TIMEOUT_MS = 4000;

export type ApiCategory = "taxes" | "money" | "practice" | "power" | "tech" | "rybakov";
export type ApiTemplate = "card-news" | "deep-dive" | "daily-take" | "guide" | "digest";

export type ApiFeedItem = {
  id: string;
  slug: string;
  section: "main" | "numbers" | "people" | "playbook" | "weekend" | "longread" | "newsletter";
  category: ApiCategory;
  subcategory: string | null;
  template: ApiTemplate;
  tags: string[];
  coverImageUrl: string | null;
  tease: string;
  lede: string;
  readSeconds: number;
  wordCount: number;
  isPaid: boolean;
  isFeatured: boolean;
  reactions: { fire: number; insight: number; question: number };
  publishedAt: string | null;
};

export type ApiFeedResponse = {
  items: ApiFeedItem[];
  generatedAt: string;
};

export type ApiArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "numbers"; items: Array<{ label: string; value: string; source?: string }> }
  | { type: "quote"; text: string; attribution: string }
  | { type: "callout"; kind: "why" | "yes-but" | "what-next" | "big-picture"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export type ApiArticle = ApiFeedItem & {
  whyItMatters: string | null;
  body: ApiArticleBlock[];
  citations: Array<{ url: string; title: string; publisher: string; publishedAt?: string }>;
  audioUrl: string | null;
};

function getBaseUrl(): string | null {
  const url = process.env.X10_API_BASE_URL;
  if (!url || url.trim() === "") return null;
  return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchFeed(
  limit: number,
  filter?: { category?: ApiCategory; template?: ApiTemplate },
): Promise<ApiFeedResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter?.category) params.set("category", filter.category);
  if (filter?.template) params.set("template", filter.template);
  try {
    const res = await fetchWithTimeout(`${base}/v1/feed/daily?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as ApiFeedResponse;
  } catch {
    return null;
  }
}

export async function fetchArticle(slug: string): Promise<ApiArticle | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/v1/articles/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return (await res.json()) as ApiArticle;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * Community (Этап 3c — brief §2.1)
 * ---------------------------------------------------------------- */

export type ApiCommunityStats = {
  totalKlamps: number;
  totalMembers: number;
  openKlamps: number;
  cities: number;
  countries: number;
};

export type ApiEventType = "kod-x10" | "meet-up" | "breakfast" | "festival" | "webinar";

export type ApiEvent = {
  id: string;
  slug: string;
  title: string;
  type: ApiEventType;
  startDate: string;
  endDate: string | null;
  timezone: string;
  city: string | null;
  venue: { name: string; address: string; lat?: number; lng?: number } | null;
  isOnline: boolean;
  organizer: string;
  ticketPriceFrom: number | null;
  ticketUrl: string | null;
  coverImageUrl: string | null;
  registeredCount: number;
  capacity: number | null;
  seatsLeft: number | null;
};

export type ApiEventsResponse = { items: ApiEvent[]; count: number };

export async function fetchCommunityStats(): Promise<ApiCommunityStats | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/v1/community/stats`);
    if (!res.ok) return null;
    return (await res.json()) as ApiCommunityStats;
  } catch {
    return null;
  }
}

export async function fetchEvents(
  limit: number,
  filter?: { city?: string; type?: ApiEventType },
): Promise<ApiEventsResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams({ limit: String(limit), scope: "upcoming" });
  if (filter?.city) params.set("city", filter.city);
  if (filter?.type) params.set("type", filter.type);
  try {
    const res = await fetchWithTimeout(`${base}/v1/events?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as ApiEventsResponse;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * Profile (Этап 3d — brief §6 UserProgress + §11 engagement)
 *
 * X10_DEV_USER_ID — серверный env, dev-stub auth.
 * В прод появится Telegram initData → JWT session.
 * ---------------------------------------------------------------- */

function getDevUserId(): string | null {
  const v = process.env.X10_DEV_USER_ID;
  return v && v.trim() !== "" ? v : null;
}

async function fetchAuthed(path: string): Promise<Response | null> {
  const base = getBaseUrl();
  const userId = getDevUserId();
  if (!base || !userId) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      headers: { "X-User-Id": userId },
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type ApiProfileStats = {
  bookmarksTotal: number;
  readsTotal: number;
  completedTotal: number;
  totalReadSeconds: number;
  ipsScore: number;
  streakDays: number;
  weekActivity: Array<{ day: string; on: boolean }>;
};

export async function fetchProfileStats(): Promise<ApiProfileStats | null> {
  const res = await fetchAuthed(`/v1/profile/stats`);
  if (!res || !res.ok) return null;
  return (await res.json()) as ApiProfileStats;
}
