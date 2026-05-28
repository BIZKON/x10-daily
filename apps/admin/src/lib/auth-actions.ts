"use server";

/**
 * Server Actions для admin login / logout (HIGH-2).
 *
 * - loginWithTelegramWidgetAction: принимает payload из TG Login Widget
 *   (data-onauth callback), POST'ит в /v1/auth/telegram-widget. Backend
 *   verifies signature через тот же BOT_TOKEN, проверяет role editor|admin,
 *   возвращает JWT — Server Action ставит HttpOnly cookie.
 * - devLoginAction: DEV-only, X10_ADMIN_USER_ID → /v1/auth/dev-login → cookie.
 *   В prod возвращает disabled.
 * - logoutAction: чистит cookie + redirect to /login.
 */

import { redirect } from "next/navigation";
import { setSessionToken, clearSessionToken } from "./session";

const TIMEOUT_MS = 5000;

function getApiBaseUrl(): string | null {
  const url = process.env.X10_API_BASE_URL;
  if (!url || url.trim() === "") return null;
  return url.replace(/\/+$/, "");
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "no_backend" | "tg_invalid" | "forbidden" | "network" | "disabled" };

export interface TelegramWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface AuthResponse {
  token: string;
  expiresAt: number;
}

async function postAuth(
  path: string,
  body: unknown,
): Promise<{ result: AuthResponse | null; status: number }> {
  const base = getApiBaseUrl();
  if (!base) return { result: null, status: 0 };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { result: null, status: res.status };
    const data = (await res.json()) as AuthResponse;
    return { result: data, status: res.status };
  } catch {
    return { result: null, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

export async function loginWithTelegramWidgetAction(
  widgetUser: TelegramWidgetUser,
): Promise<LoginResult> {
  if (!getApiBaseUrl()) return { ok: false, reason: "no_backend" };
  const { result, status } = await postAuth("/v1/auth/telegram-widget", widgetUser);
  if (!result) {
    if (status === 403) return { ok: false, reason: "forbidden" };
    if (status === 401) return { ok: false, reason: "tg_invalid" };
    return { ok: false, reason: "network" };
  }
  await setSessionToken(result.token, result.expiresAt);
  return { ok: true };
}

export async function devLoginAction(): Promise<LoginResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, reason: "disabled" };
  }
  const userId = process.env.X10_ADMIN_USER_ID?.trim();
  if (!userId) return { ok: false, reason: "disabled" };
  if (!getApiBaseUrl()) return { ok: false, reason: "no_backend" };
  const { result } = await postAuth("/v1/auth/dev-login", { userId });
  if (!result) return { ok: false, reason: "network" };
  await setSessionToken(result.token, result.expiresAt);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect("/login");
}
