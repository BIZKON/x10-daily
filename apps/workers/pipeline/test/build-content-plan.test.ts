import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * Сборка контент-плана на месяц (спека 13.08).
 *
 * Проверяются решения, каждое из которых видно клиенту: план не собирается из
 * пустой базы знаний, деньги считаются до прогона, недоступный формат не
 * попадает в темы, а потраченное на модель попадает в счёт даже при падении.
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
};
type Billing = {
  balanceRub: number;
  lowThresholdRub: number;
  billingEnforced: boolean;
  blocked: boolean;
  low: boolean;
};
type PlanContext = {
  knowledge: string;
  recentTitles: string[];
  formats: Array<{ slug: string; title: string }>;
};
type Saved = { topics: Array<{ title: string }>; knowledgeUsed: string; periodStart: string };

// Период начинается в произвольный день, а не первого числа: план собирают
// когда придётся (находка живого прогона 13.08).
const JOB = { id: "plan-1", periodStart: "2026-09-14", status: "queued" as const };

const CONTEXT: PlanContext = {
  knowledge: "## Цены и условия\nСтраховой взнос от 150 ₽…",
  recentTitles: ["Склад считает остатки сам"],
  formats: [{ slug: "post", title: "Пост" }],
};

const {
  recordRun,
  guardBilling,
  loadPlanJob,
  markPlanRunning,
  failPlan,
  loadPlanContext,
  savePlanItems,
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
  loadPlanJob: vi.fn(async (_db: unknown, _id: string): Promise<unknown> => null),
  markPlanRunning: vi.fn(async (_db: unknown, _id: string) => undefined),
  failPlan: vi.fn(async (_db: unknown, _id: string, _reason: string) => undefined),
  loadPlanContext: vi.fn(async (_db: unknown): Promise<PlanContext> => CONTEXT),
  savePlanItems: vi.fn(async (_db: unknown, _id: string, _payload: Saved) => 30),
}));

vi.mock("../src/lib/cost-ledger", () => ({ recordRun }));
vi.mock("../src/lib/billing-gate", () => ({ guardBilling }));
vi.mock("../src/lib/plans", () => ({
  loadPlanJob,
  markPlanRunning,
  failPlan,
  loadPlanContext,
  savePlanItems,
}));
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return { ...actual, createDb: vi.fn(() => ({})) };
});

const { agentState } = vi.hoisted(() => ({
  agentState: {
    fail: false,
    output: {
      items: [
        {
          day: 3,
          slot: "09:30",
          categorySlug: "business",
          modeSlug: "post",
          title: "Сколько стоит застраховать груз",
          angle: "Показать сетку взносов.",
          rationale: "На полке «Цены» лежит сетка взносов.",
        },
      ],
    },
  },
}));

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    PlanAgent: {
      name: "plan",
      tier: "SONNET" as const,
      run: vi.fn(async () => {
        if (agentState.fail) throw new Error("модель не ответила");
        return {
          output: agentState.output,
          usage: { inputTokens: 9000, outputTokens: 6000, cachedInputTokens: 0 },
          costUsd: 0.03,
          modelUsed: "deepseek/deepseek-v4-flash",
        };
      }),
    },
  };
});

import { PlanAgent } from "@x10/agents";
import { createPipelineInngest } from "../src/inngest/client";
import { createBuildContentPlanFunction } from "../src/inngest/functions/build-content-plan";

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
  const fn = createBuildContentPlanFunction(inngest, BINDINGS as unknown as PipelineBindings);
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { planId: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<Record<string, unknown>>;
    }
  ).fn;
}

const run = () => makeHandler()({ event: { data: { planId: "plan-1" } }, step: makeStep() });
const agentRun = PlanAgent.run as unknown as ReturnType<typeof vi.fn>;

