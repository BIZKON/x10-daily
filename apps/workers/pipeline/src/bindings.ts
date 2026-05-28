/**
 * Pipeline worker bindings — runtime-agnostic интерфейс env переменных.
 *
 * До session 18 был PipelineBindings (worker-configuration.d.ts). После
 * переезда на Timeweb App Platform / Docker — чистый TS интерфейс. Bindings
 * передаются в Hono через `app.fetch(req, bindings)` из server.ts.
 *
 * Все ключи строки (Node process.env source). Inngest functions сами
 * валидируют через @x10/config loadEnv.
 */
export interface PipelineBindings {
  NODE_ENV: "development" | "staging" | "production";

  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;

  // ---- AI (Timeweb AI Gateway primary, ANTHROPIC_* как legacy fallback) ----
  AI_GATEWAY_URL?: string;
  AI_GATEWAY_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ZDR_CONFIRMED?: "true" | "false";

  // ---- Masker (опционально — через Timeweb AI Gateway не нужен) ----
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  // ---- Inngest (signing key обязателен в prod — CRITICAL-4) ----
  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;
}
