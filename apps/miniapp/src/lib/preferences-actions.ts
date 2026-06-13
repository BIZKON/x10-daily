"use server";

/**
 * Server Action для настроек профиля (Tier-2): тонкий слой над patchPreferences.
 * Вызывается из client-компонента PreferenceToggles (optimistic useState). Auth
 * через session cookie (HIGH-2). Контракт: ok/reason без throw — client сам
 * откатывает оптимистичное состояние при ok=false.
 */
import { patchPreferences, type ApiPreferences } from "./api";
import { getSessionToken } from "./session";

export type UpdatePrefsResult =
  | { ok: true; data: ApiPreferences }
  | { ok: false; reason: "no_auth" | "api_error" };

export async function updatePreferencesAction(
  body: Partial<ApiPreferences>,
): Promise<UpdatePrefsResult> {
  const data = await patchPreferences(body);
  if (!data) {
    const token = await getSessionToken();
    return { ok: false, reason: token ? "api_error" : "no_auth" };
  }
  return { ok: true, data };
}
