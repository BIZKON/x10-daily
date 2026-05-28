/**
 * Node.js entrypoint для apps/api (Timeweb App Platform / Docker).
 *
 * До session 15 был apps/api/src/index.ts (export default app — CF Workers
 * стиль). После переезда на Hono on Node — server.ts использует
 * `@hono/node-server` и слушает TCP-порт.
 *
 * Bindings (env vars + runtime objects) собираются здесь и пробрасываются в
 * Hono через `app.fetch(req, bindings)`. Это позволяет роутам обращаться к
 * `c.env.DATABASE_URL` / `c.env.ENGAGEMENT_LIMITER` без изменений.
 *
 * S15 — placeholder реализации RateLimiter / ObjectStorage. В S16 заменим
 * на реальные (Redis-backed + AWS SDK S3).
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import type { AppBindings, ObjectStorage, RateLimiter } from "./bindings";
import { disconnectRedis, getRedis } from "./services/redis";
import { RedisRateLimiter } from "./services/rate-limiter-redis";
import { S3Storage, createS3Client } from "./services/s3-storage";

/** Заглушка RateLimiter — всегда allow. Используется когда REDIS_URL не задан. */
const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

function buildRateLimiters(
  redisUrl: string | undefined,
): { engagement: RateLimiter; pipeline: RateLimiter } {
  if (!redisUrl) {
    console.warn("[server] REDIS_URL не задан — rate limit disabled (noop)");
    return { engagement: noopLimiter, pipeline: noopLimiter };
  }
  const redis = getRedis(redisUrl);
  return {
    // Limits из docs/SECURITY-AUDIT.md HIGH-3 (соответствуют старым CF bindings):
    engagement: new RedisRateLimiter(redis, { limit: 30, windowSeconds: 60 }),
    pipeline: new RedisRateLimiter(redis, { limit: 10, windowSeconds: 60 }),
  };
}

function buildObjectStorage(env: NodeJS.ProcessEnv): ObjectStorage | undefined {
  const endpoint = env.S3_ENDPOINT?.trim();
  const region = env.S3_REGION?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = env.S3_BUCKET?.trim();
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
    if (env.NODE_ENV === "production") {
      console.warn("[server] S3_* env неполные — upload endpoint вернёт 503");
    }
    return undefined;
  }
  const client = createS3Client({
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: true,
  });
  return new S3Storage(client, bucket);
}

function readBindings(): AppBindings {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as AppBindings["NODE_ENV"];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL обязателен — задайте в env / docker -e DATABASE_URL=...");
  }

  const limiters = buildRateLimiters(process.env.REDIS_URL);
  const objectStorage = buildObjectStorage(process.env);

  return {
    NODE_ENV: nodeEnv,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    X10_ALLOWED_ORIGINS: process.env.X10_ALLOWED_ORIGINS,

    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,

    AI_GATEWAY_BASE_URL: process.env.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,

    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: process.env.ANTHROPIC_ZDR_CONFIRMED as AppBindings["ANTHROPIC_ZDR_CONFIRMED"],

    MASKER_BASE_URL: process.env.MASKER_BASE_URL,
    MASKER_API_KEY: process.env.MASKER_API_KEY,

    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    X10_JWT_SECRET: process.env.X10_JWT_SECRET,
    X10_JWT_TTL_SECONDS: process.env.X10_JWT_TTL_SECONDS,

    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    X10_IMAGES_PUBLIC_BASE: process.env.X10_IMAGES_PUBLIC_BASE,

    REDIS_URL: process.env.REDIS_URL,

    ENGAGEMENT_LIMITER: limiters.engagement,
    PIPELINE_LIMITER: limiters.pipeline,
    X10_IMAGES: objectStorage,
  };
}

const bindings = readBindings();
const app = createApp();
const port = Number(process.env.PORT ?? 8080);

const server = serve(
  {
    fetch: (req) => app.fetch(req, bindings),
    port,
  },
  (info) => {
    console.log(`✓ x10-api listening on http://localhost:${info.port} (${bindings.NODE_ENV})`);
  },
);

const shutdown = (signal: string) => {
  console.log(`[server] received ${signal}, closing...`);
  server.close(async (err) => {
    if (err) {
      console.error("[server] close error", err);
      process.exit(1);
    }
    // Redis quit чтобы pending команды успели завершиться.
    await disconnectRedis().catch((e) => console.error("[server] redis quit:", e));
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
