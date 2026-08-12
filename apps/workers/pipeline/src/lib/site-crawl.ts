/**
 * Обход сайта клиента — чистая часть (спека «база знаний по ссылке» §4).
 *
 * Здесь нет сети: только чтение чужих правил, разбор карты сайта, сбор ссылок
 * и отбор страниц. Загрузка живёт в `fetch-article.ts`, где собрана вся защита
 * адреса, — и это единственное место, откуда сервер ходит наружу.
 *
 * 🔴 Мы обходим ЧУЖОЙ сайт, пусть и принадлежащий клиенту. Отсюда две
 * обязанности: уважать `robots.txt` и не брать больше, чем нужно.
 */

/** Как мы представляемся сайту — та же строка, что в заголовке запроса. */
export const CRAWLER_AGENT = "ProAgentAI";

/** Потолок страниц за обход. Без него один сайт съест и время, и деньги. */
export const MAX_PAGES = 12;

/**
 * Сколько текста со страницы уходит агенту (решение владельца 12.08).
 *
 * `fetchArticle` отдаёт до 24 000 знаков, и при 12 страницах это 288 000 в один
 * промпт — больше 100 тысяч токенов на вход. «О компании», «услуги» и «цены»
 * выкладывают суть в первых абзацах, а хвост страницы — отзывы, повторы и
 * подвал. Платить за хвост значит платить за воду.
 */
export const PAGE_TEXT_LIMIT = 6000;

/* ── robots.txt ──────────────────────────────────────────────────────────── */

export type RobotsRules = {
  allow: string[];
  disallow: string[];
  sitemaps: string[];
};

/**
 * Разобрать `robots.txt`.
 *
 * Группы адресуются `User-agent`, и наша группа сильнее общей: сайт может
 * закрыться от всех, но открыться нам, и наоборот. Читать только `*` значит
 * либо лезть, куда не звали, либо не брать разрешённое.
 *
 * `Sitemap` — запись общая для файла, а не для группы, поэтому собирается
 * отовсюду.
 */
export function parseRobots(text: string, agent: string = CRAWLER_AGENT): RobotsRules {
  const groups = new Map<string, { allow: string[]; disallow: string[] }>();
  const sitemaps: string[] = [];

  let current: string[] = [];
  // Подряд идущие User-agent относятся к ОДНОМУ блоку правил ниже; первая
  // директива после них начинает новый блок.
  let collectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = (rawLine.split("#")[0] ?? "").trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (key === "user-agent") {
      if (!collectingAgents) {
        current = [];
        collectingAgents = true;
      }
      if (value) current.push(value.toLowerCase());
      continue;
    }

    if (key !== "allow" && key !== "disallow") continue;
    collectingAgents = false;
    // Пустой `Disallow:` — это «можно всё», а не запрет пустого пути.
    if (!value) continue;

    for (const a of current) {
      const group = groups.get(a) ?? { allow: [], disallow: [] };
      if (key === "allow") group.allow.push(value);
      else group.disallow.push(value);
      groups.set(a, group);
    }
  }

  const own = groups.get(agent.toLowerCase());
  const common = groups.get("*");
  const chosen = own ?? common ?? { allow: [], disallow: [] };
  return { allow: chosen.allow, disallow: chosen.disallow, sitemaps };
}

/**
 * Совпало ли правило с путём.
 *
 * Поддержаны две подстановки из стандарта: `*` — любой кусок, `$` в конце —
 * точное совпадение. Так написана половина настоящих `robots.txt`
 * (`Disallow: /*?utm`), и прочитать звёздочку буквально значит пойти ровно
 * туда, куда сайт просил не ходить.
 */
function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split("*");

  let pos = 0;
  for (const [i, part] of parts.entries()) {
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    if (part === "") continue;
    const at = path.indexOf(part, pos);
    if (at === -1) return false;
    pos = at + part.length;
  }

  // `$` требует, чтобы путь на этом и кончился — кроме случая, когда правило
  // само заканчивается звёздочкой.
  if (anchored && !body.endsWith("*")) return pos === path.length;
  return true;
}

/** Длина самого точного совпавшего правила; `null` — не совпало ничего. */
function longestMatch(patterns: readonly string[], path: string): number | null {
  let best: number | null = null;
  for (const p of patterns) {
    if (!ruleMatches(p, path)) continue;
    if (best === null || p.length > best) best = p.length;
  }
  return best;
}

/**
 * Можно ли брать этот путь.
 *
 * Точное правило сильнее общего — так `Allow: /catalog/services` открывает
 * раздел внутри закрытого `Disallow: /catalog`. При равной точности выигрывает
 * разрешение: запрет должен быть заявлен точнее, чем разрешение, чтобы закрыть.
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const denied = longestMatch(rules.disallow, path);
  if (denied === null) return true;
  const allowed = longestMatch(rules.allow, path);
  return allowed !== null && allowed >= denied;
}

/* ── sitemap.xml ─────────────────────────────────────────────────────────── */

