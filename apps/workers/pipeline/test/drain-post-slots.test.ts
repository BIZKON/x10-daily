import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * drain-post-slots (session 23): cron слот-постинга. Мокаем @x10/db —
 * createDb отдаёт chain-объект, где каждый select-терминал (.limit) берёт
 * следующий результат из очереди dbState.selectResults (порядок селектов в
 * функции детерминирован), а update пишет в dbState.updates. TG/VK отправку
 * проверяем через инъектированный fetchImpl (реальные callTelegram/vkWallPost).
 *
 * ⚠️ Зона НЕ покрытия: фактический SQL-фильтр select (FIFO/свежесть/posted_at
 * IS NULL) мок обходит — корректность выборки проверяется живьём при деплое.
 * Здесь — оркестрация: пауза, пустая очередь, happy tg, vk-ветка, non-retryable.
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    paused: { paused: false, reason: null as string | null },
    selectResults: [] as Array<Array<Record<string, unknown>>>,
    updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  },
}));

vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  const makeChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => dbState.selectResults.shift() ?? [],
    };
    return chain;
  };
  return {
    ...actual,
    createDb: vi.fn(() => ({
      select: () => makeChain(),
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            dbState.updates.push({
              table: table === actual.articles ? "articles" : "channels",
              set: v,
            });
          },
        }),
      }),
    })),
    getPostingControl: vi.fn(async () => ({})),
    isPostingPaused: vi.fn(() => dbState.paused),
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createDrainPostSlotsFunction } from "../src/inngest/functions/drain-post-slots";

const TG_BINDINGS: Record<string, string | undefined> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  TELEGRAM_BOT_TOKEN: "123:abc",
  TG_TEST_CHANNEL_ID: "-100500",
};
const VK_BINDINGS = { ...TG_BINDINGS, VK_ACCESS_TOKEN: "vk-token", VK_OWNER_ID: "-123456" };

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function makeHandler(bindings: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createDrainPostSlotsFunction(inngest, bindings as unknown as PipelineBindings, {
    fetchImpl,
  });
  return (
    fn as unknown as { fn: (a: { step: ReturnType<typeof makeStep> }) => Promise<unknown> }
  ).fn;
}

/** fetch по host: TG ok всегда; VK по opts (post_id или error_code). */
const dualFetch = (vk: { postId?: number; errorCode?: number } = {}) =>
  vi.fn(async (url: unknown) => {
    if (String(url).includes("api.telegram.org")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 555 } }) };
    }
    if (vk.errorCode) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ error: { error_code: vk.errorCode, error_msg: "e" } }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ response: { post_id: vk.postId ?? 99 } }) };
  }) as unknown as typeof fetch;

describe("drain-post-slots", () => {
  beforeEach(() => {
    dbState.paused = { paused: false, reason: null };
    dbState.selectResults = [];
    dbState.updates = [];
    vi.clearAllMocks();
  });

  it("постинг на паузе → слот пропущен, fetch не зовётся", async () => {
    dbState.paused = { paused: true, reason: "quiet-hours" };
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      skipped: boolean;
      reason: string;
    };
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("posting-paused:quiet-hours");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it("очередь пуста → no-op", async () => {
    dbState.selectResults = [[]]; // select articleId → пусто
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      reason: string;
    };
    expect(r.posted).toBe(0);
    expect(r.reason).toBe("queue-empty");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("happy tg-only: постит 1 статью, mark posted + published", async () => {
    // select articleId → load-tg (VK не сконфигурирован → нет vk-селекта).
    dbState.selectResults = [[{ articleId: "a1" }], [{ text: "Новость", visualRef: null }]];
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      articleId: string;
      posted: number;
      results: Array<{ channel: string; status: string; postRef?: string | null }>;
    };
    expect(r.articleId).toBe("a1");
    expect(r.posted).toBe(1);
    expect(r.results).toEqual([{ channel: "tg", status: "posted", postRef: "555" }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const tables = dbState.updates.map((u) => u.table);
    expect(tables).toContain("channels"); // mark posted
    expect(tables).toContain("articles"); // mark published
    const published = dbState.updates.find((u) => u.table === "articles");
    expect(published?.set.status).toBe("published");
  });

  it("VK сконфигурирован: постит tg + vk одной статьёй", async () => {
    // select articleId → vk-target check → load-tg → load-vk.
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ id: "vkrow" }],
      [{ text: "TG", visualRef: null }],
      [{ text: "VK", visualRef: null }],
    ];
    const fetchImpl = dualFetch({ postId: 77 });
    const r = (await makeHandler(VK_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      results: Array<{ channel: string; status: string }>;
    };
    expect(r.posted).toBe(2);
    expect(r.results.map((x) => x.channel)).toEqual(["tg", "vk"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("VK non-retryable (214): tg постится, vk skipped, статья published", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ id: "vkrow" }],
      [{ text: "TG", visualRef: null }],
      [{ text: "VK", visualRef: null }],
    ];
    const fetchImpl = dualFetch({ errorCode: 214 });
    const r = (await makeHandler(VK_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      results: Array<{ channel: string; status: string }>;
    };
    expect(r.posted).toBe(1); // только tg
    const vk = r.results.find((x) => x.channel === "vk");
    expect(vk?.status).toBe("skipped:vk-error-214");
    expect(
      dbState.updates.some((u) => u.table === "articles" && u.set.status === "published"),
    ).toBe(true);
  });
});
