/**
 * Walking Skeleton e2e (ТЗ #1, N7 = DoD):
 *   cron-tick → vc.ru fetch (fixture) → dedup (seen_items) →
 *   source.item.received → process-source-item (IngestAgent gate) →
 *   article/topic.ingested → draft-article (B2 цепочка, агенты мокнуты) →
 *   article.ready → post-to-tg → assert: реальный sendMessage в TG (мок fetch).
 *
 * Триггерится **только** cron-функция через её handler — без HTTP, без ручных
 * шагов. Между handler'ами event'ы передаются последовательно (имитация Inngest
 * dispatcher).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RSS_FIXTURE = readFileSync(resolve(__dirname, "fixtures/vc-rss.xml"), "utf-8");

const FAKE_ARTICLE_ID = "00000000-0000-4000-8000-000000000abc";
const FAKE_SOURCE_ID = "00000000-0000-4000-8000-000000000aaa";

// === Shared in-memory stores (через vi.hoisted чтобы доступны в mock factory) ===
const { seenStore, channelsStore } = vi.hoisted(() => ({
  seenStore: new Set<string>(),
  channelsStore: new Map<string, { text: string; visualRef: string | null }>(),
}));

// === Mocks ===

// dedupe слой — in-memory, без реального Postgres.
vi.mock("@x10/worker-ingest", async () => {
  const actual = await vi.importActual<typeof import("@x10/worker-ingest")>("@x10/worker-ingest");
  return {
    ...actual, // fetchRss + simhash64 + VC_RSS_URL + isSourceDue — оригинал
    ensureSource: vi.fn(async () => FAKE_SOURCE_ID),
    // Multi-source ingest читает источники из таблицы — мокаем один vc.ru.
    // lastPolledAt=null → isSourceDue=true каждый тик (оба тика поллят, dedup
    // ловит дубль на 2-м). markSourcePolled — noop (in-memory, без pg).
    listEnabledRssSources: vi.fn(async () => [
      {
        id: FAKE_SOURCE_ID,
        name: "vc.ru",
        url: actual.VC_RSS_URL,
        pollIntervalSec: 900,
        lastPolledAt: null,
      },
    ]),
    markIfNew: vi.fn(async (_db: unknown, args: { externalId: string }) => {
      if (seenStore.has(args.externalId)) return false;
      seenStore.add(args.externalId);
      return true;
    }),
    markSourcePolled: vi.fn(async () => undefined),
  };
});

// $-ledger / алерты не относятся к skeleton-пути vc.ru→TG — мокаем noop, чтобы
// e2e не зависел от формы $-запросов (их проверяет cost-ledger.test.ts).
vi.mock("../src/lib/cost-ledger", () => ({
  getTodaySpendUsd: vi.fn(async () => 0),
  recordRun: vi.fn(async () => undefined),
  mskDayString: () => "2026-06-04",
}));
vi.mock("../src/lib/ops-alert", () => ({
  deliverOpsAlert: vi.fn(async () => ({ claimed: false, delivered: false })),
}));

// Все LLM-агенты в цепочке. Outputs минимально валидные.
vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  const usage = { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 };
  const draftShape = {
    tease: "Тест walking",
    lede: "Walking skeleton lede.",
    whyItMatters: "Walking skeleton проверяет автономный контур.",
    body: [
      {
        type: "paragraph" as const,
        text: "Основной абзац walking skeleton для теста.",
      },
    ],
  };
  return {
    ...actual,
    IngestAgent: {
      name: "ingest",
      tier: "HAIKU" as const,
      run: vi.fn(async () => ({
        output: {
          decision: "accept",
          topic: "Тема walking skeleton",
          context: "Контекст из vc.ru фикстуры.",
          category: "tech",
          subcategory: null,
          template: "card-news",
          tags: ["test"],
          relevanceScore: 0.8,
          rejectReason: null,
          duplicateOf: null,
          political: false,
        },
        usage,
        costUsd: 0.001,
        modelUsed: "anthropic/claude-haiku-4-5",
      })),
    },
    DraftAgent: {
      name: "draft",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: draftShape,
        usage,
        costUsd: 0.01,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
    NumbersAgent: {
      name: "numbers",
      tier: "HAIKU" as const,
      run: vi.fn(async () => ({
        output: { items: [], hasUnsourcedNumbers: false },
        usage,
        costUsd: 0.001,
        modelUsed: "anthropic/claude-haiku-4-5",
      })),
    },
    ToVAgent: {
      name: "tov",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: { revised: draftShape, changes: [] },
        usage,
        costUsd: 0.005,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
    BrevityAgent: {
      name: "brevity",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: {
          compressed: draftShape,
          beforeWords: 20,
          afterWords: 15,
          cuts: [],
        },
        usage,
        costUsd: 0.005,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
    HookGenAgent: {
      name: "hookgen",
      tier: "HAIKU" as const,
      run: vi.fn(async () => ({
        output: {
          hooks: [{ pattern: "number-led", text: "Хук walking", reasoning: "fixture" }],
        },
        usage,
        costUsd: 0.001,
        modelUsed: "anthropic/claude-haiku-4-5",
      })),
    },
    SocialAmplifyAgent: {
      name: "social",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: {
          channel: "tg-x10",
          framework: "BAB",
          post: "Тестовый TG-пост walking skeleton для канала Х10.",
          hookLine: "Hook walking",
          twistLine: null,
          wordCount: 10,
          lineCount: 1,
        },
        usage,
        costUsd: 0.005,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
    PreviewScoreAgent: {
      name: "score",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: {
          hookStrength: 6,
          voiceMatch: 6,
          valueDensity: 6,
          structureFormat: 6,
          publishReadiness: 6,
          total: 30,
          verdict: "ok",
          topPerformerComparison: "ok",
          fixes: [],
        },
        usage,
        costUsd: 0.002,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
    FactCheckAgent: { name: "factcheck", tier: "OPUS" as const, run: vi.fn() },
    createMasker: vi.fn(() => ({
      mask: async (t: string) => t,
      unmask: async (t: string) => t,
    })),
  };
});

vi.mock("../src/persist", async () => {
  const actual = await vi.importActual<typeof import("../src/persist")>("../src/persist");
  return {
    ...actual,
    persistArticle: vi.fn(async () => ({
      id: FAKE_ARTICLE_ID,
      slug: "test-walking",
    })),
  };
});

// In-memory channels store через stub Drizzle builder. Покрывает только те
// chains которые реально используются (insert.values.onConflictDoNothing,
// select.from.where.limit).
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return {
    ...actual,
    createDb: vi.fn(() => makeTestDb()),
    // Стоп-кран не на паузе — skeleton постит. (БД-логику posting_control
    // makeTestDb не моделирует; реальная проверяется в posting-control.test.ts.)
    getPostingControl: vi.fn(async () => ({
      paused: false,
      quietEnabled: false,
      quietStartHour: 21,
      quietEndHour: 9,
    })),
    isPostingPaused: () => ({ paused: false, reason: null }),
  };
});

function makeTestDb() {
  return {
    insert(_table: unknown) {
      let buffered:
        | {
            articleId: string;
            channel: "tg" | "vk" | "dzen" | "linkedin";
            text: string;
            visualRef?: string | null;
          }
        | undefined;
      const persistRow = () => {
        if (!buffered) return;
        channelsStore.set(`${buffered.articleId}:${buffered.channel}`, {
          text: buffered.text,
          visualRef: buffered.visualRef ?? null,
        });
      };
      const builder: {
        values: (v: unknown) => typeof builder;
        onConflictDoNothing: () => typeof builder;
        returning: (fields?: unknown) => Promise<Array<{ id: string }>>;
        then: (
          onFulfilled: (value: undefined) => void,
          onRejected?: (reason: unknown) => void,
        ) => void;
      } = {
        values(v: unknown) {
          buffered = v as typeof buffered;
          return builder;
        },
        onConflictDoNothing() {
          return builder;
        },
        async returning(_fields?: unknown) {
          persistRow();
          return [{ id: "mock-row" }];
        },
        then(onFulfilled, onRejected) {
          try {
            persistRow();
            onFulfilled(undefined);
          } catch (e) {
            onRejected?.(e);
          }
        },
      };
      return builder;
    },
    select(_fields: unknown) {
      const builder: {
        from: () => typeof builder;
        where: () => typeof builder;
        limit: (n: number) => Promise<Array<{ text: string; visualRef: string | null }>>;
      } = {
        from() {
          return builder;
        },
        where() {
          return builder;
        },
        async limit(n: number) {
          // Тесты используют единственный articleId — отдаём всё что есть.
          return Array.from(channelsStore.values()).slice(0, n);
        },
      };
      return builder;
    },
  };
}

// === Imports после vi.mock (hoisted) ===
import { createPipelineInngest } from "../src/inngest/client";
import { createDraftArticleFunction } from "../src/inngest/functions/draft-article";
import { createIngestRssFunction } from "../src/inngest/functions/ingest-rss";
import { createPostToTgFunction } from "../src/inngest/functions/post-to-tg";
import { createProcessSourceItemFunction } from "../src/inngest/functions/process-source-item";

const BINDINGS = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  ANTHROPIC_API_KEY: "sk-test",
  AI_GATEWAY_API_KEY: "tw-test",
  TELEGRAM_BOT_TOKEN: "123:test-bot-token",
  TG_TEST_CHANNEL_ID: "@x10_test_channel",
} as unknown as PipelineBindings;

interface CapturedEvent {
  name: string;
  data: Record<string, unknown>;
}

function makeStep(events: CapturedEvent[]) {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async (_id: string, ev: { name: string; data: Record<string, unknown> }) => {
      events.push(ev);
    }),
  };
}

function getHandler<T>(fn: T): (args: { event?: unknown; step: unknown }) => Promise<unknown> {
  return (
    fn as unknown as {
      fn: (args: { event?: unknown; step: unknown }) => Promise<unknown>;
    }
  ).fn;
}

function makeRssFetchSpy(xml: string) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => xml,
      }) as unknown as Response,
  );
}

function makeTgFetchSpy() {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      }) as unknown as Response,
  );
}

describe("Walking Skeleton e2e — cron → fetch → dedup → chain → real TG sendMessage", () => {
  beforeEach(() => {
    seenStore.clear();
    channelsStore.clear();
    vi.clearAllMocks();
  });

  it("один тик cron — vc.ru item доходит до реального sendMessage в TG", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: "test" });
    const events: CapturedEvent[] = [];
    const rssSpy = makeRssFetchSpy(RSS_FIXTURE);
    const tgSpy = makeTgFetchSpy();

    // N2: cron-tick ingest-rss (триггерится ТОЛЬКО эта функция вручную; один vc.ru источник)
    const ingestFn = createIngestRssFunction(inngest, BINDINGS, {
      fetchImpl: rssSpy,
    });
    const step1 = makeStep(events);
    const ingestResult = (await getHandler(ingestFn)({ step: step1 })) as {
      fetched: number;
      emitted: number;
    };
    expect(ingestResult.fetched).toBe(1);
    expect(ingestResult.emitted).toBe(1);
    expect(rssSpy).toHaveBeenCalledOnce();
    expect(String(rssSpy.mock.calls[0]![0])).toBe("https://vc.ru/rss");
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe("source.item.received");
    const ingestData = events[0]!.data as {
      rawTitle: string;
      rawText: string;
      source: { url: string; publisher: string };
    };
    expect(ingestData.rawTitle).toContain("walking skeleton");
    expect(ingestData.source.url).toBe("https://vc.ru/test/walking-skeleton-1");
    expect(ingestData.source.publisher).toBe("vc.ru");

    // N4: process-source-item (IngestAgent gate → accept → topic.ingested)
    const procFn = createProcessSourceItemFunction(inngest, BINDINGS);
    const step2 = makeStep(events);
    const procResult = (await getHandler(procFn)({
      event: { data: events[0]!.data },
      step: step2,
    })) as { dispatched: boolean };
    expect(procResult.dispatched).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[1]!.name).toBe("article/topic.ingested");

    // B2 цепочка через draft-article + терминальный article.ready emit
    const draftFn = createDraftArticleFunction(inngest, BINDINGS);
    const step3 = makeStep(events);
    await getHandler(draftFn)({
      event: { data: events[1]!.data },
      step: step3,
    });
    expect(events).toHaveLength(3);
    expect(events[2]!.name).toBe("article.ready");
    const readyData = events[2]!.data as { articleId: string; channel: string };
    expect(readyData.articleId).toBe(FAKE_ARTICLE_ID);
    expect(readyData.channel).toBe("tg");

    // channels row должна быть сохранена (Walking Skeleton, N6 шов).
    const stored = channelsStore.get(`${FAKE_ARTICLE_ID}:tg`);
    expect(stored).toBeDefined();
    expect(stored!.text).toContain("walking");
    expect(stored!.visualRef).toBeNull();

    // N5: post-to-tg → реальный fetch к api.telegram.org (мок).
    // Это НЕ UPDATE articles SET status='published' — это исходящий HTTP.
    const tgFn = createPostToTgFunction(inngest, BINDINGS, {
      fetchImpl: tgSpy,
    });
    const step4 = makeStep(events);
    const tgResult = (await getHandler(tgFn)({
      event: { data: events[2]!.data },
      step: step4,
    })) as {
      ok: boolean;
      method: string;
      messageId: number | null;
      articleId: string;
      channel: string;
    };

    expect(tgSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = tgSpy.mock.calls[0]!;
    const urlStr = String(calledUrl);
    expect(urlStr).toBe("https://api.telegram.org/bot123:test-bot-token/sendMessage");
    const body = JSON.parse(((calledInit as RequestInit).body as string) ?? "{}") as {
      chat_id: string;
      text: string;
      photo?: string;
    };
    expect(body.chat_id).toBe("@x10_test_channel");
    expect(body.text).toBeTruthy();
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.photo).toBeUndefined();
    expect(tgResult.ok).toBe(true);
    expect(tgResult.method).toBe("sendMessage");
    expect(tgResult.messageId).toBe(42);
    expect(tgResult.articleId).toBe(FAKE_ARTICLE_ID);
    expect(tgResult.channel).toBe("tg");
  });

  it("повторный cron-тик НЕ эмитит дубль (dedup по seen_items)", async () => {
    const inngest = createPipelineInngest({ NODE_ENV: "test" });
    const rssSpy = makeRssFetchSpy(RSS_FIXTURE);
    const ingestFn = createIngestRssFunction(inngest, BINDINGS, {
      fetchImpl: rssSpy,
    });

    const events1: CapturedEvent[] = [];
    const result1 = (await getHandler(ingestFn)({
      step: makeStep(events1),
    })) as { sources: number; fetched: number; emitted: number };
    expect(result1.fetched).toBe(1);
    expect(result1.emitted).toBe(1);
    expect(events1).toHaveLength(1);

    const events2: CapturedEvent[] = [];
    const result2 = (await getHandler(ingestFn)({
      step: makeStep(events2),
    })) as { sources: number; fetched: number; emitted: number };
    expect(result2.fetched).toBe(1);
    expect(result2.emitted).toBe(0);
    expect(events2).toHaveLength(0);
  });

  it("ветка sendPhoto активируется при visual_ref в channels row (N6 шов)", async () => {
    channelsStore.set(`${FAKE_ARTICLE_ID}:tg`, {
      text: "Caption под фото walking skeleton",
      visualRef: "stub://photo.jpg",
    });

    const inngest = createPipelineInngest({ NODE_ENV: "test" });
    const tgSpy = makeTgFetchSpy();
    const tgFn = createPostToTgFunction(inngest, BINDINGS, {
      fetchImpl: tgSpy,
    });
    const events: CapturedEvent[] = [];

    const result = (await getHandler(tgFn)({
      event: { data: { articleId: FAKE_ARTICLE_ID, channel: "tg" } },
      step: makeStep(events),
    })) as { method: string };

    expect(tgSpy).toHaveBeenCalledOnce();
    expect(String(tgSpy.mock.calls[0]![0])).toBe(
      "https://api.telegram.org/bot123:test-bot-token/sendPhoto",
    );
    const body = JSON.parse(((tgSpy.mock.calls[0]![1] as RequestInit).body as string) ?? "{}") as {
      photo: string;
      caption: string;
      text?: string;
    };
    expect(body.photo).toBe("stub://photo.jpg");
    expect(body.caption).toBe("Caption под фото walking skeleton");
    expect(body.text).toBeUndefined();
    expect(result.method).toBe("sendPhoto");
  });
});