/**
 * Разобрать карту сайта.
 *
 * 🔴 Индекс карт и сама карта — разные документы с одинаковым тегом `<loc>`.
 * Спутать их значит уйти с пустыми руками там, где страниц больше всего:
 * крупные сайты кладут в корень именно индекс.
 */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs: string[] = [];
  for (const m of xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const value = (m[1] ?? "").trim();
    if (value) locs.push(value);
  }
  if (locs.length === 0) return { urls: [], sitemaps: [] };

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

/* ── ссылки с главной ────────────────────────────────────────────────────── */

/** Не страницы: файлы и ресурсы, из которых текста не достать. */
const FILE_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|rtf|csv|zip|rar|7z|gz|jpe?g|png|gif|svg|webp|avif|ico|bmp|mp[34]|m4a|mov|avi|mkv|css|js|json|xml|rss)$/i;

/**
 * Собрать ссылки страницы.
 *
 * 🔴 Работает по СЫРОМУ html, а не по тексту: `extractText` вырезает `<nav>`,
 * `<header>` и `<footer>` — ровно ту разметку, где живут ссылки на «услуги» и
 * «цены». Через текст карту сайта не построить.
 *
 * Берём только свой хост: мы обходим сайт клиента, а не интернет.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/gi)) {
    const raw = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    // Якорь — не новая страница, а место на этой же.
    if (!raw || raw.startsWith("#")) continue;

    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    if (FILE_EXT.test(url.pathname)) continue;

    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  return out;
}

/* ── отбор страниц ───────────────────────────────────────────────────────── */

export type PageCandidate = { url: string; title?: string };

/**
 * Что ищем, в порядке ценности для базы знаний.
 *
 * Русские и латинские написания равноправны: половина сайтов малого бизнеса
 * живёт на `/uslugi`, вторая на `/services`, и обе — одно и то же.
 */
const PRIORITY: ReadonlyArray<{ weight: number; re: RegExp }> = [
  {
    weight: 100,
    re: /(^|[/\-_])(about|o-?nas|o-?kompanii|company|about-?us)([/\-_?]|$)|о\s?компании|о\s?нас/i,
  },
  {
    weight: 90,
    re: /(^|[/\-_])(services?|uslugi|products?|produkty|catalog|katalog|tovary)([/\-_?]|$)|услуг|продукт|каталог/i,
  },
  {
    weight: 80,
    re: /(^|[/\-_])(price|prices|pricing|prays|tarif|tarify|stoimost)([/\-_?]|$)|цен|тариф|стоимост|прайс/i,
  },
  {
    weight: 70,
    re: /(^|[/\-_])(cases?|keysy|portfolio|projects?|proekty|works?|raboty)([/\-_?]|$)|кейс|портфолио|проект|наши\s?работ/i,
  },
  { weight: 60, re: /(^|[/\-_])(faq|voprosy|questions?)([/\-_?]|$)|вопрос|отвечаем/i },
  {
    weight: 50,
    re: /(^|[/\-_])(delivery|dostavka|oplata|payment|garanti|warranty)([/\-_?]|$)|доставк|оплат|гаранти/i,
  },
  { weight: 40, re: /(^|[/\-_])(contacts?|kontakty)([/\-_?]|$)|контакт|реквизит/i },
];

/** Главная всегда идёт первой: там короткий рассказ о бизнесе целиком. */
const HOME_WEIGHT = 120;

function scorePage(page: PageCandidate): number {
  let path = page.url;
  try {
    const u = new URL(page.url);
    if (u.pathname === "/" && !u.search) return HOME_WEIGHT;
    path = decodeURIComponent(u.pathname + u.search);
  } catch {
    /* адрес разберёт вызывающий; здесь просто ищем по строке */
  }

  // Адрес и заголовок проверяем ПОРОЗНЬ, а не одной склеенной строкой: правила
  // опираются на конец строки («/price», а не «/prices-old»), и приклеенный
  // заголовок этот конец бы отодвинул.
  const title = page.title?.trim();
  for (const { weight, re } of PRIORITY) {
    if (re.test(path) || (title !== undefined && title !== "" && re.test(title))) return weight;
  }
  return 0;
}

/**
 * Отобрать страницы под обход: сначала ценные, всего не больше потолка.
 *
 * Порядок равных сохраняется — так порядок карты сайта остаётся видимым, а не
 * перемешивается сортировкой.
 */
export function selectPages(pages: readonly PageCandidate[], limit: number = MAX_PAGES): string[] {
  const seen = new Set<string>();
  const unique: PageCandidate[] = [];
  for (const p of pages) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    unique.push(p);
  }

  return unique
    .map((page, index) => ({ page, index, weight: scorePage(page) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.page.url);
}

/** Обрезать текст страницы до бюджета входа (§5.1 спеки). */
export function capPageText(text: string): string {
  return text.length > PAGE_TEXT_LIMIT ? text.slice(0, PAGE_TEXT_LIMIT) : text;
}
