import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Оркестрация: DRAFT → (NUMBERS ∥ TOV) → BREVITY → (HOOKGEN ∥ SOCIAL ∥ SCORE ∥ PERSIST).
 * Inngest runtime тестируется самим Inngest SDK, нас интересует что наша factory
 * собирает правильный handler и шаги вызываются в правильном порядке.
 */

const ANTHROPIC_KEY = "sk-test";

const { COMPRESSED_DRAFT } = vi.hoisted(() => ({
  COMPRESSED_DRAFT: {
    tease: "ЦБ ставка 17%",
    lede: "Совет сохранил ставку.",
    whyItMatters: "Кредитное окно закрыто.",
    body: [
      { type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз подряд." },
    ],
  },
}));

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
        modelUsed: "anthropic/claude-sonnet-4-6",
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
        modelUsed: "anthropic/claude-haiku-4-5",
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
        modelUsed: "anthropic/claude-sonnet-4-6",
      }),
    },
    BrevityAgent: {
      name: "brevity",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          compressed: COMPRESSED_DRAFT,
          beforeWords: 420,
          afterWords: 270,
          cuts: ["удалил преамбулу"],
        },
        usage: { inputTokens: 700, outputTokens: 350, cachedInputTokens: 0 },
        costUsd: 0.007,
        modelUsed: "anthropic/claude-sonnet-4-6",
      }),
    },
    HookGenAgent: {
      name: "hookgen",
      tier: "HAIKU" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          hooks: [
            { pattern: "number-led", text: "17% — четвёртое заседание", reasoning: "цифра" },
            { pattern: "contrarian", text: "Все ждут снижения. ЦБ не снизит", reasoning: "контр" },
            { pattern: "transformation", text: "Было 21%, стало 17%", reasoning: "до/после" },
            { pattern: "authority", text: "Греф: ставка — главный риск", reasoning: "имя" },
            { pattern: "admission", text: "Кредитное окно для МСП закрыто", reasoning: "признание" },
            { pattern: "future-shock", text: "Что если ЦБ удержит до Q4", reasoning: "будущее" },
          ],
        },
        usage: { inputTokens: 400, outputTokens: 200, cachedInputTokens: 0 },
        costUsd: 0.0015,
        modelUsed: "anthropic/claude-haiku-4-5",
      }),
    },
    SocialAmplifyAgent: {
      name: "social",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          channel: "tg-x10",
          framework: "BAB",
          post: "ЦБ держит ставку 17%.\n\nКредитное окно для МСП закрыто.\n\nЧитать на x10daily.",
          hookLine: "ЦБ держит ставку 17%",
          twistLine: "Четвёртый раз подряд",
          segments: [
            { stage: "Before", text: "Ждали снижения" },
            { stage: "After", text: "Ставка 17%" },
            { stage: "Bridge", text: "Кредит для МСП закрыт" },
          ],
          wordCount: 18,
          lineCount: 5,
        },
        usage: { inputTokens: 900, outputTokens: 450, cachedInputTokens: 0 },
        costUsd: 0.009,
        modelUsed: "anthropic/claude-sonnet-4-6",
      }),
    },
    PreviewScoreAgent: {
      name: "score",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          hookStrength: 8,
          voiceMatch: 9,
          valueDensity: 7,
          structureFormat: 8,
          publishReadiness: 7,
          total: 39,
          verdict: "Готово к publish с лёгкими правками.",
          topPerformerComparison: "Попадает в Smart Brevity, цифры с источниками.",
          fixes: [
            {
              criterion: "hookStrength",
              issue: "tease можно усилить числом",
              suggestion: "Заменить на «17% — четвёртое заседание»",
            },
          ],
        },
        usage: { inputTokens: 600, outputTokens: 300, cachedInputTokens: 0 },
        costUsd: 0.006,
        modelUsed: "anthropic/claude-sonnet-4-6",
      }),
    },
    FactCheckAgent: {
      name: "factcheck",
      tier: "OPUS" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          claims: [
            {
              claim: "ЦБ сохранил ставку 17%",
              location: "lede",
              verdict: "supported",
              confidence: "high",
              supportingSourceUrls: ["https://www.cbr.ru/press/keypr/"],
              contradictingSourceUrls: [],
              rationale: "Источник ЦБ РФ подтверждает.",
            },
          ],
          status: "passed",
          haltReason: null,
        },
        usage: { inputTokens: 1500, outputTokens: 500, cachedInputTokens: 0 },
        costUsd: 0.02,
        modelUsed: "anthropic/claude-opus-4-7",
      }),
    },
  };
});

vi.mock("../src/persist", () => ({
  persistArticle: vi.fn().mockResolvedValue({ id: "art-uuid-1", slug: "tsb-stavka-17" }),
  serializeDraftForNumbers: vi.fn().mockReturnValue("serialized draft"),
}));

