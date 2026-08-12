import { describe, expect, it, vi } from "vitest";
import { crawlSite } from "../src/lib/crawl-site";
import type { FetchArticleResult, FetchRawResult } from "../src/lib/fetch-article";

/**
 * Обход сайта клиента целиком (спека «база знаний по ссылке» §4).
 *
 * Загрузчики внедряются, поэтому здесь проверяется ПОВЕДЕНИЕ обхода, а не
 * проводка: закрытый robots останавливает обход до единого запроса страницы,
 * потолок соблюдается, отсев объясняется человеку.
 */

const SITE = "https://veles.ru";

function raw(map: Record<string, string>) {
  return vi.fn(async (url: string): Promise<FetchRawResult> => {
    const body = map[url];
    if (body === undefined) return { ok: false, reason: "Страница ответила ошибкой 404" };
    return { ok: true, url, body, contentType: "text/plain" };
  });
}

function pages(map: Record<string, string>) {
  return vi.fn(async (url: string): Promise<FetchArticleResult> => {
    const text = map[url];
    if (text === undefined) return { ok: false, reason: "На странице не нашлось текста." };
    return { ok: true, url, title: `Заголовок ${url}`, text };
  });
}

const LONG = "Возим сборные грузы по России между 42 городами. ".repeat(5);

describe("crawlSite — чужие правила сильнее нашего желания", () => {
  it("🔴 сайт, закрытый от роботов, не читается вовсе", async () => {
    // Проверяем поведение: ни одного запроса страницы. Тест «в коде вызвана
    // проверка robots» подтвердил бы и вывернутый наизнанку смысл.
    const fetchArticle = pages({ [`${SITE}/about`]: LONG });
    const r = await crawlSite(SITE, {
      fetchRaw: raw({ [`${SITE}/robots.txt`]: "User-agent: *\nDisallow: /\n" }),
      fetchArticle,
      sleep: async () => {},
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/робот/i);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it("🔴 запрещённый раздел не запрашивается, разрешённый читается", async () => {
    // Личный кабинет закрыт от роботов — туда не должно уйти ни одного запроса,
    // даже если он лежит в карте сайта.
    const fetchArticle = pages({
      [`${SITE}/`]: LONG,
      [`${SITE}/about`]: LONG,
      [`${SITE}/lk`]: LONG,
    });
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/robots.txt`]:
          "User-agent: *\nDisallow: /lk\nSitemap: https://veles.ru/sitemap.xml\n",
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/about</loc></url><url><loc>${SITE}/lk</loc></url></urlset>`,
      }),
      fetchArticle,
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages.map((p) => p.url)).toContain(`${SITE}/about`);
    expect(fetchArticle).not.toHaveBeenCalledWith(`${SITE}/lk`);
  });

  it("главная читается всегда: там рассказ о бизнесе целиком", async () => {
    // Карта сайта её часто не перечисляет, а это лучшая единственная страница.
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/price</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/`]: LONG, [`${SITE}/price`]: LONG }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages.map((p) => p.url)).toContain(`${SITE}/`);
  });

  it("отсутствие robots.txt не мешает обходу", async () => {
    // 404 на robots — обычное дело у маленьких сайтов, и это «можно всё».
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/about</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: LONG }),
      sleep: async () => {},
    });
    expect(r.ok).toBe(true);
  });
});

describe("crawlSite — откуда берётся карта страниц", () => {
  it("карта из robots.txt важнее догадки про /sitemap.xml", async () => {
    const fetchRaw = raw({
      [`${SITE}/robots.txt`]: "Sitemap: https://veles.ru/sitemap-main.xml\n",
      [`${SITE}/sitemap-main.xml`]: `<urlset><url><loc>${SITE}/price</loc></url></urlset>`,
    });
    const r = await crawlSite(SITE, {
      fetchRaw,
      fetchArticle: pages({ [`${SITE}/price`]: LONG }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages[0]?.url).toBe(`${SITE}/price`);
  });

  it("🔴 индекс карт разворачивается: иначе страниц не будет вовсе", async () => {
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<sitemapindex><sitemap><loc>${SITE}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
        [`${SITE}/sitemap-pages.xml`]: `<urlset><url><loc>${SITE}/about</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: LONG }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages.map((p) => p.url)).toEqual([`${SITE}/about`]);
  });

  it("нет карты — берём ссылки с главной", async () => {
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/`]: `<html><nav><a href="/about">О компании</a><a href="https://vk.com/veles">ВК</a></nav></html>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: LONG, [`${SITE}/`]: LONG }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages.map((p) => p.url)).toContain(`${SITE}/about`);
  });
});

describe("crawlSite — потолки и отчёт человеку", () => {
  it("🔴 больше 12 страниц не читаем ни при каких условиях", async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `${SITE}/p${i}`);
    const fetchArticle = pages({
      ...Object.fromEntries(urls.map((u) => [u, LONG])),
      [`${SITE}/`]: LONG,
    });
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`,
      }),
      fetchArticle,
      sleep: async () => {},
    });

    expect(fetchArticle).toHaveBeenCalledTimes(12);
    if (r.ok) expect(r.pages).toHaveLength(12);
  });

  it("🔴 текст страницы режется бюджетом входа", async () => {
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/about</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: "а".repeat(20_000) }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages[0]?.text).toHaveLength(6000);
  });

  it("страница без текста попадает в отчёт с причиной, а не исчезает", async () => {
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/about</loc></url><url><loc>${SITE}/video</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: LONG }),
      sleep: async () => {},
    });

    expect(r.ok).toBe(true);
    const skipped = r.log.find((p) => p.url === `${SITE}/video`);
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.reason).toMatch(/текст/i);
  });

  it("🔴 ни одной читаемой страницы — честный отказ, а не пустой прогон агента", async () => {
    // Иначе агент получит пустой вход, потратит деньги и вернёт выдумку.
    const r = await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/video</loc></url></urlset>`,
      }),
      fetchArticle: pages({}),
      sleep: async () => {},
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/текст/i);
  });

  it("между запросами делается пауза — обход не должен выглядеть атакой", async () => {
    const sleep = vi.fn(async () => {});
    await crawlSite(SITE, {
      fetchRaw: raw({
        [`${SITE}/sitemap.xml`]: `<urlset><url><loc>${SITE}/about</loc></url><url><loc>${SITE}/price</loc></url></urlset>`,
      }),
      fetchArticle: pages({ [`${SITE}/about`]: LONG, [`${SITE}/price`]: LONG }),
      sleep,
    });

    expect(sleep).toHaveBeenCalled();
  });

  it("совсем пустой сайт объясняется человеком понятной причиной", async () => {
    const r = await crawlSite(SITE, {
      fetchRaw: raw({}),
      fetchArticle: pages({}),
      sleep: async () => {},
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
  });
});
