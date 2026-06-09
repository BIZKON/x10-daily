import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

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
    body: [{ type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз подряд." }],
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
            {
              pattern: "admission",
              text: "Кредитное окно для МСП закрыто",
              reasoning: "признание",
            },
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

// save-tg-channel step делает прямой INSERT в channels (Walking Skeleton, ТЗ #1).
// Этот тест не проверяет содержимое channels — no-op stub достаточно. Подробный
// тест pipeline-связки см. walking-skeleton.e2e.test.ts.
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return {
    ...actual,
    createDb: vi.fn(() => ({
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => Promise.resolve(),
        }),
      }),
    })),
  };
});

// $-ledger / алерты мокаем — БД-логика проверяется отдельно в cost-ledger.test.ts.
// Здесь нас интересует только что draft-article корректно вызывает gate/record/alert.
const { getTodaySpendUsd, recordRun } = vi.hoisted(() => ({
  getTodaySpendUsd: vi.fn(),
  recordRun: vi.fn(),
}));
vi.mock("../src/lib/cost-ledger", () => ({
  getTodaySpendUsd,
  recordRun,
  mskDayString: () => "2026-06-04",
}));
// M4: claim+send+бухгалтерия инкапсулированы в deliverOpsAlert (его логика —
// в ops-alert.test.ts). Здесь проверяем только что draft-article зовёт его с
// правильными порогами/текстом и уважает warn-границу.
const { deliverOpsAlert } = vi.hoisted(() => ({ deliverOpsAlert: vi.fn() }));
vi.mock("../src/lib/ops-alert", () => ({ deliverOpsAlert }));

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
import { createPipelineInngest } from "../src/inngest/client";
import { createDraftArticleFunction } from "../src/inngest/functions/draft-article";
import { persistArticle } from "../src/persist";

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
    sendEvent: vi.fn(async (_id: string, _ev: { name: string; data: unknown }) => undefined),
  };
}

