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

  // ---- Bindings (раскомментировать после `wrangler hyperdrive create`) ----
  // HYPERDRIVE: Hyperdrive;
}

// vitest-pool-workers использует `Cloudflare.Env` — мейнтейним один источник правды.
declare namespace Cloudflare {
  interface Env extends CloudflareBindings {}
}
