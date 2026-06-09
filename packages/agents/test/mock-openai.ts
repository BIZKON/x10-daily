import type OpenAI from "openai";
import { vi } from "vitest";

export type MockResponse = {
  toolName: string;
  /** Output payload — будет сериализован в tool_calls[0].function.arguments. */
  toolInput: unknown;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  /** Override модели в response (по умолчанию "x10-mock"). */
  model?: string;
  /** DeepSeek-путь: payload кладётся в message.content (response_format json_object), без tool_calls. */
  contentMode?: boolean;
};

/**
 * Мок OpenAI клиента для тестов. Возвращает чат-completion с одним tool_call,
 * имитируя ответ AI Gateway (OpenAI-compatible).
 *
 * До session 17 был mock-anthropic.ts с Anthropic-shaped response. После
 * переезда на Timeweb AI Gateway — те же агенты, но через OpenAI Chat
 * Completions format.
 */
export function mockOpenAI(response: MockResponse): {
  client: OpenAI;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn().mockResolvedValue({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: response.model ?? "x10-mock",
    choices: [
      {
        index: 0,
        message: response.contentMode
          ? {
              role: "assistant",
              content: JSON.stringify(response.toolInput),
            }
          : {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_test",
                  type: "function",
                  function: {
                    name: response.toolName,
                    arguments: JSON.stringify(response.toolInput),
                  },
                },
              ],
            },
        finish_reason: response.contentMode ? "stop" : "tool_calls",
      },
    ],
    usage: {
      prompt_tokens: response.inputTokens ?? 1000,
      completion_tokens: response.outputTokens ?? 500,
      total_tokens: (response.inputTokens ?? 1000) + (response.outputTokens ?? 500),
      prompt_tokens_details: {
        cached_tokens: response.cachedInputTokens ?? 0,
      },
    },
  });

  const client = {
    chat: { completions: { create: spy } },
  } as unknown as OpenAI;
  return { client, spy };
}
