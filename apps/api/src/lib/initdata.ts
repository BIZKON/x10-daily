/**
 * Telegram Mini App initData verification (HIGH-2).
 *
 * Спека: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Алгоритм:
 *   1. Парсим initData как querystring → пары (key, value).
 *   2. Извлекаем `hash` (это то с чем сравниваем).
 *   3. Удаляем `hash` и `signature` из набора пар.
 *   4. Сортируем оставшиеся пары лексикографически по key.
 *   5. Склеиваем в data-check-string: "key1=value1\nkey2=value2\n...".
 *   6. secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN).
 *   7. expected = HMAC_SHA256(secret_key, data-check-string), hex lowercase.
 *   8. Constant-time compare expected vs hash.
 *   9. Дополнительно: auth_date freshness ≤ maxAgeSeconds.
 *
 * Возвращает разобранного `user` (JSON в поле user) при успехе. Бросает Error
 * с понятным message при любой ошибке (caller отображает 401).
 */

export interface TelegramInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface VerifiedInitData {
  user: TelegramInitDataUser;
  authDateSeconds: number;
  raw: Record<string, string>;
}

const encoder = new TextEncoder();

/** Импорт ключа для HMAC-SHA256 операции. */
async function importHmacKey(rawKey: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  // BufferSource cast: TS 5.7+ Uint8Array стал generic над ArrayBufferLike,
  // но SubtleCrypto принимает только ArrayBuffer-backed views. Safe — не SAB.
  return crypto.subtle.importKey(
    "raw",
    rawKey as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await importHmacKey(key);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** Constant-time string equality. Оба аргумента приведены к одной длине заранее. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifyInitDataOptions {
  /** Bot token формата `<id>:<secret>`. */
  botToken: string;
  /** Maximum age в секундах. Default: 86400 (24 часа). */
  maxAgeSeconds?: number;
  /** Override "сейчас" для тестов (epoch seconds). */
  nowSeconds?: number;
}

export async function verifyInitData(
  initData: string,
  options: VerifyInitDataOptions,
): Promise<VerifiedInitData> {
  if (!initData || typeof initData !== "string") {
    throw new Error("initData empty or not a string");
  }
  const { botToken } = options;
  if (!botToken) {
    throw new Error("botToken required");
  }
  const maxAge = options.maxAgeSeconds ?? 86400;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData missing `hash` field");
  }

  const pairs: Array<[string, string]> = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash" || k === "signature") continue;
    pairs.push([k, v]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const expectedBuf = await hmacSha256(secretKey, dataCheckString);
  const expected = toHex(expectedBuf);

  if (!timingSafeEqualHex(expected, hash.toLowerCase())) {
    throw new Error("initData hash mismatch — подпись не прошла верификацию");
  }

  const authDateStr = params.get("auth_date");
  if (!authDateStr) {
    throw new Error("initData missing `auth_date`");
  }
  const authDateSeconds = Number(authDateStr);
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    throw new Error("initData `auth_date` invalid");
  }
  const ageSeconds = now - authDateSeconds;
  if (ageSeconds < 0) {
    throw new Error("initData `auth_date` в будущем (clock skew?)");
  }
  if (ageSeconds > maxAge) {
    throw new Error(`initData expired (${ageSeconds}s > ${maxAge}s)`);
  }

  const userJson = params.get("user");
  if (!userJson) {
    throw new Error("initData missing `user`");
  }
  let user: TelegramInitDataUser;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw new Error("initData `user` is not valid JSON");
  }
  if (typeof user.id !== "number" || !Number.isFinite(user.id) || user.id <= 0) {
    throw new Error("initData `user.id` invalid");
  }

  const raw: Record<string, string> = {};
  for (const [k, v] of pairs) raw[k] = v;

  return { user, authDateSeconds, raw };
}
