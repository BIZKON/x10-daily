import { describe, expect, it } from "vitest";
import {
  PAGE_TEXT_LIMIT,
  capPageText,
  extractLinks,
  isPathAllowed,
  parseRobots,
  parseSitemap,
  selectPages,
} from "../src/lib/site-crawl";

/**
 * Обход сайта клиента — чистая часть (спека «база знаний по ссылке» §4, §5.1).
 *
 * Здесь ровно то, что можно проверить без сети: чтение `robots.txt`, разбор
 * карты сайта, сбор ссылок с главной, отбор страниц и потолок входа. Загрузка
 * проверяется отдельно — в `fetch-article.test.ts`, где живёт защита адреса.
 */

describe("parseRobots — читаем чужие правила, а не игнорируем", () => {
  it("берёт запреты группы «для всех»", () => {
    const r = parseRobots("User-agent: *\nDisallow: /admin\nDisallow: /cart\n");
    expect(r.disallow).toEqual(["/admin", "/cart"]);
  });

  it("🔴 наша группа сильнее общей: правила для ProAgentAI перекрывают «*»", () => {
    // Сайт может закрыть от всех, но открыть нам — и наоборот. Читать надо
    // адресованное нам, иначе мы либо лезем куда не звали, либо не берём
    // разрешённое.
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: ProAgentAI\nDisallow: /private\n",
    );
    expect(r.disallow).toEqual(["/private"]);
  });

  it("находит карты сайта в любой группе и в любом регистре", () => {
    const r = parseRobots(
      "sitemap: https://veles.ru/sitemap.xml\nUser-agent: *\nSitemap: https://veles.ru/news.xml\n",
    );
    expect(r.sitemaps).toEqual(["https://veles.ru/sitemap.xml", "https://veles.ru/news.xml"]);
  });

  it("пустой Disallow значит «можно всё» и в список не попадает", () => {
    const r = parseRobots("User-agent: *\nDisallow:\n");
    expect(r.disallow).toEqual([]);
  });

  it("комментарии и мусорные строки не ломают разбор", () => {
    const r = parseRobots("# карта\nUser-agent: *\nDisallow: /tmp # временное\nЧто-то не то\n");
    expect(r.disallow).toEqual(["/tmp"]);
  });

  it("пустой файл не запрещает ничего", () => {
    expect(parseRobots("").disallow).toEqual([]);
    expect(parseRobots("").sitemaps).toEqual([]);
  });
});

describe("isPathAllowed — поведение запрета, а не наличие строки", () => {
  it("запрещённый раздел закрыт вместе с вложенным", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin\n");
    expect(isPathAllowed(rules, "/admin")).toBe(false);
    expect(isPathAllowed(rules, "/admin/users")).toBe(false);
  });

  it("соседний раздел с похожим началом остаётся открытым", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /price-list\n");
    expect(isPathAllowed(rules, "/prices")).toBe(true);
  });

  it("🔴 Disallow: / закрывает сайт целиком", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n");
    expect(isPathAllowed(rules, "/")).toBe(false);
    expect(isPathAllowed(rules, "/about")).toBe(false);
  });

  it("🔴 звёздочка в правиле — это подстановка, а не буква", () => {
    // Так пишут половина реальных robots.txt: `Disallow: /*?` закрывает всё с
    // параметрами. Прочитать звёздочку буквально значит пойти туда, куда сайт
    // явно просил не ходить.
    const rules = parseRobots("User-agent: *\nDisallow: /*?utm\n");
    expect(isPathAllowed(rules, "/about?utm_source=vk")).toBe(false);
    expect(isPathAllowed(rules, "/about")).toBe(true);
  });

  it("доллар в конце правила означает точное совпадение", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /search$\n");
    expect(isPathAllowed(rules, "/search")).toBe(false);
    expect(isPathAllowed(rules, "/search-engine-optimizaciya")).toBe(true);
  });

  it("Allow точнее Disallow — исключение работает", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /catalog\nAllow: /catalog/services\n");
    expect(isPathAllowed(rules, "/catalog/tovar")).toBe(false);
    expect(isPathAllowed(rules, "/catalog/services")).toBe(true);
  });
});

describe("parseSitemap", () => {
  it("достаёт адреса страниц", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://veles.ru/about</loc></url><url><loc>https://veles.ru/price</loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://veles.ru/about", "https://veles.ru/price"]);
  });

  it("🔴 индекс карт отдаёт вложенные карты, а не страницы", () => {
    // Крупные сайты кладут в корень именно индекс. Спутать одно с другим значит
    // уйти с пустыми руками там, где страниц больше всего.
    const xml =
      "<sitemapindex><sitemap><loc>https://veles.ru/sitemap-pages.xml</loc></sitemap></sitemapindex>";
    const r = parseSitemap(xml);
    expect(r.sitemaps).toEqual(["https://veles.ru/sitemap-pages.xml"]);
    expect(r.urls).toEqual([]);
  });

  it("переносы и пробелы внутри loc не мешают", () => {
    const xml = "<urlset><url><loc>\n  https://veles.ru/about\n </loc></url></urlset>";
    expect(parseSitemap(xml).urls).toEqual(["https://veles.ru/about"]);
  });

  it("мусор вместо xml не роняет разбор", () => {
    expect(parseSitemap("<html>404</html>")).toEqual({ urls: [], sitemaps: [] });
  });
});