describe("draft-article pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Дефолт: расход за день 0 → под потолком, конвейер идёт целиком.
    getTodaySpendUsd.mockResolvedValue(0);
    recordRun.mockResolvedValue(undefined);
    deliverOpsAlert.mockResolvedValue({ claimed: false, delivered: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("вызывает 7 агентов и возвращает articleId, hooks, social, score", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();

    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

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

    // now + budget-gate + 8 шагов B2 + persist/record-run/save-tg-channel/budget-warn-alert.
    expect(step.run).toHaveBeenCalledTimes(13);
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toEqual([
      "now",
      "budget-gate",
      "draft",
      "numbers",
      "tov",
      "brevity",
      "hookgen",
      "social",
      "score",
      "persist",
      "record-run",
      "save-tg-channel",
      "budget-warn-alert",
    ]);
    // Слот-постинг (session 23): draft больше НЕ шлёт article.ready — пост кладётся
    // в channels-очередь (save-tg-channel выше), а drain-post-slots постит по слотам.
    expect(step.sendEvent).not.toHaveBeenCalled();

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
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

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
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: {
          event: { data: typeof EVENT.data & { political: boolean } };
          step: typeof step;
        }) => Promise<unknown>;
      }
    ).fn;

    const politicalEvent = {
      data: { ...EVENT.data, political: true },
    };

    const result = (await handler({ event: politicalEvent, step })) as {
      factcheck: { status: string };
      totalCostUsd: number;
    };

    expect(FactCheckAgent.run).toHaveBeenCalledOnce();
    // now + budget-gate + 9 шагов B2 (с factcheck) + persist/record-run/save-tg-channel/budget-warn-alert.
    expect(step.run).toHaveBeenCalledTimes(14);
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toEqual([
      "now",
      "budget-gate",
      "draft",
      "numbers",
      "tov",
      "brevity",
      "factcheck",
      "hookgen",
      "social",
      "score",
      "persist",
      "record-run",
      "save-tg-channel",
      "budget-warn-alert",
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
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: {
          event: { data: typeof EVENT.data & { political: boolean } };
          step: typeof step;
        }) => Promise<unknown>;
      }
    ).fn;

    const politicalEvent = { data: { ...EVENT.data, political: true } };

    await expect(handler({ event: politicalEvent, step })).rejects.toThrow(/FactCheck halt/);
    expect(FactCheckAgent.run).toHaveBeenCalledOnce();
    expect(HookGenAgent.run).not.toHaveBeenCalled();
    expect(SocialAmplifyAgent.run).not.toHaveBeenCalled();
    expect(PreviewScoreAgent.run).not.toHaveBeenCalled();
    // audit M1: стоимость halt'а (draft+numbers+tov+brevity+factcheck) пишется
    // в ledger ДО throw — иначе невидима для дневного потолка.
    expect(recordRun).toHaveBeenCalledOnce();
    const haltRow = recordRun.mock.calls[0]![1] as { status: string; costUsd: number };
    expect(haltRow.status).toBe("halted");
    expect(haltRow.costUsd).toBeCloseTo(0.01 + 0.001 + 0.008 + 0.007 + 0.02, 6);
  });

  it("political=false (default): FactCheck НЕ запускается, шагов 8", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    const result = (await handler({ event: EVENT, step })) as {
      factcheck: { status: string } | null;
    };
    expect(FactCheckAgent.run).not.toHaveBeenCalled();
    // now + budget-gate + 8 (без factcheck) + persist/record-run/save-tg-channel/budget-warn-alert.
    expect(step.run).toHaveBeenCalledTimes(13);
    expect(result.factcheck).toBeNull();
  });

  it("бросает если ANTHROPIC_API_KEY не задан", async () => {
    const bindingsNoKey: Record<string, string> = { ...BINDINGS, ANTHROPIC_API_KEY: "" };
    const inngest = createPipelineInngest({ NODE_ENV: bindingsNoKey.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, bindingsNoKey as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await expect(handler({ event: EVENT, step })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("budget hard-cap: при расходе ≥ DAILY_BUDGET_USD драфт пропускается, агенты НЕ запускаются", async () => {
    // Default DAILY_BUDGET_USD = 15. Расход за день уже 15 → стоп.
    getTodaySpendUsd.mockResolvedValue(15);
    deliverOpsAlert.mockResolvedValue({ claimed: true, delivered: true });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    const result = (await handler({ event: EVENT, step })) as {
      skipped: boolean;
      reason: string;
      spentUsd: number;
      capUsd: number;
    };

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("daily-budget-exceeded");
    expect(result.spentUsd).toBe(15);
    expect(result.capUsd).toBe(15);
    // Ни один LLM-агент не вызван — главное «бурст не съест бюджет».
    expect(DraftAgent.run).not.toHaveBeenCalled();
    expect(NumbersAgent.run).not.toHaveBeenCalled();
    expect(persistArticle).not.toHaveBeenCalled();
    // exhausted-алерт доставлен один раз с правильными порогом/текстом.
    expect(deliverOpsAlert).toHaveBeenCalledOnce();
    const exhaustedCall = deliverOpsAlert.mock.calls[0]![2] as {
      day: string;
      kind: string;
      spendUsd: number;
      message: string;
    };
    expect(exhaustedCall).toMatchObject({ day: "2026-06-04", kind: "exhausted", spendUsd: 15 });
    expect(exhaustedCall.message).toMatch(/бюджет исчерпан/);
    // Только now + budget-gate + budget-exhausted-alert.
    expect(step.run.mock.calls.map((c) => c[0])).toEqual([
      "now",
      "budget-gate",
      "budget-exhausted-alert",
    ]);
  });

  it("budget warn: расход пересёк DAILY_BUDGET_WARN_USD → warn-алерт один раз", async () => {
    // 1-й вызов (gate, в начале) — под потолком; 2-й (warn-пересчёт, в конце) — ≥ warn (9).
    getTodaySpendUsd.mockResolvedValueOnce(5).mockResolvedValueOnce(9.5);
    deliverOpsAlert.mockResolvedValue({ claimed: true, delivered: true });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await handler({ event: EVENT, step });

    expect(DraftAgent.run).toHaveBeenCalledOnce(); // под потолком — драфт прошёл
    expect(recordRun).toHaveBeenCalledOnce();
    expect(deliverOpsAlert).toHaveBeenCalledOnce();
    const warnCall = deliverOpsAlert.mock.calls[0]![2] as {
      kind: string;
      spendUsd: number;
      message: string;
    };
    expect(warnCall).toMatchObject({ kind: "warn", spendUsd: 9.5 });
    expect(warnCall.message).toMatch(/расход за день/);
  });

  it("budget warn НЕ шлётся ниже порога: расход < DAILY_BUDGET_WARN_USD", async () => {
    // gate — под потолком; warn-пересчёт = 8 (< warn 9) → ранний выход, алерта нет.
    // (Идемпотентность повторного warn — в ops-alert.test.ts через claim=null.)
    getTodaySpendUsd.mockResolvedValueOnce(5).mockResolvedValueOnce(8);

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await handler({ event: EVENT, step });

    expect(deliverOpsAlert).not.toHaveBeenCalled();
  });

  it("VK сконфигурирован → второй SocialAmplify (channel=vk) + save-vk-channel (очередь)", async () => {
    const VK_BINDINGS = { ...BINDINGS, VK_ACCESS_TOKEN: "vk-tok", VK_OWNER_ID: "-123456" };
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, VK_BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await handler({ event: EVENT, step });

    // SocialAmplify вызван дважды: tg-x10 (основной) + vk.
    const socialCalls = vi.mocked(SocialAmplifyAgent.run).mock.calls;
    expect(socialCalls).toHaveLength(2);
    expect(socialCalls.some((c) => (c[0] as { channel?: string }).channel === "vk")).toBe(true);

    // Шаги social-vk + save-vk-channel присутствуют.
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).toContain("social-vk");
    expect(stepIds).toContain("save-vk-channel");

    // Слот-постинг: vk-вариант кладётся в очередь (save-vk-channel), без события.
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("VK НЕ сконфигурирован → один SocialAmplify (tg), без vk-события/шагов", async () => {
    // BINDINGS без VK_* → vkEnabled=false.
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, BINDINGS as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await handler({ event: EVENT, step });

    expect(vi.mocked(SocialAmplifyAgent.run)).toHaveBeenCalledOnce();
    const stepIds = step.run.mock.calls.map((c) => c[0]);
    expect(stepIds).not.toContain("social-vk");
    expect(stepIds).not.toContain("save-vk-channel");
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("частичный VK-конфиг (токен есть, owner пуст) → VK-ветка ВЫКЛ (review [9])", async () => {
    // vkEnabled = Boolean(TOKEN && OWNER): пустой owner → false → VK не активна,
    // лишний Sonnet-вызов не делается, vk-событие не шлётся.
    const PARTIAL = { ...BINDINGS, VK_ACCESS_TOKEN: "vk-tok", VK_OWNER_ID: "" };
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createDraftArticleFunction(inngest, PARTIAL as unknown as PipelineBindings);
    const step = makeStep();
    const handler = (
      fn as unknown as {
        fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    await handler({ event: EVENT, step });

    expect(vi.mocked(SocialAmplifyAgent.run)).toHaveBeenCalledOnce();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});
