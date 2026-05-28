"use server";

/**
 * Server Actions для логина / логаута в Telegram Mini App.
 *
 * - loginWithTelegramAction: принимает raw initData из TG WebApp SDK,
 *   POST'ит в apps/api /v1/auth/telegram, ставит HttpOnly cookie на ответе.
 * - devLoginAction: DEV-only fallback. В отсутствие TG WebView (localhost
 *   в обычном браузере) использует X10_DEV_USER_ID env через api/dev-login.
 *   В prod этот action возвращает no_auth.
 * - logoutAction: чистит cookie.
 *
 * Контракт результата: { ok: true } / { ok: false, reason } — без throw,
 * чтобы client-side useTransition корректно отображал состояние.
 */

import { setSessionToken, clearSessionToken } from "./session";

const TIMEOUT_MS = 4000;

function getApiBaseUrl(): string | null {
  const url = process.env.X10_API_BASE_URL;
  if (!url || url.trim() === "") return null;
  return url.replace(/\/+$/, "");
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "no_backend" | "tg_invalid" | "network" | "disabled" };

interface AuthResponse {
  token: string;
  expiresAt: number;
}

async function postAuth(path: string, body: unknown): Promise<AuthResponse | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function loginWithTelegramAction(initData: string): Promise<LoginResult> {
  if (!getApiBaseUrl()) return { ok: false, reason: "no_backend" };
  if (!initData) return { ok: false, reason: "tg_invalid" };
  const result = await postAuth("/v1/auth/telegram", { initData });
  if (!result) return { ok: false, reason: "tg_invalid" };
  await setSessionToken(result.token, result.expiresAt);
  return { ok: true };
}

export async function devLoginAction(): Promise<LoginResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, reason: "disabled" };
  }
  const userId = process.env.X10_DEV_USER_ID?.trim();
  if (!userId) return { ok: false, reason: "disabled" };
  if (!getApiBaseUrl()) return { ok: false, reason: "no_backend" };
  const result = await postAuth("/v1/auth/dev-login", { userId });
  if (!result) return { ok: false, reason: "network" };
  await setSessionToken(result.token, result.expiresAt);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
}
