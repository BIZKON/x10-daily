import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * generate-cover (Спека 2). Мокаем @x10/db chain-объектом (паттерн
 * drain-post-slots.test.ts) и VisualAgent; шлюз картинок — через инъекцию
 * fetchImpl (реальный gemini-image + реальная запись на диск во временный
 * каталог). Проверяем оркестрацию и, главное, ЖЕЛЕЗНЫЙ ФОЛБЭК: ни один сбой не
 * должен привести к visual_status='approved' или 'pending_review'.
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    selectResults: [] as Array<Array<Record<string, unknown>>>,
    updates: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
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
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          dbState.inserts.push(v);
        },
      }),
    })),
  };
});

const { agentState } = vi.hoisted(() => ({
  agentState: { scene: "A single closed warehouse door", shouldThrow: false },
}));

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    VisualAgent: {
      name: "visual",
      tier: "HAIKU" as const,
      run: vi.fn(async () => {
        if (agentState.shouldThrow) throw new Error("VisualAgent упал");
        return {
          output: { scene: agentState.scene },
          usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 },
          costUsd: 0.0001,
          modelUsed: "deepseek/deepseek-v4-flash",
        };
      }),
    },
  };
});

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPipelineInngest } from "../src/inngest/client";
import { createGenerateCoverFunction } from "../src/inngest/functions/generate-cover";

const IMAGE_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function gatewayFetch(ok = true) {
  return vi.fn(async () => {
    if (!ok) return new Response("boom", { status: 502 });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: null, images: [{ image_url: { url: IMAGE_DATA_URL } }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

async function baseBindings(overrides: Record<string, string | undefined> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "gc-"));
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost/test",
    AI_GATEWAY_API_KEY: "k",
    COVERS_DIR: dir,
    COVERS_PUBLIC_BASE_URL: "https://app.example.ru/covers",
    ...overrides,
  } as Record<string, string | undefined>;
}

function makeHandler(bindings: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createGenerateCoverFunction(inngest, bindings as unknown as PipelineBindings, {
    fetchImpl,
  });
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { articleId: string; force?: boolean } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<unknown>;
    }
  ).fn;
}

const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";

const ARTICLE_ROW = {
  tease: "Склад считает остатки сам",
  lede: "WMS с ИИ снял ручную сверку",
  category: "cases",
  visualStatus: "none",
  coverImageUrl: null,
};

describe("generate-cover", () => {
  beforeEach(() => {
    dbState.selectResults = [];
    dbState.updates = [];
    dbState.inserts = [];
    agentState.shouldThrow = false;
    vi.clearAllMocks();
  });

  it("happy: пишет coverImageUrl + visualStatus='pending_review' + visualPrompt", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    const r = (await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { coverImageUrl: string; visualStatus: string };

    expect(r.coverImageUrl).toMatch(
      new RegExp(`^https://app\\.example\\.ru/covers/${ARTICLE_ID}\\.jpg\\?v=[0-9a-f]{8}$`),
    );
    expect(r.visualStatus).toBe("pending_review");

    const upd = dbState.updates[0] as Record<string, unknown>;
    expect(upd.visualStatus).toBe("pending_review");
    expect(String(upd.coverImageUrl)).toContain(`/covers/${ARTICLE_ID}.jpg?v=`);
    expect(String(upd.visualPrompt)).toContain("A single closed warehouse door");
    // Канон визуала доехал до промпта.
    expect(String(upd.visualPrompt).toLowerCase()).toContain("no text");
  });

  it("🔴 HumanGate: функция НИКОГДА не ставит approved", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });
    for (const u of dbState.updates) {
      expect(u.visualStatus).not.toBe("approved");
    }
  });

  it("пишет строку $-ledger агентом visual", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });
    expect(dbState.inserts[0]?.agent).toBe("visual");
    expect(dbState.inserts[0]?.status).toBe("succeeded");
  });

  it("COVERS_* пусты → скип с причиной covers-disabled, БД не трогается", async () => {
    const bindings = await baseBindings({ COVERS_PUBLIC_BASE_URL: "" });
    const fetchImpl = gatewayFetch();
    const r = (await makeHandler(
      bindings,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { skipped: boolean; reason: string };

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("covers-disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it("статья не найдена → скип, генерация не запускается", async () => {
    dbState.selectResults = [[]];
    const bindings = await baseBindings();
    const fetchImpl = gatewayFetch();
    const r = (await makeHandler(
      bindings,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { skipped: boolean; reason: string };

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("article-not-found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("обложка уже есть и ждёт ревью → повторное событие не тратит деньги", async () => {
    dbState.selectResults = [
      [{ ...ARTICLE_ROW, visualStatus: "pending_review", coverImageUrl: "https://a/b.jpg" }],
    ];
    const bindings = await baseBindings();
    const fetchImpl = gatewayFetch();
    const r = (await makeHandler(
      bindings,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { skipped: boolean; reason: string };

    expect(r.reason).toBe("cover-already-exists");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("force=true (перегенерация из админки) перебивает гард уже-существующей обложки", async () => {
    dbState.selectResults = [
      [{ ...ARTICLE_ROW, visualStatus: "approved", coverImageUrl: "https://a/b.jpg" }],
    ];
    const bindings = await baseBindings();
    const fetchImpl = gatewayFetch();
    const r = (await makeHandler(
      bindings,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID, force: true } },
      step: makeStep(),
    })) as { visualStatus: string };

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Перегенерация возвращает обложку на ревью — одобрять заново обязан редактор.
    expect(r.visualStatus).toBe("pending_review");
  });

  it("🔴 сбой генерации → бросает, visual_status НЕ становится pending_review", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    await expect(
      makeHandler(
        bindings,
        gatewayFetch(false),
      )({
        event: { data: { articleId: ARTICLE_ID } },
        step: makeStep(),
      }),
    ).rejects.toThrow(/502/);
    expect(dbState.updates).toHaveLength(0);
  });

  it("🔴 сбой VisualAgent → бросает, картинка не генерится и статус не меняется", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    agentState.shouldThrow = true;
    const bindings = await baseBindings();
    const fetchImpl = gatewayFetch();
    await expect(
      makeHandler(
        bindings,
        fetchImpl,
      )({
        event: { data: { articleId: ARTICLE_ID } },
        step: makeStep(),
      }),
    ).rejects.toThrow(/VisualAgent/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it("неизвестная рубрика не роняет генерацию (фолбэк регистра news)", async () => {
    dbState.selectResults = [[{ ...ARTICLE_ROW, category: null }]];
    const bindings = await baseBindings();
    const r = (await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { visualStatus: string };
    expect(r.visualStatus).toBe("pending_review");
  });
});
