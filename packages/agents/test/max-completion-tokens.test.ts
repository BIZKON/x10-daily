import { describe, expect, it } from "vitest";
import { ToVAgent } from "../src";
import { mockOpenAI } from "./mock-openai";

/**
 * 🔴 Регресс инцидента 31.07.2026 (сессия 30).
 *
 * После перехода DeepSeek на версию `0731` параметр `max_tokens` перестал
 * задавать бюджет вывода: шлюз применяет вместо него дефолтную отсечку 8192,
 * ответ приходит с `finish_reason: "length"` и ПУСТЫМ content. Конвейер встал
 * на 4 дня — не писалось ни одной статьи.
 *
 * Замер на живом шлюзе (идентичный payload, отличается только имя параметра):
 *   max_tokens=10240            → finish=length, completion=8192, JSON битый
 *   max_completion_tokens=10240 → finish=stop,   completion=27671, JSON валиден
 *
 * Ответ поддержки Timeweb: «нужно передавать не max_tokens, а
 * max_completion_tokens; после перехода deepseek на 0731 параметр перестал быть
 * актуальным». То же самое пишет и SDK OpenAI: `max_tokens` помечен deprecated
 * в пользу `max_completion_tokens`.
 *
 * ⚠️ Слать ОБА параметра нельзя: присутствие `max_tokens` возвращает отсечку 8192.
 */

const DRAFT = {
  tease: "Заголовок",
  lede: "Вводка",
  whyItMatters: "Почему важно",
  body: [{ type: "paragraph" as const, text: "Текст абзаца." }],
};

const TOV_OUTPUT = {
  revised: DRAFT,
  changes: [],
  blacklistHits: [],
};

describe("бюджет вывода — max_completion_tokens (регресс 31.07.2026)", () => {
  it("DeepSeek-путь шлёт max_completion_tokens и НЕ шлёт max_tokens", async () => {
    const { client, spy } = mockOpenAI({
      toolName: "x10_emit_tov",
      toolInput: TOV_OUTPUT,
      contentMode: true,
    });

    await ToVAgent.run(
      { draft: DRAFT },
      { apiKey: "k", client, models: { SONNET: "deepseek/deepseek-v4-flash" } },
    );

    const params = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.max_completion_tokens).toBeGreaterThan(0);
    expect(params).not.toHaveProperty("max_tokens");
  });

  it("tool_choice-путь (не-DeepSeek модели) тоже шлёт max_completion_tokens", async () => {
    const { client, spy } = mockOpenAI({ toolName: "x10_emit_tov", toolInput: TOV_OUTPUT });

    await ToVAgent.run({ draft: DRAFT }, { apiKey: "k", client });

    const params = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.max_completion_tokens).toBeGreaterThan(0);
    expect(params).not.toHaveProperty("max_tokens");
  });

  it("на DeepSeek к бюджету добавляется запас под рассуждения", async () => {
    const { client, spy } = mockOpenAI({
      toolName: "x10_emit_tov",
      toolInput: TOV_OUTPUT,
      contentMode: true,
    });

    await ToVAgent.run(
      { draft: DRAFT },
      { apiKey: "k", client, models: { SONNET: "deepseek/deepseek-v4-flash" } },
    );

    const deepseekBudget = (spy.mock.calls[0]?.[0] as { max_completion_tokens: number })
      .max_completion_tokens;

    const plain = mockOpenAI({ toolName: "x10_emit_tov", toolInput: TOV_OUTPUT });
    await ToVAgent.run({ draft: DRAFT }, { apiKey: "k", client: plain.client });
    const claudeBudget = (plain.spy.mock.calls[0]?.[0] as { max_completion_tokens: number })
      .max_completion_tokens;

    expect(deepseekBudget).toBeGreaterThan(claudeBudget);
  });
});
