import { loadEnv, type Env as BaseEnv } from "@x10/config";

/**
 * Pipeline worker env → @x10/config Zod-валидация.
 *
 * CRITICAL-4 / CRITICAL-6 из docs/SECURITY-AUDIT.md:
 * - loadEnv enforces production-required keys (INNGEST_SIGNING_KEY,
 *   MASKER_BASE_URL/API_KEY, ANTHROPIC_API_KEY) → без них boot fails fast.
 * - Дополнительно проверяет ANTHROPIC_ZDR_CONFIRMED="true" если есть API_KEY.
 *
 * Кэширование per-isolate — повторные парсы дёшевы.
 */
let cached: BaseEnv | undefined;

export function getPipelineEnv(bindings: CloudflareBindings): BaseEnv {
  if (cached) return cached;
  const source: Record<string, string | undefined> = {
    NODE_ENV: bindings.NODE_ENV,
    DATABASE_URL: bindings.DATABASE_URL,
    DIRECT_DATABASE_URL: bindings.DIRECT_DATABASE_URL,
    ANTHROPIC_API_KEY: bindings.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: bindings.ANTHROPIC_ZDR_CONFIRMED,
    MASKER_BASE_URL: bindings.MASKER_BASE_URL,
    MASKER_API_KEY: bindings.MASKER_API_KEY,
    INNGEST_EVENT_KEY: bindings.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: bindings.INNGEST_SIGNING_KEY,
  };
  cached = loadEnv(source);
  return cached;
}

export type PipelineEnv = BaseEnv;
