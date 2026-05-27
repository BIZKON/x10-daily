/**
 * Worker-side env типы. Расширяется по мере добавления bindings в wrangler.toml.
 */
interface CloudflareBindings {
  // ---- Vars ----
  NODE_ENV: "development" | "staging" | "production";
  NEXT_PUBLIC_POSTHOG_HOST?: string;

  // ---- Secrets (`wrangler secret put`) ----
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  // ---- Inngest (отправка событий в pipeline worker) ----
  INNGEST_EVENT_KEY?: string;

  // ---- R2 Images bucket (Этап 3g) ----
  // Раскомментировать в wrangler.toml после `wrangler r2 bucket create x10-images`.
  // Public URLs строятся через X10_IMAGES_PUBLIC_BASE (custom domain или R2 .dev).
  X10_IMAGES?: R2Bucket;
  X10_IMAGES_PUBLIC_BASE?: string;

  // ---- Bindings (раскомментировать после `wrangler hyperdrive create`) ----
  // HYPERDRIVE: Hyperdrive;
}

// vitest-pool-workers использует `Cloudflare.Env` — мейнтейним один источник правды.
declare namespace Cloudflare {
  interface Env extends CloudflareBindings {}
}
