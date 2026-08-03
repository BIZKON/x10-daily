import { z } from "zod";
import { defineAgent } from "../define-agent";

/**
 * VisualAgent — крафтит СЦЕНУ для генератора иллюстраций (Nano Banana 2).
 *
 * Канон: `packages/voice/visual.md` — operational rules визуала, прямой брат
 * `voice.md`. Всё, что здесь зафиксировано константами, выведено оттуда; при
 * расхождении приоритет у visual.md.
 *
 * Разделение труда (visual.md §«Разделение труда»): модель рисует ТОЛЬКО
 * иллюстрацию, весь текст/логотип/бренд-хром живут в карточке миниаппа. Поэтому
 * текст в кадре запрещён жёстко и на двух уровнях — правилом в system-промпте
 * агента И фиксированным NEGATIVE-блоком, который дописывается ПОСЛЕ сцены
 * (сцена от модели не может его перебить).
 *
 * Порядок промпта — строго по visual.md §«Промт-скелет»:
 *   STYLE (фикс.) → PILLAR (регистр столпа) → SUBJECT (сцена) → NEGATIVE (фикс.) → TECH.
 */

/**
 * STYLE — фиксированный блок канона. Палитра приглушённая, документальная:
 * поверхность/steel как основа, красный дозированно (≤10% площади), золото —
 * ТОЛЬКО тонкий хром (линия/подпись), никогда как материал богатства.
 *
 * ⚠️ Осознанно БЕЗ «glow/subtle glow»: visual.md §«Что визуал НИКОГДА не делает»
 * п.6 запрещает неон, киберпанк и «AI-свечение» — это визуальный ИИ-хайп,
 * зеркало текстового анти-хайпа из BLACKLIST.
 */
export const VISUAL_STYLE =
  "editorial business illustration, restrained documentary tone, " +
  "muted steel-and-cream palette (#1F2937 steel, #FAFAF7 surface), " +
  "dosed crimson accent (#E63946) on at most a tenth of the frame, " +
  "thin gold accent line (#D4A24C) used as chrome only — never as material or wealth, " +
  "generous negative space, single idea, calm even realistic light, flat or softly dimensional";

/**
 * NEGATIVE — фиксированный блок канона (visual.md §Off-limits). Дописывается
 * ПОСЛЕ сцены, поэтому перебивает всё, что модель могла нафантазировать.
 */
export const VISUAL_NEGATIVE =
  "no text, no letters, no numbers, no captions, no watermarks, " +
  "no gold bars, no cash stacks, no luxury, no lamborghini, no yacht, no jet, no watches, " +
  "no stock-success poses, no fist-pump, no silhouette-at-sunrise, " +
  "no rising-arrow decor, no decorative charts, " +
  "no handshake cliche, no neon, no cyber glow, no AI-glow, " +
  "no 3d figurine, no meme style, no fire, no explosions, no drama, " +
  "no real faces, no brand logos, no flags, no political symbols";

/**
 * TECH — параметры кадра. Аспект 16:9 (горизонтальный) — ОСОЗНАННОЕ отклонение
 * от visual.md §«Аспекты под каналы» (там TG 1:1/4:5): одна и та же картинка
 * обслуживает ДВЕ поверхности — обложку карточки ленты (кроп 2:1, `h-44
 * object-cover`) и фото-пост канала. Вертикаль обрезалась бы в ленте по центру и
 * теряла композицию; Telegram горизонталь принимает без потерь. Спайк дал ровно
 * такой кадр нативно (1408×768).
 */
const VISUAL_TECH = "16:9 horizontal composition, 1K resolution, text-free frame";

/** Полный фиксированный хвост стиля: используется и в промпте, и в тестах. */
export const BRAND_STYLE_SUFFIX = `${VISUAL_STYLE} — ${VISUAL_NEGATIVE} — ${VISUAL_TECH}`;

/**
 * Регистр столпа под каждую рубрику рубрикатора ProAgent AI (CLAUDE.md §4).
 * visual.md §«Привязка к столпам» описывает 4 столпа — раскладываем 6 рубрик:
 * tools идёт в регистр столпа 1 (инструмент как объект), founder — в столп 4
 * (человек-в-работе обобщённо, без лица: канон запрещает лица ньюсмейкеров).
 */
const PILLARS = {
  news: "restrained conceptual illustration of a tool or platform as an object, no tech kitsch",
  cases:
    "documentary industrial frame of real Russian business context — production floor, warehouse, retail back office, a workplace mid-process",
  howto:
    "clean flat diagram-object, an everyday object as a metaphor for one step of a method, no decorative arrows",
  tools: "restrained conceptual illustration of a tool or platform as an object, no tech kitsch",
  business:
    "generalised person-at-work seen from behind or cropped, or a documentary abstraction of a financial flow without any wealth cues",
  founder:
    "generalised person-at-work seen from behind or cropped, quiet workspace, no visible face",
} as const;

