import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

/**
 * MVP auth — читаем X-User-Id header.
 * TODO(M1): заменить на Telegram initData session verification + JWT.
 * CLAUDE.md §2 → Auth: «Telegram initData + MAX OAuth + email magic link».
 *
 * Сейчас header — это ХАК для разработки и тестов. В prod без дополнительной
 * middleware (rate limit / origin check) НЕ деплоим.
 */
const userIdSchema = z.string().uuid();

export function extractUserId(c: Context): string {
  const raw = c.req.header("X-User-Id");
  if (!raw) {
    throw new HTTPException(401, {
      message: "X-User-Id header required (Telegram auth coming in M1)",
    });
  }
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "X-User-Id must be UUID" });
  }
  return parsed.data;
}

/** Опциональная версия — для эндпоинтов где user может быть anonymous. */
export function tryExtractUserId(c: Context): string | null {
  const raw = c.req.header("X-User-Id");
  if (!raw) return null;
  const parsed = userIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
