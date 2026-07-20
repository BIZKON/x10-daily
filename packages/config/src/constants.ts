/**
 * Model IDs для Timeweb AI Gateway. Префикс `anthropic/` обязательный —
 * см. ЛК → AI-агенты → Модели. При прямом подключении к Anthropic API
 * (без AI Gateway) префикс опускается.
 */
export const MODELS = {
  OPUS: "anthropic/claude-opus-4-7",
  SONNET: "anthropic/claude-sonnet-4-6",
  HAIKU: "anthropic/claude-haiku-4-5",
} as const;

export type ModelTier = keyof typeof MODELS;

/**
 * Стоимость через Timeweb AI Gateway (USD-эквивалент по фиксированному курсу
 * 80 ₽/$1 для совместимости с существующей DB schema `cost_usd numeric`).
 *
 * Real Timeweb pricing (₽ / 1 млн токенов):
 *   OPUS:   675 input / 3375 output
 *   SONNET: 405 input / 2025 output
 *   HAIKU:  135 input / 1080 output
 *
 * Прирост ~+70% vs Anthropic direct — плата за РФ-локализацию + 152-ФЗ.
 * При смене курса/тарифа обновлять здесь.
 */
export const COST_PER_MTOK = {
  OPUS: { input: 8.44, output: 42.19 },
  SONNET: { input: 5.06, output: 25.31 },
  HAIKU: { input: 1.69, output: 13.5 },
} as const;

/**
 * Цена по КОНКРЕТНОЙ модели (model-ID), а не по tier'у — нужна, когда модель
 * tier'а переопределена через env (MODEL_SONNET/MODEL_HAIKU=deepseek/...).
 * cost.ts (calculateCostUsd) резолвит стоимость по фактической модели: для
 * Claude-id значения совпадают с COST_PER_MTOK[tier], для DeepSeek — отдельные
 * тарифы Timeweb. Неизвестная модель → fallback на COST_PER_MTOK[tier] + warn.
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  [MODELS.OPUS]: { ...COST_PER_MTOK.OPUS },
  [MODELS.SONNET]: { ...COST_PER_MTOK.SONNET },
  [MODELS.HAIKU]: { ...COST_PER_MTOK.HAIKU },
  // DeepSeek через Timeweb AI Gateway (session 23) — РФ-резидентно, тот же прокси
  // и DPA, что и Claude (masker остаётся passthrough). Цены — реальный тариф LK
  // Timeweb AI Gateway, ₽/М ÷ курс ЦБ 71.73 ₽/$ (на 2026-06-10). cost.ts считает
  // по фактической модели (modelUsed).
  //
  // ⚠️ ИДЕНТИЧНОСТЬ (из API cloud-ai/models, session 24 — handoff s23 ОШИБАЛСЯ):
  //   deepseek/deepseek-chat     = «DeepSeek V3.2» (id 19, non-reasoning) — НАША рабочая модель в MODEL_*.
  //   deepseek/deepseek-v4-flash = «DeepSeek V4 Flash» (id 129 non-think / 131 think) — ДРУГАЯ, новее.
  //   deepseek/deepseek-v4-pro   = «DeepSeek V4 Pro» (id 133/135).
  //   (Раньше считали «deepseek-chat = V4 Flash non-thinking» — НЕВЕРНО.)
  // v4-flash ВАЛИДИРОВАН на реальной цепочке (s24, 17/17): response_format json_object
  // работает, но это reasoning-модель — нужен thinking-headroom в define-agent (иначе
  // reasoning_content съедает max_tokens → пустой content; Brevity падал). Латентность
  // 3-10× выше V3.2 (social до ~4 мин). reasoning-токены биллятся как output.
  //
  // ⚠️ deepseek-chat (V3.2): цена — ПРОКСИ от v4-flash (строку V3.2 в LK не сверили).
  // v4-flash 19/38 ₽/М — ПОДТВЕРЖДЁН скрином LK (контекст 1M, выход до 384K).
  "deepseek/deepseek-chat": { input: 0.265, output: 0.53 },
  "deepseek/deepseek-v4-flash": { input: 0.265, output: 0.53 },
  // v4-pro — ОЦЕНКА (LK ≈ 234.9/469.8 ₽/М ÷ 71.73), в LK не пересверена; не используется.
  "deepseek/deepseek-v4-pro": { input: 3.27, output: 6.55 },
};

export const PERF_BUDGETS = {
  LCP_MS: 2500,
  INP_MS: 200,
  CLS: 0.1,
  TTFB_MS: 200,
  TTFT_MS: 500,
  LOCAL_MUTATION_MS: 16,
  BUNDLE_JS_INITIAL_KB: 200,
} as const;

/**
 * Лимиты по шаблону — brief §3.
 * BrevityAgent целится в MAX_WORDS, DraftAgent ориентируется на READ_SECONDS_MAX.
 *
 * - card-news: классическая Smart Brevity новость. 70% материалов.
 * - deep-dive: глубокий разбор в стиле Lenny's. Brevity почти не режет — только убирает воду.
 * - daily-take: «Разбор от основателя», короткий. Структура Cite→Opinion→Implication.
 * - guide: пошаговая методичка, длинный формат с шагами. Brevity сохраняет всю структуру.
 */
export const TEMPLATE_LIMITS = {
  "card-news": { MAX_WORDS: 300, MIN_WORDS: 120, READ_SECONDS_MIN: 25, READ_SECONDS_MAX: 30 },
  "deep-dive": { MAX_WORDS: 2000, MIN_WORDS: 800, READ_SECONDS_MIN: 300, READ_SECONDS_MAX: 720 },
  "daily-take": { MAX_WORDS: 200, MIN_WORDS: 50, READ_SECONDS_MIN: 30, READ_SECONDS_MAX: 60 },
  guide: { MAX_WORDS: 2500, MIN_WORDS: 1000, READ_SECONDS_MIN: 360, READ_SECONDS_MAX: 900 },
} as const;

export type TemplateKind = keyof typeof TEMPLATE_LIMITS;

/** Backward-compat: card-news лимиты как «классический» Smart Brevity. */
export const BREVITY_LIMITS = TEMPLATE_LIMITS["card-news"];
