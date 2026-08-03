import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * drain-post-slots (session 23): cron слот-постинга. Мокаем @x10/db —
 * createDb отдаёт chain-объект, где каждый select-терминал (.limit) берёт
 * следующий результат из очереди dbState.selectResults (порядок селектов в
 * функции детерминирован), а update пишет в dbState.updates. TG/VK отправку
 * проверяем через инъектированный fetchImpl (реальные callTelegram/vkWallPost).
 *
 * ⚠️ Зона НЕ покрытия: фактический SQL-фильтр select (FIFO/свежесть/posted_at
 * IS NULL) мок обходит — корректность выборки проверяется живьём при деплое.
 * Здесь — оркестрация: пауза, пустая очередь, happy tg, vk-ветка, non-retryable.
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    paused: { paused: false, reason: null as string | null },
    selectResults: [] as Array<Array<Record<string, unknown>>>,
    updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
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
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            dbState.updates.push({
              table: table === actual.articles ? "articles" : "channels",
              set: v,
            });
          },
        }),
      }),
    })),
    getPostingControl: vi.fn(async () => ({})),
    isPostingPaused: vi.fn(() => dbState.paused),
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createDrainPostSlotsFunction } from "../src/inngest/functions/drain-post-slots";
import { CAPTION_LIMIT, visibleCaptionLength } from "../src/lib/caption";

const TG_BINDINGS: Record<string, string | undefined> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  TELEGRAM_BOT_TOKEN: "123:abc",
  TG_TEST_CHANNEL_ID: "-100500",
};
const VK_BINDINGS = { ...TG_BINDINGS, VK_ACCESS_TOKEN: "vk-token", VK_OWNER_ID: "-123456" };

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function makeHandler(bindings: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createDrainPostSlotsFunction(inngest, bindings as unknown as PipelineBindings, {
    fetchImpl,
  });
  return (fn as unknown as { fn: (a: { step: ReturnType<typeof makeStep> }) => Promise<unknown> })
    .fn;
}

/** fetch по host: TG ok всегда; VK по opts (post_id или error_code). */
const dualFetch = (vk: { postId?: number; errorCode?: number } = {}) =>
  vi.fn(async (url: unknown) => {
    if (String(url).includes("api.telegram.org")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 555 } }),
      };
    }
    if (vk.errorCode) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ error: { error_code: vk.errorCode, error_msg: "e" } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: { post_id: vk.postId ?? 99 } }),
    };
  }) as unknown as typeof fetch;

