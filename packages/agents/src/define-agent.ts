import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, type ModelTier } from "@x10/config";
import type { z } from "zod";
import { getAnthropicClient } from "./anthropic";
import { calculateCostUsd, type TokenUsage } from "./cost";
import type { Masker } from "./masker";
import { zodToToolSchema } from "./zod-to-tool-schema";

export type AgentContext = {
  apiKey: string;
  masker?: Masker;
  /** Override клиента — для тестов. Если задан, getAnthropicClient игнорируется. */
  client?: Anthropic;
};

export type AgentResult<O> = {
  output: O;
  usage: TokenUsage;
  costUsd: number;
  modelUsed: string;
};

export type AgentDefinition<I, O> = {
  name: string;
  /** Один из CLAUDE.md §2 тиров — выбирает модель через MODELS[tier]. */
  tier: ModelTier;
  /** Система. Длинный статичный текст — будет в prompt-cache (ephemeral). */
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
      const client = ctx.client ?? getAnthropicClient(ctx.apiKey);
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

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemText,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [
          {
            name: toolName,
            description: `Emit the structured ${def.name} output.`,
            input_schema: outputJsonSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
        messages: [{ role: "user", content: userText }],
      });

      const block = response.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        throw new Error(`Agent ${def.name}: модель не вернула tool_use блок`);
      }

      let payload = block.input as unknown;
      if (ctx.masker && session) {
        const json = JSON.stringify(payload);
        const restored = await ctx.masker.unmask(json, session);
        payload = JSON.parse(restored);
      }

      const output = def.outputSchema.parse(payload);

      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens:
          (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
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
