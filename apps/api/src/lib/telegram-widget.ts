/**
 * Telegram Login Widget verification (HIGH-2 — admin login flow).
 *
 * Спека: https://core.telegram.org/widgets/login#checking-authorization
 *
 * Отличия от Mini App initData:
 * - Payload приходит как JS-объект (через `data-onauth` callback), не querystring.
 * - secret_key = SHA256(BOT_TOKEN), НЕ HMAC. (Mini App: HMAC("WebAppData", BOT_TOKEN).)
 * - Поля плоские: id, first_name, last_name?, username?, photo_url?, auth_date, hash.
 *
 * Алгоритм:
 *   1. Извлекаем `hash` (что сравниваем).
 *   2. Удаляем `hash` из объекта.
 *   3. Сортируем оставшиеся ключи лексикографически.
 *   4. data-check-string = "key1=value1\nkey2=value2\n...".
 *   5. secret_key = SHA256(BOT_TOKEN).
 *   6. expected = HMAC_SHA256(secret_key, data-check-string), hex lowercase.
 *   7. Constant-time compare.
 *   8. auth_date freshness ≤ maxAgeSeconds.
 */

export interface TelegramWidgetPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface VerifiedWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  authDateSeconds: number;
}

const encoder = new TextEncoder();

async function sha256(data: string | Uint8Array): Promise<ArrayBuffer> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  // BufferSource cast: TS 5.7+ Uint8Array стал generic над ArrayBufferLike, но
  // SubtleCrypto принимает только ArrayBuffer-backed views. Safe — мы не используем SAB.
  return crypto.subtle.digest("SHA-256", bytes as BufferSource);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifyWidgetOptions {
  botToken: string;
  maxAgeSeconds?: number;
  nowSeconds?: number;
}

export async function verifyTelegramWidget(
  payload: TelegramWidgetPayload | Record<string, unknown>,
  options: VerifyWidgetOptions,
): Promise<VerifiedWidgetUser> {
  if (!payload || typeof payload !== "object") {
    throw new Error("widget payload must be object");
  }
  const { botToken } = options;
  if (!botToken) throw new Error("botToken required");
  const maxAge = options.maxAgeSeconds ?? 86400;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const hash = (payload as Record<string, unknown>).hash;
  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("widget payload missing `hash`");
  }

  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === "hash") continue;
    if (v === undefined || v === null) continue;
    entries.push([k, String(v)]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = await sha256(botToken);
  const expectedBuf = await hmacSha256(secretKey, dataCheckString);
  const expected = toHex(expectedBuf);

  if (!timingSafeEqualHex(expected, hash.toLowerCase())) {
    throw new Error("widget hash mismatch — подпись не прошла верификацию");
  }

  const authDateRaw = (payload as Record<string, unknown>).auth_date;
  const authDate = typeof authDateRaw === "string" ? Number(authDateRaw) : Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error("widget `auth_date` invalid");
  }
  const ageSeconds = now - authDate;
  if (ageSeconds < 0) {
    throw new Error("widget `auth_date` в будущем (clock skew?)");
  }
  if (ageSeconds > maxAge) {
    throw new Error(`widget login expired (${ageSeconds}s > ${maxAge}s)`);
  }

  const id = (payload as Record<string, unknown>).id;
  const idNum = typeof id === "string" ? Number(id) : Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    throw new Error("widget `id` invalid");
  }

  const firstName = (payload as Record<string, unknown>).first_name;
  if (typeof firstName !== "string" || firstName.length === 0) {
    throw new Error("widget `first_name` required");
  }

  return {
    id: idNum,
    first_name: firstName,
    last_name: stringOrUndef(payload, "last_name"),
    username: stringOrUndef(payload, "username"),
    photo_url: stringOrUndef(payload, "photo_url"),
    authDateSeconds: authDate,
  };
}

function stringOrUndef(
  payload: Record<string, unknown> | TelegramWidgetPayload,
  key: string,
): string | undefined {
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
