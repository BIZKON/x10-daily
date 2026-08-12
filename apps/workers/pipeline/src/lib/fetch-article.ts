import { lookup } from "node:dns/promises";

/**
 * Загрузка материала по ссылке, которую дал человек (пункт 1 плана 09.08.2026).
 *
 * 🔴 Это ЕДИНСТВЕННОЕ место во всей системе, где сервер ходит по адресу из
 * пользовательского ввода. Отсюда две обязанности, которых нет у RSS-загрузки:
 *
 * 1. **Не пустить запрос во внутреннюю сеть.** Без проверки клиент, вставивший
 *    `http://169.254.169.254/` или `http://localhost:8080/`, заставил бы наш
 *    сервер сходить к метаданным облака или к собственному api и вернуть ответ
 *    себе в кабинет. Проверяем КАЖДЫЙ адрес после резолва DNS, включая адреса
 *    редиректов: доменное имя может указывать на 127.0.0.1.
 * 2. **Не дать себя заткнуть.** Ограничены время, объём и число редиректов —
 *    иначе одна ссылка на бесконечный поток вешает воркер.
 */

/** Сколько ждём ответ. Живая страница отдаётся за секунды. */
const TIMEOUT_MS = 12_000;
/** Больше — не статья, а файл. Читаем поток и обрываем на пороге. */
const MAX_BYTES = 3_000_000;
/** Цепочка редиректов: обычной статье хватает трёх. */
const MAX_REDIRECTS = 3;
/** Сколько текста отдаём агенту. Дальше — вода, а токены платные. */
const MAX_TEXT_CHARS = 24_000;

export type FetchArticleResult =
  | { ok: true; url: string; title: string; text: string }
  | { ok: false; reason: string };

/** Ответ как есть: тело и его тип. Разбирает вызывающий. */
export type FetchRawResult =
  | { ok: true; url: string; body: string; contentType: string }
  | { ok: false; reason: string };

/** Приватные и служебные диапазоны IPv4 — сюда наш сервер ходить не должен. */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // метаданные облака
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast и выше
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:10.0.0.1) — проверяем как IPv4.
  const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m?.[1]) return isPrivateIPv4(m[1]);
  return false;
}

/**
 * Адрес безопасен? Резолвим ВСЕ записи домена: одна публичная и одна приватная
 * в ответе — повод отказать целиком, а не выбирать удобную.
 */
async function isSafeHost(hostname: string): Promise<boolean> {
  try {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((r) =>
      r.family === 6 ? !isPrivateIPv6(r.address) : !isPrivateIPv4(r.address),
    );
  } catch {
    return false;
  }
}

/** Проверка адреса без сети: схема и отсутствие явных localhost-имён. */
export function checkUrlShape(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      reason: "Это не похоже на ссылку. Скопируйте адрес целиком, вместе с https://",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Поддерживаются только ссылки http и https" };
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, reason: "Такой адрес недоступен" };
  }
  return { ok: true, url };
}

/**
 * Достать читаемый текст из HTML без внешних библиотек.
 *
 * Намеренно простой разбор: выкидываем скрипты, стили и разметку, берём
 * `<article>` или `<main>`, если они есть. Идеальной чистоты не даёт и не
 * должен — агенту нужен смысл, а не вёрстка.
 *
 * ⚠️ Страницы, которые рисуют текст скриптом (Instagram, TikTok), отдадут
 * пустоту. Это ограничение честно возвращается наверх, а не маскируется.
 */
