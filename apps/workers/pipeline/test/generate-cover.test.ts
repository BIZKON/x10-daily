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
          output: {
            headline: "Склад считает сам",
            sub: "WMS с ИИ снял сверку",
            scene: agentState.scene,
          },
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
        // Форма снята с живого шлюза (05.08.2026).
        usage: {
          prompt_tokens: 52,
          completion_tokens: 1514,
          completion_tokens_details: { text_tokens: 394, image_tokens: 1120 },
        },
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
      new RegExp(`^https://app\\.example\\.ru/covers/${ARTICLE_ID}-[0-9a-f]{8}\\.jpg$`),
    );
    // 🔴 Без query: Telegram не принимает sendPhoto по URL с хвостом.
    expect(r.coverImageUrl).not.toContain("?");
    expect(r.visualStatus).toBe("pending_review");

    const upd = dbState.updates[0] as Record<string, unknown>;
    expect(upd.visualStatus).toBe("pending_review");
    expect(String(upd.coverImageUrl)).toContain(`/covers/${ARTICLE_ID}-`);
    expect(String(upd.visualPrompt)).toContain("A single closed warehouse door");
    // Канон визуала доехал до промпта.
    expect(String(upd.visualPrompt)).toContain("Склад считает сам");
    expect(String(upd.visualPrompt)).toContain("БЕЗ кавычек");
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

  it("🔴 расход на КАРТИНКУ попадает в ledger отдельной строкой", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    // Две строки: крафт промпта и сама картинка — у них разные модели и тарифы.
    expect(dbState.inserts).toHaveLength(2);
    const prompt = dbState.inserts.find(
      (r) => (r.output as { stage?: string })?.stage === "prompt",
    );
    const image = dbState.inserts.find((r) => (r.output as { stage?: string })?.stage === "image");
    expect(prompt).toBeDefined();
    expect(image).toBeDefined();

    // Токены картинки — реальные, из usage шлюза.
    expect(image?.inputTokens).toBe(52);
    expect(image?.outputTokens).toBe(1514);
    expect(image?.modelUsed).toBe("gemini/gemini-3.1-flash-image-preview");
    // Разбивка для аудита.
    expect((image?.output as { imageTokens: number }).imageTokens).toBe(1120);
    expect((image?.output as { textTokens: number }).textTokens).toBe(394);
    // Картинка не бесплатна — иначе дневной потолок её не увидит.
    expect(Number(image?.costUsd)).toBeGreaterThan(0);
  });

  it("⚠️ нет двойного счёта: outputTokens = completion_tokens, image_tokens внутрь НЕ добавляются", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const bindings = await baseBindings();
    await makeHandler(
      bindings,
      gatewayFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    const image = dbState.inserts.find((r) => (r.output as { stage?: string })?.stage === "image");
    const o = image?.output as { imageTokens: number; textTokens: number };
    // completion_tokens уже включает image+text, поэтому сумма разбивки равна ему,
    // а не «плюсуется» к нему.
    expect(o.imageTokens + o.textTokens).toBe(image?.outputTokens);
  });

  it("шлюз не прислал usage → строка всё равно пишется, с нулями", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const noUsage = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: null, images: [{ image_url: { url: IMAGE_DATA_URL } }] } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    const bindings = await baseBindings();
    await makeHandler(
      bindings,
      noUsage,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    const image = dbState.inserts.find((r) => (r.output as { stage?: string })?.stage === "image");
    expect(image?.outputTokens).toBe(0);
    expect(Number(image?.costUsd)).toBe(0);
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

describe("ретрай на отказ фильтра", () => {
  // Свой сброс: этот describe — сосед внешнего, его beforeEach сюда не достаёт,
  // и состояние мока протекало бы между тестами.
  beforeEach(() => {
    dbState.selectResults = [];
    dbState.updates = [];
    dbState.inserts = [];
    agentState.shouldThrow = false;
    vi.clearAllMocks();
  });

  /** Ответ шлюза с finish_reason=content_filter и без картинок. */
  const filtered = () =>
    new Response(
      JSON.stringify({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const okBody = () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: null, images: [{ image_url: { url: IMAGE_DATA_URL } }] } }],
        usage: {
          prompt_tokens: 52,
          completion_tokens: 1514,
          completion_tokens_details: { text_tokens: 394, image_tokens: 1120 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  it("отказ на первой попытке → повтор, обложка всё равно получена", async () => {
    vi.useFakeTimers();
    try {
      dbState.selectResults = [[ARTICLE_ROW]];
      let call = 0;
      const fetchImpl = vi.fn(async () => {
        call++;
        return call === 1 ? filtered() : okBody();
      }) as unknown as typeof fetch;

      const bindings = await baseBindings();
      const p = makeHandler(
        bindings,
        fetchImpl,
      )({
        event: { data: { articleId: ARTICLE_ID } },
        step: makeStep(),
      });
      await vi.runAllTimersAsync();
      const r = (await p) as { visualStatus: string };

      expect(call).toBe(2);
      expect(r.visualStatus).toBe("pending_review");
    } finally {
      vi.useRealTimers();
    }
  });

  it("🔴 отказ на всех попытках → бросает, visual_status НЕ меняется (пост уйдёт текстом)", async () => {
    vi.useFakeTimers();
    try {
      dbState.selectResults = [[ARTICLE_ROW]];
      const fetchImpl = vi.fn(async () => filtered()) as unknown as typeof fetch;

      const bindings = await baseBindings();
      const p = makeHandler(
        bindings,
        fetchImpl,
      )({
        event: { data: { articleId: ARTICLE_ID } },
        step: makeStep(),
      }).catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const err = await p;

      expect((err as Error).name).toBe("ImageContentFilterError");
      expect(dbState.updates).toHaveLength(0);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("сетевая ошибка НЕ ретраится здесь — это работа Inngest", async () => {
    dbState.selectResults = [[ARTICLE_ROW]];
    const fetchImpl = vi.fn(
      async () => new Response("boom", { status: 502 }),
    ) as unknown as typeof fetch;
    const bindings = await baseBindings();
    await expect(
      makeHandler(
        bindings,
        fetchImpl,
      )({
        event: { data: { articleId: ARTICLE_ID } },
        step: makeStep(),
      }),
    ).rejects.toThrow(/502/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
