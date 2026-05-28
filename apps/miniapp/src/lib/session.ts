/**
 * Session cookie helpers (HIGH-2).
 *
 * Cookie `x10_session` хранит JWT, выпущенный apps/api через /v1/auth/*.
 * HttpOnly + Secure (в prod) + SameSite=Lax + path=/. Cookie ставится на
 * Next.js домене miniapp; в downstream fetch к api пробрасывается как
 * Authorization: Bearer.
 *
 * Server-only: использовать только из RSC / Server Actions. Импорт из
 * client-компонентов сломает build (cookies() — Next dynamic API).
 */
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "x10_session";

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setSessionToken(token: string, expiresAtSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAtSeconds * 1000),
  });
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