describe("сборка контент-плана", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.fail = false;
    agentState.output = {
      items: [
        {
          day: 3,
          slot: "09:30",
          categorySlug: "business",
          modeSlug: "post",
          title: "Сколько стоит застраховать груз",
          angle: "Показать сетку взносов.",
          rationale: "На полке «Цены» лежит сетка взносов.",
        },
      ],
    };
    loadPlanJob.mockResolvedValue(JOB);
    loadPlanContext.mockResolvedValue(CONTEXT);
    savePlanItems.mockResolvedValue(1);
    guardBilling.mockResolvedValue({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    });
  });

  it("🔴 пустая база знаний — план не собирается", async () => {
    // Главный урок сессии 35: план из пустоты это тридцать тем про отрасль
    // вообще, за которые клиент заплатит и которые выбросит.
    loadPlanContext.mockResolvedValue({ ...CONTEXT, knowledge: "" });

    const r = await run();

    expect(r.status).toBe("failed");
    expect(agentRun).not.toHaveBeenCalled();
    expect(recordRun).not.toHaveBeenCalled();
    expect(failPlan.mock.calls[0]?.[2]).toMatch(/база знаний|знаний/i);
  });

  it("🔴 платить нечем — модель не зовём", async () => {
    guardBilling.mockResolvedValue({
      balanceRub: 0,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: true,
      low: true,
    });

    const r = await run();

    expect(r.status).toBe("failed");
    expect(agentRun).not.toHaveBeenCalled();
    expect(failPlan.mock.calls[0]?.[2]).toMatch(/баланс|средств/i);
  });

  it("🔴 нет ни одного рабочего формата — план не собирается", async () => {
    // Иначе агент получит пустой список форматов и придумает свой.
    loadPlanContext.mockResolvedValue({ ...CONTEXT, formats: [] });

    const r = await run();

    expect(r.status).toBe("failed");
    expect(agentRun).not.toHaveBeenCalled();
    expect(failPlan.mock.calls[0]?.[2]).toMatch(/формат/i);
  });

  it("🔴 дата темы отсчитывается от начала периода, а не от первого числа", async () => {
    // День 3 при периоде с 14 сентября — это 16-е, а не 3-е.
    await run();
    expect(savePlanItems.mock.calls[0]?.[2]?.periodStart).toBe("2026-09-14");
  });

  it("🔴 в модель уходят только доступные форматы", async () => {
    await run();
    const input = agentRun.mock.calls[0]?.[0] as { formats: Array<{ slug: string }> };
    expect(input.formats.map((f) => f.slug)).toEqual(["post"]);
  });

  it("темы сохраняются вместе со снимком знаний, расход попадает в счёт", async () => {
    const r = await run();

    expect(r.status).toBe("ready");
    const saved = savePlanItems.mock.calls[0]?.[2];
    expect(saved?.topics).toHaveLength(1);
    // 🔴 Снимок обязателен: база меняется, и без него на вопрос «почему такие
    // темы» через неделю ответить нечем.
    expect(saved?.knowledgeUsed).toContain("Страховой взнос");

    const ledger = recordRun.mock.calls[0]?.[1];
    expect(ledger?.agent).toBe("plan");
    expect(ledger?.status).toBe("succeeded");
  });

  it("🔴 тема с несуществующей рубрикой отбрасывается, сборка не падает", async () => {
    agentState.output = {
      items: [
        {
          day: 3,
          slot: "09:30",
          categorySlug: "vydumannaya",
          modeSlug: "post",
          title: "Чужая рубрика",
          angle: "Угол.",
          rationale: "Опора.",
        },
        {
          day: 4,
          slot: "12:30",
          categorySlug: "cases",
          modeSlug: "post",
          title: "Живая тема",
          angle: "Угол.",
          rationale: "Опора.",
        },
      ],
    };

    const r = await run();

    expect(r.status).toBe("ready");
    expect(savePlanItems.mock.calls[0]?.[2]?.topics).toHaveLength(1);
  });

  it("🔴 модель упала после ответа — потраченное всё равно записано", async () => {
    agentState.fail = true;

    const r = await run();

    expect(r.status).toBe("failed");
    expect(recordRun.mock.calls[0]?.[1]?.status).toBe("failed");
    expect(failPlan).toHaveBeenCalled();
  });

  it("строки задания нет — тихо выходим", async () => {
    loadPlanJob.mockResolvedValue(null);
    const r = await run();
    expect(r.status).toBe("missing");
    expect(loadPlanContext).not.toHaveBeenCalled();
  });
});
