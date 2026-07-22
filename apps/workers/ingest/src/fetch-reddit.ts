import type { NormalizedItem } from "./fetch-rss";

/**
 * Reddit-адаптер через официальный OAuth (application-only, client_credentials).
 *
 * Зачем не generic RSS: анонимный `reddit.com/r/…/.rss` 429-ит datacenter-IP
 * (проверено с прод-VM). OAuth даёт лимит по КЛИЕНТУ (~100 QPM), не по IP →
 * работает с облака. Токен app-only (без юзера) — читаем публичные сабреддиты,
 * ПДн не собираем (152-ФЗ-нейтрально). Креды: «script»/«web» app на
 * reddit.com/prefs/apps → REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET.
 *
 * Пустые креды → fetchReddit бросает RedditNotConfigured; ingest ловит per-source
 * (изоляция) и скипает — reddit-источники активируются только с задаными кредами.
 */
export interface RedditCreds {
  clientId: string;
  clientSecret: string;
  /** Reddit ТРЕБУЕТ уникальный описательный UA (иначе 429/403). */
  userAgent: string;
}

export class RedditNotConfiguredError extends Error {
  constructor() {
    super("REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET не заданы — reddit-адаптер выключен");
    this.name = "RedditNotConfiguredError";
  }
}

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";
const DEFAULT_LIMIT = 25;
const VALID_SORTS = new Set(["top", "hot", "new", "rising", "controversial"]);

/** Кэш app-only токена (модульный — переживает вызовы в рамках процесса воркера). */
let tokenCache: { token: string; expiresAtMs: number } | null = null;

/** Только для тестов — сбросить кэш токена между кейсами. */
export function _resetRedditTokenCache(): void {
  tokenCache = null;
}

async function getAppToken(
  creds: RedditCreds,
  fetchFn: typeof fetch,
  nowMs: number,
): Promise<string> {
  // Свежий токен с запасом 60с до истечения.
  if (tokenCache && tokenCache.expiresAtMs > nowMs + 60_000) return tokenCache.token;

  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": creds.userAgent,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`reddit token fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("reddit token response без access_token");
  tokenCache = {
    token: json.access_token,
    expiresAtMs: nowMs + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

/**
 * Разбирает сохранённый url источника (`…/r/NAME/top/.rss?t=week`) в параметры
 * OAuth-запроса. Устойчиво к вариациям: sort по умолчанию top, t по умолчанию week.
 */
export function parseRedditUrl(url: string): { subreddit: string; sort: string; t: string } {
  const sub = url.match(/\/r\/([A-Za-z0-9_]+)/);
  if (!sub?.[1]) throw new Error(`reddit url без /r/NAME: ${url}`);
  const sortMatch = url.match(/\/r\/[A-Za-z0-9_]+\/([a-z]+)/);
  const sort = sortMatch?.[1] && VALID_SORTS.has(sortMatch[1]) ? sortMatch[1] : "top";
  const tMatch = url.match(/[?&]t=([a-z]+)/);
  const t = tMatch?.[1] ?? "week";
  return { subreddit: sub[1], sort, t };
}

/**
 * Fetch + normalize листинга сабреддита через OAuth. Формат возврата — тот же
 * NormalizedItem, что у fetchRss, поэтому downstream (dedup/simhash/emit) не меняется.
 */
export async function fetchReddit(
  url: string,
  creds: RedditCreds | null | undefined,
  opts: { fetchImpl?: typeof fetch; nowMs?: number } = {},
): Promise<NormalizedItem[]> {
  if (!creds?.clientId || !creds?.clientSecret) throw new RedditNotConfiguredError();
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const nowMs = opts.nowMs ?? Date.now();

  const token = await getAppToken(creds, fetchFn, nowMs);
  const { subreddit, sort, t } = parseRedditUrl(url);
  const api = `${API_BASE}/r/${subreddit}/${sort}?t=${t}&limit=${DEFAULT_LIMIT}&raw_json=1`;

  const res = await fetchFn(api, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": creds.userAgent },
  });
  if (!res.ok) {
    throw new Error(`reddit listing r/${subreddit} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    data?: { children?: Array<{ data?: RedditPost }> };
  };

  const out: NormalizedItem[] = [];
  for (const child of json.data?.children ?? []) {
    const p = child.data;
    if (!p) continue;
    // t3_<id> — стабильный fullname поста (дедуп-ключ external_id).
    const externalId = p.name ?? (p.id ? `t3_${p.id}` : "");
    const title = (p.title ?? "").trim();
    const link = p.permalink ? `https://www.reddit.com${p.permalink}` : (p.url ?? "");
    if (!externalId || !title || !link) continue;
    const text = (p.selftext ?? "").trim() || title;
    const publishedAt = p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null;
    out.push({ externalId, title, text, url: link, publishedAt });
  }
  return out;
}

interface RedditPost {
  name?: string;
  id?: string;
  title?: string;
  permalink?: string;
  url?: string;
  selftext?: string;
  created_utc?: number;
}
