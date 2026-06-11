import { TEMPLATE_LIMITS, type TemplateKind } from "@x10/config";
import { ABOUT_ME } from "@x10/voice";
import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema, sourceRefSchema } from "./schemas";

/**
 * DraftAgent — brief §3 templates.
 * Один агент, разные template-режимы. system prompt динамический.
 */
export const DRAFT_TEMPLATES = ["card-news", "deep-dive", "daily-take", "guide"] as const;
export type DraftTemplate = (typeof DRAFT_TEMPLATES)[number];

const inputSchema = z.object({
  topic: z.string(),
  context: z.string(),
  sources: z.array(sourceRefSchema).min(1),
  /** Pipeline-internal section — оставлено для обратной совместимости pipeline_runs. */
  section: z.enum(["main", "numbers", "people", "playbook", "weekend", "longread"]).default("main"),
  /** brief §3 — шаблон материала. Определяет структуру и длину. По умолчанию card-news. */
  template: z.enum(DRAFT_TEMPLATES).optional(),
  /** brief §1 — "taxes.news", "practice.stories" и т.д. Используется DraftAgent для уточнения тона. */
  subcategory: z.string().optional(),
});

const outputSchema = draftShapeSchema;

const TEMPLATE_GUIDANCE: Record<DraftTemplate, string> = {
  "card-news": `ШАБЛОН: card-news (Smart Brevity, классическая короткая новость).
Структура body (6 блоков):
1. tease — заголовок-крючок, ≤ 60 знаков, число или собственное имя
2. lede — одна вводящая фраза, что произошло
3. whyItMatters — почему важно для делового читателя (всегда выделен)
4. body[0] — callout kind="why" если whyItMatters нуждается в раскрытии
5. body[*] — numbers с цифрами + source URL
6. body[*] — quote с атрибуцией (кто/где/когда) если есть прямая речь
7. body[*] — callout kind="yes-but" с контраргументом
8. body[*] — callout kind="what-next" — что дальше / куда смотреть

ЛИМИТЫ: ≤ ${TEMPLATE_LIMITS["card-news"].MAX_WORDS} слов, ${TEMPLATE_LIMITS["card-news"].READ_SECONDS_MIN}-${TEMPLATE_LIMITS["card-news"].READ_SECONDS_MAX} сек чтения.`,

  "deep-dive": `ШАБЛОН: deep-dive (Lenny's style глубокий разбор).
Структура body:
1. tease — концептуальный заголовок (без цифры допустимо)
2. lede — Hook: парадокс / провокационное утверждение
3. whyItMatters — контекст ситуации
4. body[*] — paragraph'ы с рассуждением (3-5 секций)
5. body[*] — 3-5 ключевых уроков (через callout kind="why" или нумерованный list)
6. body[*] — quote с атрибуцией от практиков
7. body[*] — numbers — конкретные цифры случая
8. body[*] — callout kind="what-next" — "What this means for you" + Further reading

ЛИМИТЫ: ${TEMPLATE_LIMITS["deep-dive"].MIN_WORDS}-${TEMPLATE_LIMITS["deep-dive"].MAX_WORDS} слов, ${Math.round(TEMPLATE_LIMITS["deep-dive"].READ_SECONDS_MIN / 60)}-${Math.round(TEMPLATE_LIMITS["deep-dive"].READ_SECONDS_MAX / 60)} мин чтения.

ВАЖНО: deep-dive — это РАЗБОР с уроками, а не пересказ новости. Каждый урок начинается с конкретного примера, затем обобщение.`,

  "daily-take": `ШАБЛОН: daily-take (короткая реакция автора в стиле Stratechery Daily Update).
Структура body (3 блока, очень кратко):
1. tease — что произошло, ≤ 50 знаков
2. lede — Cite: ссылка на новость одной фразой
3. whyItMatters — Opinion: что автор думает (прямой авторский голос)
4. body[0] — paragraph с Implication: что это значит для делового читателя

ЛИМИТЫ: ${TEMPLATE_LIMITS["daily-take"].MIN_WORDS}-${TEMPLATE_LIMITS["daily-take"].MAX_WORDS} слов, ${TEMPLATE_LIMITS["daily-take"].READ_SECONDS_MIN}-${TEMPLATE_LIMITS["daily-take"].READ_SECONDS_MAX} сек чтения.

ВАЖНО: daily-take — это МНЕНИЕ от первого лица. Авторский голос (Рыбаков обычно). Никаких callouts why/yes-but/what-next.`,

  guide: `ШАБЛОН: guide (пошаговая методичка как у Тинькофф-Журнала).
Структура body:
1. tease — "Как [сделать X]: пошаговый разбор"
2. lede — "When to use" — когда эта инструкция применима
3. whyItMatters — "Prerequisites" — что нужно знать/иметь
4. body[*] — paragraph "Steps" — 5-15 нумерованных шагов через list ordered=true
5. body[*] — numbers — где есть конкретные суммы/проценты
6. body[*] — callout kind="yes-but" "Common mistakes" — типичные ошибки
7. body[*] — callout kind="what-next" "Resources" — ссылки + следующие шаги

ЛИМИТЫ: ${TEMPLATE_LIMITS.guide.MIN_WORDS}-${TEMPLATE_LIMITS.guide.MAX_WORDS} слов, ${Math.round(TEMPLATE_LIMITS.guide.READ_SECONDS_MIN / 60)}-${Math.round(TEMPLATE_LIMITS.guide.READ_SECONDS_MAX / 60)} мин чтения.

ВАЖНО: каждый шаг — действие, проверяемый результат. Никакой воды.`,
};