describe("drain-post-slots", () => {
  beforeEach(() => {
    dbState.paused = { paused: false, reason: null };
    dbState.selectResults = [];
    dbState.updates = [];
    vi.clearAllMocks();
  });

  it("постинг на паузе → слот пропущен, fetch не зовётся", async () => {
    dbState.paused = { paused: true, reason: "quiet-hours" };
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      skipped: boolean;
      reason: string;
    };
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("posting-paused:quiet-hours");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it("очередь пуста → no-op", async () => {
    dbState.selectResults = [[]]; // select articleId → пусто
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      reason: string;
    };
    expect(r.posted).toBe(0);
    expect(r.reason).toBe("queue-empty");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("happy tg-only: постит 1 статью, mark posted + published", async () => {
    // select articleId → load-tg (VK не сконфигурирован → нет vk-селекта).
    dbState.selectResults = [[{ articleId: "a1" }], [{ text: "Новость", visualRef: null }]];
    const fetchImpl = dualFetch();
    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      articleId: string;
      posted: number;
      results: Array<{ channel: string; status: string; postRef?: string | null }>;
    };
    expect(r.articleId).toBe("a1");
    expect(r.posted).toBe(1);
    expect(r.results).toEqual([{ channel: "tg", status: "posted", postRef: "555" }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const tables = dbState.updates.map((u) => u.table);
    expect(tables).toContain("channels"); // mark posted
    expect(tables).toContain("articles"); // mark published
    const published = dbState.updates.find((u) => u.table === "articles");
    expect(published?.set.status).toBe("published");
  });

  it("deep-link в ТЕКСТЕ + превью по web-URL, без кнопки (правка владельца)", async () => {
    // select articleId → load-tg channels row → load-tg article (slug для ссылки).
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "Новость", visualRef: null }],
      [{ tease: "T", lede: "L", whyItMatters: null, body: [], slug: "my-slug" }],
    ];
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_u: unknown, init: unknown) => {
      body = JSON.parse((init as { body: string }).body);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 5 } }) };
    }) as unknown as typeof fetch;
    await makeHandler(
      {
        ...TG_BINDINGS,
        TELEGRAM_BOT_USERNAME: "Sekretar_Syrov_IP_bot",
        X10_BASE_DOMAIN: "pro-agent-ai.ru",
      },
      fetchImpl,
    )({ step: makeStep() });

    // Ссылка в тексте открывает Mini App…
    expect(body.text).toContain(
      '<a href="https://t.me/Sekretar_Syrov_IP_bot?startapp=my-slug">Подробнее читай в блоге ProAgent AI →</a>',
    );
    // …а карточка превью строится по web-URL статьи (og-картинка).
    expect(body.link_preview_options).toEqual({
      url: "https://app.pro-agent-ai.ru/article/my-slug",
    });
    // Inline-кнопки больше нет — вход единственный.
    expect(body.reply_markup).toBeUndefined();
  });

  /* ===== Спека 2: ИИ-обложка в канале — HumanGate в пути постинга ===== */

  /** Строка статьи для load-tg (Спека 2 селектит её всегда). */
  const articleRow = (over: Record<string, unknown> = {}) => ({
    tease: "Склад считает остатки сам",
    lede: "WMS с ИИ снял ручную сверку.",
    whyItMatters: null,
    body: [],
    slug: "sklad",
    coverImageUrl: null,
    visualStatus: "none",
    ...over,
  });

  /** Тело запроса к Telegram (dualFetch типизирован как fetch — достаём mock). */
  const tgBody = (fetchImpl: typeof fetch) => {
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const call = calls.find((c) => String(c[0]).includes("api.telegram.org"));
    return {
      url: String(call?.[0] ?? ""),
      body: JSON.parse(((call?.[1] as RequestInit)?.body as string) ?? "{}") as Record<
        string,
        unknown
      >,
    };
  };

  it("🔴 обложка ОДОБРЕНА → sendPhoto с подписью и картинкой статьи", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [articleRow({ visualStatus: "approved", coverImageUrl: "https://app.x/covers/a1.jpg" })],
    ];
    const fetchImpl = dualFetch();
    await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() });

    const { url, body } = tgBody(fetchImpl);
    expect(url).toContain("/sendPhoto");
    expect(body.photo).toBe("https://app.x/covers/a1.jpg");
    expect(String(body.caption)).toContain("Склад считает остатки сам");
    expect(body.parse_mode).toBe("HTML");
  });

  it("🔴 обложка ЖДЁТ РЕВЬЮ → в канал уходит ТЕКСТ, картинка не публикуется", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [
        articleRow({
          visualStatus: "pending_review",
          coverImageUrl: "https://app.x/covers/a1.jpg",
        }),
      ],
    ];
    const fetchImpl = dualFetch();
    await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() });

    const { url, body } = tgBody(fetchImpl);
    expect(url).toContain("/sendMessage");
    expect(url).not.toContain("/sendPhoto");
    expect(body.photo).toBeUndefined();
  });

  it("🔴 обложка ОТКЛОНЕНА редактором → текстовый пост", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [articleRow({ visualStatus: "rejected", coverImageUrl: "https://app.x/covers/a1.jpg" })],
    ];
    const fetchImpl = dualFetch();
    await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() });

    expect(tgBody(fetchImpl).url).toContain("/sendMessage");
  });

  it("статус approved, но картинки нет → текстовый пост (не шлём пустое фото)", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [articleRow({ visualStatus: "approved", coverImageUrl: null })],
    ];
    const fetchImpl = dualFetch();
    await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() });

    expect(tgBody(fetchImpl).url).toContain("/sendMessage");
  });

  it("подпись фото укладывается в лимит Telegram даже при огромной вводке", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [
        articleRow({
          lede: "Длинная вводка. ".repeat(300),
          visualStatus: "approved",
          coverImageUrl: "https://app.x/covers/a1.jpg",
        }),
      ],
    ];
    const fetchImpl = dualFetch();
    await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() });

    const { body } = tgBody(fetchImpl);
    expect(visibleCaptionLength(String(body.caption))).toBeLessThanOrEqual(CAPTION_LIMIT);
  });

  it("🔴 Telegram отбил картинку (400) → пост НЕ теряется, уходит текстом", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [articleRow({ visualStatus: "approved", coverImageUrl: "https://app.x/covers/a1.jpg" })],
    ];
    // sendPhoto → 400 (Telegram не смог скачать URL), sendMessage → ok.
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes("/sendPhoto")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ ok: false, description: "failed to get HTTP URL content" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 5 } }) };
    }) as unknown as typeof fetch;

    const r = (await makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      results: Array<{ channel: string; status: string }>;
    };

    // Слот НЕ потерян — иначе голова FIFO-очереди залипла бы до STALE_HOURS и
    // молчали бы до четырёх слотов подряд.
    expect(r.posted).toBe(1);
    expect(r.results[0]?.status).toBe("posted");
    const urls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(urls.some((u) => u.includes("/sendPhoto"))).toBe(true);
    expect(urls.some((u) => u.includes("/sendMessage"))).toBe(true);
  });

  it("сеть/5xx на фото НЕ деградирует в текст — это ретрай Inngest, а не отказ картинки", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ text: "TG пост", visualRef: null }],
      [articleRow({ visualStatus: "approved", coverImageUrl: "https://app.x/covers/a1.jpg" })],
    ];
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ ok: false, description: "bad gateway" }),
    })) as unknown as typeof fetch;

    await expect(makeHandler(TG_BINDINGS, fetchImpl)({ step: makeStep() })).rejects.toThrow(/502/);
  });

  it("VK сконфигурирован: постит tg + vk одной статьёй", async () => {
    // select articleId → vk-target check → load-tg → load-vk.
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ id: "vkrow" }],
      [{ text: "TG", visualRef: null }],
      // Спека 2: для tg статья тянется ВСЕГДА (нужен visual_status обложки).
      [
        {
          tease: "T",
          lede: "L",
          whyItMatters: null,
          body: [],
          slug: "s",
          coverImageUrl: null,
          visualStatus: "none",
        },
      ],
      [{ text: "VK", visualRef: null }],
    ];
    const fetchImpl = dualFetch({ postId: 77 });
    const r = (await makeHandler(VK_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      results: Array<{ channel: string; status: string }>;
    };
    expect(r.posted).toBe(2);
    expect(r.results.map((x) => x.channel)).toEqual(["tg", "vk"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("VK non-retryable (214): tg постится, vk skipped, статья published", async () => {
    dbState.selectResults = [
      [{ articleId: "a1" }],
      [{ id: "vkrow" }],
      [{ text: "TG", visualRef: null }],
      // Спека 2: для tg статья тянется ВСЕГДА (нужен visual_status обложки).
      [
        {
          tease: "T",
          lede: "L",
          whyItMatters: null,
          body: [],
          slug: "s",
          coverImageUrl: null,
          visualStatus: "none",
        },
      ],
      [{ text: "VK", visualRef: null }],
    ];
    const fetchImpl = dualFetch({ errorCode: 214 });
    const r = (await makeHandler(VK_BINDINGS, fetchImpl)({ step: makeStep() })) as {
      posted: number;
      results: Array<{ channel: string; status: string }>;
    };
    expect(r.posted).toBe(1); // только tg
    const vk = r.results.find((x) => x.channel === "vk");
    expect(vk?.status).toBe("skipped:vk-error-214");
    expect(
      dbState.updates.some((u) => u.table === "articles" && u.set.status === "published"),
    ).toBe(true);
  });
});
