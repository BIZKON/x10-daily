import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  CAROUSEL_MAX,
  CAROUSEL_MIN,
  COVER_TITLE_MAX,
  TITLE_MAX,
  normalizeCarousel,
} from "../src/agents/carousel";

/**
 * Карусель (спека 7 КП: «текст на слайдах рисуем кодом»).
 *
 * 🔴 Проверяем не «работает ли функция», а правила, которыми карусель
 * отличается от простыни текста: слайдов от 2 до 10, первый — крючок,
 * последний — куда идти дальше, цифра без источника цифрой не считается.
 * Всё это едет клиенту в его канал, и переделать опубликованное нельзя.
 */

const COVER = { kind: "cover" as const, title: "Бот закрывает 80% заявок" };
const CTA = { kind: "cta" as const, title: "Разбор в Mini App" };
const POINT = {
  kind: "point" as const,
  title: "Что поменялось",
  body: "Заявки перестали теряться",
};

describe("сколько слайдов", () => {
  it("больше десяти не публикуем: Telegram отдаёт альбом до десяти картинок", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...POINT, title: `Тезис ${i}` }));
    const out = normalizeCarousel({ slides: [COVER, ...many, CTA], category: "cases" });
    expect(out.slides.length).toBe(CAROUSEL_MAX);
  });

  it("🔴 из одного слайда карусели не бывает — это просто картинка", () => {
    const out = normalizeCarousel({ slides: [COVER], category: "news" });
    expect(out.ok).toBe(false);
  });

  it("двух хватает", () => {
    const out = normalizeCarousel({ slides: [COVER, CTA], category: "news" });
    expect(out.ok).toBe(true);
    expect(out.slides.length).toBeGreaterThanOrEqual(CAROUSEL_MIN);
  });
});

describe("первый и последний слайды заданы жёстко", () => {
  it("первый — обложка, даже если модель прислала тезис", () => {
    const out = normalizeCarousel({ slides: [POINT, POINT, CTA], category: "news" });
    expect(out.slides[0]?.kind).toBe("cover");
  });

  it("🔴 последний слайд — куда идти дальше, и он дописывается сам", () => {
    // Карусель без выхода — потраченный показ: человек долистал и ушёл.
    const out = normalizeCarousel({ slides: [COVER, POINT], category: "news" });
    expect(out.slides.at(-1)?.kind).toBe("cta");
  });

  it("у кейсов зовём обсуждать внедрение, у новостей — читать разбор", () => {
    const cases = normalizeCarousel({ slides: [COVER, POINT], category: "cases" });
    const news = normalizeCarousel({ slides: [COVER, POINT], category: "news" });
    expect(cases.slides.at(-1)?.title).toContain("Обсудить");
    expect(news.slides.at(-1)?.title).toContain("Mini App");
  });

  it("второго CTA не появляется, если он уже есть", () => {
    const out = normalizeCarousel({ slides: [COVER, POINT, CTA], category: "news" });
    expect(out.slides.filter((s) => s.kind === "cta").length).toBe(1);
  });
});

describe("цифры", () => {
  it("🔴 цифра без источника цифрой не считается — становится тезисом", () => {
    // Правило конвейера: цифры с источниками. На слайде оно тем важнее —
    // картинку репостят без текста поста, и проверить будет негде.
    const out = normalizeCarousel({
      slides: [COVER, { kind: "number", title: "80%", body: "заявок закрывает бот" }, CTA],
      category: "news",
    });
    expect(out.slides[1]?.kind).toBe("point");
  });

  it("с источником остаётся цифрой", () => {
    const out = normalizeCarousel({
      slides: [
        COVER,
        { kind: "number", title: "80%", body: "заявок закрывает бот", source: "Минцифры, 2026" },
        CTA,
      ],
      category: "news",
    });
    expect(out.slides[1]?.kind).toBe("number");
  });
});

describe("длина текста", () => {
  it("длинный заголовок обрезается по границе слова, а не посередине", () => {
    const long = "Внедрение искусственного интеллекта в малом бизнесе окупается за четыре месяца";
    const out = normalizeCarousel({
      slides: [{ kind: "cover", title: long }, POINT],
      category: "news",
    });
    const t = out.slides[0]?.title ?? "";
    expect(t.length).toBeLessThanOrEqual(COVER_TITLE_MAX);
    // Последнее оставшееся слово — целое слово исходника, а не его огрызок.
    const words = t.replace(/…$/, "").trim().split(/\s+/);
    expect(long.split(/\s+/)).toContain(words.at(-1));
  });

  it("тезис и пояснение тоже подрезаются", () => {
    const out = normalizeCarousel({
      slides: [COVER, { kind: "point", title: "т".repeat(200), body: "б".repeat(400) }, CTA],
      category: "news",
    });
    expect((out.slides[1]?.title ?? "").length).toBeLessThanOrEqual(TITLE_MAX);
    expect((out.slides[1]?.body ?? "").length).toBeLessThanOrEqual(BODY_MAX);
  });

  it("пустой слайд выбрасывается, а не рисуется дырой", () => {
    const out = normalizeCarousel({
      slides: [COVER, { kind: "point", title: "   " }, POINT, CTA],
      category: "news",
    });
    expect(out.slides.every((s) => s.title.trim().length > 0)).toBe(true);
  });
});

describe("нумерация для человека", () => {
  it("слайды пронумерованы подряд с единицы", () => {
    const out = normalizeCarousel({ slides: [COVER, POINT, POINT, CTA], category: "news" });
    expect(out.slides.map((s) => s.index)).toEqual([1, 2, 3, 4]);
  });
});
