import { sourceRefSchema } from "@x10/agents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PipelineBindings } from "../src/bindings";

/**
 * Разбор по ссылке — второй вход конвейера.
 *
 * 🔴 Главное, что здесь проверяется: на выходе уходит ОБЫЧНОЕ
 * `article/topic.ingested`. Если это сломается, разбор превратится во вторую
 * трубу рядом с конвейером, и всё после драфта придётся дублировать.
 */
/**
 * Сигнатуры у моков заданы явно: без них mock.calls типизируется пустым
 * кортежем, и проверить, ЧТО именно ушло в событие, невозможно (наступали на
 * это в billing-gate.test.ts).
 */
type Ledger = { agent: string; status: string; costUsd: number; output: Record<string, unknown> };
type Billing = {
  balanceRub: number;
  lowThresholdRub: number;
  billingEnforced: boolean;
  blocked: boolean;
  low: boolean;
};
type Fetched =
  | { ok: true; url: string; title: string; text: string }
  | { ok: false; reason: string };

const { recordRun, guardBilling, fetchArticle } = vi.hoisted(() => ({
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
  fetchArticle: vi.fn(
    async (_url: string, _f?: typeof fetch): Promise<Fetched> => ({
      ok: true,
      url: "https://example.com/a",
      title: "Склад считает сам",
      text: "Текст исходника про автоматизацию склада",
    }),
  ),
}));
vi.mock("../src/lib/cost-ledger", () => ({ recordRun }));
vi.mock("../src/lib/billing-gate", () => ({ guardBilling }));
vi.mock("../src/lib/fetch-article", () => ({ fetchArticle }));
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return { ...actual, createDb: vi.fn(() => ({})) };
});

const { agentState } = vi.hoisted(() => ({
  agentState: {
    usable: true,
    output: {
      usable: true,
      hook: { source: "число без контекста", adapted: "цифра экономии в первой строке" },
      proof: { source: "точные суммы", adapted: "часы и рубли из вашего кейса" },
      arc: { source: "от проблемы к решению", adapted: "от ручной сверки к автомату" },
      cta: { source: "написать в директ", adapted: "запросить расчёт" },
      whyItWorked: "конкретная цифра вместо общего обещания",
      topic: "Автоматизация сверки остатков на складе",
      context: "Фактура про сокращение часов",
      category: "cases" as const,
      subcategory: "cases.logistics",
      template: "deep-dive" as const,
      tags: ["склад", "wms"],
      political: false,
    },
  },
}));

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    BreakdownAgent: {
      name: "breakdown",
      tier: "SONNET" as const,
      run: vi.fn(async () => ({
        output: { ...agentState.output, usable: agentState.usable },
        usage: { inputTokens: 3000, outputTokens: 400, cachedInputTokens: 0 },
        costUsd: 0.012,
        modelUsed: "anthropic/claude-sonnet-4-6",
      })),
    },
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createBreakdownLinkFunction } from "../src/inngest/functions/breakdown-link";

const BINDINGS = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  AI_GATEWAY_API_KEY: "k",
} as Record<string, string | undefined>;

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(
      async (_id: string, _ev: { name: string; data: Record<string, unknown> }) => undefined,
    ),
  };
}

function makeHandler() {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createBreakdownLinkFunction(inngest, BINDINGS as unknown as PipelineBindings);
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { url: string; submittedBy?: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<Record<string, unknown>>;
    }
  ).fn;
}

describe("breakdown-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.usable = true;
    guardBilling.mockResolvedValue({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    });
    fetchArticle.mockResolvedValue({
      ok: true,
      url: "https://example.com/a",
      title: "Склад считает сам",
      text: "Текст исходника про автоматизацию склада",
    });
  });

  it("🔴 отдаёт ОБЫЧНОЕ article/topic.ingested — конвейер после драфта не дублируется", async () => {
    const step = makeStep();
    const r = await makeHandler()({ event: { data: { url: "https://example.com/a" } }, step });

    expect(r.dispatched).toBe(true);
    const sent = step.sendEvent.mock.calls[0]![1];
    expect(sent.name).toBe("article/topic.ingested");
    expect(sent.data.topic).toBe("Автоматизация сверки остатков на складе");
    expect(sent.data.category).toBe("cases");
    expect(sent.data.template).toBe("deep-dive");
    // 🔴 Источник проверяем СХЕМОЙ, а не своей догадкой о его форме.
    // Первая версия теста сверяла {title, url} — ровно то, что я и отправлял,
    // — и пропустила на прод отсутствующий publisher: конвейер отбил событие
    // с EventValidationError, разбор отработал впустую. Тест, повторяющий
    // предположение автора, не проверяет ничего.
    const sources = z.array(sourceRefSchema).min(1).parse(sent.data.sources);
    expect(sources[0]).toEqual({
      url: "https://example.com/a",
      title: "Склад считает сам",
      publisher: "example.com",
    });
  });

  it("🔴 приём уезжает в context — иначе разбор остался бы справкой", async () => {
    const step = makeStep();
    await makeHandler()({ event: { data: { url: "https://example.com/a" } }, step });

    const sent = step.sendEvent.mock.calls[0]![1];
    expect(String(sent.data.context)).toContain("Захват: цифра экономии в первой строке");
    expect(String(sent.data.context)).toContain("Призыв: запросить расчёт");
    expect(String(sent.data.context)).toContain("конкретная цифра вместо общего обещания");
  });

  it("баланс исчерпан → ни загрузки, ни разбора", async () => {
    guardBilling.mockResolvedValueOnce({
      balanceRub: 0,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: true,
      low: false,
    });
    const step = makeStep();
    const r = await makeHandler()({ event: { data: { url: "https://example.com/a" } }, step });

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("client-balance-exhausted");
    expect(fetchArticle).not.toHaveBeenCalled();
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("🔴 страница не открылась → платного разбора НЕ было", async () => {
    fetchArticle.mockResolvedValueOnce({ ok: false, reason: "На странице не нашлось текста" });
    const step = makeStep();
    const r = await makeHandler()({ event: { data: { url: "https://x/y" } }, step });

    expect(r.reason).toBe("fetch-failed");
    expect(r.message).toContain("не нашлось текста");
    expect(recordRun).not.toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("материал не годится → тему не ставим, но расход пишем", async () => {
    // Токены потрачены в любом случае: клиент должен видеть это в «Расходах».
    agentState.usable = false;
    const step = makeStep();
    const r = await makeHandler()({ event: { data: { url: "https://example.com/ad" } }, step });

    expect(r.reason).toBe("not-usable");
    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(recordRun).toHaveBeenCalledOnce();
    const row = recordRun.mock.calls[0]![1];
    expect(row.agent).toBe("breakdown");
    expect(row.status).toBe("skipped");
  });

  it("удачный разбор пишется отдельным видом прогона", async () => {
    const step = makeStep();
    await makeHandler()({ event: { data: { url: "https://example.com/a" } }, step });

    const row = recordRun.mock.calls[0]![1];
    expect(row.agent).toBe("breakdown");
    expect(row.status).toBe("succeeded");
    expect(row.costUsd).toBe(0.012);
    expect(row.output.stage).toBe("link-breakdown");
    // Каркас переживает статью: по нему потом видно, откуда взялась тема.
    expect(Object.keys(row.output.beats as object)).toEqual(["hook", "proof", "arc", "cta"]);
  });
});
