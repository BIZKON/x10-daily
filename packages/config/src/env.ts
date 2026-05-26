import { z } from "zod";

const urlOrEmpty = z.union([z.url(), z.literal("")]);

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL required"),
  DIRECT_DATABASE_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL_OPUS: z.string().default("claude-opus-4-7"),
  ANTHROPIC_MODEL_SONNET: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_HAIKU: z.string().default("claude-haiku-4-5-20251001"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_PROXY_URL: urlOrEmpty.optional(),

  MASKER_BASE_URL: urlOrEmpty.optional(),
  MASKER_API_KEY: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBAPP_URL: urlOrEmpty.optional(),

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
  }

  return env;
}
