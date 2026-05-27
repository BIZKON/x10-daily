import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    ScoreWeeklyAgent: {
      name: "score_weekly",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          weekSummary: "9 статей, среднее composite 1240.",
          topArticleIds: ["art-1"],
          bottomArticleIds: ["art-9"],
          hookPatternRanking: [
            { pattern: "contrarian", avgComposite: 1800, sampleSize: 3 },
          ],
          recommendations: [
            {
              configPath: "hookgen.patterns.contrarian.weight",
              currentValue: 1.0,
              proposedValue: 1.3,
              rationale: "+50% engagement (n=3)",
              confidence: 0.7,
            },
          ],
          previewScoreCorrelation: 0.62,
        },
        usage: { inputTokens: 2000, outputTokens: 600, cachedInputTokens: 0 },
        costUsd: 0.012,
        modelUsed: "claude-sonnet-4-6",
      }),
    },
  };
});

import { ScoreWeeklyAgent } from "@x10/agents";
import { createPipelineInngest } from "../src/inngest/client";
import { createRunWeeklyScoreFunction } from "../src/inngest/functions/run-weekly-score";

const BINDINGS: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  ANTHROPIC_API_KEY: "sk-test",
};

const EVENT = {
  data: {
    weekISO: "2026-W21",
    articles: [
      {
        articleId: "art-1",
        slug: "tsb-stavka-17",
        section: "main",
        publishedAt: "2026-05-20",
        previewScore: 39,
        hookPattern: "contrarian",
        views: 4200,
        uniqueReaders: 3100,
        scrollDepthAvg: 0.68,
        reactions: 230,
        shares: 45,
        newsletterSignups: 12,
      },
    ],
    currentConfig: { "hookgen.patterns.contrarian.weight": 1.0 },
  },
};

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  };
}

describe("run-weekly-score", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("вызывает ScoreWeeklyAgent и пробрасывает рекомендации", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createRunWeeklyScoreFunction(
      inngest,
      BINDINGS as unknown as CloudflareBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      weekISO: string;
      recommendations: Array<{ configPath: string; proposedValue: number }>;
      previewScoreCorrelation: number;
    };

    expect(ScoreWeeklyAgent.run).toHaveBeenCalledOnce();
    expect(result.weekISO).toBe("2026-W21");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.configPath).toBe(
      "hookgen.patterns.contrarian.weight",
    );
    expect(result.previewScoreCorrelation).toBeCloseTo(0.62, 2);
  });
});
