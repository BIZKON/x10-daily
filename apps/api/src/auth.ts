import {
  type Permission,
  TEAM_ROLE_LABEL,
  type TeamRole,
  can,
  teamRoleFromDbRole,
} from "@x10/config";
import { eq, users } from "@x10/db";
import type { Database } from "@x10/db";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getEnv } from "./env";
import { type SessionClaims, verifySession } from "./lib/jwt";

/**
 * Session auth — Authorization: Bearer <JWT> (HIGH-2).
 *
 * До HIGH-2: X-User-Id header (любой клиент мог подделать). Закрыто в этой
 * сессии — все routes мигрированы на `extractSession` / `requireRole`.
 *
 * Архитектура:
 * - Клиент (Next.js miniapp/admin) хранит JWT в HttpOnly cookie на своём
 *   домене.
 * - В каждом запросе к API кладёт Authorization: Bearer <token>.
 * - extractSession verifies JWT через jose (HS256 + X10_JWT_SECRET) — payload
 *   содержит `sub` (userId UUID) и `role`. Без DB roundtrip.
 * - requireRole делает extractSession + DB lookup для freshness role (revocation
 *   случай: admin был demoted, его старый JWT отзовётся при следующем call).
 */

export const USER_ROLES = ["reader", "subscriber", "author", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Алиас для частого случая «только редколлегия» (editor + admin). */
export const EDITOR_ROLES = ["editor", "admin"] as const satisfies readonly UserRole[];

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

function requireJwtSecret(c: Context): string {
  const env = getEnv(c.env);
  if (!env.X10_JWT_SECRET) {
    throw new HTTPException(503, {
      message: "Session signing disabled — X10_JWT_SECRET не настроен",
    });
  }
  return env.X10_JWT_SECRET;
}

/**
 * Извлекает и верифицирует сессию из Authorization: Bearer header.
 * 401 — header отсутствует, токен невалиден или истёк.
 */
export async function extractSession(c: Context): Promise<SessionClaims> {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    throw new HTTPException(401, {
      message: "Authorization Bearer required",
    });
  }
  const secret = requireJwtSecret(c);
  try {
    return await verifySession(token, { secret });
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired session token" });
  }
}

/** Опциональная версия — для эндпоинтов где user может быть anonymous. */
export async function tryExtractSession(c: Context): Promise<SessionClaims | null> {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) return null;
  const env = getEnv(c.env);
  if (!env.X10_JWT_SECRET) return null;
  try {
    return await verifySession(token, { secret: env.X10_JWT_SECRET });
  } catch {
    return null;
  }
}

/**
 * Auth + role check для admin/pipeline endpoints.
 *
 * 401 — нет Bearer, токен невалиден / истёк
 * 401 — user из JWT не существует в users (удалён?)
 * 403 — текущая role в БД не в `allowed` (revocation case)
 *
 * Делает DB roundtrip для freshness — если admin был demoted после выпуска
 * токена, его старый JWT отзовётся здесь. Stale role overhead — 1 query на
 * mutation, acceptable.
 */
export async function requireRole(
  c: Context,
  db: Database,
  allowed: readonly UserRole[],
): Promise<{ userId: string; role: UserRole }> {
  const claims = await extractSession(c);
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);
  if (!row) {
    throw new HTTPException(401, {
      message: "User не найден — токен ссылается на удалённую запись",
    });
  }
  const role = row.role as UserRole;
  if (!allowed.includes(role)) {
    throw new HTTPException(403, {
      message: `Forbidden — required role: ${allowed.join("|")}; got: ${role}`,
    });
  }
  return { userId: claims.userId, role };
}

/**
 * Auth + проверка ПРАВА (Спека 5). Предпочтительнее `requireRole`: решение
 * принимает единая карта `@x10/config`, а не список ролей, продублированный в
 * каждом маршруте.
 *
 * Такой же DB-roundtrip за свежей ролью: понижение роли отзывает старый JWT
 * при следующем запросе.
 *
 * 403 говорит, ЧЕГО не хватает и что делать — сообщение видит живой человек в
 * кабинете клиента, а не только лог.
 */
export async function requirePermission(
  c: Context,
  db: Database,
  permission: Permission,
): Promise<{ userId: string; role: UserRole; teamRole: TeamRole }> {
  const claims = await extractSession(c);
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);
  if (!row) {
    throw new HTTPException(401, {
      message: "User не найден — токен ссылается на удалённую запись",
    });
  }
  const role = row.role as UserRole;
  const teamRole = teamRoleFromDbRole(role);
  if (!teamRole || !can(teamRole, permission)) {
    throw new HTTPException(403, {
      message: teamRole
        ? `Роль «${TEAM_ROLE_LABEL[teamRole]}» не может выполнить это действие. Попросите владельца изменить вашу роль.`
        : "Ваш аккаунт не входит в команду. Попросите владельца прислать приглашение.",
    });
  }
  return { userId: claims.userId, role, teamRole };
}
