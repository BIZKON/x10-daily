import { loadEnv, type Env as BaseEnv } from "@x10/config";

/**
 * Cloudflare Workers env → @x10/config Zod-валидация.
 * Кэшируется на инстанс воркера (исолят), так что повторные парсы дёшевы.
 */
let cached: BaseEnv | undefined;

export function getEnv(bindings: CloudflareBindings): BaseEnv {
  if (cached) return cached;
  const source: Record<string, string | undefined> = {
    NODE_ENV: bindings.NODE_ENV,
    DATABASE_URL: bindings.DATABASE_URL,
    DIRECT_DATABASE_URL: bindings.DIRECT_DATABASE_URL,
    ANTHROPIC_API_KEY: bindings.ANTHROPIC_API_KEY,
    MASKER_BASE_URL: bindings.MASKER_BASE_URL,
    MASKER_API_KEY: bindings.MASKER_API_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: bindings.NEXT_PUBLIC_POSTHOG_HOST,
    INNGEST_EVENT_KEY: bindings.INNGEST_EVENT_KEY,
  };
  cached = loadEnv(source);
  return cached;
}

export type ApiEnv = BaseEnv;
