import { TEMPLATE_LIMITS, type TemplateKind } from "@x10/config";
import { z } from "zod";
import { defineAgent } from "../define-agent";
import { DRAFT_TEMPLATES, type DraftTemplate } from "./draft";
import { draftShapeSchema } from "./schemas";

const inputSchema = z.object({
  /** Выход ToVAgent — финальный по тону, но возможно длинный. */
  revised: draftShapeSchema,
  /** brief §3 — лимиты Brevity зависят от шаблона. По умолчанию card-news. */
  template: z.enum(DRAFT_TEMPLATES).optional(),
});

const outputSchema = z.object({
  compressed: draftShapeSchema,
  beforeWords: z.number().int().nonnegative(),
  afterWords: z.number().int().nonnegative(),
  /** Краткие пометки что было выкинуто: «удалил преамбулу про историю ставок», «слил два абзаца про IRR». */
  cuts: z.array(z.string()),
});

function buildSystem(template: DraftTemplate): string {
  const limits = TEMPLATE_LIMITS[template];
  const minutes = (s: number) => Math.round(s / 60);
  const readWindow =
    limits.READ_SECONDS_MAX <= 90
      ? `${limits.READ_SECONDS_MIN}-${limits.READ_SECONDS_MAX} секунд`
      : `${minutes(limits.READ_SECONDS_MIN)}-${minutes(limits.READ_SECONDS_MAX)} минут`;

  const templateRules: Record<DraftTemplate, string> = {
    "card-news": `Шаблон card-news — режь агрессивно. Каждый абзац несёт цифру или конкретный факт.`,
    "deep-dive":
      `Шаблон deep-dive — режь МЯГКО. Структура «3-5 уроков» обязана сохраниться. ` +
      `Удаляй только воду в paragraph'ах, повторы. НЕ удаляй callouts с «уроками».`,
    "daily-take":
      `Шаблон daily-take — режь жёстко. Авторский голос (от первого лица) сохрани. ` +
      `Структура Cite→Opinion→Implication обязательна. Никаких numbers/quote/callouts.`,
    guide:
      `Шаблон guide — НЕ удаляй шаги list ordered=true. Сжимай только описания в шагах. ` +
      `Cohмpon mistakes (callout yes-but) и Resources (callout what-next) обязательны.`,
  };

  return `Ты — BrevityAgent редакции Х10 Daily. Получаешь готовый по тону draft и сжимаешь до лимитов шаблона.

ЦЕЛЬ:
- Итоговый объём ≤ ${limits.MAX_WORDS} слов суммарно (tease + lede + whyItMatters + все text-поля body)
- Время чтения ${readWindow} (читатель ≈ 200 слов/мин)

${templateRules[template]}

ЧТО МОЖНО:
- Сжимать paragraph: убирать преамбулы, мета-вступления, повторы
- Сливать два paragraph в один, если они про одно
- Сокращать длинные quote до сути (но НЕ менять attribution)
- Убирать list-items если они дублируют numbers

ЧТО НЕЛЬЗЯ:
- Менять цифры в блоках type="numbers" — переноси 1:1, включая label/value/source
- Менять quote.attribution
- Выдумывать новые факты, цифры, цитаты
- Менять порядок блоков body

ЗАПОЛНИ:
- compressed = новый draft с тем же набором обязательных полей (tease/lede/whyItMatters/body)
- beforeWords = подсчитанные слова исходного revised
- afterWords = подсчитанные слова compressed
- cuts = массив коротких пометок (1-фраза каждая), что именно ты выкинул или сжал

Возвращай через tool_use x10_emit_brevity.`;
}

const TEMPLATE_MAX_OUTPUT_TOKENS: Record<DraftTemplate, number> = {
  "card-news": 3072,
  "deep-dive": 6144,
  "daily-take": 1024,
  guide: 6144,
};

function makeAgent(template: DraftTemplate) {
  return defineAgent({
    name: "brevity",
    tier: "SONNET",
    system: buildSystem(template),
    inputSchema,
    outputSchema,
    maxOutputTokens: TEMPLATE_MAX_OUTPUT_TOKENS[template],
  });
}

const agentByTemplate: Record<DraftTemplate, ReturnType<typeof makeAgent>> = {
  "card-news": makeAgent("card-news"),
  "deep-dive": makeAgent("deep-dive"),
  "daily-take": makeAgent("daily-take"),
  guide: makeAgent("guide"),
};

export const BrevityAgent = {
  name: "brevity" as const,
  tier: "SONNET" as const,
  run(
    input: z.infer<typeof inputSchema>,
    ctx: Parameters<typeof agentByTemplate["card-news"]["run"]>[1],
  ) {
    const template = (input.template ?? "card-news") as DraftTemplate;
    return agentByTemplate[template].run(input, ctx);
  },
};

export type BrevityInput = z.infer<typeof inputSchema>;
export type BrevityOutput = z.infer<typeof outputSchema>;