describe("extractLinks — то, что extractText намеренно выбрасывает", () => {
  const BASE = "https://veles.ru/";

  it("собирает ссылки меню, приводя их к полному адресу", () => {
    // 🔴 Ссылки живут в <nav>, а extractText вырезает его вместе с меню.
    // Поэтому карта сайта из ссылок строится по СЫРОМУ html.
    const html = `<nav><a href="/about">О компании</a><a href="services">Услуги</a></nav>`;
    expect(extractLinks(html, BASE)).toEqual([
      "https://veles.ru/about",
      "https://veles.ru/services",
    ]);
  });

  it("🔴 чужие хосты не берём: обходим сайт клиента, а не интернет", () => {
    const html = `<a href="https://vk.com/veles">ВК</a><a href="/price">Цены</a>`;
    expect(extractLinks(html, BASE)).toEqual(["https://veles.ru/price"]);
  });

  it("якорь на ту же страницу — не новая страница", () => {
    const html = `<a href="/about">О нас</a><a href="/about#team">Команда</a><a href="#top">Наверх</a>`;
    expect(extractLinks(html, BASE)).toEqual(["https://veles.ru/about"]);
  });

  it("файлы и не-http схемы отсеиваются", () => {
    const html = `<a href="/dogovor.pdf">Договор</a><a href="/logo.png">Лого</a>
      <a href="mailto:a@veles.ru">Почта</a><a href="tel:+74951234567">Телефон</a>
      <a href="javascript:void(0)">Меню</a><a href="/contacts">Контакты</a>`;
    expect(extractLinks(html, BASE)).toEqual(["https://veles.ru/contacts"]);
  });

  it("повторы схлопываются", () => {
    const html = `<a href="/price">Цены</a><a href="/price">Прайс</a><a href='/price'>Тарифы</a>`;
    expect(extractLinks(html, BASE)).toEqual(["https://veles.ru/price"]);
  });
});

describe("selectPages — потолок обязателен, порядок осмыслен", () => {
  it("🔴 больше 12 страниц не берём ни при каких условиях", () => {
    // Без потолка один крупный сайт съест и время, и деньги клиента.
    const many = Array.from({ length: 40 }, (_, i) => ({ url: `https://veles.ru/p${i}` }));
    expect(selectPages(many)).toHaveLength(12);
  });

  it("нужные разделы идут вперёд случайных", () => {
    const picked = selectPages([
      { url: "https://veles.ru/blog/post-17" },
      { url: "https://veles.ru/price" },
      { url: "https://veles.ru/about" },
    ]);
    expect(picked.slice(0, 2)).toEqual(["https://veles.ru/about", "https://veles.ru/price"]);
  });

  it("заголовок тоже считается признаком: /o-nas с заголовком «Цены» поднимется", () => {
    const picked = selectPages([
      { url: "https://veles.ru/page/42" },
      { url: "https://veles.ru/page/7", title: "Цены и тарифы" },
    ]);
    expect(picked[0]).toBe("https://veles.ru/page/7");
  });

  it("латинские и русские адреса разделов равноправны", () => {
    const picked = selectPages([
      { url: "https://veles.ru/blog/1" },
      { url: "https://veles.ru/uslugi" },
      { url: "https://veles.ru/services" },
    ]);
    expect(picked.slice(0, 2)).toContain("https://veles.ru/uslugi");
    expect(picked.slice(0, 2)).toContain("https://veles.ru/services");
  });

  it("главная берётся всегда, даже без ключевых слов", () => {
    const picked = selectPages([{ url: "https://veles.ru/blog/1" }, { url: "https://veles.ru/" }]);
    expect(picked[0]).toBe("https://veles.ru/");
  });

  it("повторы не занимают места в потолке", () => {
    const picked = selectPages([
      { url: "https://veles.ru/about" },
      { url: "https://veles.ru/about" },
    ]);
    expect(picked).toEqual(["https://veles.ru/about"]);
  });
});

describe("capPageText — бюджет ВХОДА, решение 12.08", () => {
  it("потолок страницы — 6 000 знаков", () => {
    expect(PAGE_TEXT_LIMIT).toBe(6000);
  });

  it("🔴 длинная страница режется: 12 страниц по 24 000 знаков не влезут в промпт", () => {
    const long = "а".repeat(20_000);
    expect(capPageText(long)).toHaveLength(PAGE_TEXT_LIMIT);
  });

  it("короткая страница не трогается", () => {
    expect(capPageText("Коротко о компании")).toBe("Коротко о компании");
  });
});
