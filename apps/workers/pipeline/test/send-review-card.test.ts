import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineBindings } from "../src/bindings";

/**
 * Отправка карточки ревью в группу «Редакция» (Спека 4).
 *
 * 🔴 Этих тестов не было — и ровно поэтому карточка не ушла НИ РАЗУ за всё
 * время жизни Спеки 4. Гард «уже опубликована» смотрел на `articles.status`, а
 * с 24-й сессии статья создаётся сразу со `status='published'` (лента мини-аппа
 * наполняется без ожидания). Гард срабатывал всегда, функция молча выходила,
 * и снаружи это выглядело как «бот ничего не присылает».
 */
const { dbState } = vi.hoisted(() => ({
  dbState: {
    /** Строка статьи + LEFT JOIN канала, как её видит load-article. */
    articleRow: null as Record<string, unknown> | null,
    inserts: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@x10/db", async () => {
  const actual = await vi.importActual<typeof import("@x10/db")>("@x10/db");
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => (dbState.articleRow ? [dbState.articleRow] : []),
  });
  return {
    ...actual,
    createDb: vi.fn(() => ({
      select: () => chain,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          dbState.inserts.push(v);
          return { returning: async () => [{ id: "card-1" }] };
        },
      }),
    })),
  };
});

import { createPipelineInngest } from "../src/inngest/client";
import { createSendReviewCardFunction } from "../src/inngest/functions/send-review-card";

const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";

const BINDINGS = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  TELEGRAM_BOT_TOKEN: "123456789:AAtest-token-for-unit-tests-only",
  TG_REVIEW_CHAT_ID: "-5432043420",
  X10_BASE_DOMAIN: "example.ru",
} as Record<string, string | undefined>;

/** Статья, какой её видит функция в проде: в ленте уже есть, в канал не ушла. */
const IN_FEED_NOT_POSTED = {
  tease: "Склад считает остатки сам",
  lede: "WMS с ИИ снял ручную сверку",
  slug: "sklad-schitaet",
  coverImageUrl: "https://app.example.ru/covers/a-1.jpg",
  visualStatus: "pending_review",
  postedAt: null,
};

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => undefined),
  };
}

function tgFetch() {
  return vi.fn(async () =>
    Response.json({ ok: true, result: { message_id: 777 } }),
  ) as unknown as typeof fetch;
}

function makeHandler(bindings = BINDINGS, fetchImpl?: typeof fetch) {
  const inngest = createPipelineInngest({ NODE_ENV: "test" });
  const fn = createSendReviewCardFunction(inngest, bindings as unknown as PipelineBindings, {
    fetchImpl,
  });
  return (
    fn as unknown as {
      fn: (a: {
        event: { data: { articleId: string } };
        step: ReturnType<typeof makeStep>;
      }) => Promise<{ sent?: boolean; skipped?: boolean; reason?: string; cardId?: string }>;
    }
  ).fn;
}

describe("send-review-card", () => {
  beforeEach(() => {
    dbState.articleRow = { ...IN_FEED_NOT_POSTED };
    dbState.inserts = [];
    vi.clearAllMocks();
  });

  it("🔴 статья видна в ленте, но в канал НЕ ушла → карточка отправляется", async () => {
    // Регрессия на разбор 07.08.2026. Именно этот случай — норма в проде:
    // persistArticle ставит published сразу, а карточка запрашивается через
    // полминуты. Пока гард смотрел на статус статьи, сюда не доходило ничего.
    const fetchImpl = tgFetch();
    const r = await makeHandler(
      BINDINGS,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    expect(r.sent).toBe(true);
    expect(r.cardId).toBe("card-1");
    expect(dbState.inserts[0]?.messageId).toBe(777);
    expect(dbState.inserts[0]?.articleId).toBe(ARTICLE_ID);
  });

  it("🔴 карточка уже ждёт решения → второй раз не шлём", async () => {
    // Запрос карточки приходит из двух мест: из постановки в очередь и из
    // готовой обложки. Без этой защиты редактор получил бы две карточки на одну
    // статью, а ворота держались бы по обеим — одобрив одну, он ничего бы не
    // добился.
    dbState.articleRow = { ...IN_FEED_NOT_POSTED, awaitingCards: 1 };
    const fetchImpl = tgFetch();

    const r = (await makeHandler(
      BINDINGS,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    })) as { skipped?: boolean; reason?: string };

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("card-already-awaiting");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbState.inserts).toHaveLength(0);
  });

  it("пост уже ушёл в канал → карточку не шлём (иначе «Одобрить» выпустит дважды)", async () => {
    dbState.articleRow = { ...IN_FEED_NOT_POSTED, postedAt: new Date("2026-08-07T10:00:00Z") };
    const fetchImpl = tgFetch();

    const r = await makeHandler(
      BINDINGS,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("already-posted-to-channel");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("строки канала нет → карточку всё равно показываем редактору", async () => {
    // LEFT JOIN не нашёл очереди. «Перерисовать» и «Переписать» работают и без
    // неё, а молчание выглядело бы как поломка.
    dbState.articleRow = { ...IN_FEED_NOT_POSTED, postedAt: null };
    const r = await makeHandler(
      BINDINGS,
      tgFetch(),
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });
    expect(r.sent).toBe(true);
  });

  it("группа не настроена → тихий выход, ревью остаётся в кабинете", async () => {
    const fetchImpl = tgFetch();
    const r = await makeHandler(
      { ...BINDINGS, TG_REVIEW_CHAT_ID: "" },
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });
    expect(r.reason).toBe("review-chat-not-configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("статьи нет → выходим с причиной", async () => {
    dbState.articleRow = null;
    const r = await makeHandler()({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });
    expect(r.reason).toBe("article-not-found");
  });

  it("есть обложка → уходит фотографией с кнопками", async () => {
    const fetchImpl = tgFetch();
    const r = await makeHandler(
      BINDINGS,
      fetchImpl,
    )({
      event: { data: { articleId: ARTICLE_ID } },
      step: makeStep(),
    });

    expect(r.sent).toBe(true);
    const calls = (fetchImpl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls;
    expect(String(calls[0]?.[0])).toContain("/sendPhoto");
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as { reply_markup?: unknown };
    expect(body.reply_markup).toBeDefined();
    // Второй вызов проставляет кнопкам настоящий id карточки.
    expect(String(calls[1]?.[0])).toContain("/editMessageReplyMarkup");
  });
});
