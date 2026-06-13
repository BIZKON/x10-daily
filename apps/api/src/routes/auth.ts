/**
 * Session auth endpoints (HIGH-2).
 *
 * - POST /v1/auth/telegram        — Mini App initData → JWT.
 * - POST /v1/auth/telegram-widget — admin Login Widget → JWT (role-gated).
 * - GET  /v1/auth/me              — Bearer → user info.
 *
 * Никаких X-User-Id. Клиент сохраняет JWT в HttpOnly cookie на своём
 * Next.js домене, в API-запросах кладёт Authorization: Bearer <token>.
 */
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, users } from "@x10/db";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";
import { diagnoseInitData, verifyInitData, type TelegramInitDataUser } from "../lib/initdata";
import { verifyTelegramWidget } from "../lib/telegram-widget";
import { signSession, verifySession } from "../lib/jwt";
import { applyRateLimit } from "../rate-limit";
import { USER_ROLES, EDITOR_ROLES, type UserRole } from "../auth";

const telegramLoginSchema = z.object({
  initData: z.string().min(1).max(8192),
});

const devLoginSchema = z.object({
  userId: z.string().uuid(),
});

const widgetLoginSchema = z.object({
  id: z.union([z.number(), z.string()]),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  photo_url: z.string().max(512).optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().regex(/^[a-f0-9]{64}$/i, "hash must be 64-char hex"),
});

function requireBotToken(env: { TELEGRAM_BOT_TOKEN?: string }): string {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new HTTPException(503, {
      message: "Telegram auth disabled — TELEGRAM_BOT_TOKEN не настроен",
    });
  }
  return env.TELEGRAM_BOT_TOKEN;
}

function requireJwtSecret(env: { X10_JWT_SECRET?: string }): string {
  if (!env.X10_JWT_SECRET) {
    throw new HTTPException(503, {
      message: "Session signing disabled — X10_JWT_SECRET не настроен",
    });
  }
  return env.X10_JWT_SECRET;
}

function pickDisplayName(u: { first_name?: string; last_name?: string }): string | null {
  const parts = [u.first_name, u.last_name].filter((s): s is string => Boolean(s && s.trim()));
  const joined = parts.join(" ").trim();
  return joined.length > 0 ? joined.slice(0, 128) : null;
}

