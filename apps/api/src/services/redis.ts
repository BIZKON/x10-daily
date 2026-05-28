import { Redis, type RedisOptions } from "ioredis";

/**
 * Redis singleton-фабрика для rate limit + (в будущем) caching.
 * Поднимаем по url из REDIS_URL env. Lazy connect — соединение откладывается
 * до первого ENQ/INCR команды (lazyConnect: true).
 */
let cached: Redis | null = null;

export function getRedis(url: string, options?: RedisOptions): Redis {
  if (cached) return cached;
  cached = new Redis(url, {
    // Conservative defaults — production Redis может тормозить на cold start.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5_000,
    // Lazy connect — не делать TCP handshake на require, только на первую команду.
    // Полезно для tests + graceful boot без Redis (rate limit падает в fail-open).
    lazyConnect: true,
    ...options,
  });

  cached.on("error", (err) => {
    console.error("[redis] error:", err.message);
  });

  return cached;
}

export async function disconnectRedis(): Promise<void> {
  if (!cached) return;
  await cached.quit();
  cached = null;
}
