import { BLACKLIST, VOICE_RULES, loadAuthorVoice } from "@x10/voice";
import { z } from "zod";
import { defineAgent } from "../define-agent";
import { HOOK_CHANNELS, type HookChannel } from "./hookgen";
import { draftShapeSchema } from "./schemas";

/**
 * Frameworks из skills repo (post-formatter):
 * - PAS: Problem → Agitation → Solution
 * - AIDA: Attention → Interest → Desire → Action
 * - BAB: Before → After → Bridge
 * - STAR: Situation → Task → Action → Result
 * - SLAY: Story → Lesson → Actionable advice → You
 */
export const SOCIAL_FRAMEWORKS = ["PAS", "AIDA", "BAB", "STAR", "SLAY"] as const;
export type SocialFramework = (typeof SOCIAL_FRAMEWORKS)[number];

/** Дефолтная рамка под канал. Модель может переопределить если задано в input. */
const DEFAULT_FRAMEWORK: Record<HookChannel, SocialFramework> = {
  "tg-rybakov": "SLAY",
  "tg-x10": "BAB",
  vk: "PAS",
  zen: "STAR",
  linkedin: "PAS",
};

const inputSchema = z.object({
  draft: draftShapeSchema,
  channel: z.enum(HOOK_CHANNELS).default("tg-x10"),
  /** Опционально — иначе модель возьмёт DEFAULT_FRAMEWORK[channel]. */
  framework: z.enum(SOCIAL_FRAMEWORKS).optional(),
  /** Если статья от лица автора — подгружается about-author-{name}.md. */
  authorName: z.string().nullable().optional(),
});

const segmentSchema = z.object({
  /** Имя стадии framework — например "Problem", "Agitation", "Solution" для PAS. */
  stage: z.string(),
  text: z.string(),
});

const outputSchema = z.object({
  channel: z.enum(HOOK_CHANNELS),
  framework: z.enum(SOCIAL_FRAMEWORKS),
  /** Полный готовый к публикации текст поста, с переносами строк под канал. */
  post: z.string(),
  /** Открывающая строка (hook). */
  hookLine: z.string(),
  /** Опциональная контр-строка. */
  twistLine: z.string().nullable(),
  /** Разбивка по стадиям framework — для админки и debug. */
  segments: z.array(segmentSchema),
  wordCount: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
});

const BLACKLIST_STR = BLACKLIST.map((w) => `  - "${w}"`).join("\n");

const CHANNEL_RULES: Record<HookChannel, string> = {
  "tg-rybakov": [
    "Первое лицо («Я», «У нас»). Прямой, без регалий, без «коллеги»",
    "150-250 слов, абзацы по 1-2 предложения, разделены пустой строкой",
    "Без эмодзи. Без хэштегов. Без anglicism'ов где есть русский эквивалент",
    "CTA: вопрос-зацепка или приглашение в чат кламперов",
  ].join("\n"),
  "tg-x10": [
    "Деловой, сухой, от редакции. Без «я»",
    "200-300 слов, абзацы по 1-2 предложения, разделены пустой строкой",
    "Без эмодзи. Цифры с источником в скобках",
    "CTA: «читать полностью на x10daily», без манипуляций",
  ].join("\n"),
  vk: [
    "Простой синтаксис, без англицизмов. Аудитория шире, объясняй термины",
    "200-300 слов, абзацы 1-2 предложения",
    "Допустимы 1-2 эмодзи (📊 для цифр, 📌 для главного)",
    "CTA: вопрос в комментарии или ссылка в источниках",
  ].join("\n"),
  zen: [
    "Заголовочный стиль, кликабельный (но без кликбейта)",
    "250-350 слов, может быть длиннее. Подзаголовки разрешены",
    "Без эмодзи. Без хэштегов",
    "CTA: «продолжение в Х10 Daily»",
  ].join("\n"),
  linkedin: [
    "Английский RU-style: деловой, лаконичный, фокус на инсайт",
    "200-250 слов, ≤ 20 строк, blank line после каждой строки",
    "Hook ≤ 50 знаков. Twist ≤ 50 знаков",
    "Rule of Three: максимум два трио на пост",
    "CTA: «Repost if», «If this helped, repost», без cringe",
  ].join("\n"),
};

const FRAMEWORK_LINES = [
  "- PAS  → Problem → Agitation → Solution",
  "- AIDA → Attention → Interest → Desire → Action",
  "- BAB  → Before → After → Bridge",
  "- STAR → Situation → Task → Action → Result",
  "- SLAY → Story → Lesson → Actionable advice → You",
].join("\n");

function buildSystem(): string {
  return `Ты — SocialAmplifyAgent редакции Х10 Daily. Получаешь сжатую статью и упаковываешь её в пост под конкретный канал и framework.

VOICE RULES (общие для всех каналов Х10):
${VOICE_RULES}

ЧЁРНЫЙ СПИСОК (никогда):
${BLACKLIST_STR}

FRAMEWORKS:
${FRAMEWORK_LINES}

JOB:
1. Прочесть draft (tease/lede/whyItMatters/body) — взять только факты, цифры, имена, цитаты
2. Применить framework как структуру: разбить контент на stages
3. Применить per-channel rules (см. ниже) — длина, формат, стиль обращения
4. Написать post — готовый к публикации текст с правильными переносами строк под канал
5. Заполнить segments — разбивка по стадиям с stage-именем и текстом
6. Hook line — открывающая строка. Twist line — опциональная контр-строка (если применимо)

ВАЖНО:
- НЕ выдумывай факты, цифры, цитаты — только то что есть в draft
- НЕ используй em-dash (—)
- Цифры арабскими, не словами
- Не начинай открывалку с вопроса
- Не используй blacklist-термины
- Если authorName задан — учитывай авторский голос (он будет инжектирован отдельно)

ВОЗВРАЩАЙ через tool_use x10_emit_social. Само поле post — финальный текст с \\n как переносы строк.`;
}

export const SocialAmplifyAgent = defineAgent({
  name: "social",
  tier: "SONNET",
  system: buildSystem,
  inputSchema,
  outputSchema,
  maxOutputTokens: 2048,
  formatInput: (input) => {
    const channel = input.channel ?? "tg-x10";
    const framework = input.framework ?? DEFAULT_FRAMEWORK[channel];
    const lines = [
      `## Channel: ${channel}`,
      "",
      "## Channel rules",
      CHANNEL_RULES[channel],
      "",
      `## Framework (выбрано): ${framework}`,
      "",
      "## Draft (compressed)",
      JSON.stringify(input.draft, null, 2),
    ];
    if (input.authorName) {
      const authorVoice = loadAuthorVoice(input.authorName);
      if (authorVoice) {
        lines.push("", "## Author voice", authorVoice);
      }
    }
    return lines.join("\n");
  },
});

export type SocialAmplifyInput = z.infer<typeof inputSchema>;
export type SocialAmplifyOutput = z.infer<typeof outputSchema>;
