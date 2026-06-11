import { MODELS, type ModelTier } from "@x10/config";
import type OpenAI from "openai";
import type { z } from "zod";
import { type TokenUsage, calculateCostUsd } from "./cost";
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
 * Reasoning-headroom для thinking-вариантов DeepSeek (v4-flash/pro): их
 * `reasoning_content` тратит max_tokens ПЕРЕД JSON-выводом, и на сложных промптах
 * (полная JSON-схема + длинный вход, напр. Brevity) рассуждения съедают весь
 * бюджет → пустой `content` → падение шага (session 24). Параметры управления
 * reasoning (reasoning_effort / enable_thinking / chat_template_kwargs) gateway
 * Timeweb ИГНОРИРУЕТ (проверено) — отключить thinking нельзя. Поэтому добавляем
 * запас к maxOutputTokens на DeepSeek-пути + ретрай с удвоенным запасом на пустой
 * content. Non-reasoning `deepseek-chat` (V3.2) лишний бюджет НЕ тратит
 * (finish=stop) — headroom для неё бесплатен (биллится фактический usage).
 * Gateway клампит max_tokens по капу модели (проверено: deepseek-chat принимает
 * 14336 → finish=stop), HTTP 400 не отдаёт — кламп в коде не нужен.
 */
const DEEPSEEK_REASONING_HEADROOM = 8192;

/**
 * Per-request таймаут для DeepSeek-вызовов (session 24). v4-flash — reasoning-
 * модель, а gateway Timeweb БУФЕРИЗУЕТ ответ (заголовки приходят только по
 * завершении всей генерации — проверено: TTFB ≈ полное время), поэтому клиентский
 * таймаут покрывает ВСЮ генерацию, а не только заголовки. Дефолтные 60s
 * (openai-client) рубят длинные вызовы (~70 ток/с → 22K-токенный ретрай ≈ 5 мин) и
 * молча SDK-ретраятся, чей usage мимо $-ledger. 7 мин с запасом на worst-case
 * (maxTokens + headroom×2). Claude-путь таймаут не трогает (быстрый, 60s хватает).
 */
const DEEPSEEK_TIMEOUT_MS = 420_000;

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
      /** Usage вызова, выброшенного ретраем (пустой content) — биллится, учитываем. */
      let wastedUsage: OpenAI.Completions.CompletionUsage | undefined;

      if (isDeepSeek) {
        const jsonSystem = `${systemText}\n\nФОРМАТ ОТВЕТА (обязательно): верни СТРОГО валидный JSON-объект по этой JSON Schema. Только JSON — без markdown, без \`\`\`, без любого текста до или после.\nJSON Schema:\n${JSON.stringify(outputJsonSchema)}`;
        const callDeepSeek = (budget: number) =>
          client.chat.completions.create(
            {
              model,
              max_tokens: budget,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: jsonSystem },
                { role: "user", content: userText },
              ],
            },
            { timeout: DEEPSEEK_TIMEOUT_MS },
          );
        // Бюджет исчерпан reasoning'ом проявляется ДВУМЯ способами: пустой content
        // (бюджет кончился ДО вывода) ИЛИ усечённый JSON (finish_reason="length" —
        // бюджет кончился ПОСРЕДИ вывода; content непустой, но JSON.parse упадёт).
        // Оба чиним одинаково — ретрай с удвоенным запасом. Срабатывает редко.
        const isStarved = (r: typeof response) =>
          !r.choices[0]?.message?.content || r.choices[0]?.finish_reason === "length";
        // Thinking-headroom (см. DEEPSEEK_REASONING_HEADROOM): первый вызов с запасом;
        // если reasoning всё же съел весь бюджет — один ретрай с удвоенным запасом.
        response = await callDeepSeek(maxTokens + DEEPSEEK_REASONING_HEADROOM);
        if (isStarved(response)) {
          wastedUsage = response.usage;
          response = await callDeepSeek(maxTokens + DEEPSEEK_REASONING_HEADROOM * 2);
        }
        const content = response.choices[0]?.message?.content;
        if (!content || response.choices[0]?.finish_reason === "length") {
          throw new Error(
            `Agent ${def.name}: модель ${model} вернула пустой/усечённый content даже после ретрая ` +
              `(finish_reason=${response.choices[0]?.finish_reason}; reasoning_content вероятно исчерпал max_tokens)`,
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
        inputTokens: (u?.prompt_tokens ?? 0) + (wastedUsage?.prompt_tokens ?? 0),
        outputTokens: (u?.completion_tokens ?? 0) + (wastedUsage?.completion_tokens ?? 0),
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
