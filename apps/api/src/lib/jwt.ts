/**
 * JWT session sign / verify (HIGH-2).
 *
 * - HS256 + secret из env (X10_JWT_SECRET, min 32 байта).
 * - Payload: sub (userId UUID), role, iat, exp.
 * - TTL из env X10_JWT_TTL_SECONDS (default 86400).
 *
 * Утечка secret → атакующий выпускает токены за любого юзера. Ротация secret →
 * все активные сессии инвалидируются (юзеры перелогинятся через initData,
 * стоимость нулевая для TG-пользователей).
 */
import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import type { UserRole } from "../auth";

export interface SessionClaims {
  userId: string;
  role: UserRole;
}

export interface SignSessionOptions {
  secret: string;
  ttlSeconds: number;
  nowSeconds?: number;
}

export interface VerifySessionOptions {
  secret: string;
  nowSeconds?: number;
}

const encoder = new TextEncoder();

function secretToKey(secret: string): Uint8Array {
  return encoder.encode(secret);
}

export async function signSession(
  claims: SessionClaims,
  options: SignSessionOptions,
): Promise<string> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = now + options.ttlSeconds;
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretToKey(options.secret));
}

export async function verifySession(
  token: string,
  options: VerifySessionOptions,
): Promise<SessionClaims> {
  if (!token || typeof token !== "string") {
    throw new Error("token empty");
  }
  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    algorithms: ["HS256"],
  };
  if (options.nowSeconds !== undefined) {
    verifyOptions.currentDate = new Date(options.nowSeconds * 1000);
  }
  const { payload } = await jwtVerify(token, secretToKey(options.secret), verifyOptions);
  return claimsFromPayload(payload);
}

function claimsFromPayload(payload: JWTPayload): SessionClaims {
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("JWT missing `sub`");
  }
  const role = (payload as { role?: unknown }).role;
  if (typeof role !== "string") {
    throw new Error("JWT missing `role`");
  }
  return { userId: sub, role: role as UserRole };
}
