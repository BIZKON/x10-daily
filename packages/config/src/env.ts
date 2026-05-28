import { z } from "zod";

const urlOrEmpty = z.union([z.url(), z.literal("")]);

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL required"),
  DIRECT_DATABASE_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * Подтверждение что ZDR-контракт с Anthropic подписан (см. CLAUDE.md §7).
   * Должен быть "true" в production. Без него loadEnv throw'нет если задан
   * ANTHROPIC_API_KEY — это предотвращает первый prod-LLM-вызов до подписания
   * (152-ФЗ — 30-day retention запрещён для ПДн).
   * CRITICAL-6 из docs/SECURITY-AUDIT.md.
   */
  ANTHROPIC_ZDR_CONFIRMED: z.enum(["true", "false"]).optional(),
  ANTHROPIC_MODEL_OPUS: z.string().default("claude-opus-4-7"),
  ANTHROPIC_MODEL_SONNET: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_HAIKU: z.string().default("claude-haiku-4-5-20251001"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_PROXY_URL: urlOrEmpty.optional(),

  MASKER_BASE_URL: urlOrEmpty.optional(),
  MASKER_API_KEY: z.string().optional(),

  /**
   * Telegram bot token (формат `<id>:<secret>`) — корень доверия для
   * initData / Login Widget verification (HIGH-2 из docs/SECURITY-AUDIT.md).
   * Required в production: без него Telegram-сессии не выпускаются.
   */
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "TELEGRAM_BOT_TOKEN должен быть формата `<id>:<secret>`")
    .optional(),
  TELEGRAM_WEBAPP_URL: urlOrEmpty.optional(),

  /**
   * HMAC-secret для подписи JWT-сессий (HS256). Минимум 32 байта.
   * Required в production. Утечка → атакующий выпускает токены от имени любого
   * пользователя; ротация → инвалидация всех активных сессий (юзеры перелогинятся
   * через initData без боли). См. apps/api/src/lib/jwt.ts.
   */
  X10_JWT_SECRET: z
    .string()
    .min(32, "X10_JWT_SECRET минимум 32 символа (HS256 security)")
    .optional(),

  /**
   * TTL сессии в секундах. Default 24h. Перелогин дешёвый (TG initData
   * бесплатный), поэтому короткий TTL ОК.
   */
  X10_JWT_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  MAX_BOT_TOKEN: z.string().optional(),
  MAX_WEBAPP_URL: urlOrEmpty.optional(),

  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_SECRET_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),

  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: urlOrEmpty.default("https://eu.posthog.com"),

  SENTRY_DSN: urlOrEmpty.optional(),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type Env = z.infer<typeof baseSchema>;

export type EnvSource = Record<string, string | undefined>;

const productionRequired: Array<keyof Env> = [
  "ANTHROPIC_API_KEY",
  "MASKER_BASE_URL",
  "MASKER_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  // HIGH-2: Telegram session auth — без BOT_TOKEN initData нельзя верифицировать,
  // без JWT_SECRET — нельзя выпустить сессию. Fail-fast при отсутствии.
  "TELEGRAM_BOT_TOKEN",
  "X10_JWT_SECRET",
];

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(
      `Env validation failed:\n${issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

export function loadEnv(source: EnvSource): Env {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    const missing = productionRequired.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Production env missing required keys (152-ФЗ + AI core): ${missing.join(", ")}. ` +
          "See CLAUDE.md §7 — KikuAI Masker + Anthropic ZDR contract обязательны до первого вызова LLM.",
      );
    }
    // CRITICAL-6: если есть Anthropic-ключ в prod, ZDR должен быть явно подтверждён.
    // Без этого первый LLM-вызов попадёт в 30-day retention → нарушение 152-ФЗ
    // (ст. 272.1 УК + ₽75K-₽700K оборотный штраф).
    if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_ZDR_CONFIRMED !== "true") {
      throw new Error(
        "ANTHROPIC_ZDR_CONFIRMED=true должен быть установлен в production когда " +
          "ANTHROPIC_API_KEY задан. Без подписанного ZDR-контракта input/output " +
          "логируются Anthropic 30 дней → нарушение 152-ФЗ. См. CLAUDE.md §7 + " +
          "docs/SECURITY-AUDIT.md C6. Контакт: support@anthropic.com → 'Zero Data " +
          "Retention agreement for EU customers'.",
      );
    }
  }

  return env;
}
