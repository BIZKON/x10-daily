import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";
import type { CrawlSiteResult } from "../src/lib/crawl-site";

/**
 * База знаний по ссылке: прогон обхода (спека 11.08).
 *
 * Проверяются решения, каждое из которых видно клиенту: деньги считаются ДО
 * обхода, отказ обхода не доходит до агента, найденное ложится как
 * ПРЕДЛОЖЕНИЯ, а потраченное на модель попадает в счёт даже при падении.
 *
 * Сигнатуры моков заданы явно: без них `mock.calls` типизируется пустым
 * кортежем и проверить, ЧТО ушло в вызов, невозможно (грабля сессии 34).
 */

type Ledger = {
  articleId: string | null;
  agent: string;
  status: string;
  costUsd: number;
  output?: Record<string, unknown> | null;
  error?: string | null;
};
type Billing = {
  balanceRub: number;
  lowThresholdRub: number;
  billingEnforced: boolean;
  blocked: boolean;
  low: boolean;
};
type Shelf = { slug: string; title: string; purpose: string; question: string };
type Proposal = { shelfSlug: string; title: string; body: string; sourceUrl: string | null };
type Saved = { documents: Proposal[]; notes: string[]; log: unknown[] };

const IMPORT = { id: "imp-1", siteUrl: "https://veles.ru", status: "queued" as const };

const SHELVES: Shelf[] = [
  {
    slug: "business",
    title: "Чем вы занимаетесь",
    purpose: "Основа.",
    question: "Чем занимаетесь?",
  },
  { slug: "prices", title: "Цены и условия", purpose: "Цифры.", question: "Сколько стоит?" },
];

const CRAWLED: CrawlSiteResult = {
  ok: true,
  pages: [{ url: "https://veles.ru/about", title: "О компании", text: "Возим сборные грузы." }],
  log: [{ url: "https://veles.ru/about", status: "read", chars: 21 }],
};

const {
  recordRun,
  guardBilling,
  crawlSite,
  loadImportJob,
  markImportRunning,
  failImport,
  saveProposals,
  loadExtractShelves,
} = vi.hoisted(() => ({
  recordRun: vi.fn(async (_db: unknown, _entry: Ledger) => undefined),
  guardBilling: vi.fn(
    async (_db: unknown, _env: unknown, _now: Date): Promise<Billing> => ({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    }),
  ),
  crawlSite: vi.fn(
    async (_url: string, _deps: unknown): Promise<CrawlSiteResult> => ({
      ok: true,
      pages: [],
      log: [],
    }),
  ),
  loadImportJob: vi.fn(async (_db: unknown, _id: string): Promise<unknown> => null),
  markImportRunning: vi.fn(async (_db: unknown, _id: string) => undefined),
  failImport: vi.fn(
    async (_db: unknown, _id: string, _reason: string, _log?: unknown[]) => undefined,
  ),
  saveProposals: vi.fn(async (_db: unknown, _id: string, _payload: Saved) => 3),
  loadExtractShelves: vi.fn(async (_db: unknown): Promise<Shelf[]> => SHELVES),
}));

vi.mock("../src/lib/cost-ledger", () => ({ recordRun }));
vi.mock("../src/lib/billing-gate", () => ({ guardBilling }));
vi.mock("../src/lib/crawl-site", () => ({ crawlSite }));
vi.mock("../src/lib/kb-imports", () => ({
  loadImportJob,
  markImportRunning,
  failImport,
  saveProposals,
  loadExtractShelves,
}));
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return { ...actual, createDb: vi.fn(() => ({})) };
});

const { agentState } = vi.hoisted(() => ({
  agentState: {
    fail: false,
    output: {
      documents: [
        {
          shelfSlug: "business",
          title: "Сборные грузы по России",
          body: "Возим сборные грузы между 42 городами.",
          sourceUrl: "https://veles.ru/about",
        },
      ],
      notes: ["На сайте нет цен"],
    },
  },
}));

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    KnowledgeExtractAgent: {
      name: "knowledge",
      tier: "SONNET" as const,
      run: vi.fn(async () => {
        if (agentState.fail) throw new Error("модель не ответила");
        return {
          output: agentState.output,
          usage: { inputTokens: 12000, outputTokens: 1400, cachedInputTokens: 0 },
          costUsd: 0.02,
          modelUsed: "deepseek/deepseek-v4-flash",
        };
      }),
    },
  };
});

