import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { KICKER, type NormalizedSlide } from "@x10/agents";
import satori from "satori";

/**
 * Рисование слайдов карусели КОДОМ (обещание КП, §3.5 реестра).
 *
 * 🔴 Это наше объективное преимущество перед конкурентами: у них слайды рисует
 * image-модель, и «80%» время от времени выходит как «8O%», а «₽» — закорючкой.
 * Здесь текст проходит через шрифт, а не через модель: цифры и знаки точные
 * ровно настолько, насколько точен исходный материал.
 *
 * Путь: разметка → satori → SVG (текст уже кривыми) → resvg → PNG. Системные
 * шрифты выключены намеренно: в контейнере их нет, и молчаливая подмена дала бы
 * не наш шрифт на картинке в канале клиента.
 */

/** 4:5 — самый крупный вертикальный кадр, который Telegram не режет в ленте. */
export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

/** Палитра — из канона `packages/ui/src/styles/theme.css`. */
const COLOR = {
  night: "#0B0B0E",
  steel: "#1F2937",
  paper: "#F2F2F2",
  mist: "#A8A8A8",
  gold: "#D4A24C",
  red: "#E63946",
} as const;

/** Тинт рубрики — тот же, что у обложек (`branded-cover.tsx`). */
const TINT: Record<string, string> = {
  news: COLOR.red,
  cases: COLOR.gold,
  howto: COLOR.gold,
  tools: COLOR.gold,
  business: COLOR.red,
  founder: COLOR.red,
};

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");

type Font = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: "normal" };

/**
 * Шрифты читаются один раз на процесс: файл на 300 КБ, а слайдов в сутки
 * десятки — перечитывать его на каждый кадр незачем.
 */
let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(join(FONT_DIR, "manrope-800.ttf")),
      readFile(join(FONT_DIR, "inter-500.ttf")),
      readFile(join(FONT_DIR, "jetbrains-mono-700.ttf")),
    ]).then(([display, sans, mono]) => [
      { name: "Manrope", data: display, weight: 800 as const, style: "normal" as const },
      { name: "Inter", data: sans, weight: 500 as const, style: "normal" as const },
      { name: "JetBrains Mono", data: mono, weight: 700 as const, style: "normal" as const },
    ]);
  }
  return fontsPromise;
}

/**
 * satori принимает React-элементы, но JSX ради трёх узлов тянуть в воркер
 * незачем: та же структура объектом читается не хуже.
 */
type Node = { type: string; props: Record<string, unknown> };

const el = (
  type: string,
  style: Record<string, unknown>,
  children?: Node | Node[] | string | null,
): Node => ({ type, props: { style, ...(children == null ? {} : { children }) } });

export type SlideContext = {
  /** Сколько слайдов всего — рисуем «3 / 7». */
  total: number;
  category: string;
};

/** Шапка: рубрика слева, счётчик справа. Одинакова на всех слайдах. */
function header(s: NormalizedSlide, ctx: SlideContext, tint: string): Node {
  return el("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
    el(
      "div",
      {
        display: "flex",
        fontFamily: "Inter",
        fontSize: 26,
        letterSpacing: 4,
        color: tint,
      },
      KICKER[ctx.category] ?? "PROAGENT AI",
    ),
    el(
      "div",
      { display: "flex", fontFamily: "JetBrains Mono", fontSize: 26, color: COLOR.mist },
      `${s.index} / ${ctx.total}`,
    ),
  ]);
}

/** Подвал: брендовая полоса. На репосте картинки это единственная подпись. */
function footer(tint: string): Node {
  return el("div", { display: "flex", alignItems: "center", gap: 16 }, [
    el(
      "div",
      {
        display: "flex",
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Manrope",
        fontSize: 22,
        color: COLOR.night,
      },
      "PA",
    ),
    el(
      "div",
      { display: "flex", fontFamily: "Manrope", fontSize: 26, color: COLOR.paper },
      "ProAgent AI",
    ),
    el(
      "div",
      { display: "flex", fontFamily: "Inter", fontSize: 22, color: COLOR.mist },
      "ИИ работает на вас",
    ),
  ]);
}

/**
 * Кегль по длине строки.
 *
 * 🔴 Фиксированный размер ломает вёрстку в обе стороны: короткий заголовок
 * висит потерянным в пустом кадре, длинный уезжает на подвал. Считаем от числа
 * знаков — переносы за нас посчитает satori.
 */
function fitSize(text: string, steps: readonly [number, number][]): number {
  const len = text.length;
  for (const [max, size] of steps) if (len <= max) return size;
  return steps[steps.length - 1]?.[1] ?? 48;
}

