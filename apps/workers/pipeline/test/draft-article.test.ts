import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тестируем оркестрацию: цепочка DRAFT → (NUMBERS ∥ TOV) → PERSIST.
 * Inngest runtime тестируется самим Inngest SDK, нас интересует что наша factory
 * собирает правильный handler и шаги вызываются в правильном порядке.
 *
 * Подход: мокаем @x10/agents и @x10/db до импорта функции. Затем вызываем handler
 * напрямую (он экспонируется через .fn) с фейковым step и event.
 */

const ANTHROPIC_KEY = "sk-test";

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    DraftAgent: {
      name: "draft",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          tease: "ЦБ ставка 17%",
          lede: "Совет сохранил ставку.",
          whyItMatters: "Кредитное окно закрыто.",
          body: [{ type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз." }],
        },
        usage: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 },
        costUsd: 0.01,
        modelUsed: "claude-sonnet-4-6",
      }),
    },
    NumbersAgent: {
      name: "numbers",
      tier: "HAIKU" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          items: [{ label: "Ставка", value: "17%", source: "https://cbr.ru" }],
          hasUnsourcedNumbers: false,
        },
        usage: { inputTokens: 300, outputTokens: 100, cachedInputTokens: 0 },
        costUsd: 0.001,
        modelUsed: "claude-haiku-4-5-20251001",
      }),
    },
    ToVAgent: {
      name: "tov",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          revised: {
            tease: "ЦБ ставка 17%",
            lede: "Совет сохранил ставку.",
            whyItMatters: "Кредитное окно закрыто.",
            body: [
              { type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз подряд." },
            ],
          },
          changes: [],
        },
        usage: { inputTokens: 800, outputTokens: 400, cachedInputTokens: 0 },
        costUsd: 0.008,
        modelUsed: "claude-sonnet-4-6",
      }),
    },
  };
});

vi.mock("../src/persist", () => ({
  persistArticle: vi.fn().mockResolvedValue({ id: "art-uuid-1", slug: "tsb-stavka-17" }),
  serializeDraftForNumbers: vi.fn().mockReturnValue("serialized draft"),
}));

import { DraftAgent, NumbersAgent, ToVAgent } from "@x10/agents";
import { persistArticle } from "../src/persist";
import { createPipelineInngest } from "../src/inngest/client";
import { createDraftArticleFunction } from "../src/inngest/functions/draft-article";

const BINDINGS: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  ANTHROPIC_API_KEY: ANTHROPIC_KEY,
};

const EVENT = {
  data: {
    topic: "ЦБ ставка",
    context: "Заседание ЦБ 26 мая 2026",
    sources: [
      {
        url: "https://www.cbr.ru/press/keypr/",
        title: "Решение ЦБ",
        publisher: "ЦБ РФ",
      },
    ],
    section: "main" as const,
    authorName: null,
  },
};

function makeStep() {
  // Inngest step.run(name, fn) — для тестов просто вызываем fn немедленно.
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  };
}

describe("draft-article pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("вызывает агентов в правильном порядке и возвращает articleId", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();

    // Достаём handler — Inngest хранит его в _fns/private поле.
    // Воркэраунд: вызываем handler через any-cast, потому что v4 не экспонирует напрямую.
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      articleId: string;
      slug: string;
      totalCostUsd: number;
      unsourcedNumbers: boolean;
    };

    expect(DraftAgent.run).toHaveBeenCalledOnce();
    expect(NumbersAgent.run).toHaveBeenCalledOnce();
    expect(ToVAgent.run).toHaveBeenCalledOnce();
    expect(persistArticle).toHaveBeenCalledOnce();

    expect(step.run).toHaveBeenCalledTimes(4);
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toEqual(["draft", "numbers", "tov", "persist"]);

    expect(result.articleId).toBe("art-uuid-1");
    expect(result.slug).toBe("tsb-stavka-17");
    expect(result.totalCostUsd).toBeCloseTo(0.01 + 0.001 + 0.008, 6);
    expect(result.unsourcedNumbers).toBe(false);
  });

  it("Numbers и ToV получают output DraftAgent", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    await handler({ event: EVENT, step });

    const tovCall = vi.mocked(ToVAgent.run).mock.calls[0]![0];
    expect(tovCall.draft.tease).toBe("ЦБ ставка 17%");

    const numbersCall = vi.mocked(NumbersAgent.run).mock.calls[0]![0];
    expect(numbersCall.text).toBe("serialized draft");
    expect(numbersCall.sources).toEqual(EVENT.data.sources);
  });

  it("бросает если ANTHROPIC_API_KEY не задан", async () => {
    const bindingsNoKey: Record<string, string> = { ...BINDINGS, ANTHROPIC_API_KEY: "" };
    const inngest = createPipelineInngest({ NODE_ENV: bindingsNoKey.NODE_ENV });
    const fn = createDraftArticleFunction(
      inngest,
      bindingsNoKey as unknown as CloudflareBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    await expect(handler({ event: EVENT, step })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
