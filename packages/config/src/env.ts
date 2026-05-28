import { z } from "zod";

const urlOrEmpty = z.union([z.url(), z.literal("")]);

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL required"),
  DIRECT_DATABASE_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * Опциональный override base URL для Anthropic SDK. Если задан — обходим
   * прямой anthropic.com через прокси (Timeweb Cloud AI Gateway).
   *
   * После session 14: основной prod-deploy идёт через Timeweb DBaaS+App Platform,
   * AI Gateway проксирует Claude API из РФ. Установка этой переменной отключает
   * ZDR-чек ниже (Timeweb обеспечивает 152-ФЗ compliance независимо).
   *
   * Пример: `https://api.timeweb.ai/anthropic` (точный URL подтверждается через
   * раздел «Подключение» в личном кабинете Timeweb AI Gateway).
   */
  ANTHROPIC_BASE_URL: urlOrEmpty.optional(),
  /**
   * ZDR-контракт нужен ТОЛЬКО при прямом подключении к anthropic.com
   * (когда ANTHROPIC_BASE_URL не задан). При работе через Timeweb AI Gateway
   * 152-ФЗ покрывается DPA с провайдером — Anthropic не видит наших данных
   * напрямую. CRITICAL-6 из docs/SECURITY-AUDIT.md.
   */
  ANTHROPIC_ZDR_CONFIRMED: z.enum(["true", "false"]).optional(),
  /**
   * Model IDs в Timeweb используют префикс `anthropic/` (например
   * `anthropic/claude-sonnet-4-6`). При прямом подключении префикс опускается.
   * Дефолты заданы под Timeweb — для direct override через env.
   */
  ANTHROPIC_MODEL_OPUS: z.string().default("anthropic/claude-opus-4-7"),
  ANTHROPIC_MODEL_SONNET: z.string().default("anthropic/claude-sonnet-4-6"),
  ANTHROPIC_MODEL_HAIKU: z.string().default("anthropic/claude-haiku-4-5"),

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
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  // HIGH-2: Telegram session auth — без BOT_TOKEN initData нельзя верифицировать,
  // без JWT_SECRET — нельзя выпустить сессию. Fail-fast при отсутствии.
  "TELEGRAM_BOT_TOKEN",
  "X10_JWT_SECRET",
];

// MASKER_BASE_URL / MASKER_API_KEY больше НЕ в productionRequired (с session 14):
// при работе через Timeweb AI Gateway PII-маскировка не критична — данные не
// уходят за пределы РФ. Если в будущем вернёмся на Anthropic direct без proxy,
// добавим обратно в required list.

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
        `Production env missing required keys: ${missing.join(", ")}. ` +
          "See docs/DEPLOY.md.",
      );
    }
    // CRITICAL-6: ZDR-чек выполняется ТОЛЬКО при прямом подключении к anthropic.com.
    // Если ANTHROPIC_BASE_URL задан (Timeweb AI Gateway или другой прокси), данные
    // не уходят в Anthropic облако напрямую — ZDR не применим. 152-ФЗ обеспечивается
    // DPA с провайдером прокси.
    const isDirectAnthropic = !env.ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL === "" ||
      env.ANTHROPIC_BASE_URL.includes("api.anthropic.com");
    if (env.ANTHROPIC_API_KEY && isDirectAnthropic && env.ANTHROPIC_ZDR_CONFIRMED !== "true") {
      throw new Error(
        "ANTHROPIC_ZDR_CONFIRMED=true обязательна в production при прямом подключении " +
          "к Anthropic API (без ANTHROPIC_BASE_URL прокси). Без подписанного ZDR-контракта " +
          "input/output логируются Anthropic 30 дней → нарушение 152-ФЗ. " +
          "Альтернатива: задайте ANTHROPIC_BASE_URL на Timeweb AI Gateway endpoint — " +
          "тогда ZDR не требуется. См. docs/SECURITY-AUDIT.md C6.",
      );
    }
  }

  return env;
}
