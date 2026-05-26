import { BREVITY_LIMITS } from "@x10/config";
import { ABOUT_ME } from "@x10/voice";
import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema, sourceRefSchema } from "./schemas";

const inputSchema = z.object({
  topic: z.string(),
  context: z.string(),
  sources: z.array(sourceRefSchema).min(1),
  section: z
    .enum(["main", "numbers", "people", "playbook", "weekend", "longread"])
    .default("main"),
});

const outputSchema = draftShapeSchema;

const SYSTEM = `Ты — DraftAgent редакции Х10 Daily. Твоя задача: написать первичный драфт статьи в формате Smart Brevity.

КТО МЫ:
${ABOUT_ME}

ФОРМАТ Smart Brevity (6 блоков):
1. tease — заголовок-крючок, ≤ 60 знаков, содержит число или собственное имя
2. lede — одна вводящая фраза, что произошло
3. whyItMatters — отдельный абзац, всегда выделен; почему это важно для делового читателя
4. body — массив блоков; включи:
   - callout kind="why" (если whyItMatters требует деталей)
   - numbers с конкретными цифрами и source URL
   - quote с атрибуцией (кто/где/когда) если есть прямые цитаты
   - callout kind="yes-but" с контраргументом
   - callout kind="what-next" — что дальше / куда смотреть

ОГРАНИЧЕНИЯ:
- Общий объём text-полей ≤ ${BREVITY_LIMITS.MAX_WORDS} слов
- Время чтения ${BREVITY_LIMITS.READ_SECONDS_MIN}–${BREVITY_LIMITS.READ_SECONDS_MAX} сек
- Все цифры — со ссылкой на source.url из inputs.sources
- Никаких выдуманных цитат — только из источников
- Без слов из чёрного списка (ToV применит отдельный агент, но не пиши заведомо «инфобиз»-лексику)

Возвращай результат строго через tool_use x10_emit_draft.`;

export const DraftAgent = defineAgent({
  name: "draft",
  tier: "SONNET",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 3072,
});

export type DraftInput = z.infer<typeof inputSchema>;
export type DraftOutput = z.infer<typeof outputSchema>;
