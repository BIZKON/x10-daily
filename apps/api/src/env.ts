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
    ANTHROPIC_ZDR_CONFIRMED: bindings.ANTHROPIC_ZDR_CONFIRMED,
    MASKER_BASE_URL: bindings.MASKER_BASE_URL,
    MASKER_API_KEY: bindings.MASKER_API_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: bindings.NEXT_PUBLIC_POSTHOG_HOST,
    INNGEST_EVENT_KEY: bindings.INNGEST_EVENT_KEY,
  };
  cached = loadEnv(source);
  return cached;
}

export type ApiEnv = BaseEnv;

/**
 * R2 binding выделен отдельно — runtime CF object, не строка.
 * Возвращаем null если binding или public base URL не настроены —
 * upload endpoint вернёт 503 с осмысленным сообщением.
 */
export type ImagesConfig = {
  bucket: R2Bucket;
  publicBase: string;
};

export function getImagesConfig(bindings: CloudflareBindings): ImagesConfig | null {
  if (!bindings.X10_IMAGES) return null;
  const publicBase = (bindings.X10_IMAGES_PUBLIC_BASE ?? "").trim();
  if (!publicBase) return null;
  return { bucket: bindings.X10_IMAGES, publicBase: publicBase.replace(/\/+$/, "") };
}