export function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]
    ? decodeEntities(stripTags(titleMatch[1])).trim().slice(0, 200)
    : "";

  let body = html;
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (article?.[1] && article[1].length > 400) body = article[1];
  else if (main?.[1] && main[1].length > 400) body = main[1];

  const text = decodeEntities(
    stripTags(
      body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(
          /<(?:nav|header|footer|aside|form)[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi,
          " ",
        )
        // Блочные теги → перенос строки, иначе абзацы слипнутся в одну простыню.
        .replace(/<\/(?:p|div|li|h[1-6]|br|tr)>/gi, "\n"),
    ),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text: text.slice(0, MAX_TEXT_CHARS) };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

/**
 * Загрузить адрес и вернуть тело как есть.
 *
 * 🔴 ЕДИНСТВЕННОЕ место, где сервер ходит наружу по пользовательскому адресу.
 * Обёрток над ним две — `fetchArticle` (страница для человека) и `fetchRaw`
 * (служебные файлы сайта), — но проверка адреса у них одна на двоих. Второй
 * загрузчик со своей проверкой означал бы, что защиту однажды починят в одном
 * месте из двух.
 *
 * Редиректы разбираем ВРУЧНУЮ (`redirect: "manual"`): при автоматическом
 * следовании проверка адреса сработала бы только на первом хопе, а второй мог
 * бы увести во внутреннюю сеть.
 */
async function fetchSafely(
  rawUrl: string,
  opts: { fetchImpl: typeof fetch; maxBytes: number; accept: string },
): Promise<FetchRawResult> {
  const shape = checkUrlShape(rawUrl);
  if (!shape.ok) return shape;

  let current = shape.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeHost(current.hostname))) {
      return { ok: false, reason: "Такой адрес недоступен" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await opts.fetchImpl(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Честно представляемся: скрываться под видом браузера — плохая
          // практика и повод для блокировки со стороны сайта.
          "User-Agent": "ProAgentAI/1.0 (+https://pro-agent-ai.ru)",
          Accept: opts.accept,
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Страница не ответила вовремя"
          : "Не удалось открыть ссылку";
      return { ok: false, reason: msg };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "Страница переадресует в никуда" };
      try {
        current = new URL(loc, current);
      } catch {
        return { ok: false, reason: "Страница переадресует на некорректный адрес" };
      }
      const next = checkUrlShape(current.toString());
      if (!next.ok) return next;
      continue;
    }

    if (!res.ok) {
      return { ok: false, reason: `Страница ответила ошибкой ${res.status}` };
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > opts.maxBytes) return { ok: false, reason: "Страница слишком большая" };

    return {
      ok: true,
      url: current.toString(),
      body: (await res.text()).slice(0, opts.maxBytes),
      contentType: res.headers.get("content-type") ?? "",
    };
  }
  return { ok: false, reason: "Слишком много переадресаций" };
}

/** Загрузить страницу и вернуть её текст. */
export async function fetchArticle(
  rawUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<FetchArticleResult> {
  const res = await fetchSafely(rawUrl, {
    fetchImpl,
    maxBytes: MAX_BYTES,
    accept: "text/html,application/xhtml+xml",
  });
  if (!res.ok) return res;

  if (!res.contentType.includes("html") && !res.contentType.includes("text/plain")) {
    return { ok: false, reason: "По ссылке не страница с текстом" };
  }

  const { title, text } = extractText(res.body);
  if (text.length < 200) {
    return {
      ok: false,
      reason:
        "На странице не нашлось текста. Так бывает у соцсетей и видео — там текст рисуется скриптом. Пришлите ссылку на статью или сам текст.",
    };
  }
  return { ok: true, url: res.url, title, text };
}

/**
 * Загрузить служебный файл сайта: `robots.txt`, `sitemap.xml` или разметку
 * главной ради ссылок.
 *
 * Отличий от `fetchArticle` ровно два, и оба обязательны для обхода: тип
 * содержимого не сужается до html (карта сайта — это `application/xml`) и нет
 * порога «мало текста» (нормальный `robots.txt` короче 200 знаков).
 */
export async function fetchRaw(
  rawUrl: string,
  opts: { fetchImpl?: typeof fetch; maxBytes?: number } = {},
): Promise<FetchRawResult> {
  return fetchSafely(rawUrl, {
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    maxBytes: opts.maxBytes ?? MAX_BYTES,
    accept: "text/plain,application/xml,text/xml,text/html;q=0.9",
  });
}
