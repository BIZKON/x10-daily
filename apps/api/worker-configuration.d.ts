/**
 * Worker-side env типы. Расширяется по мере добавления bindings в wrangler.toml.
 */
interface CloudflareBindings {
  // ---- Vars ----
  NODE_ENV: "development" | "staging" | "production";
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  /**
   * Comma-separated origins для CORS (HIGH-1). Wildcards вида
   * `https://*.vercel.app` поддерживаются. Пусто в prod = closed-by-default.
   * Пример: "https://x10daily.com,https://admin.x10daily.com,https://web.telegram.org"
   */
  X10_ALLOWED_ORIGINS?: string;

  // ---- Secrets (`wrangler secret put`) ----
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  /** "true" подтверждает что ZDR-контракт подписан (152-ФЗ, CRITICAL-6). */
  ANTHROPIC_ZDR_CONFIRMED?: "true" | "false";
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  // ---- Inngest (отправка событий в pipeline worker) ----
  INNGEST_EVENT_KEY?: string;

  // ---- R2 Images bucket (Этап 3g) ----
  // Раскомментировать в wrangler.toml после `wrangler r2 bucket create x10-images`.
  // Public URLs строятся через X10_IMAGES_PUBLIC_BASE (custom domain или R2 .dev).
  X10_IMAGES?: R2Bucket;
  X10_IMAGES_PUBLIC_BASE?: string;

  // ---- Rate limiters (HIGH-3, CF Workers ratelimit bindings) ----
  ENGAGEMENT_LIMITER: RateLimit;
  PIPELINE_LIMITER: RateLimit;

  // ---- Bindings (раскомментировать после `wrangler hyperdrive create`) ----
  // HYPERDRIVE: Hyperdrive;
}

// vitest-pool-workers использует `Cloudflare.Env` — мейнтейним один источник правды.
declare namespace Cloudflare {
  interface Env extends CloudflareBindings {}
}
