import { describe, expect, it, vi } from "vitest";
import { DraftAgent, NumbersAgent, ToVAgent, createMasker } from "../src";
import { mockAnthropic } from "./mock-anthropic";

const SOURCES = [
  {
    url: "https://www.cbr.ru/press/keypr/",
    title: "Решение ЦБ по ключевой ставке",
    publisher: "ЦБ РФ",
    publishedAt: "2026-05-26",
  },
];

describe("DraftAgent", () => {
  it("использует Sonnet, шлёт system с cache_control, парсит tool_use в DraftShape", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_draft",
      toolInput: {
        tease: "ЦБ держит ставку 17% — четвёртое заседание",
        lede: "Банк России подтвердил курс на сжатие.",
        whyItMatters: "Кредитное окно для МСП закрыто минимум до сентября.",
        body: [
          {
            type: "callout",
            kind: "why",
            text: "При ставке 17% IRR проектов МСП в среднем ниже стоимости долга.",
          },
          {
            type: "numbers",
            items: [
              {
                label: "Ключевая ставка",
                value: "17%",
                source: "https://www.cbr.ru/press/keypr/",
              },
            ],
          },
        ],
      },
      inputTokens: 2000,
      outputTokens: 600,
    });

    const result = await DraftAgent.run(
      {
        topic: "ЦБ ставка",
        context: "Заседание ЦБ 26 мая 2026",
        sources: SOURCES,
        section: "main",
      },
      { apiKey: "test", client },
    );

    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.tool_choice).toEqual({ type: "tool", name: "x10_emit_draft" });
    expect(call.tools[0].name).toBe("x10_emit_draft");

    expect(result.modelUsed).toBe("claude-sonnet-4-6");
    expect(result.output.tease).toContain("17%");
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.costUsd).toBeGreaterThan(0);
  });
});

describe("NumbersAgent", () => {
  it("использует Haiku (дешёвый тир)", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: {
        items: [
          {
            label: "Ключевая ставка",
            value: "17%",
            source: "https://www.cbr.ru/press/keypr/",
            contextQuote: "Совет директоров принял решение сохранить ставку 17%.",
          },
        ],
        hasUnsourcedNumbers: false,
      },
    });

    const result = await NumbersAgent.run(
      { text: "ЦБ оставил ставку 17%.", sources: SOURCES },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-haiku-4-5-20251001");
    expect(result.output.items).toHaveLength(1);
    expect(result.output.items[0]?.value).toBe("17%");
    expect(result.output.hasUnsourcedNumbers).toBe(false);
  });
});

describe("ToVAgent", () => {
  it("инжектит voice.md в system и возвращает changes", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_tov",
      toolInput: {
        revised: {
          tease: "ЦБ держит ставку 17%",
          lede: "Банк России подтвердил курс на сжатие.",
          whyItMatters: "Кредитное окно для МСП закрыто до сентября.",
          body: [
            { type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз подряд." },
          ],
        },
        changes: [
          {
            kind: "blacklist",
            before: "беспрецедентное решение",
            after: "решение сохранить ставку",
            reason: "blacklist: «беспрецедентный»",
          },
        ],
      },
    });

    const result = await ToVAgent.run(
      {
        draft: {
          tease: "Беспрецедентное решение ЦБ",
          lede: "Банк России подтвердил курс.",
          whyItMatters: "Кредитное окно для МСП закрыто.",
          body: [{ type: "paragraph", text: "Совет директоров принял беспрецедентное решение." }],
        },
        authorName: null,
      },
      { apiKey: "test", client },
    );

    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toContain("VOICE RULES");
    expect(systemText).toContain("беспрецедентный");
    expect(result.output.changes).toHaveLength(1);
    expect(result.output.changes[0]?.kind).toBe("blacklist");
  });
});

describe("masker × agent integration", () => {
  it("mask вызывается перед LLM, unmask — после", async () => {
    const maskFn = vi.fn(async (text: string) => ({
      masked: text.replace("Иванов", "[NAME_1]"),
      session: { sessionId: "s1" },
    }));
    const unmaskFn = vi.fn(async (text: string) =>
      text.replaceAll("[NAME_1]", "Иванов"),
    );

    const { client } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: {
        items: [
          {
            label: "Зарплата [NAME_1]",
            value: "200 000 ₽",
            source: null,
            contextQuote: "[NAME_1] получает 200 000 ₽ в месяц",
          },
        ],
        hasUnsourcedNumbers: true,
      },
    });

    const result = await NumbersAgent.run(
      { text: "Иванов получает 200 000 ₽ в месяц", sources: [] },
      { apiKey: "test", client, masker: { mask: maskFn, unmask: unmaskFn } },
    );

    expect(maskFn).toHaveBeenCalledWith(
      expect.stringContaining("Иванов"),
    );
    expect(unmaskFn).toHaveBeenCalledOnce();
    expect(result.output.items[0]?.label).toBe("Зарплата Иванов");
    expect(result.output.items[0]?.contextQuote).toContain("Иванов");
  });

  it("passthrough masker не меняет текст", async () => {
    const masker = createMasker({ NODE_ENV: "development" });
    const { client } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: { items: [], hasUnsourcedNumbers: false },
    });
    const result = await NumbersAgent.run(
      { text: "hello", sources: [] },
      { apiKey: "test", client, masker },
    );
    expect(result.output.items).toHaveLength(0);
  });
});
