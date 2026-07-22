import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * Multi-source RSS ingest (session 18+): data-driven из таблицы sources,
 * изоляция битых источников, кап эмиссий на источник за тик.
 */

const { listMock, fetchMock, markMock, markPolledMock, getCtrlMock, pauseMock } = vi.hoisted(
  () => ({
    listMock: vi.fn(),
    fetchMock: vi.fn(),
    markMock: vi.fn(),
    markPolledMock: vi.fn(),
    getCtrlMock: vi.fn(),
    pauseMock: vi.fn(),
  }),
);

// importActual → реальный isSourceDue (gating-логику тестируем через функцию,
// без дублирования impl). Остальное переопределяем мок-функциями.
vi.mock("@x10/worker-ingest", async () => {
  const actual = await vi.importActual<typeof import("@x10/worker-ingest")>("@x10/worker-ingest");
  return {
    ...actual,
    listEnabledRssSources: listMock,
    fetchRss: fetchMock,
    markIfNew: markMock,
    markSourcePolled: markPolledMock,
    simhash64: () => "fp",
  };
});
vi.mock("@x10/db", () => ({
  createDb: vi.fn(() => ({})),
  getPostingControl: getCtrlMock,
  isPostingPaused: pauseMock,
}));

import { isSourceDue } from "@x10/worker-ingest";
import { createPipelineInngest } from "../src/inngest/client";
import { createIngestRssFunction } from "../src/inngest/functions/ingest-rss";

const BINDINGS = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  AI_GATEWAY_API_KEY: "tw",
  INNGEST_EVENT_KEY: "e",
  INNGEST_SIGNING_KEY: "s",
} as unknown as PipelineBindings;

interface Emitted {
  name: string;
  data: { source: { publisher: string }; rawTitle: string };
}

function makeStep(events: Emitted[]) {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async (_id: string, ev: Emitted) => {
      events.push(ev);
    }),
  };
}

function getHandler(fn: unknown): (args: { step: unknown }) => Promise<{
  sources: number;
  emitted: number;
  perSource: Array<{ name: string; emitted: number; skipped?: boolean; error?: string }>;
}> {
  return (fn as { fn: (args: { step: unknown }) => Promise<never> }).fn;
}

function item(id: string) {
  return {
    externalId: id,
    title: `T-${id}`,
    text: "тело",
    url: `https://x/${id}`,
    publishedAt: null,
  };
}

const inngest = () => createPipelineInngest({ NODE_ENV: "test" });

describe("ingest-rss — multi-source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markMock.mockResolvedValue(true);
    getCtrlMock.mockResolvedValue({ paused: false, quietEnabled: false });
    pauseMock.mockReturnValue({ paused: false, reason: null }); // по умолчанию не на паузе
  });

  it("эмитит из нескольких источников, publisher = source.name", async () => {
    listMock.mockResolvedValue([
      { id: "s1", name: "РБК", url: "https://rbc/rss" },
      { id: "s2", name: "Forbes", url: "https://forbes/rss" },
    ]);
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("rbc") ? [item("a")] : [item("b")],
    );

    const events: Emitted[] = [];
    const r = await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    });

    expect(r.sources).toBe(2);
    expect(r.emitted).toBe(2);
    expect(events.map((e) => e.data.source.publisher).sort()).toEqual(["Forbes", "РБК"]);
  });

  it("битый источник (fetch бросает) не роняет остальные", async () => {
    listMock.mockResolvedValue([
      { id: "bad", name: "BadSrc", url: "https://bad/rss" },
      { id: "ok", name: "OkSrc", url: "https://ok/rss" },
    ]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("bad")) throw new Error("ETIMEDOUT");
      return [item("z")];
    });

    const events: Emitted[] = [];
    const r = await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.data.source.publisher).toBe("OkSrc");
    const bad = r.perSource.find((s) => s.name === "BadSrc");
    expect(bad?.error).toContain("ETIMEDOUT");
    expect(bad?.emitted).toBe(0);
  });

  it("кап 25 эмиссий/источник/тик (страховка от бурста)", async () => {
    listMock.mockResolvedValue([{ id: "big", name: "Big", url: "https://big/rss" }]);
    fetchMock.mockResolvedValue(Array.from({ length: 40 }, (_, i) => item(String(i))));

    const events: Emitted[] = [];
    const r = await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    });

    expect(events).toHaveLength(25);
    expect(r.perSource[0]?.emitted).toBe(25);
  });

  it("gating: несозревший источник (свежий lastPolledAt) пропущен, fetch не зовётся", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1 мин назад < 15 мин
    listMock.mockResolvedValue([
      {
        id: "slow",
        name: "Slow",
        url: "https://slow/rss",
        pollIntervalSec: 900,
        lastPolledAt: recent,
      },
    ]);

    const events: Emitted[] = [];
    const r = await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(markPolledMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    expect(r.perSource.find((s) => s.name === "Slow")?.skipped).toBe(true);
  });

  it("gating: созревший источник поллится и фиксирует lastPolledAt", async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString(); // 20 мин назад > 15
    listMock.mockResolvedValue([
      {
        id: "due",
        name: "Due",
        url: "https://due/rss",
        pollIntervalSec: 900,
        lastPolledAt: old,
      },
    ]);
    fetchMock.mockResolvedValue([item("d")]);

    const events: Emitted[] = [];
    await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(markPolledMock).toHaveBeenCalledOnce();
  });

  it("стоп-кран (пауза/тихие часы) → весь тик пропущен, ни fetch, ни emit", async () => {
    pauseMock.mockReturnValue({ paused: true, reason: "quiet-hours" });
    listMock.mockResolvedValue([{ id: "s1", name: "РБК", url: "https://rbc/rss" }]);
    fetchMock.mockResolvedValue([item("a")]);

    const events: Emitted[] = [];
    const r = (await getHandler(createIngestRssFunction(inngest(), BINDINGS))({
      step: makeStep(events),
    })) as unknown as { skipped?: boolean; reason?: string };

    expect(r.skipped).toBe(true);
    expect(r.reason).toContain("quiet-hours");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });
});

// audit L20: isSourceDue была задокументирована как unit-тестируемая, но прямого
// теста не было. Реальная функция (importActual в мок-фабрике @x10/worker-ingest).
describe("isSourceDue", () => {
  const src = (lastPolledAt: string | null, pollIntervalSec = 900) => ({
    id: "s",
    name: "S",
    url: "u",
    adapterType: "rss",
    pollIntervalSec,
    lastPolledAt,
  });

  it("null lastPolledAt → due (ещё не поллили)", () => {
    expect(isSourceDue(src(null), new Date())).toBe(true);
  });

  it("невалидный lastPolledAt → due (не застреваем)", () => {
    expect(isSourceDue(src("не-дата"), new Date())).toBe(true);
  });

  it("свежий полл (< интервала) → not due", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const recent = new Date(now.getTime() - 60_000).toISOString(); // 1 мин назад
    expect(isSourceDue(src(recent), now)).toBe(false);
  });

  it("старый полл (≥ интервала) → due", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const old = new Date(now.getTime() - 20 * 60_000).toISOString(); // 20 мин > 15
    expect(isSourceDue(src(old), now)).toBe(true);
  });

  it("ровно на границе интервала → due", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const exact = new Date(now.getTime() - 900_000).toISOString(); // ровно 900 с
    expect(isSourceDue(src(exact), now)).toBe(true);
  });
});
