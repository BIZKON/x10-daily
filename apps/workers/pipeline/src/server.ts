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
import { readBindingsFromEnv } from "./bindings";

// readBindingsFromEnv вынесена в bindings.ts (side-effect-free, тестируемая) —
// чтобы новый env-ключ не «терялся по дороге» (см. её докстринг + bindings.test.ts).
const bindings = readBindingsFromEnv();
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
