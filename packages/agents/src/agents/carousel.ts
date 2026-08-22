import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema } from "./schemas";
import { ctaFor } from "./visual";

/**
 * CarouselAgent — разбирает готовый материал на слайды.
 *
 * 🔴 Наше объективное преимущество из КП: «текст на слайдах рисуем КОДОМ —
 * цифры и знаки всегда точные». У конкурентов слайды рисует image-модель, и там
 * как повезёт: «80%» превращается в «8O%», а «₽» — в закорючку. Поэтому агент
 * отдаёт ТЕКСТ и роль каждого слайда, а не картинку; рисует рендер.
 *
 * Слайд — не абзац. На телефоне читают крупно и по одному, поэтому у каждого
 * слайда одна мысль, а лимиты знаков жёсткие: не влезло — значит слишком
 * длинно, а не «шрифт помельче».
 */

/** Меньше двух слайдов — это картинка, а не карусель. */
export const CAROUSEL_MIN = 2;
/** Telegram отдаёт альбом максимум из десяти вложений. */
export const CAROUSEL_MAX = 10;

/** Обложка набрана самым крупным кеглем — знаков в неё влезает меньше. */
export const COVER_TITLE_MAX = 60;
export const TITLE_MAX = 70;
export const BODY_MAX = 180;
export const SOURCE_MAX = 64;

export const SLIDE_KINDS = ["cover", "point", "number", "quote", "cta"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];

export type Slide = {
  kind: SlideKind;
  /** Крупная строка. У `number` — сама цифра. */
  title: string;
  /** Пояснение под ней. */
  body?: string;
  /** Источник цифры. У `number` обязателен, иначе слайд не цифра. */
  source?: string;
};

/** Слайд, готовый к рисованию: с номером и подрезанным текстом. */
export type NormalizedSlide = Slide & { index: number };

/**
 * Обрезка по границе слова.
 *
 * Обрубок посреди слова на картинке выглядит как брак вёрстки, а не как
 * сокращение: в отличие от текста поста, тут нет «читать дальше».
 */
function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[,;:.\-–—]+$/, "")}…`;
}

export type NormalizeInput = {
  slides: readonly Slide[];
  /** Рубрика материала: от неё зависит, куда зовём на последнем слайде. */
  category: string;
};

export type NormalizeResult =
  | { ok: true; slides: NormalizedSlide[] }
  | { ok: false; reason: "too_few"; slides: NormalizedSlide[] };

/**
 * Приводит присланное моделью к тому, что можно рисовать.
 *
 * Правила здесь, а не в промпте, намеренно: промпт — просьба, а это гарантия.
 * Модель периодически отдаёт одиннадцать слайдов, забывает последний или
 * называет цифрой фразу без источника — на каждом из этих случаев карусель
 * уезжала бы в канал клиента кривой.
 */
export function normalizeCarousel(input: NormalizeInput): NormalizeResult {
  const cleaned: Slide[] = [];

  for (const raw of input.slides) {
    const title = clip(raw.title ?? "", raw.kind === "cover" ? COVER_TITLE_MAX : TITLE_MAX);
    // Пустой слайд нарисовался бы дырой в альбоме — выбрасываем молча.
    if (!title) continue;

    const source = raw.source ? clip(raw.source, SOURCE_MAX) : undefined;
    // 🔴 Цифра без источника цифрой не считается. Картинку репостят без текста
    // поста, и проверить утверждение будет негде — значит крупная цифра без
    // ссылки на источник в кадре не появляется вообще.
    const kind: SlideKind = raw.kind === "number" && !source ? "point" : raw.kind;

    cleaned.push({
      kind,
      title,
      body: raw.body ? clip(raw.body, BODY_MAX) : undefined,
      ...(source ? { source } : {}),
    });
  }

  // Первый слайд — крючок, что бы ни прислала модель: с него начинается показ.
  const first = cleaned[0];
  if (first && first.kind !== "cover") cleaned[0] = { ...first, kind: "cover" };

  // 🔴 Хватает ли материала, решаем ДО дописывания выхода. Иначе один
  // присланный слайд плюс наш CTA формально дают карусель, в которой читать
  // нечего: крючок и кнопка.
  const enough = cleaned.length >= CAROUSEL_MIN;

  // Последний — выход. Карусель без него — потраченный показ: человек
  // долистал и ушёл никуда.
  if (cleaned.length > 0 && cleaned.at(-1)?.kind !== "cta") {
    cleaned.push({ kind: "cta", title: ctaFor(input.category) });
  }

  const capped = cleaned.slice(0, CAROUSEL_MAX);
  // Обрезка по десятому могла срезать сам выход — возвращаем его на место.
  if (capped.length === CAROUSEL_MAX && capped.at(-1)?.kind !== "cta") {
    capped[CAROUSEL_MAX - 1] = { kind: "cta", title: ctaFor(input.category) };
  }

  const slides = capped.map((s, i) => ({ ...s, index: i + 1 }));
  return enough ? { ok: true, slides } : { ok: false, reason: "too_few", slides };
}

const slideSchema = z.object({
  kind: z.enum(SLIDE_KINDS).catch("point"),
  title: z.string(),
  body: z.string().optional(),
  source: z.string().optional(),
});

const inputSchema = z.object({
  draft: draftShapeSchema,
  category: z.string().default("news"),
  /** Сколько слайдов просим. Модель может отдать меньше — это нормально. */
  target: z.number().int().min(CAROUSEL_MIN).max(CAROUSEL_MAX).default(6),
});

const outputSchema = z.object({
  slides: z.array(slideSchema),
});

const SYSTEM = `Ты — CarouselAgent редакции ProAgent AI. Получаешь готовый материал и разбираешь его на слайды карусели для Telegram.

РОЛИ СЛАЙДОВ:
- cover  — первый слайд, крючок. Одна мысль, ради которой откроют остальное
- point  — один тезис: что произошло или что это даёт бизнесу
- number — ОДНА крупная цифра и что она значит. Только если знаешь источник
- quote  — цитата с атрибуцией: кто, где, когда
- cta    — последний слайд, куда идти дальше

ПРАВИЛА:
- Один слайд — одна мысль. Слайд не абзац: его читают крупно и по одному
- Заголовок обложки ≤ ${COVER_TITLE_MAX} знаков, остальные ≤ ${TITLE_MAX}, пояснение ≤ ${BODY_MAX}
- У слайда number ОБЯЗАТЕЛЕН source — кто и когда это посчитал. Нет источника — делай point
- Цифры арабскими, знак валюты рядом с числом
- Только факты из материала. Не выдумывай ни цифр, ни цитат
- Без em-dash (—), без хедж-слов «возможно», «вероятно», «по-видимому»
- Не начинай обложку вопросом: она утверждает, а не спрашивает
- Карусель читают вместо статьи, а не после неё: последовательность слайдов сама по себе рассказывает историю`;

export type CarouselInput = z.infer<typeof inputSchema>;
export type CarouselOutput = z.infer<typeof outputSchema>;

export const CarouselAgent = defineAgent({
  name: "CarouselAgent",
  tier: "SONNET",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  formatInput: (i) =>
    [
      `Рубрика: ${i.category}`,
      `Сколько слайдов: ${i.target}`,
      "",
      JSON.stringify(i.draft, null, 2),
    ].join("\n"),
});
