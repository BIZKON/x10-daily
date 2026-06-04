/**
 * HTTP-клиент к admin API (apps/api). Server-side only.
 *
 * Env: X10_API_BASE_URL — тот же что в miniapp. Локально http://localhost:8788.
 */

const TIMEOUT_MS = 5000;

export type AdminCategory = "taxes" | "money" | "practice" | "power" | "tech" | "rybakov";
export type AdminTemplate = "card-news" | "deep-dive" | "daily-take" | "guide" | "digest";

export type QueueItem = {
  id: string;
  slug: string;
  section: "main" | "numbers" | "people" | "playbook" | "weekend" | "longread" | "newsletter";
  category: AdminCategory;
  subcategory: string | null;
  template: AdminTemplate;
  tags: string[];
  tease: string;
  lede: string;
  wordCount: number;
  readSeconds: number;
  createdAt: string;
  scoreTotal: number | null;
  scoreVerdict: string | null;
  factcheckStatus: "passed" | "review-needed" | "halt" | null;
};

export type QueueResponse = {
  items: QueueItem[];
  count: number;
};

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "numbers"; items: Array<{ label: string; value: string; source?: string }> }
  | { type: "quote"; text: string; attribution: string }
  | { type: "callout"; kind: "why" | "yes-but" | "what-next" | "big-picture"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export type ArticleDetail = {
  id: string;
  slug: string;
  section: string;
  category: AdminCategory;
  subcategory: string | null;
  template: AdminTemplate;
  tags: string[];
  coverImageUrl: string | null;
  status: string;
  tease: string;
  lede: string;
  whyItMatters: string | null;
  body: ArticleBlock[];
  wordCount: number;
  readSeconds: number;
  citations: Array<{ url: string; title: string; publisher: string; publishedAt?: string }>;
  publishedAt: string | null;
  createdAt: string;
  metadata: {
    brevity?: { beforeWords: number; afterWords: number; cuts: string[] };
    score?: {
      total: number;
      verdict: string;
      breakdown: {
        hookStrength: number;
        voiceMatch: number;
        valueDensity: number;
        structureFormat: number;
        publishReadiness: number;
      };
      fixes: Array<{ criterion: string; issue: string; suggestion: string }>;
    };
    hooks?: Array<{ pattern: string; text: string; reasoning: string }>;
    social?: {
      channel: string;
      framework: string;
      post: string;
      hookLine: string;
      twistLine: string | null;
      wordCount: number;
      lineCount: number;
    };
    factcheck?: {
      status: "passed" | "review-needed" | "halt";
      haltReason: string | null;
      claims: Array<{
        claim: string;
        location: string;
        verdict: string;
        confidence: string;
        rationale: string;
      }>;
    } | null;
    totalCostUsd?: number;
  } | null;
};

function getBaseUrl(): string | null {
  const url = process.env.X10_API_BASE_URL;
  if (!url || url.trim() === "") {
    // HIGH-5: hard-fail в prod если URL не задан — иначе admin молча
    // включает demo mode, редактор видит mock data, mutations silently fail.
    // В dev/preview/test возвращаем null → demo fallback.
    // NEXT_PHASE guard: во время `next build` (Docker/Timeweb — бэкенда нет)
    // НЕ кидаем, иначе пререндер статичной /_not-found/шелла падает. Реальные
    // данные тянутся динамически в рантайме; рантайм-защита HIGH-5 цела
    // (NEXT_PHASE при serve не задан).
    if (
      process.env.NODE_ENV === "production" &&
      process.env.X10_DEMO !== "1" &&
      process.env.NEXT_PHASE !== "phase-production-build"
    ) {
      throw new Error(
        "X10_API_BASE_URL is required in production. Set it in Vercel env. " +
          "Чтобы явно включить demo mode в prod (для preview-deploy без backend) — задай X10_DEMO=1.",
      );
    }
    return null;
  }
  return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Demo mode — true когда нет X10_API_BASE_URL.
 * Используется для рендера DemoBanner и для fallback в каждом fetcher.
 *
 * NEXT_PHASE guard: во время `next build` (Docker/Timeweb — бэкенда нет)
 * возвращаем false, чтобы mock-fetchers не запускались. Иначе их Date.now()
 * запекается в prerender (Cache Components Next 16 это запрещает: «used
 * Date.now() before accessing uncached data»). На билде fetchers вернут null,
 * страницы отрендерят ApiUnavailable — статично. В рантайме (NEXT_PHASE при
 * serve не задан) demo mode работает как прежде.
 */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  return getBaseUrl() === null;
}

export type QueueFilter = {
  category?: AdminCategory;
  subcategory?: string;
};

export async function fetchQueue(
  limit = 50,
  filter: QueueFilter = {},
): Promise<QueueResponse | null> {
  const base = getBaseUrl();
  if (!base) {
    const { MOCK_QUEUE } = await import("./mocks");
    let items = MOCK_QUEUE.items;
    if (filter.category) items = items.filter((i) => i.category === filter.category);
    if (filter.subcategory) items = items.filter((i) => i.subcategory === filter.subcategory);
    return { items: items.slice(0, limit), count: items.length };
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter.category) params.set("category", filter.category);
  if (filter.subcategory) params.set("subcategory", filter.subcategory);
  try {
    const res = await fetchWithTimeout(`${base}/v1/admin/queue?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as QueueResponse;
  } catch {
    return null;
  }
}

export async function fetchArticleDetail(id: string): Promise<ArticleDetail | null> {
  const base = getBaseUrl();
  if (!base) {
    const { findMockArticleDetail } = await import("./mocks");
    return findMockArticleDetail(id) ?? null;
  }
  try {
    const res = await fetchWithTimeout(`${base}/v1/admin/article/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as ArticleDetail;
  } catch {
    return null;
  }
}

export async function publishArticle(
  id: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const base = getBaseUrl();
  if (!base) return { ok: false, error: "X10_API_BASE_URL не задан" };
  try {
    const res = await fetchWithTimeout(`${base}/v1/admin/publish/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    const data = (await res.json()) as { status?: string; error?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.error ?? data.message ?? `HTTP ${res.status}` };
    return { ok: true, status: data.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/* ----------------------------------------------------------------
 * Content sources (Этап 3e) — list-страницы используют существующие public GET endpoints.
 * CRUD POST/PATCH/DELETE на /v1/admin/* реализуют create/edit формы (следующий заход).
 * ---------------------------------------------------------------- */

export type AdminAuthor = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatarUrl: string | null;
  bylineColor: string | null;
  isStaff: boolean;
  isFlagship: boolean;
  subscriberCount: number;
};

export type AdminKlamp = {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  leadName: string;
  memberCount: number;
  isOpen: boolean;
  meetingSchedule: string;
  description: string;
  goal: string | null;
};

export type AdminEvent = {
  id: string;
  slug: string;
  title: string;
  type: "kod-x10" | "meet-up" | "breakfast" | "festival" | "webinar";
  startDate: string;
  endDate: string | null;
  city: string | null;
  isOnline: boolean;
  organizer: string;
  ticketPriceFrom: number | null;
  registeredCount: number;
  capacity: number | null;
  seatsLeft: number | null;
};

export type AdminDigest = {
  id: string;
  issueDate: string;
  intro: string;
  topArticleIds: string[];
  tomorrow: string | null;
  sentAt: string | null;
};

/* ----------------------------------------------------------------
 * Pipeline config — 12 агентов из @x10/db agentKind enum.
 * confidenceThreshold приходит как numeric(4,3) string ("0.700"),
 * UI парсит parseFloat при отображении.
 * ---------------------------------------------------------------- */

export type PipelineAgent =
  | "ingest"
  | "draft"
  | "numbers"
  | "factcheck"
  | "tov"
  | "brevity"
  | "audio"
  | "hookgen"
  | "social"
  | "visual"
  | "score"
  | "newsletter";

export const PIPELINE_AGENTS: readonly PipelineAgent[] = [
  "ingest",
  "draft",
  "numbers",
  "factcheck",
  "tov",
  "brevity",
  "audio",
  "hookgen",
  "social",
  "visual",
  "score",
  "newsletter",
] as const;

export type AdminPipelineConfig = {
  agent: PipelineAgent;
  enabled: boolean;
  modelOverride: string | null;
  /** numeric(4,3) string из БД. parseFloat при отображении. */
  confidenceThreshold: string;
};

async function getJson<T>(path: string): Promise<T | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchAdminAuthors(): Promise<{ items: AdminAuthor[] } | null> {
  const real = await getJson<{ items: AdminAuthor[] }>("/v1/authors?limit=100");
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_AUTHORS } = await import("./mocks");
  return { items: MOCK_AUTHORS };
}

export async function fetchAdminKlamps(): Promise<{ items: AdminKlamp[] } | null> {
  const real = await getJson<{ items: AdminKlamp[] }>("/v1/community/klamps?limit=200");
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_KLAMPS } = await import("./mocks");
  return { items: MOCK_KLAMPS };
}

export async function fetchAdminEvents(
  scope: "upcoming" | "all" = "all",
): Promise<{ items: AdminEvent[] } | null> {
  const real = await getJson<{ items: AdminEvent[] }>(`/v1/events?scope=${scope}&limit=100`);
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_EVENTS } = await import("./mocks");
  const now = Date.now();
  const items =
    scope === "upcoming"
      ? MOCK_EVENTS.filter((e) => new Date(e.startDate).getTime() >= now)
      : MOCK_EVENTS;
  return { items };
}

/**
 * GET /v1/digests/latest — у нас нет публичного списка digests; для admin
 * пока показываем только последний отправленный. Полный список добавим
 * когда понадобится историчность.
 */
export async function fetchAdminLatestDigest(): Promise<AdminDigest | null> {
  const real = await getJson<AdminDigest>("/v1/digests/latest");
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_DIGEST_LATEST } = await import("./mocks");
  return MOCK_DIGEST_LATEST;
}

/* ----------------------------------------------------------------
 * Mutations (Этап 3f) — generic helper для POST/PATCH/DELETE.
 * Auth: session cookie x10_session → Authorization Bearer (HIGH-2).
 * Cookie выставляется через /login (TG Widget или dev-login).
 * ---------------------------------------------------------------- */

import { getSessionToken } from "./session";

export type MutationResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export async function adminMutate<T = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<MutationResult<T>> {
  const base = getBaseUrl();
  if (!base) return { ok: false, error: "X10_API_BASE_URL не задан" };
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Сессия не установлена. Войдите через /login." };
  try {
    const res = await fetchWithTimeout(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string; message?: string };
        err = j.error ?? j.message ?? err;
      } catch {}
      return { ok: false, error: err, status: res.status };
    }
    // DELETE может вернуть пустой ответ — обрабатываем.
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Fetch single author by slug — для edit-form. */
export async function fetchAdminAuthorBySlug(
  slug: string,
): Promise<{ author: AdminAuthor } | null> {
  const real = await getJson<{ author: AdminAuthor }>(
    `/v1/authors/${encodeURIComponent(slug)}?articlesLimit=0`,
  );
  if (real) return real;
  if (!isDemoMode()) return null;
  const { findMockAuthor } = await import("./mocks");
  const author = findMockAuthor(slug);
  return author ? { author } : null;
}

/** Fetch single klamp by slug — для edit-form. */
export async function fetchAdminKlampBySlug(slug: string): Promise<AdminKlamp | null> {
  const real = await getJson<AdminKlamp>(`/v1/community/klamps/${encodeURIComponent(slug)}`);
  if (real) return real;
  if (!isDemoMode()) return null;
  const { findMockKlamp } = await import("./mocks");
  return findMockKlamp(slug) ?? null;
}

/** Fetch single event by slug — для edit-form. */
export async function fetchAdminEventBySlug(slug: string): Promise<AdminEvent | null> {
  const real = await getJson<AdminEvent>(`/v1/events/${encodeURIComponent(slug)}`);
  if (real) return real;
  if (!isDemoMode()) return null;
  const { findMockEvent } = await import("./mocks");
  return findMockEvent(slug) ?? null;
}

/** Fetch single digest by date — для edit-form. */
export async function fetchAdminDigestByDate(date: string): Promise<AdminDigest | null> {
  const real = await getJson<AdminDigest>(`/v1/digests/${encodeURIComponent(date)}`);
  if (real) return real;
  if (!isDemoMode()) return null;
  const { findMockDigest } = await import("./mocks");
  return findMockDigest(date) ?? null;
}

/* ----------------------------------------------------------------
 * Pipeline config fetchers.
 * ---------------------------------------------------------------- */

/** Список всех 12 агентов с effective config. Backend всегда возвращает 12. */
export async function fetchAdminPipelineConfigs(): Promise<{
  items: AdminPipelineConfig[];
} | null> {
  const real = await getJson<{ items: AdminPipelineConfig[] }>("/v1/admin/pipeline-config");
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_PIPELINE_CONFIGS } = await import("./mocks");
  return { items: MOCK_PIPELINE_CONFIGS };
}

/** Single config для edit-формы. Backend всегда 200 (дефолты если не сохранён). */
export async function fetchAdminPipelineConfigByAgent(
  agent: PipelineAgent,
): Promise<AdminPipelineConfig | null> {
  const real = await getJson<AdminPipelineConfig>(
    `/v1/admin/pipeline-config/${encodeURIComponent(agent)}`,
  );
  if (real) return real;
  if (!isDemoMode()) return null;
  const { MOCK_PIPELINE_CONFIGS } = await import("./mocks");
  return MOCK_PIPELINE_CONFIGS.find((c) => c.agent === agent) ?? null;
}

/* ----------------------------------------------------------------
 * $-дашборд автономного конвейера (session 20) — агрегаты pipeline_runs.
 * Endpoint role-gated (EDITOR_ROLES) → форвардим session-токен (как adminMutate).
 * ---------------------------------------------------------------- */

export type PipelineRunStats = {
  budget: {
    capUsd: number;
    warnUsd: number;
    todaySpendUsd: number;
    todayRuns: number;
    pct: number;
  };
  byAgent: Array<{ agent: PipelineAgent; runs: number; spendUsd: number }>;
  series7d: Array<{ day: string; spendUsd: number; runs: number }>;
  gateToday: { accepted: number; skipped: number };
  recent: Array<{
    agent: PipelineAgent;
    status: string;
    costUsd: number;
    modelUsed: string | null;
    articleId: string | null;
    createdAt: string;
  }>;
  alertsToday: Array<{ kind: "warn" | "exhausted"; spendUsd: number; createdAt: string }>;
};

/* ----------------------------------------------------------------
 * Стоп-кран автопостинга (session 20) — ручная пауза + тихие часы (МСК).
 * Endpoint role-gated → форвардим session-токен.
 * ---------------------------------------------------------------- */

export type PostingControl = {
  paused: boolean;
  quietEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  updatedAt: string;
  /** Вычисляется бэкендом: на паузе ли конвейер прямо сейчас. */
  currentlyPaused: boolean;
  pauseReason: "manual" | "quiet-hours" | null;
  mskHour: number;
};

export async function fetchPostingControl(): Promise<PostingControl | null> {
  const base = getBaseUrl();
  if (!base) {
    if (!isDemoMode()) return null;
    const { MOCK_POSTING_CONTROL } = await import("./mocks");
    return MOCK_POSTING_CONTROL;
  }
  const token = await getSessionToken();
  try {
    const res = await fetchWithTimeout(`${base}/v1/admin/posting-control`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as PostingControl;
  } catch {
    return null;
  }
}

export async function fetchPipelineRunStats(): Promise<PipelineRunStats | null> {
  const base = getBaseUrl();
  if (!base) {
    if (!isDemoMode()) return null;
    const { MOCK_PIPELINE_RUN_STATS } = await import("./mocks");
    return MOCK_PIPELINE_RUN_STATS;
  }
  // Endpoint требует EDITOR_ROLES → форвардим session cookie как Bearer.
  const token = await getSessionToken();
  try {
    const res = await fetchWithTimeout(`${base}/v1/admin/pipeline-runs/stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as PipelineRunStats;
  } catch {
    return null;
  }
}
