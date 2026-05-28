interface CloudflareBindings {
  NODE_ENV: "development" | "staging" | "production";

  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;

  ANTHROPIC_API_KEY: string;
  /** "true" подтверждает что ZDR-контракт подписан (152-ФЗ, CRITICAL-6). */
  ANTHROPIC_ZDR_CONFIRMED?: "true" | "false";
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;
}

declare namespace Cloudflare {
  interface Env extends CloudflareBindings {}
}
