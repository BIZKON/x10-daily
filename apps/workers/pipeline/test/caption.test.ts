import { describe, expect, it } from "vitest";
import { CAPTION_LIMIT, buildPhotoCaption, visibleCaptionLength } from "../src/lib/caption";

const LINK = "https://t.me/bot?startapp=slug";

const SHORT = {
  tease: "Склад считает остатки сам",
  lede: "WMS с ИИ снял ручную сверку и вернул кладовщикам два часа в смену.",
};

describe("buildPhotoCaption — базовая форма", () => {
  it("заголовок жирным, ссылка в конце", () => {
    const { html } = buildPhotoCaption(SHORT, { linkUrl: LINK });
    expect(html).toContain(`<b>${SHORT.tease}</b>`);
    expect(html).toContain(SHORT.lede);
    expect(html.indexOf("<a href=")).toBeGreaterThan(html.indexOf(SHORT.lede));
    expect(html).toContain(`href="${LINK}"`);
  });

  it("plain-вариант без разметки — фолбэк, если Telegram отверг HTML", () => {
    const { plain } = buildPhotoCaption(SHORT, { linkUrl: LINK });
    expect(plain).not.toContain("<b>");
    expect(plain).not.toContain("<a ");
    expect(plain).toContain(SHORT.tease);
    expect(plain).toContain(LINK);
  });

  it("без ссылки не рисует пустой <a>", () => {
    const { html, plain } = buildPhotoCaption(SHORT, { linkUrl: null });
    expect(html).not.toContain("<a ");
    expect(plain).not.toContain("http");
  });
});

describe("buildPhotoCaption — лимит Telegram 1024", () => {
  const LONG_LEDE = "Очень длинная вводка. ".repeat(200);

  it("HTML укладывается в лимит по ВИДИМОЙ длине (теги не считаются)", () => {
    const { html } = buildPhotoCaption({ tease: SHORT.tease, lede: LONG_LEDE }, { linkUrl: LINK });
    expect(visibleCaptionLength(html)).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("plain тоже укладывается в лимит", () => {
    const { plain } = buildPhotoCaption({ tease: SHORT.tease, lede: LONG_LEDE }, { linkUrl: LINK });
    expect(plain.length).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("обрезка идёт по границе слова и ставит многоточие", () => {
    const { html } = buildPhotoCaption(
      { tease: SHORT.tease, lede: `${"слово ".repeat(400)}хвост` },
      { linkUrl: LINK },
    );
    expect(html).toContain("…");
    // Не рвём слово посередине: перед многоточием — целое слово.
    expect(html).toMatch(/слово…/);
  });

  it("ссылка ВСЕГДА доживает до конца, даже если вводка огромна", () => {
    const { html } = buildPhotoCaption({ tease: SHORT.tease, lede: LONG_LEDE }, { linkUrl: LINK });
    expect(html).toContain(`href="${LINK}"`);
    expect(html.trimEnd().endsWith("</a>")).toBe(true);
  });

  it("экстремальный случай: сам заголовок длиннее лимита — тоже режется", () => {
    const { html, plain } = buildPhotoCaption(
      { tease: "А".repeat(5000), lede: "вводка" },
      { linkUrl: LINK },
    );
    expect(visibleCaptionLength(html)).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(plain.length).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("короткий текст не режется и не получает многоточия", () => {
    const { html } = buildPhotoCaption(SHORT, { linkUrl: LINK });
    expect(html).not.toContain("…");
  });
});

describe("buildPhotoCaption — безопасность разметки", () => {
  it("спецсимволы экранируются (анти-инъекция тегов)", () => {
    const { html } = buildPhotoCaption(
      { tease: "Ставка <b>16%</b> & точка", lede: "a > b" },
      { linkUrl: LINK },
    );
    expect(html).toContain("&lt;b&gt;16%&lt;/b&gt; &amp; точка");
    expect(html).toContain("a &gt; b");
  });

  it("экранированная сущность считается за один видимый символ", () => {
    // «&amp;» — 5 символов разметки, но в Telegram это один символ «&».
    expect(visibleCaptionLength("&amp;")).toBe(1);
    expect(visibleCaptionLength("<b>ab</b>")).toBe(2);
  });

  it("кавычки в URL не ломают атрибут href", () => {
    const { html } = buildPhotoCaption(SHORT, { linkUrl: 'https://e.ru/?a="x"&b=1' });
    expect(html).toContain("&amp;b=1");
    expect(html).not.toMatch(/href="[^"]*"[^>]*"/);
  });
});

describe("buildPhotoCaption — устойчивость (крэш здесь = молчащий канал)", () => {
  it("пустые/отсутствующие поля не роняют билдер", () => {
    const r = buildPhotoCaption({}, { linkUrl: LINK });
    expect(r.html).toContain("href=");
    expect(visibleCaptionLength(r.html)).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("null-поля не роняют билдер", () => {
    const r = buildPhotoCaption({ tease: null, lede: null }, { linkUrl: null });
    expect(r.html).toBe("");
    expect(r.plain).toBe("");
  });

  it("есть заголовок, нет вводки — не оставляет висящий разделитель", () => {
    const r = buildPhotoCaption({ tease: "Заголовок", lede: "" }, { linkUrl: null });
    expect(r.plain).toBe("Заголовок");
  });
});