/** Тело слайда — своё для каждой роли. */
function body(s: NormalizedSlide, tint: string): Node {
  const explain = (size: number) =>
    s.body
      ? el(
          "div",
          {
            display: "flex",
            fontFamily: "Inter",
            fontSize: size,
            lineHeight: 1.45,
            color: COLOR.mist,
          },
          s.body,
        )
      : null;

  if (s.kind === "number") {
    return el(
      "div",
      { display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 24 },
      [
        el(
          "div",
          {
            display: "flex",
            fontFamily: "JetBrains Mono",
            // Моноширинный кегль падает быстрее: «20 мин» в 190px занимает
            // почти всю ширину кадра, а «1 200 000 ₽» не влезает вовсе.
            fontSize: fitSize(s.title, [
              [4, 200],
              [7, 150],
              [11, 112],
              [Number.POSITIVE_INFINITY, 84],
            ]),
            color: tint,
          },
          s.title,
        ),
        explain(40),
        s.source
          ? el(
              "div",
              { display: "flex", fontFamily: "Inter", fontSize: 24, color: COLOR.mist },
              `Источник: ${s.source}`,
            )
          : null,
      ].filter(Boolean) as Node[],
    );
  }

  if (s.kind === "quote") {
    return el("div", { display: "flex", justifyContent: "center", flexGrow: 1, gap: 28 }, [
      el("div", { display: "flex", width: 8, backgroundColor: tint, borderRadius: 4 }),
      el(
        "div",
        { display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 },
        [
          el(
            "div",
            {
              display: "flex",
              fontFamily: "Manrope",
              fontSize: 56,
              lineHeight: 1.25,
              color: COLOR.paper,
            },
            s.title,
          ),
          explain(30),
        ].filter(Boolean) as Node[],
      ),
    ]);
  }

  // cover · point · cta — одна крупная мысль и пояснение под ней. Разница в
  // кегле: обложку читают в ленте на бегу, остальное — уже листая.
  const size =
    s.kind === "cover"
      ? fitSize(s.title, [
          [28, 104],
          [44, 92],
          [Number.POSITIVE_INFINITY, 76],
        ])
      : s.kind === "cta"
        ? 76
        : fitSize(s.title, [
            [24, 72],
            [Number.POSITIVE_INFINITY, 60],
          ]);
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: s.kind === "cta" ? "center" : "flex-end",
      flexGrow: 1,
      gap: 28,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontFamily: "Manrope",
          fontSize: size,
          lineHeight: 1.12,
          color: s.kind === "cta" ? tint : COLOR.paper,
        },
        s.title,
      ),
      explain(36),
    ].filter(Boolean) as Node[],
  );
}

function slideTree(s: NormalizedSlide, ctx: SlideContext): Node {
  const tint = TINT[ctx.category] ?? COLOR.red;
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      padding: 72,
      backgroundColor: COLOR.night,
      // Диагональ к стали — тот же приём, что в обложках: плоская заливка на
      // 1080×1350 выглядит как незагрузившаяся картинка.
      backgroundImage: `linear-gradient(150deg, ${COLOR.steel} 0%, ${COLOR.night} 78%)`,
      justifyContent: "space-between",
      // 🔴 Без зазора нижняя строка заголовка ложится прямо на брендовую
      // полосу: выносные элементы букв («у», «р») перекрывают подпись.
      gap: 72,
    },
    [header(s, ctx, tint), body(s, tint), footer(tint)],
  );
}

/** Рисует один слайд и отдаёт PNG. */
export async function renderSlide(s: NormalizedSlide, ctx: SlideContext): Promise<Buffer> {
  const fonts = await loadFonts();
  // satori ждёт ReactNode, а мы строим ту же структуру объектом: JSX ради трёх
  // узлов в воркер не тянем.
  // biome-ignore lint/suspicious/noExplicitAny: структура строится объектом, не JSX
  const svg = await satori(slideTree(s, ctx) as any, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts,
  });

  // 🔴 Системные шрифты выключены: в контейнере их нет, и подмена молча дала бы
  // не наш шрифт. Текст к этому моменту уже кривые — шрифты resvg не нужны.
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: SLIDE_WIDTH },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

  return Buffer.from(png);
}

/** Рисует всю карусель по порядку. */
export async function renderCarousel(
  slides: readonly NormalizedSlide[],
  category: string,
): Promise<Buffer[]> {
  const ctx: SlideContext = { total: slides.length, category };
  const out: Buffer[] = [];
  // Последовательно: satori держит шрифты в памяти, а параллельный рендер
  // десяти кадров на маленькой VM даёт всплеск, ради которого незачем.
  for (const s of slides) out.push(await renderSlide(s, ctx));
  return out;
}