/** Тот же реестр под индексный доступ по произвольной строке из БД. */
export const PILLAR_REGISTER: Record<string, string> = PILLARS;

/** Рубрика по умолчанию, если пришла неизвестная (конвейер не должен падать). */
const DEFAULT_PILLAR_KEY = "news";

/** Регистр столпа по рубрике; неизвестная рубрика → регистр `news`. */
export function pillarFor(category: string): string {
  return PILLAR_REGISTER[category] ?? PILLARS[DEFAULT_PILLAR_KEY];
}

const inputSchema = z.object({
  /** Заголовок-крючок статьи. */
  tease: z.string().min(1),
  /** Вводящая фраза. */
  lede: z.string().min(1),
  /** Рубрика (news|cases|howto|tools|business|founder); неизвестная → регистр news. */
  category: z.string().default(DEFAULT_PILLAR_KEY),
});

const outputSchema = z.object({
  /**
   * Англоязычное описание СЦЕНЫ (что изобразить), 1-2 предложения. Только
   * SUBJECT — стиль, негатив и тех-параметры дописывает buildImagePrompt.
   */
  scene: z.string(),
});

/**
 * User-промпт для крафта сцены. Несёт суть статьи + регистр её столпа, чтобы
 * модель придумала метафору внутри нужного визуального регистра, а не «вообще».
 */
export function buildVisualUserPrompt(a: {
  tease: string;
  lede: string;
  category: string;
}): string {
  return [
    `Заголовок статьи: ${a.tease}`,
    `Суть: ${a.lede}`,
    `Рубрика: ${a.category}`,
    `Регистр иллюстрации для этой рубрики: ${pillarFor(a.category)}`,
    "",
    "Придумай МЕТАФОРУ для редакционной иллюстрации и опиши её ПО-АНГЛИЙСКИ:",
    "что изображено (объекты, сцена, ракурс, композиция). Одна идея на кадр.",
    "Без текста, букв и цифр в кадре. Без брендов, логотипов и лиц.",
    "Только описание сцены, 1-2 предложения. Без указаний стиля и палитры — их добавит редакция.",
  ].join("\n");
}

/**
 * Собирает финальный промпт для image-модели в каноническом порядке.
 * NEGATIVE идёт ПОСЛЕ сцены намеренно: если модель-крафтер всё же попросила
 * текст/лицо/логотип в кадре, фиксированный запрет стоит последним и весомее.
 */
export function buildImagePrompt(a: { scene: string; category: string }): string {
  return [VISUAL_STYLE, pillarFor(a.category), a.scene.trim(), VISUAL_NEGATIVE, VISUAL_TECH].join(
    " — ",
  );
}

const SYSTEM = `Ты — VisualAgent редакции ProAgent AI. Ты придумываешь СЦЕНУ для редакционной иллюстрации к статье и описываешь её по-английски.

КТО МЫ ВИЗУАЛЬНО:
Деловое редакционное медиа. Регистр — сдержанность Bloomberg / Axios / Stratechery плюс документальность. НЕ глянец Forbes, НЕ визуальный шум. Визуал редакции, а не личного бренда. Если кадр выглядит как обложка инфо-курса или мотивационный постер — это брак.

ЧТО ТЫ ДЕЛАЕШЬ:
Возвращаешь ТОЛЬКО описание сцены (SUBJECT) — объекты, ракурс, композиция. Стиль, палитру, запреты и технические параметры дописывает редакция после тебя. Не повторяй их.

ЖЁСТКИЕ ПРАВИЛА:
- Одна идея на изображение. Не коллаж из трёх мыслей. Много воздуха.
- НИКАКОГО текста, букв, цифр, подписей и логотипов в кадре — весь текст живёт в карточке, не в иллюстрации.
- Без лиц реальных людей. Человек — только обобщённо: со спины, силуэтом, кадрированно.
- Без роскоши, золотых слитков, денег пачками, спорткаров, яхт, часов. Это инфобиз-маркеры.
- Без стокового «успеха»: прыжков, кулака вверх, силуэта на фоне рассвета.
- Без восходящих 3D-стрелок и декоративных графиков вместо смысла.
- Без рукопожатий людей в костюмах.
- Без неона, киберпанка и «AI-свечения» — технологический китч это визуальный ИИ-хайп.
- Без мемных 3D-фигурок.
- Без огня, взрывов и драматургии. Визуал не эмоционирует.
- Без брендов, узнаваемого IP, упаковки, флагов и политсимволов.
- Сцена ОБЕЗЛИЧЕНА: не называй компании, людей и продукты — только обобщённые формы.

ФОРМАТ: поле scene — 1-2 предложения по-английски, описание сцены. Больше ничего.`;

export const VisualAgent = defineAgent({
  name: "visual",
  tier: "HAIKU",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  formatInput: buildVisualUserPrompt,
  maxOutputTokens: 512,
});

export type VisualInput = z.infer<typeof inputSchema>;
export type VisualOutput = z.infer<typeof outputSchema>;
