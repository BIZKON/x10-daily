import { MODELS, type ModelTier } from "@x10/config";
import type OpenAI from "openai";
import type { z } from "zod";
import { calculateCostUsd, type TokenUsage } from "./cost";
import type { Masker } from "./masker";
import { getOpenAIClient } from "./openai-client";
import { zodToToolSchema } from "./zod-to-tool-schema";

export type AgentContext = {
  /** API key для Timeweb AI Gateway (или Anthropic direct если baseURL не задан). */
  apiKey: string;
  /** Base URL — по умолчанию читается из OPENAI_BASE_URL env. */
  baseURL?: string;
  masker?: Masker;
  /** Override клиента — для тестов. Если задан, getOpenAIClient игнорируется. */
  client?: OpenAI;
};

export type AgentResult<O> = {
  output: O;
  usage: TokenUsage;
  /**
   * Стоимость в USD-эквиваленте (по курсу 80 ₽/$1 при работе через Timeweb).
   * См. COST_PER_MTOK в @x10/config/constants.ts.
   */
  costUsd: number;
  modelUsed: string;
};

export type AgentDefinition<I, O> = {
  name: string;
  /** Один из CLAUDE.md §2 тиров — выбирает модель через MODELS[tier]. */
  tier: ModelTier;
  /** Система. Длинный статичный текст (раньше был в prompt-cache, через AI Gateway — обычный system message). */
  system: string | (() => string);
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  /** Сериализация input в user-message. Default — JSON.stringify с отступами. */
  formatInput?: (input: I) => string;
  /** Лимит на output tokens — экономия + safety. Default 2048. */
  maxOutputTokens?: number;
};

export type Agent<I, O> = {
  name: string;
  tier: ModelTier;
  run(input: I, ctx: AgentContext): Promise<AgentResult<O>>;
};

const TOOL_NAME_PREFIX = "x10_emit_";

/**
 * defineAgent — фабрика декларативных LLM-агентов через function calling.
 *
 * Архитектура (после session 17 — OpenAI Chat Completions API через Timeweb):
 *   1. system prompt + user input → /v1/chat/completions с tools[].
 *   2. tool_choice пинит модель на единственную функцию x10_emit_<name>.
 *   3. JSON Schema из outputSchema (Zod) служит structured-output контрактом.
 *   4. Распарсенный tool_calls[0].function.arguments → output через outputSchema.parse.
 *
 * Anthropic prompt caching (cache_control: ephemeral) не поддерживается через
 * OpenAI-compat API. Timeweb может применять prefix caching автоматически
 * на стороне прокси — но это не публичный контракт.
 */
export function defineAgent<I, O>(def: AgentDefinition<I, O>): Agent<I, O> {
  const toolName = `${TOOL_NAME_PREFIX}${def.name}`;
  const outputJsonSchema = zodToToolSchema(def.outputSchema);
  const formatInput = def.formatInput ?? ((i: I) => JSON.stringify(i, null, 2));
  const maxTokens = def.maxOutputTokens ?? 2048;

  return {
    name: def.name,
    tier: def.tier,

    async run(input: I, ctx: AgentContext): Promise<AgentResult<O>> {
      const validated = def.inputSchema.parse(input);
      const client = ctx.client ?? getOpenAIClient({ apiKey: ctx.apiKey, baseURL: ctx.baseURL });
      const systemText = typeof def.system === "function" ? def.system() : def.system;
      const model = MODELS[def.tier];

      const userTextRaw = formatInput(validated);
      let userText = userTextRaw;
      let session = undefined as { sessionId: string } | undefined;
      if (ctx.masker) {
        const masked = await ctx.masker.mask(userTextRaw);
        userText = masked.masked;
        session = masked.session;
      }

      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemText },
          { role: "user", content: userText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: toolName,
              description: `Emit the structured ${def.name} output.`,
              parameters: outputJsonSchema as Record<string, unknown>,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: toolName },
        },
      });

      const choice = response.choices[0];
      const toolCall = choice?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`Agent ${def.name}: модель не вернула function tool_call`);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        throw new Error(
          `Agent ${def.name}: tool_call.function.arguments не JSON: ${err instanceof Error ? err.message : err}`,
        );
      }

      if (ctx.masker && session) {
        const json = JSON.stringify(payload);
        const restored = await ctx.masker.unmask(json, session);
        payload = JSON.parse(restored);
      }

      const output = def.outputSchema.parse(payload);

      const u = response.usage;
      // OpenAI v3+ API экспонирует cached_tokens в prompt_tokens_details. Это
      // unstable field — некоторые прокси не передают, поэтому fallback 0.
      const cachedInputTokens =
        (u as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
          ?.prompt_tokens_details?.cached_tokens ?? 0;
      const usage: TokenUsage = {
        inputTokens: u?.prompt_tokens ?? 0,
        outputTokens: u?.completion_tokens ?? 0,
        cachedInputTokens,
      };

      return {
        output,
        usage,
        costUsd: calculateCostUsd(def.tier, usage),
        modelUsed: model,
      };
    },
  };
}
