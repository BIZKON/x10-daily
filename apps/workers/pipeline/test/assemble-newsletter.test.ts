import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    NewsletterAssembleAgent: {
      name: "newsletter",
      tier: "SONNET" as const,
      run: vi.fn().mockResolvedValue({
        output: {
          subject: "ЦБ держит 17%",
          subjectVariants: ["ЦБ держит 17%", "Кредит закрыт", "Греф: главный риск"],
          preheader: "preheader",
          sections: Array.from({ length: 7 }, (_, i) => ({
            sectionLabel: [
              "Главное",
              "Цифры дня",
              "Кто и что",
              "Плейбук",
              "Что дальше",
              "Длинное чтение",
              "Слово редактора",
            ][i],
            articleIds: i === 0 ? ["art-1"] : [],
            htmlBody: i === 0 ? "<article/>" : "",
            plainBody: i === 0 ? "ЦБ" : "",
          })),
          closing: "Подпишитесь",
          meta: { totalArticles: 1, sectionsUsed: 1, issueDate: "2026-05-26" },
        },
        usage: { inputTokens: 1500, outputTokens: 800, cachedInputTokens: 0 },
        costUsd: 0.015,
        modelUsed: "anthropic/claude-sonnet-4-6",
      }),
    },
  };
});

import { NewsletterAssembleAgent } from "@x10/agents";
import { createPipelineInngest } from "../src/inngest/client";
import { createAssembleNewsletterFunction } from "../src/inngest/functions/assemble-newsletter";

const BINDINGS: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  ANTHROPIC_API_KEY: "sk-test",
};

const EVENT = {
  data: {
    issueDate: "2026-05-26",
    articles: [
      {
        id: "art-1",
        slug: "tsb-stavka-17",
        section: "main" as const,
        tease: "ЦБ держит ставку 17%",
        lede: "Совет сохранил ставку.",
        whyItMatters: "Кредитное окно закрыто.",
        wordCount: 270,
      },
    ],
  },
};

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  };
}

describe("assemble-newsletter", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("вызывает NewsletterAssembleAgent с данными из event", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createAssembleNewsletterFunction(
      inngest,
      BINDINGS as unknown as PipelineBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      subject: string;
      subjectVariants: string[];
      sections: Array<{ sectionLabel: string }>;
      meta: { totalArticles: number };
    };

    expect(NewsletterAssembleAgent.run).toHaveBeenCalledOnce();
    const call = vi.mocked(NewsletterAssembleAgent.run).mock.calls[0]![0];
    expect(call.issueDate).toBe("2026-05-26");
    expect(call.articles).toHaveLength(1);

    expect(result.subject).toBe("ЦБ держит 17%");
    expect(result.subjectVariants).toHaveLength(3);
    expect(result.sections).toHaveLength(7);
    expect(result.meta.totalArticles).toBe(1);
  });
});
