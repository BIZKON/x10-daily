import { describe, expect, it } from "vitest";
import { articleToTelegramHtml, escapeTelegramHtml } from "../src/lib/telegram-html";

describe("escapeTelegramHtml", () => {
  it("экранирует & < > (анти-инъекция тегов)", () => {
    expect(escapeTelegramHtml("<script>a & b > c")).toBe("&lt;script&gt;a &amp; b &gt; c");
  });
});

describe("articleToTelegramHtml", () => {
  const base = "https://app.pro-agent-ai.ru";
  const article = {
    tease: "ЦБ сохранил ставку 17%",
    lede: "Совет директоров не изменил ставку четвёртый раз.",
    whyItMatters: "Кредитное окно для МСП закрыто.",
    body: [
      { type: "numbers" as const, items: [{ label: "Ставка", value: "17%" }] },
      { type: "paragraph" as const, text: "Решение совпало с прогнозом." },
    ],
    slug: "tsb-stavka-17",
  };

  it("жирный заголовок + подзаг + выноска + цифры-буллеты + ссылка «Читать в Х10»", () => {
    const html = articleToTelegramHtml(article, base);
    expect(html).toContain("<b>ЦБ сохранил ставку 17%</b>");
    expect(html).toContain("Совет директоров не изменил ставку четвёртый раз.");
    expect(html).toContain(
      "<blockquote><b>Почему важно.</b> Кредитное окно для МСП закрыто.</blockquote>",
    );
    expect(html).toContain("• Ставка: <b>17%</b>");
    expect(html).toContain(
      '<a href="https://app.pro-agent-ai.ru/article/tsb-stavka-17">Читать в Х10 →</a>',
    );
  });

  it("НЕ использует rich-теги (<h*>/<ul>/<li>) — только parse_mode=HTML рендерится у всех", () => {
    const html = articleToTelegramHtml(article, base);
    expect(html).not.toMatch(/<h[1-6]>/);
    expect(html).not.toContain("<ul>");
    expect(html).not.toContain("<li>");
  });

  it("блоки разделены пустой строкой (воздух между блоками)", () => {
    expect(articleToTelegramHtml(article, base)).toContain("\n\n");
  });

  it("экранирует спецсимволы в тексте статьи (& < >)", () => {
    const html = articleToTelegramHtml({ ...article, tease: "A < B & C" }, base);
    expect(html).toContain("<b>A &lt; B &amp; C</b>");
    expect(html).not.toContain("A < B & C");
  });

  it("null whyItMatters → выноска не рендерится", () => {
    expect(articleToTelegramHtml({ ...article, whyItMatters: null }, base)).not.toContain(
      "Почему важно",
    );
  });

  it("тизер: не льёт весь body (только цифры + первый абзац)", () => {
    const html = articleToTelegramHtml(
      {
        ...article,
        body: [
          { type: "paragraph", text: "Первый абзац." },
          { type: "paragraph", text: "Второй абзац — не должен попасть в тизер." },
        ],
      },
      base,
    );
    expect(html).toContain("Первый абзац.");
    expect(html).not.toContain("Второй абзац");
  });
});
