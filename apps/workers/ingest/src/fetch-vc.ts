import Parser from "rss-parser";

/**
 * Нормализованный item из vc.ru RSS — формат под `inngest_items` row +
 * payload для `source.item.received` (см. apps/workers/pipeline/src/events.ts).
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
 * Fetch + parse RSS-фида vc.ru.
 *
 * @param opts.rssUrl — переопределение URL (для тестов / альтернативных fed'ов того же издателя).
 * @param opts.fetchImpl — fetch-инжекция для тестов (mock RSS body без сети).
 */
export async function fetchVcRss(
  opts: { rssUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<NormalizedItem[]> {
  const url = opts.rssUrl ?? VC_RSS_URL;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;

  const res = await fetchFn(url, {
    headers: {
      "User-Agent": "x10-daily-ingest/0.1 (+https://x10.media)",
      Accept: "application/rss+xml, application/xml; q=0.9, */*; q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`vc.ru RSS fetch failed: ${res.status} ${res.statusText}`);
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

    const rawText =
      item.contentSnippet ??
      (item.content ? stripHtml(item.content) : "") ??
      title;
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
