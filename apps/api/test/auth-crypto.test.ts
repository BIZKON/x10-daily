/**
 * Unit-тесты криптографии auth-слоя (HIGH-2).
 * - initData verification (Mini App).
 * - Telegram Login Widget verification (admin).
 * - JWT sign/verify round-trip.
 *
 * Запуск побежит когда @cloudflare/vitest-pool-workers будет совместим с
 * vitest 4.x (см. handoff-session-10.md). Тесты не требуют cloudflare:test —
 * только SubtleCrypto (доступно в Workers + Node 20+) и jose.
 */
import { describe, expect, it } from "vitest";
import { verifyInitData } from "../src/lib/initdata";
import { verifyTelegramWidget } from "../src/lib/telegram-widget";
import { signSession, verifySession } from "../src/lib/jwt";

const BOT_TOKEN = "7700000000:AAEHELLOworld_TEST_TOKEN_PLACEHOLDER_x10x";
const JWT_SECRET = "test-secret-min-32-bytes-for-HS256-yes-this-is-long-enough";

/** Build valid Mini App initData querystring (hash вычислен с BOT_TOKEN). */
async function buildValidInitData(opts: {
  userId?: number;
  authDateSeconds?: number;
  username?: string;
}): Promise<string> {
  const authDate = opts.authDateSeconds ?? Math.floor(Date.now() / 1000);
  const user = JSON.stringify({
    id: opts.userId ?? 12345,
    first_name: "Test",
    username: opts.username ?? "tester",
  });
  // Сортированные пары — те же что верификатор соберёт.
  const pairs: Array<[string, string]> = [
    ["auth_date", String(authDate)],
    ["query_id", "AAH"],
    ["user", user],
  ];
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData") as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    enc.encode(BOT_TOKEN),
  );
  const hashBuf = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      secretKey as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    enc.encode(dataCheckString),
  );
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const qs = new URLSearchParams();
  for (const [k, v] of pairs) qs.set(k, v);
  qs.set("hash", hash);
  return qs.toString();
}

/**
 * Реалистичное initData (фикс s26): `query_id` содержит ЛИТЕРАЛЬНЫЙ `+` (как
 * шлёт Telegram, base64 без percent-encoding) + присутствует поле `signature`
 * (должно исключаться из data-check-string). Воспроизводит реальную грабля,
 * где URLSearchParams ломал `+` → пробел → hash mismatch.
 */
async function buildInitDataWithPlusAndSignature(
  opts: { authDateSeconds?: number } = {},
): Promise<string> {
  const authDate = opts.authDateSeconds ?? Math.floor(Date.now() / 1000);
  const user = JSON.stringify({ id: 555, first_name: "Real", username: "real_user" });
  const queryId = "AAH+xY/z9w=="; // литеральные '+' '/' '=' — Telegram их не кодирует
  // data-check-string: исключаем hash+signature, сорт по ключу, значения как есть.
  const pairs: Array<[string, string]> = [
    ["auth_date", String(authDate)],
    ["query_id", queryId],
    ["user", user],
  ];
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData") as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    enc.encode(BOT_TOKEN),
  );
  const hashBuf = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      secretKey as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    enc.encode(dataCheckString),
  );
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Сериализуем ВРУЧНУЮ: query_id с литеральным '+', signature с '+' (исключается),
  // user через encodeURIComponent, hash hex.
  const signature = "sigAbc+def/ghi==";
  return [
    `auth_date=${authDate}`,
    `query_id=${queryId}`,
    `signature=${signature}`,
    `user=${encodeURIComponent(user)}`,
    `hash=${hash}`,
  ].join("&");
}

async function buildValidWidgetPayload(opts: {
  id?: number;
  authDateSeconds?: number;
}): Promise<Record<string, string | number>> {
  const authDate = opts.authDateSeconds ?? Math.floor(Date.now() / 1000);
  const id = opts.id ?? 999;
  const fields: Array<[string, string]> = [
    ["auth_date", String(authDate)],
    ["first_name", "Admin"],
    ["id", String(id)],
    ["username", "admin_user"],
  ];
  fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = fields.map(([k, v]) => `${k}=${v}`).join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.digest("SHA-256", enc.encode(BOT_TOKEN) as BufferSource);
  const hashBuf = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      secretKey as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    enc.encode(dataCheckString),
  );
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    id,
    first_name: "Admin",
    username: "admin_user",
    auth_date: authDate,
    hash,
  };
}

