export const MODELS = {
  OPUS: "claude-opus-4-7",
  SONNET: "claude-sonnet-4-6",
  HAIKU: "claude-haiku-4-5-20251001",
} as const;

export type ModelTier = keyof typeof MODELS;

export const COST_PER_MTOK = {
  OPUS: { input: 5, output: 25 },
  SONNET: { input: 3, output: 15 },
  HAIKU: { input: 1, output: 5 },
} as const;

export const PERF_BUDGETS = {
  LCP_MS: 2500,
  INP_MS: 200,
  CLS: 0.1,
  TTFB_MS: 200,
  TTFT_MS: 500,
  LOCAL_MUTATION_MS: 16,
  BUNDLE_JS_INITIAL_KB: 200,
} as const;

export const BREVITY_LIMITS = {
  MAX_WORDS: 300,
  READ_SECONDS_MIN: 25,
  READ_SECONDS_MAX: 30,
} as const;
