import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * post-to-vk: ветвление (channel-mismatch / vk-not-configured / posting-paused /
 * happy path / missing row). @x10/db мокаем (createDb + posting-control); VK
 * отправку проверяем через инъектированный fetchImpl (реальный vkWallPost).
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    channelsRows: [{ text: "Текст VK-поста" }] as Array<{ text: string }>,
    paused: { paused: false, reason: null as string | null },
  },
}));

vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return {
    ...actual,
    createDb: vi.fn(() => ({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => dbState.channelsRows }) }),
      }),
    })),
    getPostingControl: vi.fn(async () => ({})),
    isPostingPaused: vi.fn(() => dbState.paused),
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createPostToVkFunction } from "../src/inngest/functions/post-to-vk";

const BINDINGS: Record<string, string | undefined> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  VK_ACCESS_TOKEN: "vk-token",
  VK_OWNER_ID: "-123456",
};

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function makeHandler(bindings: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createPostToVkFunction(inngest, bindings as unknown as PipelineBindings, {
    fetchImpl,
  });
  return (
    fn as unknown as {
      fn: (a: { event: unknown; step: ReturnType<typeof makeStep> }) => Promise<unknown>;
    }
  ).fn;
}

const okFetch = () =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: { post_id: 99 } }),
  })) as unknown as typeof fetch;

/** fetch, отдающий VK-ошибку в теле (HTTP 200) с заданным error_code. */
const vkErrorFetch = (code: number) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: { error_code: code, error_msg: `err ${code}` } }),
  })) as unknown as typeof fetch;

describe("post-to-vk", () => {
  beforeEach(() => {
    dbState.channelsRows = [{ text: "Текст VK-поста" }];
    dbState.paused = { paused: false, reason: null };
    vi.clearAllMocks();
  });

  it("channel != vk → skip channel-mismatch, fetch не зовётся", async () => {
    const fetchImpl = okFetch();
    const handler = makeHandler(BINDINGS, fetchImpl);
    const step = makeStep();
    const r = (await handler({
      event: { data: { articleId: "a1", channel: "tg" } },
      step,
    })) as { skipped: boolean; reason: string };
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("channel-mismatch");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("VK не сконфигурирован (нет токена) → skip vk-not-configured", async () => {
    const fetchImpl = okFetch();
    const handler = makeHandler({ ...BINDINGS, VK_ACCESS_TOKEN: undefined }, fetchImpl);
    const step = makeStep();
    const r = (await handler({
      event: { data: { articleId: "a1", channel: "vk" } },
      step,
    })) as { skipped: boolean; reason: string };
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("vk-not-configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("постинг на паузе → skip posting-paused, fetch не зовётся", async () => {
    dbState.paused = { paused: true, reason: "manual" };
    const fetchImpl = okFetch();
    const handler = makeHandler(BINDINGS, fetchImpl);
    const step = makeStep();
    const r = (await handler({
      event: { data: { articleId: "a1", channel: "vk" } },
      step,
    })) as { skipped: boolean; reason: string };
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("posting-paused:manual");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("happy path → wall.post вызван; токен/owner/текст/guid доходят до тела запроса", async () => {
    // [10]: проверяем что секрет и параметры реально попадают в VK-запрос (а не
    // только что fetch дёрнут) — иначе regression «секрет не доходит до API» немой.
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      capturedBody = (init as { body: string }).body;
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 99 } }) };
    }) as unknown as typeof fetch;
    const handler = makeHandler(BINDINGS, fetchImpl);
    const step = makeStep();
    const r = (await handler({
      event: { data: { articleId: "art-1-2-3", channel: "vk" } },
      step,
    })) as { channel: string; postId: number; ok: boolean };
    expect(r.channel).toBe("vk");
    expect(r.postId).toBe(99);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const p = new URLSearchParams(capturedBody);
    expect(p.get("access_token")).toBe("vk-token");
    expect(p.get("owner_id")).toBe("-123456");
    expect(p.get("message")).toBe("Текст VK-поста");
    // guid = articleId без дефисов (идемпотентность ретрая).
    expect(p.get("guid")).toBe("art123");
  });

  it("невосстановимая VK-ошибка (214 access denied) → НЕ ретраим, возвращаем failed", async () => {
    const handler = makeHandler(BINDINGS, vkErrorFetch(214));
    const step = makeStep();
    const r = (await handler({
      event: { data: { articleId: "a1", channel: "vk" } },
      step,
    })) as { ok: boolean; skipped: boolean; reason: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("vk-error-214");
  });

  it("транзиентная VK-ошибка (код не в non-retryable) → throw (Inngest ретраит)", async () => {
    const handler = makeHandler(BINDINGS, vkErrorFetch(100));
    const step = makeStep();
    await expect(
      handler({ event: { data: { articleId: "a1", channel: "vk" } }, step }),
    ).rejects.toThrow(/\[100\]/);
  });

  it("нет channels-row → throw (Inngest заретраит)", async () => {
    dbState.channelsRows = [];
    const handler = makeHandler(BINDINGS, okFetch());
    const step = makeStep();
    await expect(
      handler({ event: { data: { articleId: "a1", channel: "vk" } }, step }),
    ).rejects.toThrow(/channels row не найден/);
  });
});
