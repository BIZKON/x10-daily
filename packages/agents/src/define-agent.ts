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
  /**
   * Override модели по tier'у (session 23). Пусто/не задано → дефолт MODELS[tier].
   * Позволяет перевести агентов на другую модель (напр. DeepSeek V4 Flash) флипом
   * env, не трогая код. Стоимость считается по фактической модели (см. cost.ts).
   */
  models?: Partial<Record<ModelTier, string>>;
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
 * defineAgent — фабрика декларативных LLM-агентов (OpenAI Chat Completions через
 * Timeweb AI Gateway). Structured output — провайдер-conditional (см. run):
 *   - Anthropic/Claude: forced tool_choice на функцию x10_emit_<name>; ответ из
 *     tool_calls[0].function.arguments.
 *   - DeepSeek (model начинается с "deepseek"): response_format=json_object +
 *     JSON Schema в system-промпте; ответ из message.content. Причина — DeepSeek
 *     function-calling бьёт JSON на крупных вложенных выводах (session 23), а
 *     thinking-варианты вовсе отвергают tool_choice (HTTP 400).
 * В обоих путях JSON → outputSchema.parse (Zod) — единый контракт.
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
      const model = ctx.models?.[def.tier] || MODELS[def.tier];

      const userTextRaw = formatInput(validated);
      let userText = userTextRaw;
      let session = undefined as { sessionId: string } | undefined;
      if (ctx.masker) {
        const masked = await ctx.masker.mask(userTextRaw);
        userText = masked.masked;
        session = masked.session;
      }

      // Провайдер-conditional structured output (session 23):
      //  - Anthropic/Claude: forced tool_choice на единственную функцию
      //    x10_emit_<name> — надёжно, оставляем как было.
      //  - DeepSeek: function-calling НЕнадёжен для крупных вложенных выводов
      //    (модель дописывает текст после JSON / бьёт массивы — ToV 0/10), а
      //    thinking-варианты вовсе отвергают tool_choice (HTTP 400). Поэтому
      //    response_format=json_object (API гарантирует валидный JSON) + JSON Schema
      //    в system-промпте; ответ берём из message.content. Соответствие схеме
      //    добивается outputSchema.parse + ретраем вызывающего (Inngest-step).
      const isDeepSeek = model.startsWith("deepseek");

      let response: OpenAI.Chat.Completions.ChatCompletion;
      let rawArgs: string;

      if (isDeepSeek) {
        const jsonSystem =
          `${systemText}\n\nФОРМАТ ОТВЕТА (обязательно): верни СТРОГО валидный JSON-объект ` +
          "по этой JSON Schema. Только JSON — без markdown, без ```, без любого текста до или после.\n" +
          `JSON Schema:\n${JSON.stringify(outputJsonSchema)}`;
        response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: jsonSystem },
            { role: "user", content: userText },
          ],
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error(
            `Agent ${def.name}: модель ${model} вернула пустой content (response_format=json_object)`,
          );
        }
        rawArgs = content;
      } else {
        response = await client.chat.completions.create({
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
          tool_choice: { type: "function", function: { name: toolName } },
        });
        const toolCall = response.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.type !== "function") {
          throw new Error(`Agent ${def.name}: модель не вернула function tool_call`);
        }
        rawArgs = toolCall.function.arguments;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawArgs);
      } catch (err) {
        throw new Error(
          `Agent ${def.name}: ответ модели ${model} не JSON: ${err instanceof Error ? err.message : err}`,
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
        costUsd: calculateCostUsd(def.tier, usage, model),
        modelUsed: model,
      };
    },
  };
}