export const authRoute = new Hono<AppEnv>()
  /**
   * POST /v1/auth/telegram
   * Body: { initData: string }   // raw Telegram WebApp.initData querystring
   * Response: { token, user, expiresAt }
   *
   * Upsert user (platform="telegram") + sign JWT.
   * Любой TG-пользователь может войти; новый создаётся с role="reader".
   */
  .post("/telegram", zValidator("json", telegramLoginSchema), async (c) => {
    await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "auth-tg", null);

    const env = getEnv(c.env);
    const botToken = requireBotToken(env);
    const jwtSecret = requireJwtSecret(env);
    const ttl = env.X10_JWT_TTL_SECONDS;
    const { initData } = c.req.valid("json");

    let verified;
    try {
      verified = await verifyInitData(initData, { botToken });
    } catch (err) {
      // ВРЕМЕННАЯ ДИАГНОСТИКА (s26): реальное TG initData → 401, форж s25 проходил.
      // Логируем причину + ключи (БЕЗ значений — PII) для точного разбора. Снять после фикса.
      try {
        const p = new URLSearchParams(initData);
        const keys = [...p.keys()].sort().join(",");
        const authDate = Number(p.get("auth_date") ?? 0);
        const ageSec = Math.floor(Date.now() / 1000) - authDate;
        // PII-safe: только имена ключей (не значения) + производный возраст.
        console.warn(
          `[auth/telegram] FAIL reason="${err instanceof Error ? err.message : "unknown"}" keys=[${keys}] hashLen=${(p.get("hash") ?? "").length} ageSec=${ageSec} hasSignature=${p.has("signature")}`,
        );
        // Перебор конструкций data-check-string × секрет → какая совпала.
        const diag = await diagnoseInitData(initData, botToken).catch(() => "diag-err");
        console.warn(`[auth/telegram] DIAG match=${diag}`);
        if (diag === "NONE") {
          // Ни одна не сошлась → подпись чужим ботом? Логируем RAW для оффлайн-
          // анализа (PII, ВРЕМЕННО — очистить логи после разбора).
          console.warn(`[auth/telegram] RAW=${initData}`);
        }
      } catch {
        // ignore — диагностика не должна влиять на ответ
      }
      throw new HTTPException(401, {
        message: `Telegram initData invalid: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }

    const db = getDb(env.DATABASE_URL);
    const user = await upsertTelegramUser(db, verified.user);

    const token = await signSession(
      { userId: user.id, role: user.role as UserRole },
      { secret: jwtSecret, ttlSeconds: ttl },
    );
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    return c.json({
      token,
      expiresAt,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
      },
    });
  })

  /**
   * POST /v1/auth/telegram-widget
   * Body: { id, first_name, last_name?, username?, photo_url?, auth_date, hash }
   * Response: { token, user, expiresAt }
   *
   * Admin login через Telegram Login Widget. Verifies signature через тот же
   * BOT_TOKEN, но secret_key = SHA256(BOT_TOKEN) (отличие от Mini App).
   *
   * Role-gated: только editor / admin могут войти. Если user не существует
   * или role !== editor|admin → 403. Это значит первый admin создаётся
   * вручную через `pnpm db:seed` или ручной INSERT.
   */
  .post("/telegram-widget", zValidator("json", widgetLoginSchema), async (c) => {
    await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "auth-widget", null);

    const env = getEnv(c.env);
    const botToken = requireBotToken(env);
    const jwtSecret = requireJwtSecret(env);
    const ttl = env.X10_JWT_TTL_SECONDS;
    const payload = c.req.valid("json");

    let verified;
    try {
      verified = await verifyTelegramWidget(payload, { botToken });
    } catch (err) {
      throw new HTTPException(401, {
        message: `Telegram widget invalid: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }

    const db = getDb(env.DATABASE_URL);
    const platformUserId = String(verified.id);
    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      })
      .from(users)
      .where(and(eq(users.platform, "telegram"), eq(users.platformUserId, platformUserId)))
      .limit(1);

    if (!user) {
      throw new HTTPException(403, {
        message: "Учётка не зарегистрирована. Обратитесь к администратору.",
      });
    }
    const role = user.role as UserRole;
    if (!EDITOR_ROLES.includes(role as (typeof EDITOR_ROLES)[number])) {
      throw new HTTPException(403, {
        message: "Недостаточно прав для входа в админку.",
      });
    }

    const token = await signSession(
      { userId: user.id, role },
      { secret: jwtSecret, ttlSeconds: ttl },
    );
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    return c.json({
      token,
      expiresAt,
      user: {
        id: user.id,
        role,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
      },
    });
  })

  /**
   * POST /v1/auth/dev-login
   * Body: { userId: UUID }
   * Response: { token, expiresAt, user }
   *
   * DEV-only — endpoint доступен только если NODE_ENV !== "production".
   * Нужен чтобы локальный dev без TG WebView мог получить JWT по seed-UUID
   * (X10_DEV_USER_ID env в miniapp/admin). В prod этот endpoint 404.
   */
  .post("/dev-login", zValidator("json", devLoginSchema), async (c) => {
    if (c.env.NODE_ENV === "production") {
      throw new HTTPException(404, { message: "Not found" });
    }
    const env = getEnv(c.env);
    const jwtSecret = requireJwtSecret(env);
    const ttl = env.X10_JWT_TTL_SECONDS;
    const { userId } = c.req.valid("json");

    const db = getDb(env.DATABASE_URL);
    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new HTTPException(404, {
        message: `User ${userId} не найден. Запусти pnpm db:seed.`,
      });
    }

    const token = await signSession(
      { userId: user.id, role: user.role as UserRole },
      { secret: jwtSecret, ttlSeconds: ttl },
    );
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    return c.json({
      token,
      expiresAt,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
      },
    });
  })

  /**
   * GET /v1/auth/me
   * Header: Authorization: Bearer <token>
   * Response: { user }
   */
  .get("/me", async (c) => {
    const token = extractBearer(c.req.header("authorization"));
    if (!token) {
      throw new HTTPException(401, { message: "Authorization Bearer required" });
    }
    const env = getEnv(c.env);
    const jwtSecret = requireJwtSecret(env);
    let claims;
    try {
      claims = await verifySession(token, { secret: jwtSecret });
    } catch {
      throw new HTTPException(401, { message: "Invalid or expired session token" });
    }

    const db = getDb(env.DATABASE_URL);
    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);

    if (!user) {
      throw new HTTPException(401, { message: "User не найден (удалён?)" });
    }
    return c.json({ user });
  });

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/**
 * Upsert user по (platform="telegram", platformUserId). При первом входе
 * создаётся с role="reader". При повторных — обновляем username/display_name/
 * avatar/locale если данные в TG изменились.
 */
async function upsertTelegramUser(
  db: ReturnType<typeof getDb>,
  tgUser: TelegramInitDataUser,
): Promise<{
  id: string;
  role: (typeof USER_ROLES)[number];
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  locale: string;
}> {
  const platformUserId = String(tgUser.id);
  const username = tgUser.username?.slice(0, 64) ?? null;
  const displayName = pickDisplayName(tgUser);
  const avatarUrl = tgUser.photo_url ?? null;
  const locale = (tgUser.language_code ?? "ru").slice(0, 8);

  const [existing] = await db
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
    })
    .from(users)
    .where(and(eq(users.platform, "telegram"), eq(users.platformUserId, platformUserId)))
    .limit(1);

  if (existing) {
    // Обновляем поля только если изменились — экономим WAL.
    const needsUpdate =
      existing.username !== username ||
      existing.displayName !== displayName ||
      existing.avatarUrl !== avatarUrl ||
      existing.locale !== locale;
    if (needsUpdate) {
      const [updated] = await db
        .update(users)
        .set({ username, displayName, avatarUrl, locale })
        .where(eq(users.id, existing.id))
        .returning({
          id: users.id,
          role: users.role,
          displayName: users.displayName,
          username: users.username,
          avatarUrl: users.avatarUrl,
          locale: users.locale,
        });
      return updated!;
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      platform: "telegram",
      platformUserId,
      username,
      displayName,
      avatarUrl,
      locale,
      role: "reader",
    })
    .returning({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
    });
  return created!;
}