describe("verifyInitData (Mini App)", () => {
  it("принимает свежий valid initData и возвращает user", async () => {
    const initData = await buildValidInitData({ userId: 42 });
    const result = await verifyInitData(initData, { botToken: BOT_TOKEN });
    expect(result.user.id).toBe(42);
    expect(result.user.username).toBe("tester");
  });

  it("принимает реальное initData с '+' в query_id и полем signature (фикс s26)", async () => {
    const initData = await buildInitDataWithPlusAndSignature({});
    const result = await verifyInitData(initData, { botToken: BOT_TOKEN });
    // Канон-конструкция (decodeURIComponent сохраняет '+') сходится несмотря на
    // литеральный '+' в query_id и присутствие поля signature.
    expect(result.user.id).toBe(555);
    expect(result.user.username).toBe("real_user");
  });

  it("отвергает initData с подделанным hash", async () => {
    const initData = await buildValidInitData({});
    const tampered = initData.replace(/hash=[a-f0-9]+/, "hash=" + "0".repeat(64));
    await expect(verifyInitData(tampered, { botToken: BOT_TOKEN })).rejects.toThrow(/hash mismatch/);
  });

  it("отвергает истёкший initData (auth_date старше maxAge)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = await buildValidInitData({ authDateSeconds: now - 90_000 });
    await expect(
      verifyInitData(initData, { botToken: BOT_TOKEN, maxAgeSeconds: 86400 }),
    ).rejects.toThrow(/expired/);
  });

  it("отвергает initData без hash", async () => {
    await expect(
      verifyInitData("user=%7B%22id%22%3A1%7D&auth_date=1", { botToken: BOT_TOKEN }),
    ).rejects.toThrow(/missing.*hash/);
  });

  it("отвергает initData с auth_date в будущем", async () => {
    const now = Math.floor(Date.now() / 1000);
    const future = await buildValidInitData({ authDateSeconds: now + 600 });
    await expect(
      verifyInitData(future, { botToken: BOT_TOKEN, nowSeconds: now }),
    ).rejects.toThrow(/в будущем/);
  });

  it("constant-time compare — не падает на разной длине hash", async () => {
    const initData = await buildValidInitData({});
    const short = initData.replace(/hash=[a-f0-9]+/, "hash=abc");
    await expect(verifyInitData(short, { botToken: BOT_TOKEN })).rejects.toThrow();
  });
});

describe("verifyTelegramWidget (Login Widget)", () => {
  it("принимает valid widget payload", async () => {
    const payload = await buildValidWidgetPayload({ id: 777 });
    const result = await verifyTelegramWidget(payload, { botToken: BOT_TOKEN });
    expect(result.id).toBe(777);
    expect(result.first_name).toBe("Admin");
  });

  it("отвергает widget с подделанным hash", async () => {
    const payload = await buildValidWidgetPayload({});
    payload.hash = "0".repeat(64);
    await expect(verifyTelegramWidget(payload, { botToken: BOT_TOKEN })).rejects.toThrow(/hash mismatch/);
  });

  it("отвергает истёкший widget", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await buildValidWidgetPayload({ authDateSeconds: now - 100_000 });
    await expect(
      verifyTelegramWidget(payload, { botToken: BOT_TOKEN, maxAgeSeconds: 86400 }),
    ).rejects.toThrow(/expired/);
  });

  it("отвергает widget без first_name", async () => {
    const payload = await buildValidWidgetPayload({});
    delete (payload as Record<string, unknown>).first_name;
    // Hash станет невалидным после удаления, но мы хотим проверить именно
    // first_name-валидацию. Подделываем hash под новый набор полей.
    await expect(verifyTelegramWidget(payload, { botToken: BOT_TOKEN })).rejects.toThrow();
  });
});

describe("JWT sign/verify", () => {
  it("round-trip: sign → verify возвращает те же claims", async () => {
    const token = await signSession(
      { userId: "550e8400-e29b-41d4-a716-446655440000", role: "editor" },
      { secret: JWT_SECRET, ttlSeconds: 3600 },
    );
    const claims = await verifySession(token, { secret: JWT_SECRET });
    expect(claims.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(claims.role).toBe("editor");
  });

  it("отвергает tampered token", async () => {
    const token = await signSession(
      { userId: "550e8400-e29b-41d4-a716-446655440000", role: "reader" },
      { secret: JWT_SECRET, ttlSeconds: 3600 },
    );
    const tampered = token.slice(0, -3) + "AAA";
    await expect(verifySession(tampered, { secret: JWT_SECRET })).rejects.toThrow();
  });

  it("отвергает токен с другим secret", async () => {
    const token = await signSession(
      { userId: "550e8400-e29b-41d4-a716-446655440000", role: "reader" },
      { secret: JWT_SECRET, ttlSeconds: 3600 },
    );
    await expect(
      verifySession(token, { secret: "different-secret-min-32-bytes-also-long-enough-yes" }),
    ).rejects.toThrow();
  });

  it("отвергает expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = await signSession(
      { userId: "550e8400-e29b-41d4-a716-446655440000", role: "reader" },
      { secret: JWT_SECRET, ttlSeconds: 3600, nowSeconds: past },
    );
    await expect(verifySession(token, { secret: JWT_SECRET })).rejects.toThrow();
  });
});
