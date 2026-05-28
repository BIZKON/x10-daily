/**
 * Rate limiting helpers (HIGH-3 из docs/SECURITY-AUDIT.md).
 *
 * Использует CF Workers Rate Limiting API binding (см. wrangler.toml).
 * Ключ — комбинация userId (если есть) + IP, чтобы покрыть оба вектора
 * (один user shotgun + один IP с разными UUID).
 *
 * Throw 429 при превышении — Hono onError рендерит ответ. Сообщение
 * generic, без раскрытия actual limit/period.
 */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

function getClientIp(c: Context): string {
  // CF Workers always sets CF-Connecting-IP. Fallbacks для local dev / tests.
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Применяет rate limit. Бросает HTTPException(429) если превышен.
 *
 * @param c Hono context
 * @param limiter `RateLimit` binding (e.g. `c.env.ENGAGEMENT_LIMITER`)
 * @param scope Префикс для ключа (e.g. "engagement", "pipeline-run"). Изолирует разные группы лимитов на одном binding.
 * @param userId Опциональный user ID — если есть, входит в ключ.
 */
export async function applyRateLimit(
  c: Context,
  limiter: RateLimit,
  scope: string,
  userId?: string | null,
): Promise<void> {
  const ip = getClientIp(c);
  const key = `${scope}:${userId ?? "anon"}:${ip}`;
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new HTTPException(429, {
      message: "Rate limit exceeded. Slow down and try again in a minute.",
    });
  }
}
