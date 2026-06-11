import { type Env as BaseEnv, loadEnv } from "@x10/config";
import type { AppBindings, ObjectStorage } from "./bindings";

/**
 * Bindings (env vars + runtime objects) → @x10/config Zod-валидация.
 * Кэшируется per process — повторные парсы дешёвы.
 */
let cached: BaseEnv | undefined;

/**
 * Prod-required ключи именно для API. В отличие от глобального productionRequired
 * (@x10/config) НЕ требует INNGEST_SIGNING_KEY: signing key верифицирует входящие
 * Inngest-вебхуки и нужен только pipeline-воркеру (он serve'ит /inngest). API
 * лишь ШЛЁТ события через INNGEST_EVENT_KEY и signing key в source даже не
 * маппит. Без этого override loadEnv падал в проде «missing INNGEST_SIGNING_KEY»
 * → getEnv throw ДО auth → все /v1/admin/* читения отдавали 500 (а не 401).
 */
const API_REQUIRED_KEYS = [
  "AI_GATEWAY_API_KEY",
  "INNGEST_EVENT_KEY",
  "TELEGRAM_BOT_TOKEN",
  "X10_JWT_SECRET",
] as const satisfies ReadonlyArray<keyof BaseEnv>;

export function getEnv(bindings: AppBindings): BaseEnv {
  if (cached) return cached;
  const source: Record<string, string | undefined> = {
    NODE_ENV: bindings.NODE_ENV,
    DATABASE_URL: bindings.DATABASE_URL,
    DIRECT_DATABASE_URL: bindings.DIRECT_DATABASE_URL,
    AI_GATEWAY_BASE_URL: bindings.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: bindings.AI_GATEWAY_API_KEY,
    ANTHROPIC_API_KEY: bindings.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: bindings.ANTHROPIC_ZDR_CONFIRMED,
    MASKER_BASE_URL: bindings.MASKER_BASE_URL,
    MASKER_API_KEY: bindings.MASKER_API_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: bindings.NEXT_PUBLIC_POSTHOG_HOST,
    INNGEST_EVENT_KEY: bindings.INNGEST_EVENT_KEY,
    TELEGRAM_BOT_TOKEN: bindings.TELEGRAM_BOT_TOKEN,
    X10_JWT_SECRET: bindings.X10_JWT_SECRET,
    X10_JWT_TTL_SECONDS: bindings.X10_JWT_TTL_SECONDS,
  };
  cached = loadEnv(source, { requiredKeys: API_REQUIRED_KEYS });
  return cached;
}

export type ApiEnv = BaseEnv;

/**
 * Object storage binding выделен отдельно — runtime объект, не строка.
 * Возвращает null если binding или public base URL не настроены —
 * upload endpoint вернёт 503 с осмысленным сообщением.
 */
export type ImagesConfig = {
  bucket: ObjectStorage;
  publicBase: string;
};

export function getImagesConfig(bindings: AppBindings): ImagesConfig | null {
  if (!bindings.X10_IMAGES) return null;
  const publicBase = (bindings.X10_IMAGES_PUBLIC_BASE ?? "").trim();
  if (!publicBase) return null;
  return { bucket: bindings.X10_IMAGES, publicBase: publicBase.replace(/\/+$/, "") };
}
