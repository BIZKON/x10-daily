import { z } from "zod";
import { defineAgent } from "../define-agent";
import { draftShapeSchema, sourceRefSchema } from "./schemas";

/**
 * FactCheckAgent — CLAUDE.md §4 #04.
 * Opus 4.7 (дорого, но точно). Запускается ТОЛЬКО для political тем
 * (event.data.political === true). Если хотя бы один claim получает halt — workflow
 * останавливается, статья не публикуется.
 */
const inputSchema = z.object({
  draft: draftShapeSchema,
  sources: z.array(sourceRefSchema).min(1),
  /** Опциональный контекст: например, кто из спикеров фигурирует и почему тема политическая. */
  topicContext: z.string().optional(),
});

export const FACTCHECK_CONFIDENCE = ["high", "medium", "low"] as const;
export type FactCheckConfidence = (typeof FACTCHECK_CONFIDENCE)[number];

export const FACTCHECK_VERDICT = [
  "supported", // источники прямо подтверждают
  "partially-supported", // часть деталей подтверждена, часть нет
  "unsupported", // нет ссылки в sources
  "contradicted", // источники прямо противоречат
] as const;
export type FactCheckVerdictKind = (typeof FACTCHECK_VERDICT)[number];

const claimSchema = z.object({
  /** Утверждение в свободной форме, как оно появляется в draft. */
  claim: z.string(),
  /** Где в draft встретилось — для UI: «tease», «lede», «body[2]». */
  location: z.string(),
  verdict: z.enum(FACTCHECK_VERDICT),
  confidence: z.enum(FACTCHECK_CONFIDENCE),
  /** URL'ы из sources которые поддерживают (если verdict=supported|partially-supported). */
  supportingSourceUrls: z.array(z.string()),
  /** URL'ы из sources которые противоречат (если verdict=contradicted|partially-supported). */
  contradictingSourceUrls: z.array(z.string()),
  /** Объяснение почему именно такой verdict, ≤ 60 слов. */
  rationale: z.string(),
});

export const FACTCHECK_STATUS = ["passed", "review-needed", "halt"] as const;
export type FactCheckStatus = (typeof FACTCHECK_STATUS)[number];

const outputSchema = z.object({
  claims: z.array(claimSchema),
  /**
   * passed       — все claims supported или partially-supported с high confidence
   * review-needed — есть unsupported или partially-supported low/medium confidence
   * halt         — есть contradicted claim, либо unsupported high-stake claim (цифра/имя/дата)
   */
  status: z.enum(FACTCHECK_STATUS),
  /** Краткая суммарная причина для status=halt или review-needed. Обязательна если не passed. */
  haltReason: z.string().nullable(),
});

const SYSTEM = `Ты — FactCheckAgent редакции Х10 Daily. Получаешь готовый к публикации draft по политически чувствительной теме и проверяешь каждое утверждение против предоставленных sources.

КРИТИЧНО:
- НЕ используй внешние знания о мире для проверки. Только sources из input.
- НЕ домысливай — если sources молчат об утверждении, verdict = "unsupported", не "supported".
- Высокоставочные утверждения (имена, цифры, даты, конкретные суммы) требуют ПРЯМОГО подтверждения. Косвенные намёки = "unsupported".

КАК РАЗМЕЧАТЬ КАЖДЫЙ CLAIM:

verdict:
- supported           — source прямо подтверждает (есть точная цифра/имя/факт)
- partially-supported — часть claim подтверждена, часть домыслена/расширена
- unsupported         — нет в sources, но и не противоречит
- contradicted        — source прямо противоречит

confidence:
- high   — однозначное подтверждение или противоречие в sources
- medium — намёк, контекстуальное соответствие
- low    — спорная интерпретация

status (общий вердикт):
- passed         — все claims supported (любая confidence) или partially-supported (high)
- review-needed  — есть unsupported, или partially-supported low/medium confidence
- halt           — есть contradicted claim, ИЛИ unsupported high-stake (цифра/имя/дата/сумма)

haltReason:
- если status = passed → null
- если status = review-needed → 1 фраза что требует ревью
- если status = halt → 1 фраза почему нельзя публиковать

ЛОКАЦИИ в draft (для location-поля):
- "tease"
- "lede"
- "whyItMatters"
- "body[0]", "body[1]", … "body[N]"

ОДНО CLAIM — ОДНО АТОМАРНОЕ УТВЕРЖДЕНИЕ. Не сливай несколько утверждений в один claim.

Возвращай через tool_use x10_emit_factcheck.`;

export const FactCheckAgent = defineAgent({
  name: "factcheck",
  tier: "OPUS",
  system: SYSTEM,
  inputSchema,
  outputSchema,
  maxOutputTokens: 4096,
});

export type FactCheckInput = z.infer<typeof inputSchema>;
export type FactCheckOutput = z.infer<typeof outputSchema>;
