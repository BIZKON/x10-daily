import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";

export type MockResponse = {
  toolName: string;
  toolInput: unknown;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

export function mockAnthropic(response: MockResponse): {
  client: Anthropic;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn().mockResolvedValue({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-mock",
    content: [
      {
        type: "tool_use",
        id: "tool_test",
        name: response.toolName,
        input: response.toolInput,
      },
    ],
    stop_reason: "tool_use",
    usage: {
      input_tokens: response.inputTokens ?? 1000,
      output_tokens: response.outputTokens ?? 500,
      cache_read_input_tokens: response.cachedInputTokens ?? 0,
    },
  });

  const client = { messages: { create: spy } } as unknown as Anthropic;
  return { client, spy };
}
