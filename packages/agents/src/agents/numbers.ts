import { z } from "zod";
import { defineAgent } from "../define-agent";
import { sourceRefSchema } from "./schemas";

const inputSchema = z.object({
  /** Сырой текст (draft.body, lede, whyItMatters склеенные). */
  text: z.string(),
  sources: z.array(sourceRefSchema),
});

const numberItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  /** URL из sources, к которому привязана цифра. null если не удалось сопоставить. */
  source: z.string().nullable(),
  /** Сжатая контекстная цитата из источника, ≤ 25 слов. */
  contextQuote: z.string().optional(),
});

const outputSchema = z.object({
  items: z.array(numberItemSchema),
  /** true если хотя бы одна цифра не нашла источник — DraftAgent должен перечитать. */
  hasUnsourcedNumbers: z.boolean(),
});

const SYSTEM = `Ты — NumbersAgent. Твоя задача: вытащить из текста все числовые утверждения и привязать каждое к источнику из inputs.sources.

ПРАВИЛА:
- Извлекаешь: проценты, суммы (₽/$/€/¥), даты, доли рынка, количества (человек, компаний, штук)
- label = что эта цифра означает на человеческом (например: «Ключевая ставка ЦБ»)
- value = сама цифра в человеческом виде с единицей («17%», «312 млрд ₽», «420 участников»)
- source = URL из inputs.sources, который ПРЯМО подтверждает эту цифру. Если такой ссылки нет — source=null и hasUnsourcedNumbers=true
- contextQuote = до 25 слов из подтверждающего источника
- Не выдумывай цифры. Не округляй, не «улучшай». Точно как в тексте

Возвращай через tool_use x10_emit_numbers.`;

export const NumbersAgent = defineAgent({
  name: "numbers",
  tier: "HAIKU",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 1536,
});

export type NumbersInput = z.infer<typeof inputSchema>;
export type NumbersOutput = z.infer<typeof outputSchema>;
