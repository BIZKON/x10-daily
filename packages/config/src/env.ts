import { z } from "zod";

const urlOrEmpty = z.union([z.url(), z.literal("")]);

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL required"),
  DIRECT_DATABASE_URL: z.string().optional(),

  /**
   * AI Gateway — OpenAI-совместимый прокси для LLM моделей (Claude, GPT, Gemini)
   * через российскую инфру Timeweb. Подтверждено session 14 на основе скрина
   * раздела «Подключение» в ЛК:
   *   base_url: https://api.timeweb.ai/v1
   *   SDK:      openai (Python/JS), не @anthropic-ai/sdk
   *   models:   "anthropic/claude-opus-4-7", "anthropic/claude-sonnet-4-6", ...
   *
   * Используется как primary в production. Schema fields:
   *  - AI_GATEWAY_BASE_URL — base URL OpenAI-compat endpoint
   *  - AI_GATEWAY_API_KEY — Timeweb proxy key
   *
   * Старые ANTHROPIC_API_KEY / ANTHROPIC_ZDR_CONFIRMED сохранены как fallback
   * для прямого подключения к anthropic.com (если когда-нибудь понадобится).
   */
  AI_GATEWAY_BASE_URL: urlOrEmpty.default("https://api.timeweb.ai/v1"),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),

  /** Legacy: direct Anthropic API (без proxy). Сейчас не используется в prod. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * ZDR-контракт нужен ТОЛЬКО при прямом подключении к anthropic.com
   * (когда AI Gateway не используется). При работе через Timeweb 152-ФЗ
   * покрывается DPA с провайдером.
   */
  ANTHROPIC_ZDR_CONFIRMED: z.enum(["true", "false"]).optional(),

  /**
   * Model IDs в Timeweb используют префикс `anthropic/` (например
   * `anthropic/claude-sonnet-4-6`). При direct Anthropic префикс опускается.
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
   * HTTP/HTTPS-прокси для api.telegram.org из workers/pipeline. На Timeweb
   * ru-1 (РФ-ЦОД) прямой fetch к api.telegram.org молча умирает по таймауту
   * (TelegramNetworkError). См. timeweb-telegram-deploy skill §4.
   * Формат: http://user:pass@host:port (HTTP CONNECT) — undici.ProxyAgent.
   * Пусто → прямой fetch (для dev / non-РФ-хостинга).
   */
  TELEGRAM_PROXY_URL: urlOrEmpty.optional(),
  /**
   * Walking Skeleton (ТЗ #1, N5): тестовый канал для автономного постинга.
   * Формат: `@channel_username` или numeric chat_id (`-1001234567890`).
   * Required в production только если AUTONOMOUS_POSTING_TG=true.
   */
  TG_TEST_CHANNEL_ID: z.string().optional(),
  /**
   * Пост-M0 hardening (session 20): чат для $-алертов автономного конвейера
   * (личка с ботом или приватный ops-канал). Формат как у TG_TEST_CHANNEL_ID.
   * Опционален — если пуст, алерты пишутся только в логи (console.warn), без
   * отправки в Telegram. Намеренно ОТДЕЛЬНЫЙ от контент-канала, чтобы ops-шум
   * не попадал в публикации. См. apps/workers/pipeline/src/lib/ops-alert.ts.
   */
  TG_OPS_CHAT_ID: z.string().optional(),

  /**
   * Пост-M0 hardening (session 20): жёсткий дневной потолок $-расхода на LLM.
   * draft-article в начале каждого запуска суммирует расход за календарный день
   * МСК (pipeline_runs.cost_usd) и при >= DAILY_BUDGET_USD ПРОПУСКАЕТ статью
   * (агенты не запускаются) до полуночи МСК — чтобы бурст источников не съел
   * бюджет. Дешёвый IngestAgent-гейт (Haiku) продолжает работать. Часовой
   * rateLimit (50/час ≈ $22.5/час) остаётся как второй контур.
   * coerce.number — env приходит строкой. Default 15 (CLAUDE.md §4: ~$6/день —
   * норма full-AI-бюджета; $15 — щедрый headroom, в ~36× ниже теоретического
   * рунавея часового лимита).
   */
  DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(15),
  /**
   * Предупредительный порог: при пересечении шлётся warn-алерт (один раз в день).
   * Должен быть < DAILY_BUDGET_USD. Default 9 (60% потолка).
   */
  DAILY_BUDGET_WARN_USD: z.coerce.number().nonnegative().default(9),

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
  // AI_GATEWAY_API_KEY (Timeweb) — primary для всех LLM-вызовов. ANTHROPIC_API_KEY
  // оставлен как legacy fallback и НЕ обязателен.
  "AI_GATEWAY_API_KEY",
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

export interface LoadEnvOptions {
  /**
   * Переопределяет productionRequired для конкретного сервиса. Напр. pipeline
   * (фоновый воркер) не выпускает JWT-сессии → X10_JWT_SECRET ему не нужен,
   * хотя глобальный productionRequired (для api/admin) его требует.
   * Дефолт = productionRequired.
   */
  requiredKeys?: ReadonlyArray<keyof Env>;
}

export function loadEnv(source: EnvSource, opts?: LoadEnvOptions): Env {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    const required = opts?.requiredKeys ?? productionRequired;
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Production env missing required keys: ${missing.join(", ")}. ` + "See docs/DEPLOY.md.",
      );
    }
    // CRITICAL-6: ZDR-чек выполняется ТОЛЬКО при использовании ANTHROPIC_API_KEY
    // (direct anthropic.com). При работе через AI_GATEWAY_API_KEY (Timeweb)
    // данные не идут к Anthropic напрямую — 152-ФЗ обеспечивается DPA с Timeweb.
    if (
      env.ANTHROPIC_API_KEY &&
      !env.AI_GATEWAY_API_KEY &&
      env.ANTHROPIC_ZDR_CONFIRMED !== "true"
    ) {
      throw new Error(
        "ANTHROPIC_ZDR_CONFIRMED=true обязательна в production при прямом подключении " +
          "к Anthropic API (когда AI_GATEWAY_API_KEY не задан). Без подписанного ZDR-контракта " +
          "input/output логируются Anthropic 30 дней → нарушение 152-ФЗ. " +
          "Рекомендуемый способ: использовать AI_GATEWAY_API_KEY (Timeweb). " +
          "См. docs/SECURITY-AUDIT.md C6.",
      );
    }
  }

  return env;
}
