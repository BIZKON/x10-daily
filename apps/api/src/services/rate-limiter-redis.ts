import type { Redis } from "ioredis";
import type { RateLimiter } from "../bindings";

export interface RedisRateLimitConfig {
  /** Максимум запросов в окно. */
  limit: number;
  /** Длина окна в секундах. Default 60. */
  windowSeconds?: number;
}

/**
 * Fixed-window rate limiter поверх Redis (INCR + EXPIRE).
 *
 * Алгоритм:
 *   bucket = floor(now / window)
 *   redis_key = `rl:${input_key}:${bucket}`
 *   count = INCR(redis_key)
 *   EXPIRE(redis_key, window + grace)
 *   success = count <= limit
 *
 * Fail-open: если Redis недоступен, разрешаем запрос (log warning). Это
 * принятый trade-off — лучше пропустить лишний запрос чем уронить сервис
 * на короткой регрессии Redis. Под нагрузкой fail-open видно через метрики.
 *
 * Sliding window approximation можно добавить позже (читать prev_bucket с
 * весом по elapsed). MVP делает fixed window — простой и достаточный для
 * наших лимитов (30/мин engagement, 10/мин pipeline).
 */
export class RedisRateLimiter implements RateLimiter {
  private readonly window: number;

  constructor(
    private readonly redis: Redis,
    private readonly config: RedisRateLimitConfig,
  ) {
    this.window = config.windowSeconds ?? 60;
  }

  async limit(opts: { key: string }): Promise<{ success: boolean }> {
    const bucket = Math.floor(Date.now() / 1000 / this.window);
    const fullKey = `rl:${opts.key}:${bucket}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(fullKey);
      // grace +1 чтобы бакет точно жил всё окно с момента первой записи.
      pipeline.expire(fullKey, this.window + 1);
      const results = await pipeline.exec();

      // pipeline.exec возвращает [[err, val], [err, val]]. INCR в [0].
      if (!results || results.length < 1) {
        return { success: true };
      }
      const incrResult = results[0];
      if (!incrResult || incrResult[0]) {
        // Error from INCR — fail-open.
        console.warn("[rate-limit] redis INCR error:", incrResult?.[0]?.message);
        return { success: true };
      }
      const count = incrResult[1] as number;
      return { success: count <= this.config.limit };
    } catch (err) {
      console.warn("[rate-limit] fail-open:", err instanceof Error ? err.message : err);
      return { success: true };
    }
  }
}