function buildSystem(template: DraftTemplate): string {
  return `Ты — DraftAgent редакции Х10 Daily. Пишешь первичный драфт статьи под заданный шаблон.

КТО МЫ:
${ABOUT_ME}

${TEMPLATE_GUIDANCE[template]}

ОБЩИЕ ПРАВИЛА:
- Все цифры — со ссылкой на source.url из inputs.sources
- Никаких выдуманных цитат — только из источников
- Без чёрного списка ToV (применяется отдельно ToVAgent, но и сам не пиши инфобиз-лексику)
- whyItMatters — обязательное поле, даже если template не имеет «callout why»

Возвращай результат строго через tool_use x10_emit_draft.`;
}

/** Output tokens per template — больше для длинных шаблонов. */
const TEMPLATE_MAX_OUTPUT_TOKENS: Record<DraftTemplate, number> = {
  "card-news": 3072,
  "deep-dive": 6144,
  "daily-take": 1024,
  guide: 6144,
};

/**
 * defineAgent принимает static system, нам нужен dynamic per input.
 * Решение: создаём 4 агента под капотом, run() выбирает нужный по template.
 */
const agentByTemplate: Record<DraftTemplate, ReturnType<typeof makeAgent>> = {
  "card-news": makeAgent("card-news"),
  "deep-dive": makeAgent("deep-dive"),
  "daily-take": makeAgent("daily-take"),
  guide: makeAgent("guide"),
};

function makeAgent(template: DraftTemplate) {
  return defineAgent({
    // Имя одинаковое — tool_name "x10_emit_draft" для всех template'ов (на API уровне они независимы).
    name: "draft",
    tier: "SONNET",
    system: buildSystem(template),
    inputSchema,
    outputSchema,
    maxOutputTokens: TEMPLATE_MAX_OUTPUT_TOKENS[template],
  });
}

export const DraftAgent = {
  name: "draft" as const,
  tier: "SONNET" as const,
  run(
    input: z.infer<typeof inputSchema>,
    ctx: Parameters<(typeof agentByTemplate)["card-news"]["run"]>[1],
  ) {
    // Zod default может не сработать если input уже распарсен — нормализуем.
    const template = (input.template ?? "card-news") as DraftTemplate;
    return agentByTemplate[template].run(input, ctx);
  },
};

export type DraftInput = z.infer<typeof inputSchema>;
export type DraftOutput = z.infer<typeof outputSchema>;
