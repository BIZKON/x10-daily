import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic SDK singleton. Конструктор дёшев, но клиент-уровневые retry/timeouts
 * настраиваем один раз. Кэшируем по API-ключу — на случай нескольких env (test/prod).
 */
const cache = new Map<string, Anthropic>();

export function getAnthropicClient(apiKey: string): Anthropic {
  let client = cache.get(apiKey);
  if (!client) {
    client = new Anthropic({
      apiKey,
      maxRetries: 2,
      timeout: 60_000,
    });
    cache.set(apiKey, client);
  }
  return client;
}

/** Только для тестов — позволяет инжектить мок-клиент. */
export function setAnthropicClient(apiKey: string, client: Anthropic): void {
  cache.set(apiKey, client);
}

export function resetAnthropicCache(): void {
  cache.clear();
}

export type AnthropicClient = Anthropic;
