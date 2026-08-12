import type { KbImportPage } from "@x10/db";
import type { FetchArticleResult, FetchRawResult } from "./fetch-article";
import {
  MAX_PAGES,
  type PageCandidate,
  capPageText,
  extractLinks,
  isPathAllowed,
  parseRobots,
  parseSitemap,
  selectPages,
} from "./site-crawl";

/**
 * Обход сайта клиента: от одного адреса до текстов страниц (спека §4).
 *
 * Загрузчики приходят снаружи — не ради «чистоты», а потому что иначе это
 * поведение нечем проверить: тест обязан доказать, что закрытый `robots.txt`
 * останавливает обход ДО единого запроса страницы, а не что в коде есть строка
 * про robots.
 *
 * 🔴 Мы ходим по чужому сайту. Отсюда три ограничения, каждое обязательное:
 * уважаем запреты, держим потолок страниц и делаем паузу между запросами.
 */

/** Пауза между запросами: обход не должен выглядеть атакой. */
const PAUSE_MS = 400;

export type CrawledPage = { url: string; title?: string; text: string };

export type CrawlSiteResult =
  | { ok: true; pages: CrawledPage[]; log: KbImportPage[] }
  | { ok: false; reason: string; log: KbImportPage[] };

export type CrawlDeps = {
  fetchRaw: (url: string) => Promise<FetchRawResult>;
  fetchArticle: (url: string) => Promise<FetchArticleResult>;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Путь с параметрами — правила robots пишутся именно про него. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

function sameHost(url: string, base: URL): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}

export async function crawlSite(
  siteUrl: string,
  deps: CrawlDeps,
  limit: number = MAX_PAGES,
): Promise<CrawlSiteResult> {
  const log: KbImportPage[] = [];
  const sleep = deps.sleep ?? defaultSleep;

  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return { ok: false, reason: "Это не похоже на адрес сайта.", log };
  }
  const origin = base.origin;

  // ── 1. Чужие правила ───────────────────────────────────────────────────
  // Отсутствие robots.txt — это «можно всё», обычное дело у малых сайтов.
  const robotsRes = await deps.fetchRaw(`${origin}/robots.txt`);
  const robots = parseRobots(robotsRes.ok ? robotsRes.body : "");

  if (!isPathAllowed(robots, "/")) {
    return {
      ok: false,
      reason:
        "Сайт закрыт от роботов в файле robots.txt — читать его мы не станем. Добавьте материалы вручную или откройте доступ.",
      log,
    };
  }

  // ── 2. Карта страниц ───────────────────────────────────────────────────
  // Карта из robots.txt важнее догадки: сайт сам говорит, где она лежит.
  const sitemapUrls = robots.sitemaps.length > 0 ? robots.sitemaps : [`${origin}/sitemap.xml`];
  const candidates: PageCandidate[] = [{ url: `${origin}/` }];
  const seenSitemaps = new Set<string>();

  // Индекс карт разворачиваем на один уровень: этого хватает всем обычным
  // сайтам, а глубже начинается обход ради обхода.
  const queue = [...sitemapUrls];
  while (queue.length > 0 && seenSitemaps.size < 5) {
    const next = queue.shift();
    if (!next || seenSitemaps.has(next)) continue;
    seenSitemaps.add(next);

    const res = await deps.fetchRaw(next);
    if (!res.ok) continue;
    const parsed = parseSitemap(res.body);
    for (const u of parsed.urls) candidates.push({ url: u });
    if (seenSitemaps.size < 3) queue.push(...parsed.sitemaps.slice(0, 3));
  }

  // ── 3. Нет карты — ссылки с главной ────────────────────────────────────
  if (candidates.length === 1) {
    const home = await deps.fetchRaw(`${origin}/`);
    if (home.ok) {
      for (const link of extractLinks(home.body, `${origin}/`)) candidates.push({ url: link });
    }
  }

  const allowed = candidates.filter(
    (c) => sameHost(c.url, base) && isPathAllowed(robots, pathOf(c.url)),
  );
  const targets = selectPages(allowed, limit);

  // ── 4. Страницы ────────────────────────────────────────────────────────
  const pages: CrawledPage[] = [];
  for (const [i, url] of targets.entries()) {
    if (i > 0) await sleep(PAUSE_MS);

    const res = await deps.fetchArticle(url);
    if (!res.ok) {
      // Отсев объясняем человеку: «почему система не нашла мои цены» — вопрос,
      // на который экран обязан отвечать без похода в логи.
      log.push({ url, status: "skipped", reason: res.reason });
      continue;
    }

    const text = capPageText(res.text);
    pages.push({ url: res.url, title: res.title || undefined, text });
    log.push({ url: res.url, title: res.title || undefined, status: "read", chars: text.length });
  }

  if (pages.length === 0) {
    return {
      ok: false,
      reason:
        "На страницах сайта не нашлось текста. Так бывает, когда сайт рисуется скриптом или состоит из картинок. Добавьте материалы вручную.",
      log,
    };
  }

  return { ok: true, pages, log };
}
