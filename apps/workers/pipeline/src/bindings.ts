/**
 * Pipeline worker bindings — runtime-agnostic интерфейс env переменных.
 *
 * До session 18 был PipelineBindings (worker-configuration.d.ts). После
 * переезда на Timeweb App Platform / Docker — чистый TS интерфейс. Bindings
 * передаются в Hono через `app.fetch(req, bindings)` из server.ts.
 *
 * Все ключи строки (Node process.env source). Inngest functions сами
 * валидируют через @x10/config loadEnv.
 */
export interface PipelineBindings {
  NODE_ENV: "development" | "staging" | "production";

  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;

  // ---- AI (Timeweb AI Gateway primary, ANTHROPIC_* как legacy fallback) ----
  AI_GATEWAY_BASE_URL?: string;
  AI_GATEWAY_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ZDR_CONFIRMED?: "true" | "false";

  // ---- Masker (опционально — через Timeweb AI Gateway не нужен) ----
  MASKER_BASE_URL?: string;
  MASKER_API_KEY?: string;

  // ---- Inngest (signing key обязателен в prod — CRITICAL-4) ----
  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;

  // ---- Telegram posting (ТЗ #1, N5 — реальный sendMessage в тестовый канал) ----
  TELEGRAM_BOT_TOKEN?: string;
  TG_TEST_CHANNEL_ID?: string;
  /** Базовый домен (напр. `pro-agent-ai.ru`) — ссылка «Читать в ProAgent AI» в rich-постах (session 27). */
  X10_BASE_DOMAIN?: string;
  /**
   * HTTP/HTTPS-прокси для api.telegram.org (escape-hatch, если IPv6/NAT66
   * отвалится). Пуст → прямой fetch (IPv6). Потребители: drain-post-slots, ops-alert.
   * audit M2: раньше был только в Zod-схеме, но не доходил до воркера.
   */
  TELEGRAM_PROXY_URL?: string;

  // ---- $-мониторинг автономного конвейера (session 20 hardening) ----
  /** Чат для $-алертов (отдельный от контент-канала). Пуст → алерты в логи. */
  TG_OPS_CHAT_ID?: string;
  /** Жёсткий дневной потолок $-расхода. Строка (coerce.number в @x10/config). */
  DAILY_BUDGET_USD?: string;
  /** Warn-порог $-расхода (< DAILY_BUDGET_USD). */
  DAILY_BUDGET_WARN_USD?: string;

  // ---- VK posting (session 21 — автопостинг на стену сообщества) ----
  /** VK access token (community/user с правом wall). Пуст → VK-ветка отключена. */
  VK_ACCESS_TOKEN?: string;
  /** owner_id стены VK: "-123456" сообщество, "123456" юзер. */
  VK_OWNER_ID?: string;

  // ---- Override модели по tier'у (session 23) — env-своп на DeepSeek без redeploy ----
  /**
   * Пусто → дефолт MODELS[tier] (Claude). Задать deepseek/deepseek-v4-flash →
   * воркер-агенты на DeepSeek. ⚠️ Должны ЧИТАТЬСЯ в readBindingsFromEnv ниже,
   * иначе не доходят до воркера (как было с TELEGRAM_PROXY_URL — тот же класс бага).
   */
  MODEL_OPUS?: string;
  MODEL_SONNET?: string;
  MODEL_HAIKU?: string;

  // ---- Reddit OAuth (reddit-адаптер ingest — обход IP-429 через app-токен) ----
  /** Пусты → reddit-источники не фетчатся (адаптер бросает RedditNotConfigured, ingest скипает). */
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  /** Уникальный описательный UA (Reddit требует). Пуст → дефолт в адаптере. */
  REDDIT_USER_AGENT?: string;
}

/**
 * Собирает PipelineBindings из process.env (Node entrypoint, зовётся в server.ts).
 * Вынесено из server.ts, чтобы быть side-effect-free и ТЕСТИРУЕМЫМ: иначе
 * env-переменная, добавленная в Zod-схему (@x10/config) и интерфейс выше, но
 * забытая здесь, молча НЕ доходит до воркера — loadPipelineEnv парсит ИМЕННО этот
 * объект, а не сырой process.env, и применит .default(). Так уже было дважды
 * (TELEGRAM_PROXY_URL — audit M2; MODEL_* — session 23 review).
 *
 * ⚠️ Любой НОВЫЙ env-ключ воркера ДОБАВЛЯТЬ И СЮДА (regression: test/bindings.test.ts).
 */
export function readBindingsFromEnv(): PipelineBindings {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as PipelineBindings["NODE_ENV"];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL обязателен — задайте в env / docker-compose: DATABASE_URL=postgresql://...",
    );
  }
  return {
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,

    AI_GATEWAY_BASE_URL: process.env.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_ZDR_CONFIRMED: process.env
      .ANTHROPIC_ZDR_CONFIRMED as PipelineBindings["ANTHROPIC_ZDR_CONFIRMED"],

    MASKER_BASE_URL: process.env.MASKER_BASE_URL,
    MASKER_API_KEY: process.env.MASKER_API_KEY,

    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TG_TEST_CHANNEL_ID: process.env.TG_TEST_CHANNEL_ID,
    X10_BASE_DOMAIN: process.env.X10_BASE_DOMAIN,
    TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL,

    TG_OPS_CHAT_ID: process.env.TG_OPS_CHAT_ID,
    DAILY_BUDGET_USD: process.env.DAILY_BUDGET_USD,
    DAILY_BUDGET_WARN_USD: process.env.DAILY_BUDGET_WARN_USD,

    VK_ACCESS_TOKEN: process.env.VK_ACCESS_TOKEN,
    VK_OWNER_ID: process.env.VK_OWNER_ID,

    MODEL_OPUS: process.env.MODEL_OPUS,
    MODEL_SONNET: process.env.MODEL_SONNET,
    MODEL_HAIKU: process.env.MODEL_HAIKU,

    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
    REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT,
  };
}
