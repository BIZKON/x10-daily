import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * prime-source — приминание нового источника парсинга.
 *
 * 🔴 Смысл функции: свежий источник не имеет строк в `seen_items`, и первый тик
 * ingest-rss принял бы весь исторический фид за новости, выстрелив в канал
 * бэклогом за месяцы. Поэтому источник заводится ВЫКЛЮЧЕННЫМ, а включается
 * только здесь — после того, как фид прочитан и записан.
 *
 * Главное, что проверяют тесты: НИ ОДИН сбой не должен привести к
 * `enabled = true`. Включённый неприминенный источник — это и есть та авария,
 * от которой всё построено.
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    selectResults: [] as Array<Array<Record<string, unknown>>>,
    updates: [] as Array<Record<string, unknown>>,
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
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            dbState.updates.push(v);
          },
        }),
      }),
    })),
  };
});

const { ingestState } = vi.hoisted(() => ({
  ingestState: {
    items: [] as Array<{ externalId: string; title: string; text: string }>,
    shouldThrow: null as string | null,
    marked: [] as string[],
  },
}));

vi.mock("@x10/worker-ingest", async () => {
  const actual = await vi.importActual<typeof import("@x10/worker-ingest")>("@x10/worker-ingest");
  return {
    ...actual,
    fetchRss: vi.fn(async () => {
      if (ingestState.shouldThrow) throw new Error(ingestState.shouldThrow);
      return ingestState.items;
    }),
    fetchReddit: vi.fn(async () => {
      if (ingestState.shouldThrow) throw new Error(ingestState.shouldThrow);
      return ingestState.items;
    }),
    markIfNew: vi.fn(async (_db: unknown, a: { externalId: string }) => {
      ingestState.marked.push(a.externalId);
      return true;
    }),
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createPrimeSourceFunction } from "../src/inngest/functions/prime-source";

const SOURCE_ID = "22222222-2222-2222-2222-222222222222";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function makeHandler() {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const bindings = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost/test",
    AI_GATEWAY_API_KEY: "k",
  } as unknown as PipelineBindings;
  const fn = createPrimeSourceFunction(inngest, bindings);
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { sourceId: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<Record<string, unknown>>;
    }
  ).fn;
}

const SOURCE_ROW = {
  id: SOURCE_ID,
  name: "Тестовый фид",
  url: "https://example.ru/rss",
  adapterType: "rss",
  enabled: false,
  notes: null,
};

function feed(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    externalId: `guid-${i}`,
    title: `Заголовок ${i}`,
    text: `Текст ${i}`,
  }));
}

describe("prime-source", () => {
  beforeEach(() => {
    dbState.selectResults = [];
    dbState.updates = [];
    ingestState.items = [];
    ingestState.shouldThrow = null;
    ingestState.marked = [];
    vi.clearAllMocks();
  });

  it("happy: весь фид ушёл в seen_items, источник включён", async () => {
    dbState.selectResults = [[SOURCE_ROW]];
    ingestState.items = feed(30);

    const r = await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(r.primed).toBe(true);
    expect(r.fetched).toBe(30);
    // Все 30, а не первые 25: кап ingest-rss здесь не действует — весь фид
    // обязан быть помечен, иначе остаток выстрелит на первом же тике.
    expect(ingestState.marked).toHaveLength(30);
    expect(dbState.updates.at(-1)?.enabled).toBe(true);
    expect(dbState.updates.at(-1)?.status).toBe("active");
  });

  it("🔴 фид не прочитался → источник ОСТАЛСЯ выключенным, причина в notes", async () => {
    dbState.selectResults = [[SOURCE_ROW]];
    ingestState.shouldThrow = "RSS fetch failed (404)";

    const r = await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(r.primed).toBe(false);
    const last = dbState.updates.at(-1);
    expect(last?.enabled).toBe(false);
    expect(last?.status).toBe("pending");
    expect(String(last?.notes)).toContain("404");
    // Ни один UPDATE не смеет включить источник.
    expect(dbState.updates.some((u) => u.enabled === true)).toBe(false);
  });

  it("🔴 пустой фид не включаем: молчащий источник выглядит рабочим", async () => {
    dbState.selectResults = [[SOURCE_ROW]];
    ingestState.items = [];

    const r = await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(r.primed).toBe(false);
    expect(r.error).toBe("empty-feed");
    expect(dbState.updates.at(-1)?.enabled).toBe(false);
    expect(dbState.updates.some((u) => u.enabled === true)).toBe(false);
  });

  it("повторное событие по уже включённому источнику ничего не делает", async () => {
    dbState.selectResults = [[{ ...SOURCE_ROW, enabled: true }]];
    ingestState.items = feed(5);

    const r = await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("already-enabled");
    // Фид не перечитывается, seen_items не трогается, состояние не меняется.
    expect(ingestState.marked).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it("источник удалён между событием и обработкой → тихий пропуск, не падение", async () => {
    dbState.selectResults = [[]];

    const r = await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("source-not-found");
    expect(dbState.updates).toHaveLength(0);
  });

  it("длинный guid обрезается до 256: иначе весь фид ронял бы вставку", async () => {
    dbState.selectResults = [[SOURCE_ROW]];
    ingestState.items = [{ externalId: "x".repeat(400), title: "T", text: "T" }];

    await makeHandler()({ event: { data: { sourceId: SOURCE_ID } }, step: makeStep() });

    expect(ingestState.marked[0]).toHaveLength(256);
  });
});