import {
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  HookGenAgent,
  NumbersAgent,
  PreviewScoreAgent,
  SocialAmplifyAgent,
  ToVAgent,
} from "@x10/agents";
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

  it("вызывает 7 агентов и возвращает articleId, hooks, social, score", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();

    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      articleId: string;
      slug: string;
      totalCostUsd: number;
      unsourcedNumbers: boolean;
      hooks: Array<{ pattern: string; text: string }>;
      brevity: { beforeWords: number; afterWords: number; cuts: string[] };
      social: { channel: string; framework: string; post: string; wordCount: number };
      score: {
        total: number;
        verdict: string;
        breakdown: Record<string, number>;
        fixes: Array<{ criterion: string }>;
      };
    };

    expect(DraftAgent.run).toHaveBeenCalledOnce();
    expect(NumbersAgent.run).toHaveBeenCalledOnce();
    expect(ToVAgent.run).toHaveBeenCalledOnce();
    expect(BrevityAgent.run).toHaveBeenCalledOnce();
    expect(HookGenAgent.run).toHaveBeenCalledOnce();
    expect(SocialAmplifyAgent.run).toHaveBeenCalledOnce();
    expect(PreviewScoreAgent.run).toHaveBeenCalledOnce();
    expect(persistArticle).toHaveBeenCalledOnce();

    expect(step.run).toHaveBeenCalledTimes(8);
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toEqual([
      "draft",
      "numbers",
      "tov",
      "brevity",
      "hookgen",
      "social",
      "score",
      "persist",
    ]);

    expect(result.articleId).toBe("art-uuid-1");
    expect(result.totalCostUsd).toBeCloseTo(
      0.01 + 0.001 + 0.008 + 0.007 + 0.0015 + 0.009 + 0.006,
      6,
    );
    expect(result.hooks).toHaveLength(6);
    expect(result.social.channel).toBe("tg-x10");
    expect(result.social.framework).toBe("BAB");
    expect(result.score.total).toBe(39);
    expect(result.score.breakdown.hookStrength).toBe(8);
    expect(result.score.fixes).toHaveLength(1);
  });

  it("Social и Score получают compressed от Brevity, persist тоже", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    await handler({ event: EVENT, step });

    const socialCall = vi.mocked(SocialAmplifyAgent.run).mock.calls[0]![0];
    expect(socialCall.draft).toEqual(COMPRESSED_DRAFT);
    expect(socialCall.channel).toBe("tg-x10");

    const scoreCall = vi.mocked(PreviewScoreAgent.run).mock.calls[0]![0];
    expect(scoreCall.draft).toEqual(COMPRESSED_DRAFT);

    const hookgenCall = vi.mocked(HookGenAgent.run).mock.calls[0]![0];
    expect(hookgenCall.draft).toEqual(COMPRESSED_DRAFT);

    const persistCall = vi.mocked(persistArticle).mock.calls[0]![0];
    expect(persistCall.revised).toEqual(COMPRESSED_DRAFT);
    // metadata собирается из всех агентов и передаётся в persist для админки.
    expect(persistCall.pipelineMetadata).toBeDefined();
    expect(persistCall.pipelineMetadata?.score?.total).toBe(39);
    expect(persistCall.pipelineMetadata?.hooks).toHaveLength(6);
    expect(persistCall.pipelineMetadata?.social?.channel).toBe("tg-x10");
    expect(persistCall.pipelineMetadata?.brevity?.beforeWords).toBe(420);
    expect(persistCall.pipelineMetadata?.factcheck).toBeNull();
    expect(persistCall.pipelineMetadata?.totalCostUsd).toBeGreaterThan(0);
  });

  it("political=true: добавляется FactCheck шаг между brevity и hookgen", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: { data: typeof EVENT.data & { political: boolean } }; step: typeof step }) => Promise<unknown>;
    }).fn;

    const politicalEvent = {
      data: { ...EVENT.data, political: true },
    };

    const result = (await handler({ event: politicalEvent, step })) as {
      factcheck: { status: string };
      totalCostUsd: number;
    };

    expect(FactCheckAgent.run).toHaveBeenCalledOnce();
    expect(step.run).toHaveBeenCalledTimes(9);
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toEqual([
      "draft",
      "numbers",
      "tov",
      "brevity",
      "factcheck",
      "hookgen",
      "social",
      "score",
      "persist",
    ]);
    expect(result.factcheck.status).toBe("passed");
    expect(result.totalCostUsd).toBeCloseTo(
      0.01 + 0.001 + 0.008 + 0.007 + 0.02 + 0.0015 + 0.009 + 0.006,
      6,
    );
  });

  it("political=true + factcheck status=halt → throws и не запускает HOOKGEN/SOCIAL/SCORE/PERSIST", async () => {
    vi.mocked(FactCheckAgent.run).mockResolvedValueOnce({
      output: {
        claims: [
          {
            claim: "ЦБ сохранил ставку 18%",
            location: "lede",
            verdict: "contradicted",
            confidence: "high",
            supportingSourceUrls: [],
            contradictingSourceUrls: ["https://www.cbr.ru/press/keypr/"],
            rationale: "Источник ЦБ говорит про 17%, не 18%.",
          },
        ],
        status: "halt",
        haltReason: "Цифра ставки противоречит источнику ЦБ.",
      },
      usage: { inputTokens: 1500, outputTokens: 500, cachedInputTokens: 0 },
      costUsd: 0.02,
      modelUsed: "anthropic/claude-opus-4-7",
    });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: { data: typeof EVENT.data & { political: boolean } }; step: typeof step }) => Promise<unknown>;
    }).fn;

    const politicalEvent = { data: { ...EVENT.data, political: true } };

    await expect(handler({ event: politicalEvent, step })).rejects.toThrow(/FactCheck halt/);
    expect(FactCheckAgent.run).toHaveBeenCalledOnce();
    expect(HookGenAgent.run).not.toHaveBeenCalled();
    expect(SocialAmplifyAgent.run).not.toHaveBeenCalled();
    expect(PreviewScoreAgent.run).not.toHaveBeenCalled();
  });

  it("political=false (default): FactCheck НЕ запускается, шагов 8", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as CloudflareBindings);
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      factcheck: { status: string } | null;
    };
    expect(FactCheckAgent.run).not.toHaveBeenCalled();
    expect(step.run).toHaveBeenCalledTimes(8);
    expect(result.factcheck).toBeNull();
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
