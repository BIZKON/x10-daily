import OpenAI from "openai";

/**
 * OpenAI SDK singleton для Timeweb AI Gateway.
 *
 * До session 17 был Anthropic SDK direct. После перехода на Timeweb AI Gateway —
 * OpenAI-совместимый прокси для Claude / GPT / Gemini моделей с базовым URL
 * https://api.timeweb.ai/v1 (см. ЛК Timeweb → AI-агенты → Подключение).
 *
 * Кэшируем клиент по комбинации (apiKey, baseURL) — на случай тестов или
 * нескольких окружений (test/prod) в одном процессе.
 */
const cache = new Map<string, OpenAI>();

export interface OpenAIClientOptions {
  apiKey: string;
  baseURL?: string;
}

function cacheKey(opts: OpenAIClientOptions): string {
  return `${opts.baseURL ?? "default"}|${opts.apiKey}`;
}

export function getOpenAIClient(opts: OpenAIClientOptions): OpenAI {
  const key = cacheKey(opts);
  let client = cache.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      maxRetries: 2,
      timeout: 60_000,
    });
    cache.set(key, client);
  }
  return client;
}

/** Только для тестов — позволяет инжектить мок-клиент. */
export function setOpenAIClient(opts: OpenAIClientOptions, client: OpenAI): void {
  cache.set(cacheKey(opts), client);
}

export function resetOpenAIClientCache(): void {
  cache.clear();
}

export type OpenAIClient = OpenAI;
