import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    IngestAgent: {
      name: "ingest",
      tier: "HAIKU" as const,
      run: vi.fn(),
    },
  };
});

import { IngestAgent } from "@x10/agents";
import { createPipelineInngest } from "../src/inngest/client";
import { createProcessSourceItemFunction } from "../src/inngest/functions/process-source-item";

const BINDINGS: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  ANTHROPIC_API_KEY: "sk-test",
};

const EVENT = {
  data: {
    rawTitle: "Банк России сохранил ставку",
    rawText: "Совет директоров ЦБ.",
    source: { url: "https://www.cbr.ru/", title: "Пресс-релиз", publisher: "ЦБ РФ" },
  },
};

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(
      async (_id: string, _event: { name: string; data: unknown }) => undefined,
    ),
  };
}

describe("process-source-item", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("accept: запускает IngestAgent и шлёт article/topic.ingested с category/template/tags", async () => {
    vi.mocked(IngestAgent.run).mockResolvedValue({
      output: {
        decision: "accept",
        category: "money",
        subcategory: "money.cbr",
        template: "card-news",
        tags: ["ЦБ", "ставка", "малый-бизнес"],
        topic: "ЦБ ставка 17%",
        context: "Заседание ЦБ 26 мая 2026.",
        relevanceScore: 0.85,
        rejectReason: null,
        duplicateOf: null,
        political: true,
      },
      usage: { inputTokens: 300, outputTokens: 100, cachedInputTokens: 0 },
      costUsd: 0.001,
      modelUsed: "claude-haiku-4-5-20251001",
    });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createProcessSourceItemFunction(
      inngest,
      BINDINGS as unknown as CloudflareBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      dispatched: boolean;
      political: boolean;
      category: string;
      template: string;
    };

    expect(IngestAgent.run).toHaveBeenCalledOnce();
    expect(step.sendEvent).toHaveBeenCalledOnce();
    const sentEvent = step.sendEvent.mock.calls[0]![1] as {
      name: string;
      data: {
        political: boolean;
        topic: string;
        category: string;
        subcategory: string;
        template: string;
        tags: string[];
      };
    };
    expect(sentEvent.name).toBe("article/topic.ingested");
    expect(sentEvent.data.political).toBe(true);
    expect(sentEvent.data.topic).toBe("ЦБ ставка 17%");
    expect(sentEvent.data.category).toBe("money");
    expect(sentEvent.data.subcategory).toBe("money.cbr");
    expect(sentEvent.data.template).toBe("card-news");
    expect(sentEvent.data.tags).toEqual(["ЦБ", "ставка", "малый-бизнес"]);
    expect(result.dispatched).toBe(true);
    expect(result.category).toBe("money");
    expect(result.template).toBe("card-news");
  });

  it("reject: не шлёт topic.ingested, возвращает reason", async () => {
    vi.mocked(IngestAgent.run).mockResolvedValue({
      output: {
        decision: "reject",
        category: null,
        subcategory: null,
        template: null,
        tags: [],
        topic: null,
        context: null,
        relevanceScore: 0.1,
        rejectReason: "infobiz",
        duplicateOf: null,
        political: false,
      },
      usage: { inputTokens: 300, outputTokens: 50, cachedInputTokens: 0 },
      costUsd: 0.0005,
      modelUsed: "claude-haiku-4-5-20251001",
    });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createProcessSourceItemFunction(
      inngest,
      BINDINGS as unknown as CloudflareBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      dispatched: boolean;
      rejectReason: string;
    };

    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(result.dispatched).toBe(false);
    expect(result.rejectReason).toBe("infobiz");
  });

  it("duplicate: тоже не диспатчит", async () => {
    vi.mocked(IngestAgent.run).mockResolvedValue({
      output: {
        decision: "duplicate",
        category: null,
        subcategory: null,
        template: null,
        tags: [],
        topic: null,
        context: null,
        relevanceScore: 0.5,
        rejectReason: null,
        duplicateOf: "ЦБ ставка 17%",
        political: false,
      },
      usage: { inputTokens: 300, outputTokens: 50, cachedInputTokens: 0 },
      costUsd: 0.0005,
      modelUsed: "claude-haiku-4-5-20251001",
    });

    const inngest = createPipelineInngest({ NODE_ENV: BINDINGS.NODE_ENV });
    const fn = createProcessSourceItemFunction(
      inngest,
      BINDINGS as unknown as CloudflareBindings,
    );
    const step = makeStep();
    const handler = (fn as unknown as {
      fn: (args: { event: typeof EVENT; step: typeof step }) => Promise<unknown>;
    }).fn;

    const result = (await handler({ event: EVENT, step })) as {
      dispatched: boolean;
      duplicateOf: string;
    };

    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(result.dispatched).toBe(false);
    expect(result.duplicateOf).toBe("ЦБ ставка 17%");
  });
});
