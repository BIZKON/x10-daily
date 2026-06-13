/**
 * Telegram Mini App initData verification (HIGH-2).
 *
 * Спека: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Канонический алгоритм:
 *   1. Парсим initData как querystring → пары (key, value).
 *   2. Извлекаем `hash` (с чем сравниваем).
 *   3. Удаляем `hash` и `signature` из набора пар.
 *   4. Сортируем оставшиеся пары лексикографически по key.
 *   5. data-check-string = "key1=value1\nkey2=value2\n...".
 *   6. secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN).
 *   7. expected = HMAC_SHA256(secret_key, data-check-string), hex lowercase.
 *   8. Constant-time compare expected vs hash.
 *   9. auth_date freshness ≤ maxAgeSeconds.
 *
 * ⚠️ ГРАБЛЯ (session 26): реальное TG-initData падало с «hash mismatch», а
 * самоподделанное (s25) проходило. Причина — КОДИРОВКА значений: `URLSearchParams`
 * трактует строку как application/x-www-form-urlencoded и декодирует `+` → ПРОБЕЛ.
 * В реальном initData base64-подобные значения (`query_id`, и т.п.) содержат `+`,
 * который Telegram НЕ кодирует — URLSearchParams портил их → data-check-string не
 * совпадал. Самоподделка s25 не содержала ни `+`, ни поля `signature`, поэтому
 * проходила против того же кода (ловушка «валидируем против самих себя»).
 *
 * Фикс s26: исключать из data-check-string ТОЛЬКО `hash` (поле `signature`
 * ВКЛЮЧАЕТСЯ — эмпирически: bot-token HMAC у Telegram считается поверх signature;
 * «exclude hash+signature» из доков — про Ed25519 third-party, не про этот путь).
 * Парсинг — ручной decodeURIComponent (сохраняет `+`, в отличие от URLSearchParams,
 * который трактует строку как form-urlencoded → '+'→пробел; защитно на будущее).
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
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

/** Constant-time string equality. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Ручной парсинг querystring в пары. `decode=true` → decodeURIComponent
 * (сохраняет `+`, в отличие от URLSearchParams). На битом %-эскейпе fallback
 * на сырое значение (не роняем верификацию).
 */
function parsePairs(initData: string, decode: boolean): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of initData.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = i === -1 ? part : part.slice(0, i);
    const rawV = i === -1 ? "" : part.slice(i + 1);
    let v = rawV;
    if (decode) {
      try {
        v = decodeURIComponent(rawV);
      } catch {
        v = rawV;
      }
    }
    out.push([k, v]);
  }
  return out;
}

function buildCheckString(pairs: Array<[string, string]>, exclude: Set<string>): string {
  return pairs
    .filter(([k]) => !exclude.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export interface VerifyInitDataOptions {
  /** Bot token формата `<id>:<secret>`. */
  botToken: string;
  /** Maximum age в секундах. Default: 86400 (24 часа). */
  maxAgeSeconds?: number;
  /** Допуск на рассинхрон часов (auth_date чуть в будущем). Default: 60с. */
  clockSkewSeconds?: number;
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
  const clockSkew = options.clockSkewSeconds ?? 60;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  // hash — hex, без проблем кодировки: берём из сырых пар (literal).
  const hash = parsePairs(initData, false).find(([k]) => k === "hash")?.[1];
  if (!hash) {
    throw new Error("initData missing `hash` field");
  }

  // Каноническая data-check-string (спека Telegram): пары через decodeURIComponent
  // (сохраняет `+`, в отличие от URLSearchParams, который трактует строку как
  // form-urlencoded и портит '+'→пробел), исключить hash+signature, сортировка по
  // ключу, join '\n'. decodeURIComponent покрывает все случаи URLSearchParams
  // КРОМЕ '+' (а его Telegram не кодирует) — поэтому одной канон-конструкции
  // достаточно; legacy-варианты убраны (ревью s26: spec-compliance, signature
  // ВСЕГДА исключается).
  const decodedPairs = parsePairs(initData, true);
  // ⚠️ Исключаем ТОЛЬКО `hash`. Поле `signature` ВКЛЮЧАЕТСЯ в data-check-string —
  // эмпирически подтверждено диагностикой s26 против реального initData: Telegram
  // считает bot-token HMAC ПОВЕРХ поля signature. Распространённое «exclude hash
  // AND signature» из доков относится к Ed25519 third-party валидации, НЕ к
  // bot-token HMAC. (Исключение signature ломало вход для всех реальных клиентов.)
  const dataCheckString = buildCheckString(decodedPairs, new Set(["hash"]));

  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeEqualHex(expected, hash.toLowerCase())) {
    throw new Error("initData hash mismatch — подпись не прошла верификацию");
  }

  // Значения — из декодированных пар (корректное URL-декодирование).
  const decoded: Record<string, string> = {};
  for (const [k, v] of decodedPairs) {
    if (k !== "hash" && k !== "signature") decoded[k] = v;
  }

  const authDateStr = decoded.auth_date;
  if (!authDateStr) {
    throw new Error("initData missing `auth_date`");
  }
  const authDateSeconds = Number(authDateStr);
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    throw new Error("initData `auth_date` invalid");
  }
  const ageSeconds = now - authDateSeconds;
  if (ageSeconds < -clockSkew) {
    throw new Error("initData `auth_date` слишком в будущем (clock skew?)");
  }
  if (ageSeconds > maxAge) {
    throw new Error(`initData expired (${ageSeconds}s > ${maxAge}s)`);
  }

  const userJson = decoded.user;
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

  return { user, authDateSeconds, raw: decoded };
}
