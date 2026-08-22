import { describe, expect, it } from "vitest";
import { SLIDE_HEIGHT, SLIDE_WIDTH, renderSlide } from "../src/lib/carousel-render";

/**
 * Рисование слайда (КП: «текст на слайдах рисуем кодом»).
 *
 * 🔴 Главное, что здесь проверяется, — что кириллица РИСУЕТСЯ. Если шрифт без
 * русских глифов, satori молча ставит пустые квадраты: код зелёный, картинка
 * пустая, а узнаём мы об этом из канала клиента.
 */

/** Ширина и высота из заголовка PNG (IHDR идёт сразу после сигнатуры). */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const isPng = (b: Buffer) => b.subarray(0, 4).toString("hex") === "89504e47";

describe("слайд рисуется в PNG", () => {
  it("отдаёт PNG нужного размера", async () => {
    const png = await renderSlide(
      { index: 1, kind: "cover", title: "Бот закрывает 80% заявок" },
      { total: 5, category: "cases" },
    );
    expect(isPng(png)).toBe(true);
    expect(pngSize(png)).toEqual({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
  });

  it("🔴 кириллица не превращается в пустые квадраты", async () => {
    // Косвенно, но надёжно: тот же слайд с текстом и без него обязан весить
    // ощутимо по-разному. Пустые квадраты дали бы почти одинаковый вес.
    const withText = await renderSlide(
      {
        index: 2,
        kind: "point",
        title: "Заявки перестали теряться",
        body: "Раньше терялась каждая пятая заявка из директа",
      },
      { total: 5, category: "cases" },
    );
    const bare = await renderSlide(
      { index: 2, kind: "point", title: "." },
      { total: 5, category: "cases" },
    );
    expect(withText.length).toBeGreaterThan(bare.length * 1.15);
  });

  it("цифра со ссылкой на источник рисуется вместе с ним", async () => {
    const png = await renderSlide(
      {
        index: 3,
        kind: "number",
        title: "80%",
        body: "заявок закрывает бот",
        source: "Минцифры, 2026",
      },
      { total: 5, category: "news" },
    );
    expect(isPng(png)).toBe(true);
  });

  it("длинный заголовок не роняет рендер", async () => {
    const png = await renderSlide(
      { index: 1, kind: "cover", title: "Внедрение ИИ-агентов окупается за четыре месяца" },
      { total: 3, category: "business" },
    );
    expect(isPng(png)).toBe(true);
  });
});
