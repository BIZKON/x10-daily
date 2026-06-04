import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * Multi-source RSS ingest (session 18+): data-driven из таблицы sources,
 * изоляция битых источников, кап эмиссий на источник за тик.
 */

const { listMock, fetchMock, markMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  fetchMock: vi.fn(),
  markMock: vi.fn(),
}));

vi.mock("@x10/worker-ingest", () => ({
  listEnabledRssSources: listMock,
  fetchRss: fetchMock,
  markIfNew: markMock,
  simhash64: () => "fp",
}));
vi.mock("@x10/db", () => ({ createDb: vi.fn(() => ({})) }));

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
  perSource: Array<{ name: string; emitted: number; error?: string }>;
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
});
