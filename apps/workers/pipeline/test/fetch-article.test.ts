import { describe, expect, it, vi } from "vitest";
import { checkUrlShape, extractText, fetchArticle } from "../src/lib/fetch-article";

/**
 * Загрузка материала по ссылке — второй вход конвейера.
 *
 * 🔴 Это единственное место, где сервер идёт по адресу из пользовательского
 * ввода, поэтому первым делом проверяется НЕ извлечение текста, а то, что
 * запрос не уйдёт во внутреннюю сеть.
 */

describe("checkUrlShape — что отсекаем до всякой сети", () => {
  it("обычная ссылка проходит", () => {
    const r = checkUrlShape("https://example.com/post");
    expect(r.ok).toBe(true);
  });

  it("не-ссылка отклоняется с человеческим объяснением", () => {
    const r = checkUrlShape("просто текст");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("https://");
  });

  it("🔴 file:// и другие схемы не пропускаем", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/x", "gopher://a"]) {
      expect(checkUrlShape(u).ok).toBe(false);
    }
  });

  it("🔴 localhost по имени отсекается сразу", () => {
    for (const u of ["http://localhost:8080/", "http://api.localhost/", "http://db.internal/"]) {
      expect(checkUrlShape(u).ok).toBe(false);
    }
  });
});

describe("fetchArticle — защита от обращений во внутреннюю сеть", () => {
  /** Сеть не должна дёргаться вовсе: адрес отсекается раньше. */
  function forbiddenFetch() {
    return vi.fn(async () => {
      throw new Error("сеть не должна была вызываться");
    }) as unknown as typeof fetch;
  }

  it("🔴 адрес в приватной сети не запрашивается", async () => {
    // 10.0.0.1 — частная сеть. Именно так выглядит попытка достать наш
    // собственный api или базу через поле «вставьте ссылку».
    const f = forbiddenFetch();
    const r = await fetchArticle("http://10.0.0.1/secret", f);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("🔴 метаданные облака (169.254.169.254) недоступны", async () => {
    const f = forbiddenFetch();
    const r = await fetchArticle("http://169.254.169.254/latest/meta-data/", f);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("🔴 петля 127.0.0.1 недоступна", async () => {
    const f = forbiddenFetch();
    expect((await fetchArticle("http://127.0.0.1:3001/", f)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("🔴 редирект во внутреннюю сеть обрывается", async () => {
    // Самая коварная форма: первый адрес публичный, а уводит внутрь. Поэтому
    // редиректы разбираются вручную и КАЖДЫЙ хоп проверяется заново.
    let hop = 0;
    const f = vi.fn(async () => {
      hop++;
      return new Response(null, { status: 302, headers: { location: "http://192.168.1.1/admin" } });
    }) as unknown as typeof fetch;

    const r = await fetchArticle("https://example.com/redirect", f);
    expect(r.ok).toBe(false);
    // Первый запрос ушёл (адрес публичный), второй — уже нет.
    expect(hop).toBe(1);
  });
});

describe("fetchArticle — обычная работа", () => {
  function htmlFetch(html: string, type = "text/html; charset=utf-8") {
    return vi.fn(async () =>
      new Response(html, { status: 200, headers: { "content-type": type } }),
    ) as unknown as typeof fetch;
  }

  const LONG = "Внедрение ИИ сократило сверку остатков с четырёх часов до двадцати минут. ".repeat(6);

  it("достаёт заголовок и текст статьи", async () => {
    const r = await fetchArticle(
      "https://example.com/a",
      htmlFetch(`<html><head><title>Склад считает сам</title></head><body><article><p>${LONG}</p></article></body></html>`),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.title).toBe("Склад считает сам");
      expect(r.text).toContain("сократило сверку");
    }
  });

  it("🔴 страница без текста → честный отказ, а не пустой материал", async () => {
    // Так выглядят соцсети и видео: разметка есть, текста нет.
    const r = await fetchArticle(
      "https://example.com/reel",
      htmlFetch("<html><head><title>Reel</title></head><body><div id=app></div></body></html>"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("текст");
  });

  it("не-HTML отклоняется", async () => {
    const r = await fetchArticle("https://example.com/f.pdf", htmlFetch("%PDF-1.7", "application/pdf"));
    expect(r.ok).toBe(false);
  });

  it("ошибка сервера возвращается с кодом", async () => {
    const f = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const r = await fetchArticle("https://example.com/none", f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("404");
  });
});

describe("extractText", () => {
  it("выкидывает скрипты и стили", () => {
    const { text } = extractText(
      "<body><script>alert('x')</script><style>.a{}</style><p>Живой текст</p></body>",
    );
    expect(text).toContain("Живой текст");
    expect(text).not.toContain("alert");
    expect(text).not.toContain(".a{}");
  });

  it("предпочитает article навигации и подвалу", () => {
    const long = "Полезная фактура про автоматизацию склада и цифры внедрения. ".repeat(10);
    const { text } = extractText(
      `<body><nav>Меню Каталог Контакты</nav><article><p>${long}</p></article><footer>Все права</footer></body>`,
    );
    expect(text).toContain("Полезная фактура");
    expect(text).not.toContain("Все права");
  });

  it("разворачивает html-сущности и не склеивает абзацы", () => {
    const { text } = extractText("<body><p>Первый&nbsp;абзац</p><p>Второй &amp; третий</p></body>");
    expect(text).toContain("Первый абзац");
    expect(text).toContain("Второй & третий");
    expect(text.split("\n").filter(Boolean).length).toBeGreaterThan(1);
  });
});
