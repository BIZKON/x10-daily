import type { ModelTier } from "@x10/config";
import type { PipelineEnv } from "../env";

/**
 * Override моделей по tier'у из env (session 23) → поле `models` в AgentContext.
 * Пусто → агент берёт дефолт MODELS[tier] (Claude). Позволяет перевести
 * воркер-агентов на DeepSeek V4 Flash флипом .env.production
 * (MODEL_SONNET/MODEL_HAIKU=deepseek/deepseek-v4-flash), не трогая код. FactCheck
 * (OPUS) остаётся на Claude — MODEL_OPUS не задаём. Включаются только заданные
 * (непустые) tier'ы; стоимость считается по фактической модели (cost.ts).
 */
export function modelsFromEnv(env: PipelineEnv): Partial<Record<ModelTier, string>> {
  const models: Partial<Record<ModelTier, string>> = {};
  if (env.MODEL_OPUS) models.OPUS = env.MODEL_OPUS;
  if (env.MODEL_SONNET) models.SONNET = env.MODEL_SONNET;
  if (env.MODEL_HAIKU) models.HAIKU = env.MODEL_HAIKU;
  return models;
}
