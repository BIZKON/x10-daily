import { loadEnv, type Env as BaseEnv } from "@x10/config";
import type { PipelineBindings } from "./bindings";

/**
 * Pipeline worker env → @x10/config Zod-валидация.
 *
 * CRITICAL-4 из docs/SECURITY-AUDIT.md:
 * - loadEnv enforces INNGEST_SIGNING_KEY в production. Без него boot fails.
 * - AI_GATEWAY_API_KEY required в production (primary LLM auth). ANTHROPIC_*
 *   опционально (legacy direct fallback).
 *
 * Кэширование per-process — повторные парсы дёшевы.
 */
let cached: BaseEnv | undefined;

export function getPipelineEnv(bindings: PipelineBindings): BaseEnv {
  if (cached) return cached;
  const source: Record<string, string | undefined> = {
    NODE_ENV: bindings.NODE_ENV,
    DATABASE_URL: bindings.DATABASE_URL,
    DIRECT_DATABASE_URL: bindings.DIRECT_DATABASE_URL,
    AI_GATEWAY_URL: bindings.AI_GATEWAY_URL,
    AI_GATEWAY_API_KEY: bindings.AI_GATEWAY_API_KEY,
    ANTHROPIC_API_KEY: bindings.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: bindings.ANTHROPIC_ZDR_CONFIRMED,
    MASKER_BASE_URL: bindings.MASKER_BASE_URL,
    MASKER_API_KEY: bindings.MASKER_API_KEY,
    INNGEST_EVENT_KEY: bindings.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: bindings.INNGEST_SIGNING_KEY,
    TELEGRAM_BOT_TOKEN: bindings.TELEGRAM_BOT_TOKEN,
    TG_TEST_CHANNEL_ID: bindings.TG_TEST_CHANNEL_ID,
  };
  cached = loadEnv(source);
  return cached;
}

export type PipelineEnv = BaseEnv;
