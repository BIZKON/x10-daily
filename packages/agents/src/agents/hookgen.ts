import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema } from "./schemas";

/**
 * 6 паттернов хуков (HookGenAgent):
 * - number-led       — начало с яркой цифры или дельты («80% заявок закрывает бот»)
 * - contrarian       — контр-консенсус, опровержение хайпа («ИИ-агент не про увольнения»)
 * - transformation   — до/после, что изменилось («было 4 часа в день, стало 20 минут»)
 * - authority        — кто стоит за заявлением («Минцифры: у МСП с ИИ выручка растёт быстрее»)
 * - admission        — признание неприятного («половина внедрений чат-ботов не окупается»)
 * - future-shock     — будущий риск или событие («что изменит обязательная маркировка ИИ-контента»)
 */
export const HOOK_PATTERNS = [
  "number-led",
  "contrarian",
  "transformation",
  "authority",
  "admission",
  "future-shock",
] as const;
export type HookPattern = (typeof HOOK_PATTERNS)[number];

export const HOOK_CHANNELS = ["tg-rybakov", "tg-x10", "vk", "zen", "linkedin"] as const;
export type HookChannel = (typeof HOOK_CHANNELS)[number];

const inputSchema = z.object({
  draft: draftShapeSchema,
  channel: z.enum(HOOK_CHANNELS).default("tg-x10"),
});

const hookSchema = z.object({
  // .catch: Timeweb AI Gateway не строго энфорсит tool-enum'ы; pattern —
  // advisory-метка для редактора, отклонение модели → дефолт, не падаем.
  pattern: z.enum(HOOK_PATTERNS).catch("number-led"),
  /** Сам текст хука — ≤ 140 знаков, содержит число или собственное имя. */
  text: z.string(),
  /** Зачем именно этот паттерн — для редактора при выборе. */
  reasoning: z.string(),
});

const outputSchema = z.object({
  hooks: z.array(hookSchema),
});

const PATTERN_LINES = [
  '- number-led — открой яркой цифрой или дельтой ("80% заявок автосервиса закрывает бот")',
  '- contrarian — контр-консенсус, ломает ожидание ("Внедрение ИИ-агента не про увольнения")',
  '- transformation — до/после, сдвиг ("Было 4 часа на заказы в день. Стало 20 минут")',
  '- authority — кто стоит за заявлением ("Минцифры: у МСП с ИИ выручка растёт быстрее")',
  '- admission — признание неприятного для делового читателя ("Половина внедрений чат-ботов не окупается")',
  '- future-shock — будущий риск/событие ("С 2027 маркировка ИИ-контента станет обязательной")',
].join("\n");

const CHANNEL_LINES = [
  "- tg-rybakov   — авторский канал основателя ProAgent AI; от первого лица, прямой, без регалий",
  "- tg-x10       — канал «ИИ работает на вас!», официальный канал редакции; деловой, сухой, без эмодзи",
  "- vk           — VK сообщество; более простой синтаксис, без англицизмов",
  "- zen          — Дзен; заголовочный стиль, кликабельный, но без кликбейта",
  "- linkedin     — LinkedIn RU; деловой английский-style, focus на инсайт",
].join("\n");

const SYSTEM = `Ты — HookGenAgent редакции ProAgent AI. Получаешь готовую статью и генерируешь по одному хуку на каждый из шести паттернов.

ШЕСТЬ ПАТТЕРНОВ (один хук на паттерн, итого 6):
${PATTERN_LINES}

КАНАЛЫ (выбирается inputs.channel):
${CHANNEL_LINES}

ПРАВИЛА:
- Каждый hook.text ≤ 140 знаков (включая пробелы)
- Каждый hook содержит число ИЛИ собственное имя (компания, человек, страна)
- НЕ начинай открывающую строку с вопроса — открывалка утверждает, не спрашивает
- НЕ используй em-dash (—). Точку, запятую или двоеточие — да; длинное тире — нет
- Цифры — арабскими (3, не «три»; 17%, не «семнадцать процентов»)
- Без хедж-слов: «возможно», «по-видимому», «вероятно», «может быть»
- Каждое слово зарабатывает место. Слабый хук хуже отсутствия хука
- Используй только факты из draft (lede/whyItMatters/body) — не выдумывай
- reasoning ≤ 25 слов, объясняет почему этот хук работает для данного канала
- Не используй чёрный список ProAgent AI («магия нейросетей», «ИИ заменит всех», «секреты успеха» и т.д. — см. ToV)
- Не повторяй паттерны: ровно 6 hooks, по одному на каждый pattern из enum

ДЛЯ КАНАЛОВ linkedin / tg-rybakov / tg-x10 — допускается формат «двухстрочка»:
строка 1 (≤40 знаков) утверждение → строка 2 (≤40 знаков) переворот/контраст.
В hook.text это НАСТОЯЩИЙ перенос строки между строками (не последовательность из обратного слэша и n как текст).

Возвращай через tool_use x10_emit_hookgen.`;

export const HookGenAgent = defineAgent({
  name: "hookgen",
  tier: "HAIKU",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 1024,
});

export type HookGenInput = z.infer<typeof inputSchema>;
export type HookGenOutput = z.infer<typeof outputSchema>;
