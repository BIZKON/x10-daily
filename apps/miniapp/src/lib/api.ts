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
  /** Engagement-счётчики из articles row (доступны только в article-detail, не в feed). */
  bookmarkCount: number;
  commentCount: number;
  shareCount: number;
};

function getBaseUrl(): string | null {
  const url = process.env.X10_API_BASE_URL;
  if (!url || url.trim() === "") {
    // HIGH-5: hard-fail в prod — иначе miniapp молча работает на mock-данных
    // из feed.ts, пользователи видят 4 фейковых статьи как реальные.
    // В dev/preview без env остаётся mock fallback (для dev UI без backend).
    // NEXT_PHASE guard: во время `next build` (Docker/Timeweb — бэкенда нет)
    // НЕ кидаем — динамический SSR подтянет реальные данные в рантайме.
    // Рантайм-защита HIGH-5 (NEXT_PHASE при serve не задан) сохраняется.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.X10_DEMO !== "1" &&
      process.env.NEXT_PHASE !== "phase-production-build"
    ) {
      throw new Error(
        "X10_API_BASE_URL is required in production. Set it in Vercel env. " +
          "Чтобы явно включить demo mode в prod (preview-deploy без backend) — задай X10_DEMO=1.",
      );
    }
    return null;
  }
  return url.replace(/\/+$/, "");
}

/**
 * Сконфигурирован ли реальный бэкенд. true → API ожидается (prod): при пустом
 * ответе показываем честный empty-state, НЕ мок. false → dev/demo без бэкенда:
 * можно показать мок-данные для UI. Отличает «бэкенд упал» от «бэкенда нет».
 */
export function isApiConfigured(): boolean {
  return Boolean(process.env.X10_API_BASE_URL && process.env.X10_API_BASE_URL.trim() !== "");
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
 * Daily digest (home-hero) — GET /v1/digests/hero.
 *
 * Бэкенд отдаёт редакционный выпуск, а пока его нет — СИНТЕЗ из реальных
 * топ-статей дня (synthetic:true). topArticles раскрыты — hero рендерится
 * одним запросом. 404 (нет контента) / api down → null → honest fallback.
 * ---------------------------------------------------------------- */

export type ApiDigestArticle = {
  id: string;
  slug: string;
  tease: string;
  lede: string;
  category: ApiCategory;
};

export type ApiDigest = {
  issueDate: string;
  intro: string;
  rybakovTake: { quote: string; context: string } | null;
  premiumTeaser: { title: string; articleId: string } | null;
  tomorrow: string | null;
  sentAt: string | null;
  synthetic: boolean;
  topArticles: ApiDigestArticle[];
};

export async function fetchDigest(): Promise<ApiDigest | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/v1/digests/hero`);
    if (!res.ok) return null;
    return (await res.json()) as ApiDigest;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * Видео — лента YouTube-канала Рыбакова (GET /v1/videos, RSS на бэкенде).
 * ---------------------------------------------------------------- */

export type ApiVideo = {
  youtubeId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShort: boolean;
};

export async function fetchVideos(): Promise<ApiVideo[] | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/v1/videos`);
    if (!res.ok) return null;
    const body = (await res.json()) as { items: ApiVideo[] };
    return body.items;
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
 * Session-based auth (HIGH-2): JWT хранится в HttpOnly cookie x10_session,
 * выпускается через /v1/auth/telegram (real TG) или /v1/auth/dev-login
 * (только NODE_ENV !== "production"). Здесь читаем cookie и шлём Bearer.
 * ---------------------------------------------------------------- */

import { getSessionToken } from "./session";

async function fetchAuthed(path: string): Promise<Response | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const token = await getSessionToken();
  if (!token) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
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

/** Сохранённая статья (закладка) — GET /v1/profile/bookmarks. */
export type ApiBookmarkItem = {
  articleId: string;
  savedAt: string;
  slug: string;
  category: ApiCategory;
  template: ApiTemplate;
  tease: string;
  lede: string;
  readSeconds: number;
  isPaid: boolean;
};

/**
 * Список закладок авторизованного юзера. null → нет auth (гость) / API down /
 * не сконфигурирован; [] → авторизован, но закладок нет. Caller различает.
 */
