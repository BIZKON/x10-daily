import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * Ручной режим, шаг 1: прогон задания из раздела «Создать».
 *
 * Что здесь на самом деле проверяется — не «функция отработала», а четыре
 * решения, ошибка в каждом из которых видна клиенту: режим «готовится» не
 * пишет, знания берутся по полкам этого режима, снимок знаний остаётся, и
 * потраченные деньги попадают в счёт даже при падении.
 *
 * Сигнатуры моков заданы явно: без них mock.calls типизируется пустым кортежем
 * и проверить, ЧТО ушло в вызов, невозможно (наступали в billing-gate.test.ts).
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
type Job = {
  creation: { id: string; prompt: string };
  mode: {
    slug: string;
    title: string;
    guidance: string;
    shelfSlugs: string[];
    available: boolean;
  };
};

const JOB: Job = {
  creation: { id: "c-1", prompt: "Как мы сократили сверку склада" },
  mode: {
    slug: "post",
    title: "Пост",
    guidance: "Напиши пост для канала клиента. 250-300 слов.",
    shelfSlugs: ["business", "rules"],
    available: true,
  },
};

const {
  recordRun,
  guardBilling,
  loadKnowledge,
  loadCreationJob,
  markCreationRunning,
  finishCreation,
  failCreation,
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
  loadKnowledge: vi.fn(
    async (_db: unknown, _opts?: { shelfSlugs?: readonly string[] }) =>
      "## О бизнесе\nВнедряем ИИ-агентов",
  ),
  loadCreationJob: vi.fn(async (_db: unknown, _id: string): Promise<unknown> => null),
  markCreationRunning: vi.fn(async (_db: unknown, _id: string) => undefined),
  finishCreation: vi.fn(
    async (
      _db: unknown,
      _id: string,
      _p: { result: Record<string, unknown>; knowledgeUsed: string },
    ) => undefined,
  ),
  failCreation: vi.fn(async (_db: unknown, _id: string, _reason: string) => undefined),
}));

vi.mock("../src/lib/cost-ledger", () => ({ recordRun }));
vi.mock("../src/lib/billing-gate", () => ({ guardBilling }));
vi.mock("../src/lib/knowledge", () => ({ loadKnowledge }));
vi.mock("../src/lib/creations", () => ({
  loadCreationJob,
  markCreationRunning,
  finishCreation,
  failCreation,
}));
vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  return { ...actual, createDb: vi.fn(() => ({})) };
});

const { agentState } = vi.hoisted(() => ({
  agentState: {
    fail: false,
    output: {
      title: "Сверка склада за 20 минут вместо трёх часов",
      body: "Текст материала про автоматизацию сверки.",
      notes: ["цифру экономии стоит сверить с бухгалтерией"],
    },
  },
}));

vi.mock("@x10/agents", async () => {
  const actual = await vi.importActual<typeof import("@x10/agents")>("@x10/agents");
  return {
    ...actual,
    CreationAgent: {
      name: "creation",
      tier: "SONNET" as const,
      run: vi.fn(async () => {
        if (agentState.fail) throw new Error("модель не ответила");
        return {
          output: agentState.output,
          usage: { inputTokens: 2500, outputTokens: 700, cachedInputTokens: 0 },
          costUsd: 0.008,
          modelUsed: "deepseek/deepseek-v4-flash",
        };
      }),
    },
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createRunCreationFunction } from "../src/inngest/functions/run-creation";

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
  const fn = createRunCreationFunction(inngest, BINDINGS as unknown as PipelineBindings);
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { creationId: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<Record<string, unknown>>;
    }
  ).fn;
}

const run = () => makeHandler()({ event: { data: { creationId: "c-1" } }, step: makeStep() });

describe("прогон задания «Создать»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.fail = false;
    loadCreationJob.mockResolvedValue(JOB);
    loadKnowledge.mockResolvedValue("## О бизнесе\nВнедряем ИИ-агентов");
    // clearAllMocks чистит вызовы, но НЕ реализации: отказ, поставленный одним
    // тестом, иначе течёт в следующие и роняет их «по чужой вине».
    finishCreation.mockResolvedValue(undefined);
    failCreation.mockResolvedValue(undefined);
    guardBilling.mockResolvedValue({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    });
  });

  it("готовый материал попадает в задание и статус становится ready", async () => {
    const r = await run();

    expect(r.status).toBe("ready");
    const saved = finishCreation.mock.calls[0]![2];
    expect(saved.result.title).toBe("Сверка склада за 20 минут вместо трёх часов");
    expect(failCreation).not.toHaveBeenCalled();
  });

  it("🔴 знания берутся ПО ПОЛКАМ РЕЖИМА, а не всей базой", async () => {
    // Иначе прайс клиента уедет в публичный пост: у режима «Пост» полки цен нет
    // намеренно, и это единственное место, где его выбор соблюдается.
    await run();

    expect(loadKnowledge.mock.calls[0]![1]).toEqual({ shelfSlugs: ["business", "rules"] });
  });

  it("🔴 сохраняется снимок знаний, ушедших в модель", async () => {
    // База меняется. Без снимка на вопрос «почему получилось так» через неделю
    // ответить нечем — восстановить прошлое состояние базы неоткуда.
    await run();

    expect(finishCreation.mock.calls[0]![2].knowledgeUsed).toBe(
      "## О бизнесе\nВнедряем ИИ-агентов",
    );
  });

  it("указание режима и тема человека доходят до агента", async () => {
    const { CreationAgent } = await import("@x10/agents");
    await run();

    const input = vi.mocked(CreationAgent.run).mock.calls[0]![0];
    expect(input.guidance).toBe("Напиши пост для канала клиента. 250-300 слов.");
    expect(input.topic).toBe("Как мы сократили сверку склада");
    expect(input.knowledge).toBe("## О бизнесе\nВнедряем ИИ-агентов");
  });

  it("расход попадает в счёт видом «creation», а не смешивается с конвейером", async () => {
    // Экран «Расходы» группирует по виду агента: «линия сделала» и «ваш
    // сотрудник попросил» — разные разговоры с клиентом.
    await run();

    const entry = recordRun.mock.calls[0]![1];
    expect(entry.agent).toBe("creation");
    expect(entry.status).toBe("succeeded");
    expect(entry.costUsd).toBe(0.008);
  });
});

