/**
 * Node.js entrypoint для apps/workers/pipeline (Timeweb App Platform / Docker).
 *
 * До session 18 был apps/workers/pipeline/src/index.ts (CF Workers default export).
 * После переезда на Node — `@hono/node-server` слушает TCP порт.
 *
 * Bindings собираются из process.env и пробрасываются в Hono через
 * `app.fetch(req, bindings)`. Inngest functions получают `bindings` как
 * second аргумент factory (см. inngest/functions/*).
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import type { PipelineBindings } from "./bindings";

function readBindings(): PipelineBindings {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as PipelineBindings["NODE_ENV"];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL обязателен — задайте в env / docker-compose: DATABASE_URL=postgresql://...",
    );
  }
  return {
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,

    AI_GATEWAY_BASE_URL: process.env.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: process.env
      .ANTHROPIC_ZDR_CONFIRMED as PipelineBindings["ANTHROPIC_ZDR_CONFIRMED"],

    MASKER_BASE_URL: process.env.MASKER_BASE_URL,
    MASKER_API_KEY: process.env.MASKER_API_KEY,

    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TG_TEST_CHANNEL_ID: process.env.TG_TEST_CHANNEL_ID,
    TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL,

    TG_OPS_CHAT_ID: process.env.TG_OPS_CHAT_ID,
    DAILY_BUDGET_USD: process.env.DAILY_BUDGET_USD,
    DAILY_BUDGET_WARN_USD: process.env.DAILY_BUDGET_WARN_USD,

    VK_ACCESS_TOKEN: process.env.VK_ACCESS_TOKEN,
    VK_OWNER_ID: process.env.VK_OWNER_ID,
  };
}

const bindings = readBindings();
const app = createApp();
const port = Number(process.env.PORT ?? 8787);

const server = serve(
  {
    fetch: (req) => app.fetch(req, bindings),
    port,
  },
  (info) => {
    console.log(
      `✓ x10-worker-pipeline listening on http://localhost:${info.port} (${bindings.NODE_ENV})`,
    );
  },
);

const shutdown = (signal: string) => {
  console.log(`[server] received ${signal}, closing...`);
  server.close((err) => {
    if (err) {
      console.error("[server] close error", err);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
