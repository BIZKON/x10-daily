import { BLACKLIST, VOICE_RULES, loadAuthorVoice } from "@x10/voice";
import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema } from "./schemas";

const inputSchema = z.object({
  draft: draftShapeSchema,
  /** Имя автора если статья от спикера (Рыбаков). null = голос редакции. */
  authorName: z.string().nullable().optional(),
});

const outputSchema = z.object({
  revised: draftShapeSchema,
  changes: z.array(
    z.object({
      kind: z.enum(["blacklist", "tone", "rhythm", "structure"]),
      before: z.string(),
      after: z.string(),
      reason: z.string(),
    }),
  ),
});

const BLACKLIST_STR = BLACKLIST.map((w) => `  - "${w}"`).join("\n");

function buildSystem(): string {
  return `Ты — ToVAgent редакции Х10 Daily. Получаешь черновик и приводишь его к голосу редакции.

VOICE RULES:
${VOICE_RULES}

ЧЁРНЫЙ СПИСОК (никогда не используем, заменяй на эквиваленты):
${BLACKLIST_STR}

ТВОЙ JOB:
1. Прочесть draft.body + tease/lede/whyItMatters
2. Найти и заменить blacklist-термины
3. Привести ритм к 14 слов/предложение, max 25
4. Удалить эмоциональные усилители («революционный», «потрясающий» — см. voice.md §тон)
5. Проверить что числа и даты сохранены 1:1 (НЕ переписывай цифры)
6. Если authorName задан — учитывай авторский голос (он будет инжектирован отдельно)
7. Заполнить changes: каждое изменение с before/after/reason

ВАЖНО:
- Не удаляй блоки. Не переставляй порядок body.
- Не сокращай контент — для сокращения есть BrevityAgent.
- Не выдумывай новые цифры. Не добавляй цитаты которых не было в draft.

Возвращай через tool_use x10_emit_tov.`;
}

export const ToVAgent = defineAgent({
  name: "tov",
  tier: "SONNET",
  system: buildSystem,
  inputSchema,
  outputSchema,
  maxOutputTokens: 4096,
  formatInput: (input) => {
    const lines = [JSON.stringify(input.draft, null, 2)];
    if (input.authorName) {
      const authorVoice = loadAuthorVoice(input.authorName);
      if (authorVoice) {
        lines.push("", "## Author voice", authorVoice);
      }
    }
    return lines.join("\n");
  },
});

export type ToVInput = z.infer<typeof inputSchema>;
export type ToVOutput = z.infer<typeof outputSchema>;
