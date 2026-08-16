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

/** Рубрикатор ProAgent AI (Р4): news — дефолт «Новости ИИ». */
export type ApiCategory = "news" | "cases" | "howto" | "tools" | "business" | "founder";
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

export async function fetchArticleUserState(articleId: string): Promise<ApiArticleUserState> {
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

export async function postBookmark(articleId: string): Promise<ApiBookmarkResponse | null> {
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

/* ── Партнёрская программа (спека 14.08) ─────────────────────────────────── */

export type ApiPartnerProgram = {
  partnerRatePercent: number;
  mentorRatePercent: number;
  mentorMonths: number;
  terms: string[];
};

export type ApiPartnerDeal = {
  id: string;
  clientName: string;
  package: "manual" | "line";
  amountRub: number;
  paidRub: number;
  ratePercent: number;
  status: string;
  installments: number;
  /** Ссылка, которую партнёр отдаёт клиенту. Одна на весь заказ. */
  payUrl: string | null;
  /** Срок второй части рассрочки. Появляется после первой оплаты. */
  nextDueAt: string | null;
  signedAt: string | null;
  createdAt: string;
};

export type ApiPartnerCabinet = {
  partner: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    ratePercent: number;
    hasMentor: boolean;
    joinedAt: string | null;
    /** Ссылка в мини-апп: презентация продукта, подписанная партнёром. */
    promoUrl: string | null;
    promoWebUrl: string | null;
    kpUrl: string | null;
  };
  balance: { accruedRub: number; paidRub: number; dueRub: number };
  program: ApiPartnerProgram;
  deals: ApiPartnerDeal[];
  accruals: Array<{
    id: string;
    amountRub: number;
    level: number;
    reason: string;
    ratePercent: number;
    createdAt: string | null;
  }>;
  payouts: Array<{ id: string; amountRub: number; paidAt: string | null; method: string | null }>;
  invited: Array<{ id: string; name: string; joinedAt: string | null; soldRub: number }>;
};

/**
 * Условия программы плюс «участвую ли я».
 *
 * `null` — раздел в этом экземпляре выключен или человек не вошёл. Экран тогда
 * просто не показывает партнёрский блок: у клиента завода нашей программы быть
 * не должно.
 */
export async function fetchPartnerProgram(): Promise<{
  program: ApiPartnerProgram;
  isPartner: boolean;
  status: string | null;
} | null> {
  const res = await fetchAuthed("/v1/partner/program");
  if (!res || !res.ok) return null;
  return (await res.json()) as {
    program: ApiPartnerProgram;
    isPartner: boolean;
    status: string | null;
  };
}

/** Кабинет партнёра. `null` — не партнёр либо раздел выключен. */
export async function fetchPartnerCabinet(): Promise<ApiPartnerCabinet | null> {
  const res = await fetchAuthed("/v1/partner/me");
  if (!res || !res.ok) return null;
  return (await res.json()) as ApiPartnerCabinet;
}

/** Заводит клиента на оплату. Возвращает ссылку либо текст ошибки. */
export async function createPartnerOrder(body: {
  clientName: string;
  clientContact?: string;
  package: "manual" | "line";
  installments: number;
}): Promise<{ payUrl: string; dealNo: number; firstPaymentRub: number } | { error: string }> {
  const res = await postAuthed("/v1/partner/deals", body);
  if (!res) return { error: "Нет связи с сервером. Попробуйте ещё раз." };
  const data = (await res.json().catch(() => null)) as {
    payUrl?: string;
    dealNo?: number;
    firstPaymentRub?: number;
    message?: string;
    error?: string;
  } | null;

  if (!res.ok || !data?.payUrl) {
    return { error: data?.message ?? data?.error ?? `Ошибка ${res.status}` };
  }
  return {
    payUrl: data.payUrl,
    dealNo: data.dealNo ?? 0,
    firstPaymentRub: data.firstPaymentRub ?? 0,
  };
}

/** Регистрация в программе. Возвращает текст ошибки или null при успехе. */
export async function joinPartnerProgram(ref?: string): Promise<string | null> {
  const res = await postAuthed("/v1/partner/join", ref ? { ref } : {});
  if (!res) return "Нет связи с сервером. Попробуйте ещё раз.";
  if (res.ok) return null;
  try {
    const j = (await res.json()) as { message?: string; error?: string };
    return j.message ?? j.error ?? `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

/* ── Страница оплаты (спека 7) ────────────────────────────────────────────── */

export type ApiPayOrder = {
  dealNo: number;
  clientName: string;
  state: "awaiting" | "partially_paid" | "paid" | "cancelled";
  package: { key: string; title: string; summary: string; includes: readonly string[] };
  amountRub: number;
  paidRub: number;
  dueNowRub: number;
  installments: number;
  nextDueAt: string | null;
  payerKind: "individual" | "company" | null;
  payerName: string | null;
  payerEmail: string | null;
  seller: {
    legalName: string;
    shortName: string;
    inn: string;
    ogrnip: string;
    phone: string;
    email: string;
    vatNote: string;
  };
  cardAvailable: boolean;
};

/**
 * Заказ по коду ссылки. Без сессии: платит клиент, входа по Telegram у него нет.
 *
 * `null` — код неизвестен или api недоступен. Страница в обоих случаях говорит
 * одно и то же: ссылка не открылась, напишите тому, кто её прислал. Разница
 * между «нет заказа» и «нет связи» посторонему человеку ничего не даёт.
 */
export async function fetchPayOrder(token: string): Promise<ApiPayOrder | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/pay/${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiPayOrder;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Публичный POST страницы оплаты. Ответ отдаём как есть — форма разберёт. */
export async function postPay(
  token: string,
  path: "start" | "company",
  body: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = getBaseUrl();
  if (!base) return { ok: false, status: 0, data: null };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/pay/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(t);
  }
}

export type ApiInvoice = {
  bankConfigured: boolean;
  dealNo: number;
  issuedAt: string;
  seller: {
    legalName: string;
    shortName: string;
    inn: string;
    ogrnip: string;
    phone: string;
    email: string;
    vatNote: string;
    address: string;
    bank: { name: string; bik: string; account: string; corrAccount: string } | null;
  };
  buyer: { name: string; inn: string | null; kpp: string | null; address: string | null };
  item: { description: string; amountRub: number };
  amountRub: number;
  paidRub: number;
  dueNowRub: number;
  dueInWords: string;
  installments: number;
  nextDueAt: string | null;
  vatNote: string;
};

/** Данные счёта на оплату. `null` — код неизвестен или api недоступен. */
export async function fetchInvoice(token: string): Promise<ApiInvoice | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/pay/${encodeURIComponent(token)}/invoice`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiInvoice;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ── Презентация по ссылке партнёра (16.08.2026) ──────────────────────────── */

export type ApiPromoPartner = {
  name: string;
  contact: string | null;
  /** Полное КП партнёра: тот же домен, тот же webview. */
  kpUrl: string;
};

/**
 * Кто рекомендует продукт. `null` — слаг неизвестен, участие приостановлено
 * или api недоступен: презентация тогда показывается без подписи.
 */
export async function fetchPromoPartner(slug: string): Promise<ApiPromoPartner | null> {
  const base = getBaseUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/partner/public/${encodeURIComponent(slug)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiPromoPartner;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
