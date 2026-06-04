import Parser from "rss-parser";

/**
 * Нормализованный item из RSS-фида — формат под payload для
 * `source.item.received` (см. apps/workers/pipeline/src/events.ts).
 * Generic: один и тот же парсер для любого RSS-источника (vc.ru, РБК,
 * Коммерсантъ, Forbes, Habr, …) — источник задаётся URL'ом.
 */
export interface NormalizedItem {
  /** RSS guid или link если guid отсутствует. */
  externalId: string;
  title: string;
  /** Plain-text без HTML (rss-parser contentSnippet или ручной strip). */
  text: string;
  url: string;
  /** ISO-8601. Null если pubDate не задан. */
  publishedAt: string | null;
}

export const VC_RSS_URL = "https://vc.ru/rss";

const HTML_TAG_RE = /<[^>]+>/g;
const WS_RE = /\s+/g;

function stripHtml(s: string): string {
  return s.replace(HTML_TAG_RE, " ").replace(WS_RE, " ").trim();
}

/**
 * Fetch + parse произвольного RSS-фида.
 *
 * @param rssUrl — URL фида (обязателен; источники берутся из таблицы `sources`).
 * @param opts.fetchImpl — fetch-инжекция для тестов (mock RSS body без сети).
 */
export async function fetchRss(
  rssUrl: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<NormalizedItem[]> {
  const url = rssUrl;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;

  const res = await fetchFn(url, {
    headers: {
      "User-Agent": "x10-daily-ingest/0.1 (+https://x10.media)",
      Accept: "application/rss+xml, application/xml; q=0.9, */*; q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`RSS fetch failed (${url}): ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const parser = new Parser();
  const feed = await parser.parseString(xml);

  const out: NormalizedItem[] = [];
  for (const item of feed.items) {
    const externalId = item.guid ?? item.link ?? "";
    const title = (item.title ?? "").trim();
    const link = (item.link ?? "").trim();
    if (!externalId || !title || !link) continue;

    const rawText = item.contentSnippet ?? (item.content ? stripHtml(item.content) : "") ?? title;
    const text = rawText.trim() || title;

    let publishedAt: string | null = null;
    if (item.isoDate) {
      publishedAt = item.isoDate;
    } else if (item.pubDate) {
      const d = new Date(item.pubDate);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    out.push({ externalId, title, text, url: link, publishedAt });
  }
  return out;
}
