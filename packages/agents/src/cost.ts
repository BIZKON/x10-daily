import { COST_PER_MTOK, MODEL_COSTS, type ModelTier } from "@x10/config";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic prompt-caching: токены, прочитанные из кэша (дешевле в ~10×). */
  cachedInputTokens?: number;
};

/**
 * Цена запроса в USD. Если задан modelId и он есть в MODEL_COSTS — считаем по
 * ФАКТИЧЕСКОЙ модели (важно при env-override tier'а, напр. SONNET→deepseek/...).
 * Иначе fallback на тариф tier'а (COST_PER_MTOK). Неизвестная модель → fallback
 * + warn (чтобы $-ledger не врал молча). Cached input биллится как 0.1×
 * (Anthropic prompt caching; DeepSeek кэш не отдаёт → cached=0 → обычная цена).
 */
export function calculateCostUsd(tier: ModelTier, usage: TokenUsage, modelId?: string): number {
  let rate: { input: number; output: number } = COST_PER_MTOK[tier];
  if (modelId) {
    const byModel = MODEL_COSTS[modelId];
    if (byModel) {
      rate = byModel;
    } else {
      console.warn(
        `calculateCostUsd: нет тарифа для модели "${modelId}" — fallback на tier ${tier}. ` +
          "Добавь в MODEL_COSTS (@x10/config/constants.ts), иначе $-ledger неточен.",
      );
    }
  }
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const inputCost = (fresh * rate.input) / 1_000_000;
  const cachedCost = (cached * rate.input * 0.1) / 1_000_000;
  const outputCost = (usage.outputTokens * rate.output) / 1_000_000;
  return inputCost + cachedCost + outputCost;
}
