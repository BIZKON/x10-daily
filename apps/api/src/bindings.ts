/**
 * AppBindings — runtime-agnostic интерфейс зависимостей API сервера.
 *
 * До session 15 был тип CloudflareBindings (worker-configuration.d.ts) с
 * R2Bucket / RateLimit / etc. — CF Workers specific. После переезда на
 * Timeweb App Platform (Hono on Node) — заменён на чистые TypeScript типы.
 *
 * Bindings приходят в Hono через `app.fetch(req, bindings)` из server.ts.
 * Реализации:
 *   - RateLimiter — заглушка в S15 (в S16 заменим на Redis-backed)
 *   - ObjectStorage — заглушка в S15 (в S16 заменим на AWS SDK S3 client)
 */
export interface RateLimiter {
  /**
   * Возвращает {success: true} если запрос укладывается в лимит, false если
   * превышен. Key — комбинация scope+userId+IP (см. rate-limit.ts).
   */
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface ObjectStorage {
  /**
   * Загружает объект в bucket. body может быть ReadableStream / Buffer /
   * Uint8Array. opts включает httpMetadata (Content-Type, Cache-Control) +
   * customMetadata (uploadedBy, originalName).
   */
  put(
    key: string,
    body: ReadableStream | Uint8Array | Buffer,
    opts?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void>;
}

export interface AppBindings {
  // ---- Vars (process.env) ----
  NODE_ENV: "development" | "staging" | "production";
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  /** Comma-separated origins для CORS (HIGH-1). Wildcards `https://*.vercel.app`. */
  X10_ALLOWED_ORIGINS?: string;

  // ---- Secrets ----
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;

  // ---- AI Gateway (Timeweb OpenAI-compat) ----
  AI_GATEWAY_BASE_URL?: string;
  AI_GATEWAY_API_KEY?: string;

  // ---- Legacy direct Anthropic (fallback) ----
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ZDR_CONFIRMED?: "true" | "false";

  // ---- Masker (опционально — deprecated при работе через AI Gateway) ----
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  // ---- Inngest (отправка событий в pipeline worker) ----
  INNGEST_EVENT_KEY?: string;

  // ---- Telegram session auth (HIGH-2) ----
  TELEGRAM_BOT_TOKEN?: string;
  X10_JWT_SECRET?: string;
  X10_JWT_TTL_SECONDS?: string;

  // ---- S3 storage (Timeweb) — настраивается в S16 ----
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_BUCKET?: string;
  X10_IMAGES_PUBLIC_BASE?: string;

  // ---- Redis (для rate limit + Inngest) — настраивается в S16 ----
  REDIS_URL?: string;

  // ---- Runtime bindings (created в server.ts) ----
  ENGAGEMENT_LIMITER: RateLimiter;
  PIPELINE_LIMITER: RateLimiter;
  X10_IMAGES?: ObjectStorage;
}