describe("что задание НЕ должно делать", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.fail = false;
    loadCreationJob.mockResolvedValue(JOB);
    loadKnowledge.mockResolvedValue("## О бизнесе\nВнедряем ИИ-агентов");
    // clearAllMocks чистит вызовы, но НЕ реализации: отказ, поставленный одним
    // тестом, иначе течёт в следующие и роняет их «по чужой вине».
    finishCreation.mockResolvedValue(undefined);
    failCreation.mockResolvedValue(undefined);
    guardBilling.mockResolvedValue({
      balanceRub: 5000,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: false,
      low: false,
    });
  });

  it("🔴 режим «готовится» не запускает агента и не берёт денег", async () => {
    // Из шести режимов работает один. Если недоступный режим начнёт что-то
    // писать, пометка «готовится» превратится в обман, а клиент получит счёт
    // за материал, которого не заказывал.
    loadCreationJob.mockResolvedValue({ ...JOB, mode: { ...JOB.mode, available: false } });
    const { CreationAgent } = await import("@x10/agents");

    const r = await run();

    expect(CreationAgent.run).not.toHaveBeenCalled();
    expect(recordRun).not.toHaveBeenCalled();
    expect(r.status).toBe("failed");
    expect(String(failCreation.mock.calls[0]![2])).toMatch(/готовится/i);
  });

  it("баланс исчерпан → агент не запускается, причина видна человеку", async () => {
    guardBilling.mockResolvedValue({
      balanceRub: 0,
      lowThresholdRub: 500,
      billingEnforced: true,
      blocked: true,
      low: true,
    });
    const { CreationAgent } = await import("@x10/agents");

    const r = await run();

    expect(CreationAgent.run).not.toHaveBeenCalled();
    expect(r.status).toBe("failed");
    expect(String(failCreation.mock.calls[0]![2])).toMatch(/баланс|средств/i);
  });

  it("🔴 падение агента не теряет потраченные деньги и объясняет причину", async () => {
    agentState.fail = true;

    const r = await run();

    expect(r.status).toBe("failed");
    expect(failCreation).toHaveBeenCalled();
    const entry = recordRun.mock.calls[0]![1];
    expect(entry.agent).toBe("creation");
    expect(entry.status).toBe("failed");
    expect(String(entry.error)).toContain("модель не ответила");
  });

  it("🔴 агент отработал, а запись упала → потраченное всё равно попадает в учёт", async () => {
    // Самый коварный путь: модель ответила, деньги у шлюза списаны, а падение
    // случилось после. Записать здесь ноль значит подарить клиенту прогон и
    // ослепить дневной учёт расхода — ровно та дыра, которую в конвейере
    // закрывали `billed` (draft-article, audit M2).
    finishCreation.mockRejectedValue(new Error("база не ответила"));

    const r = await run();

    expect(r.status).toBe("failed");
    const entry = recordRun.mock.calls[0]![1];
    expect(entry.status).toBe("failed");
    expect(entry.costUsd).toBe(0.008);
  });

  it("задания нет в базе → тихий выход, без записей и без падения", async () => {
    // Бросок здесь заставил бы Inngest ретраить в пустоту: строки не появится.
    loadCreationJob.mockResolvedValue(null);

    const r = await run();

    expect(r.status).toBe("missing");
    expect(recordRun).not.toHaveBeenCalled();
    expect(failCreation).not.toHaveBeenCalled();
  });

  it("отказ базы знаний не отменяет создание — материал выйдет беднее, но выйдет", async () => {
    loadKnowledge.mockRejectedValue(new Error("база недоступна"));

    const r = await run();

    expect(r.status).toBe("ready");
    const input = vi.mocked((await import("@x10/agents")).CreationAgent.run).mock.calls[0]![0];
    expect(input.knowledge).toBeUndefined();
  });
});