import { KnowledgeExtractAgent } from "@x10/agents";
import { createPipelineInngest } from "../src/inngest/client";
import { createImportKnowledgeFunction } from "../src/inngest/functions/import-knowledge";

const BINDINGS = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  AI_GATEWAY_API_KEY: "k",
} as Record<string, string | undefined>;

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function makeHandler() {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createImportKnowledgeFunction(inngest, BINDINGS as unknown as PipelineBindings);
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { importId: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<Record<string, unknown>>;
    }
  ).fn;
}

const run = () => makeHandler()({ event: { data: { importId: "imp-1" } }, step: makeStep() });

const agentRun = KnowledgeExtractAgent.run as unknown as ReturnType<typeof vi.fn>;

describe("обход сайта для базы знаний", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.fail = false;
    loadImportJob.mockResolvedValue(IMPORT);
    loadExtractShelves.mockResolvedValue(SHELVES);
    crawlSite.mockResolvedValue(CRAWLED);
    saveProposals.mockResolvedValue(3);
    guardBilling.mockResolvedValue({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    });
  });

  it("🔴 платить нечем — по сайту не ходим вовсе", async () => {
    // Обход бесплатен только на первый взгляд: за ним сразу идёт прогон агента.
    // Ходить по чужому сайту, зная, что заплатить нечем, — трата чужого канала
    // ради нашего отказа.
    guardBilling.mockResolvedValue({
      balanceRub: 0,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: true,
      low: true,
    });

    const r = await run();

    expect(r.status).toBe("failed");
    expect(crawlSite).not.toHaveBeenCalled();
    expect(agentRun).not.toHaveBeenCalled();
    expect(failImport.mock.calls[0]?.[2]).toMatch(/баланс|средств/i);
  });

  it("🔴 обход отказал — агент не запускается, причина доходит до человека", async () => {
    crawlSite.mockResolvedValue({
      ok: false,
      reason: "Сайт закрыт от роботов в файле robots.txt.",
      log: [],
    });

    const r = await run();

    expect(r.status).toBe("failed");
    expect(agentRun).not.toHaveBeenCalled();
    expect(failImport.mock.calls[0]?.[2]).toMatch(/robots/i);
    // Модель не звали — расходу взяться неоткуда.
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("найденное сохраняется как предложения, а расход попадает в счёт", async () => {
    const r = await run();

    expect(r.status).toBe("ready");
    const saved = saveProposals.mock.calls[0]?.[2];
    expect(saved?.documents).toHaveLength(1);
    expect(saved?.documents[0]?.shelfSlug).toBe("business");
    expect(saved?.notes).toEqual(["На сайте нет цен"]);

    const ledger = recordRun.mock.calls[0]?.[1];
    expect(ledger?.agent).toBe("knowledge");
    expect(ledger?.status).toBe("succeeded");
    expect(ledger?.costUsd).toBe(0.02);
  });

  it("🔴 документ с несуществующей полкой отбрасывается, а не роняет обход", async () => {
    agentState.output = {
      documents: [
        {
          shelfSlug: "vydumannaya",
          title: "Что-то",
          body: "Текст",
          sourceUrl: "https://veles.ru/about",
        },
        {
          shelfSlug: "prices",
          title: "Тарифы",
          body: "От 3 200 ₽ за куб.",
          sourceUrl: "https://veles.ru/about",
        },
      ],
      notes: [],
    };

    const r = await run();

    expect(r.status).toBe("ready");
    expect(saveProposals.mock.calls[0]?.[2]?.documents).toHaveLength(1);
  });

  it("🔴 модель упала после ответа — потраченное всё равно записано", async () => {
    // Деньги у шлюза списываются в момент ответа, а упасть можно на записи.
    // Нулевой расход в такой ситуации ослепил бы дневной учёт.
    agentState.fail = true;

    const r = await run();

    expect(r.status).toBe("failed");
    expect(recordRun.mock.calls[0]?.[1]?.status).toBe("failed");
    expect(failImport).toHaveBeenCalled();
  });

  it("строки задания нет — тихо выходим, а не долбимся ретраями", async () => {
    loadImportJob.mockResolvedValue(null);
    const r = await run();
    expect(r.status).toBe("missing");
    expect(crawlSite).not.toHaveBeenCalled();
  });
});
