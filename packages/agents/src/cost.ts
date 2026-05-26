import { COST_PER_MTOK, type ModelTier } from "@x10/config";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic prompt-caching: токены, прочитанные из кэша (дешевле в ~10×). */
  cachedInputTokens?: number;
};

/**
 * Цена запроса в USD по тарифам CLAUDE.md §2.
 * Cached input tokens биллятся как 0.1× от обычного input (Anthropic prompt caching).
 */
export function calculateCostUsd(tier: ModelTier, usage: TokenUsage): number {
  const rate = COST_PER_MTOK[tier];
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const inputCost = (fresh * rate.input) / 1_000_000;
  const cachedCost = (cached * rate.input * 0.1) / 1_000_000;
  const outputCost = (usage.outputTokens * rate.output) / 1_000_000;
  return inputCost + cachedCost + outputCost;
}
