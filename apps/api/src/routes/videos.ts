import { Hono } from "hono";
import type { AppEnv } from "../app";

/**
 * Videos — лента видео с YouTube-канала «Игорь Рыбаков» (RSS, без API-ключа).
 *
 * GET /v1/videos — последние видео канала.
 *
 * Источник: youtube.com/feeds/videos.xml?channel_id=... Парсим Atom regex'ом
 * (RSS машинно-генерируемый и стабильный) — без новой зависимости. VM достаёт
 * YouTube (проверено: 200/0.3s). Не персистим: RSS — источник правды, miniapp
 * кэширует через "use cache". Сбой/пусто → {items:[]} (честный empty-state).
 */

/** Официальный канал «Игорь Рыбаков» (~2.5M подписчиков). */
const YOUTUBE_CHANNEL_ID = "UCdOUvNFp8y6KTkswzeu7naQ";
const YOUTUBE_RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
const FETCH_TIMEOUT_MS = 8000;

export type VideoItem = {
  youtubeId: string;
  title: string;
  /** Реальный URL (youtube.com/watch?v=… или /shorts/…). */
  url: string;
  /** Канонический thumbnail (всегда существует для валидного id). */
  thumbnailUrl: string;
  publishedAt: string;
  isShort: boolean;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#x27|apos);/g, (m) => ENTITIES[m] ?? m).trim();
}

/**
 * Парсит YouTube Atom-фид в список видео. Экспортируется для теста.
 * Берёт ТОЛЬКО содержимое <entry> (channel-level <title> игнорируется).
 */
export function parseYoutubeFeed(xml: string): VideoItem[] {
  const out: VideoItem[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1] ?? "";
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1]?.trim();
    if (!id) continue;
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? "");
    const href = /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/.exec(e)?.[1]?.trim();
    const published = /<published>([^<]+)<\/published>/.exec(e)?.[1]?.trim() ?? "";
    const url = href ?? `https://www.youtube.com/watch?v=${id}`;
    out.push({
      youtubeId: id,
      title: title || "Видео",
      url,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: published,
      isShort: url.includes("/shorts/"),
    });
  }
  return out;
}

async function fetchYoutubeFeed(): Promise<VideoItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(YOUTUBE_RSS_URL, {
      signal: ctrl.signal,
      headers: { "user-agent": "x10-daily/1.0" },
    });
    if (!res.ok) return [];
    return parseYoutubeFeed(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export const videosRoute = new Hono<AppEnv>().get("/", async (c) => {
  const items = await fetchYoutubeFeed();
  return c.json({ items: items.slice(0, 24), generatedAt: new Date().toISOString() });
});