export async function fetchBookmarks(limit = 50): Promise<ApiBookmarkItem[] | null> {
  const res = await fetchAuthed(`/v1/profile/bookmarks?limit=${limit}`);
  if (!res || !res.ok) return null;
  const body = (await res.json()) as { items: ApiBookmarkItem[]; count: number };
  return body.items;
}

/** Личность авторизованного пользователя — для шапки профиля (GET /v1/auth/me). */
export type ApiMeUser = {
  id: string;
  role: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  locale: string;
};

export async function fetchAuthMe(): Promise<ApiMeUser | null> {
  const res = await fetchAuthed(`/v1/auth/me`);
  if (!res || !res.ok) return null;
  const body = (await res.json()) as { user: ApiMeUser };
  return body.user;
}

/* ----------------------------------------------------------------
 * Настройки профиля (Tier-2): подписки на рубрики + расписание дайджеста.
 * GET /v1/profile/preferences (authed) + PATCH (полный набор).
 * ---------------------------------------------------------------- */

export type ApiDigestSchedule = { morning: boolean; lunch: boolean; evening: boolean };
export type ApiPreferences = {
  subscribedCategories: string[];
  digestSchedule: ApiDigestSchedule;
};

export async function fetchPreferences(): Promise<ApiPreferences | null> {
  const res = await fetchAuthed(`/v1/profile/preferences`);
  if (!res || !res.ok) return null;
  return (await res.json()) as ApiPreferences;
}

export async function patchPreferences(
  body: Partial<ApiPreferences>,
): Promise<ApiPreferences | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const token = await getSessionToken();
  if (!token) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/profile/preferences`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiPreferences;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ----------------------------------------------------------------
 * Article engagement (optimistic UI — brief §11)
 *
 * /me — per-user snapshot для initial state.
 * mutate-helpers — POST'ы, вызываются из Server Actions
 * (apps/miniapp/src/lib/engagement-actions.ts).
 * ---------------------------------------------------------------- */

export type ReactionKind = "fire" | "insight" | "question";

export type ApiArticleUserState = {
  userReactions: { fire: boolean; insight: boolean; question: boolean };
  isBookmarked: boolean;
  readPercent: number;
};

export type ApiReactionResponse = {
  action: "added" | "removed";
  kind: ReactionKind;
  userReacted: boolean;
  reactions: { fire: number; insight: number; question: number };
};

export type ApiBookmarkResponse = {
  action: "added" | "removed";
  isBookmarked: boolean;
  bookmarkCount: number;
};

/** Гостевой default — для случаев когда auth недоступен / api down. */
export const ANONYMOUS_USER_STATE: ApiArticleUserState = {
  userReactions: { fire: false, insight: false, question: false },
  isBookmarked: false,
  readPercent: 0,
};

export async function fetchArticleUserState(
  articleId: string,
): Promise<ApiArticleUserState> {
  const res = await fetchAuthed(`/v1/articles/${encodeURIComponent(articleId)}/me`);
  if (!res || !res.ok) return ANONYMOUS_USER_STATE;
  return (await res.json()) as ApiArticleUserState;
}

async function postAuthed(path: string, body: unknown): Promise<Response | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const token = await getSessionToken();
  if (!token) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function postReaction(
  articleId: string,
  kind: ReactionKind,
): Promise<ApiReactionResponse | null> {
  const res = await postAuthed(`/v1/articles/${encodeURIComponent(articleId)}/reactions`, {
    kind,
  });
  if (!res || !res.ok) return null;
  return (await res.json()) as ApiReactionResponse;
}

export async function postBookmark(
  articleId: string,
): Promise<ApiBookmarkResponse | null> {
  const res = await postAuthed(`/v1/articles/${encodeURIComponent(articleId)}/bookmark`, {});
  if (!res || !res.ok) return null;
  return (await res.json()) as ApiBookmarkResponse;
}

export async function postProgress(
  articleId: string,
  readPercent: number,
  readSeconds?: number,
): Promise<boolean> {
  const res = await postAuthed(`/v1/articles/${encodeURIComponent(articleId)}/progress`, {
    readPercent,
    ...(readSeconds !== undefined ? { readSeconds } : {}),
  });
  return Boolean(res?.ok);
}
