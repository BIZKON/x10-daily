import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, users } from "@x10/db";
import { z } from "zod";
import type { Database } from "@x10/db";

/**
 * MVP auth — читаем X-User-Id header.
 * TODO(M1): заменить на Telegram initData session verification + JWT.
 * CLAUDE.md §2 → Auth: «Telegram initData + MAX OAuth + email magic link».
 *
 * Сейчас header — это ХАК для разработки и тестов. В prod без дополнительной
 * middleware (rate limit / origin check) НЕ деплоим.
 *
 * Security:
 * - `extractUserId` — только формат UUID. Любой клиент может подделать UUID.
 *   Использовать только для anonymous-tolerant endpoints (engagement).
 * - `requireRole` — lookup users.role в БД + role check. Это минимальная
 *   защита admin/pipeline endpoints до перехода на Telegram session.
 *   Используется в admin.ts / admin-content.ts / pipeline.ts / upload.ts
 *   для закрытия CRITICAL-1/2/3 из docs/SECURITY-AUDIT.md.
 */
const userIdSchema = z.string().uuid();

export const USER_ROLES = ["reader", "subscriber", "author", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

/**
 * Auth + role check для admin/pipeline endpoints.
 *
 * 401 — header отсутствует или невалидный UUID
 * 401 — user с таким UUID не существует в users таблице
 * 403 — user.role не в `allowed`
 *
 * Возвращает `{userId, role}` для удобства handler'a (можно логировать
 * editorId на mutations).
 */
export async function requireRole(
  c: Context,
  db: Database,
  allowed: readonly UserRole[],
): Promise<{ userId: string; role: UserRole }> {
  const userId = extractUserId(c);
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    throw new HTTPException(401, {
      message: "User not found — X-User-Id не соответствует ни одной записи в users",
    });
  }
  const role = row.role as UserRole;
  if (!allowed.includes(role)) {
    throw new HTTPException(403, {
      message: `Forbidden — required role: ${allowed.join("|")}; got: ${role}`,
    });
  }
  return { userId, role };
}

/** Алиас для частого случая «только редколлегия» (editor + admin). */
export const EDITOR_ROLES = ["editor", "admin"] as const satisfies readonly UserRole[];
