import { zValidator } from "@hono/zod-validator";
import { POST_SLOT_STALE_HOURS } from "@x10/config";
import {
  CHANNEL_FORMATS,
  type ChannelFormat,
  type ChannelStatus,
  and,
  articles,
  channels,
  desc,
  eq,
  gte,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Очередь публикаций: что вышло, что ждёт слота и что сняла площадка
 * (спека 13.08, реестр разрыва §3.12).
 *
 * До миграции 0033 состояние строки ВЫВОДИЛОСЬ из `posted_at`, и снятый
 * модерацией пост навсегда числился опубликованным — отчёт клиенту врал.
 * Теперь состояние явное, а отметить снятие и вернуть строку в очередь может
 * человек.
 *
 * Права: смотреть — `content.view`, отмечать и возвращать — `content.publish`.
 * Это управление выпуском, а не правка текста: снятие меняет то, что клиент
 * покажет в отчёте, а возврат отправляет материал в канал второй раз.
 */

/** Сколько строк очереди приносим на экран за раз. */
const DEFAULT_LIMIT = 60;

/**
 * Потолок причины снятия — колонка `text`, но 500 символов хватает на любую
 * формулировку площадки, а обрезка на входе честнее молчаливой обрезки в базе.
 */
export const MAX_REJECT_REASON = 500;

/**
 * Минимум причины. Одного символа не бывает: «-» и «х» — это отписка, а не
 * причина, и через неделю она не помогает ни повторить, ни не повторить.
 */
export const MIN_REJECT_REASON = 3;

export type PostingGate = { ok: true } | { ok: false; error: string; message: string };

/**
 * Снять можно только то, что реально выходило.
 *
 * 🔴 Строка в очереди, помеченная «снято», исчезает из выпуска молча: слот её
 * больше не возьмёт, а человек будет думать, что материал ждёт своего часа.
 */
export function checkRejectable(row: { status: ChannelStatus | string }): PostingGate {
  if (row.status === "rejected") {
    return {
      ok: false,
      error: "already_rejected",
      message: "Эта публикация уже отмечена снятой.",
    };
  }
  if (row.status !== "posted") {
    return {
      ok: false,
      error: "invalid_state",
      message: "Публикация ещё не выходила — она в очереди. Снимать нечего.",
    };
  }
  return { ok: true };
}

/**
 * Вернуть в очередь можно только снятое.
 *
 * 🔴 Возврат живой публикации отправил бы материал в канал второй раз: у
 * подписчиков это дубль, у нас — потраченный слот.
 */
export function checkRequeueable(row: { status: ChannelStatus | string }): PostingGate {
  if (row.status === "rejected") return { ok: true };
  return {
    ok: false,
    error: "invalid_state",
    message:
      row.status === "posted"
        ? "Публикация живёт в канале. Вернуть в очередь можно только снятую."
        : "Эта публикация и так в очереди.",
  };
}

/**
 * Что меняется при возврате строки в очередь (спека §7).
 *
 * 🔴 `rejected_at` и `rejected_reason` НЕ трогаем намеренно: в строке должно
 * быть видно, что публикацию снимали и почему. Иначе второй заход выглядит
 * первым, и та же причина повторяется — снимут снова.
 *
 * 🔴 `created_at` переставляем на момент возврата, и без этого кнопка была бы
 * ложью. Слот берёт из очереди только строки не старше суток (`STALE_HOURS` в
 * `drain-post-slots`), а снимают публикацию обычно на следующий день — со
 * старым временем возвращённая строка не вышла бы НИКОГДА, причём молча.
 * Смысл колонки при этом сохраняется: это момент, когда строка встала в
 * очередь, а возврат — ровно постановка в очередь заново. Заодно строка
 * встаёт в хвост FIFO, а не впереди свежих новостей.
 */
export function buildRequeuePatch(at: Date): {
  status: ChannelStatus;
  postedAt: null;
  postRef: null;
  createdAt: Date;
} {
  return { status: "queued", postedAt: null, postRef: null, createdAt: at };
}

/**
 * Возьмёт ли слот эту строку когда-нибудь.
 *
 * 🔴 `drain-post-slots` отбирает из очереди только строки не старше окна
 * свежести — протухшую новость лучше не выдавать вовсе. Для очереди это
 * значит, что старая строка не выйдет НИКОГДА, и молчать об этом нельзя:
 * 13.08.2026 на проде «в очереди» числилось 2432 строки, а слот видел пять.
 * Клиент, глядя на такой счётчик, ждал бы две тысячи публикаций.
 */
export function isStaleForSlot(
  row: { status: ChannelStatus | string; createdAt: string | Date },
  now: Date,
): boolean {
  if (row.status !== "queued") return false;
  const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return now.getTime() - created.getTime() > POST_SLOT_STALE_HOURS * 3_600_000;
}

export type PublicationRow = {
  id: string;
  articleId: string;
  slug: string;
  title: string;
  channel: string;
  format: ChannelFormat | string;
  status: ChannelStatus | string;
  postedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  postRef: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  /** Окно свежести истекло — слот эту строку уже не возьмёт. */
  staleForSlot?: boolean;
};

export type PublicationCard = {
  articleId: string;
  slug: string;
  title: string;
  /** Самое свежее событие материала — по нему карточки и сортируются. */
  lastAt: string | null;
  rows: PublicationRow[];
};

/** Момент последнего события строки: вышла, сняли или встала в очередь. */
function rowMoment(r: PublicationRow): string {
  return r.rejectedAt ?? r.postedAt ?? r.createdAt;
}

/**
 * Собирает плоские строки очереди в карточки материалов (решение владельца
 * 13.08: карточка материала, внутри — строка на каждый формат).
 *
 * 🔴 Группировку считает СЕРВЕР, а не вёрстка: это то же правило, что в
 * контент-плане. Экран рисует, что дали, и второму источнику правды взяться
 * неоткуда.
 */
export function groupPublications(rows: readonly PublicationRow[]): PublicationCard[] {
  const order = new Map<string, number>(CHANNEL_FORMATS.map((f, i) => [f, i]));
  const cards = new Map<string, PublicationCard>();

  for (const r of rows) {
    const card = cards.get(r.articleId);
    if (card) {
      card.rows.push(r);
      continue;
    }
    cards.set(r.articleId, {
      articleId: r.articleId,
      slug: r.slug,
      title: r.title,
      lastAt: null,
      rows: [r],
    });
  }

  const list = [...cards.values()];
  for (const card of list) {
    // Порядок форматов — канонический (пост · карусель · ролик · ролик с
    // ведущим), а не тот, в котором их вернула база: иначе карточка
    // перетасовывается между обновлениями и строку приходится искать заново.
    card.rows.sort(
      (a, b) =>
        (order.get(String(a.format)) ?? 99) - (order.get(String(b.format)) ?? 99) ||
        a.channel.localeCompare(b.channel),
    );
    card.lastAt = card.rows.reduce<string>(
      (max, r) => (rowMoment(r) > max ? rowMoment(r) : max),
      card.rows[0] ? rowMoment(card.rows[0]) : "",
    );
  }

  return list.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

const listQuerySchema = z.object({
  status: z.enum(["all", "queued", "posted", "rejected"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(DEFAULT_LIMIT),
});

const rowParamSchema = z.object({ id: z.string().uuid() });

const rejectSchema = z.object({
  reason: z.string().trim().min(MIN_REJECT_REASON).max(MAX_REJECT_REASON),
});

const iso = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

export const adminPostingRoute = new Hono<AppEnv>()
  /**
   * GET /v1/admin/posting/publications
   * Последние публикации карточками материалов: очередь, вышедшее и снятое.
   */
  .get("/posting/publications", zValidator("query", listQuerySchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");
    const q = c.req.valid("query");

    // Свежесть строки — по последнему событию, а не по созданию: снятая вчера
    // публикация важнее вышедшей неделю назад.
    const moment = sql<string>`coalesce(${channels.rejectedAt}, ${channels.postedAt}, ${channels.createdAt})`;

    const rows = await db
      .select({
        id: channels.id,
        articleId: channels.articleId,
        slug: articles.slug,
        title: articles.tease,
        channel: channels.channel,
        format: channels.format,
        status: channels.status,
        postedAt: channels.postedAt,
        rejectedAt: channels.rejectedAt,
        rejectedReason: channels.rejectedReason,
        postRef: channels.postRef,
        attempts: channels.attempts,
        lastError: channels.lastError,
        createdAt: channels.createdAt,
      })
      .from(channels)
      .innerJoin(articles, eq(articles.id, channels.articleId))
      .where(q.status === "all" ? undefined : eq(channels.status, q.status))
      .orderBy(desc(moment))
      .limit(q.limit);

    // Счётчики — по ВСЕЙ таблице, а не по принесённой странице: иначе фильтр
    // «Снято (2)» показывал бы двойку только пока снятое попадает в окно.
    const countRows = await db
      .select({ status: channels.status, count: sql<number>`count(*)::int` })
      .from(channels)
      .groupBy(channels.status);

    const counts = { queued: 0, posted: 0, rejected: 0, all: 0, queuedFresh: 0 };
    for (const r of countRows) {
      if (r.status === "queued" || r.status === "posted" || r.status === "rejected") {
        counts[r.status] = Number(r.count);
      }
      counts.all += Number(r.count);
    }

    // Сколько строк очереди слот реально возьмёт. Считаем той же границей, что
    // и конвейер, — иначе экран и слот разошлись бы в понимании «в очереди».
    const [fresh] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(channels)
      .where(
        and(
          eq(channels.status, "queued"),
          gte(channels.createdAt, new Date(Date.now() - POST_SLOT_STALE_HOURS * 3_600_000)),
        ),
      );
    counts.queuedFresh = Number(fresh?.count ?? 0);

    const now = new Date();
    const items = groupPublications(
      rows.map((r) => {
        const row = {
          ...r,
          postedAt: iso(r.postedAt),
          rejectedAt: iso(r.rejectedAt),
          createdAt: iso(r.createdAt) ?? "",
        };
        return { ...row, staleForSlot: isStaleForSlot(row, now) };
      }),
    );

    return c.json({
      items,
      counts,
      status: q.status,
      limit: q.limit,
      truncated: rows.length === q.limit,
    });
  })

  /**
   * POST /v1/admin/posting/publications/:id/reject
   * Отмечает, что публикацию сняла площадка. Причина обязательна.
   */
  .post(
    "/posting/publications/:id/reject",
    zValidator("param", rowParamSchema),
    zValidator("json", rejectSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "content.publish");
      const { id } = c.req.valid("param");
      const { reason } = c.req.valid("json");

      const [row] = await db
        .select({ id: channels.id, status: channels.status })
        .from(channels)
        .where(eq(channels.id, id))
        .limit(1);
      if (!row) return c.json({ error: "not_found", id }, 404);

      const gate = checkRejectable(row);
      if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

      const [updated] = await db
        .update(channels)
        .set({ status: "rejected", rejectedAt: sql`now()`, rejectedReason: reason })
        .where(and(eq(channels.id, id), eq(channels.status, "posted")))
        .returning({
          id: channels.id,
          status: channels.status,
          rejectedAt: channels.rejectedAt,
          rejectedReason: channels.rejectedReason,
        });

      // Условие статуса в WHERE — защита от двух одновременных нажатий: второе
      // не найдёт строку и не затрёт причину, записанную первым.
      if (!updated) return c.json({ error: "already_rejected", id }, 409);

      return c.json({ ...updated, rejectedAt: iso(updated.rejectedAt) });
    },
  )

  /**
   * POST /v1/admin/posting/publications/:id/requeue
   * Возвращает снятую публикацию в очередь — след снятия остаётся.
   */
  .post("/posting/publications/:id/requeue", zValidator("param", rowParamSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.publish");
    const { id } = c.req.valid("param");

    const [row] = await db
      .select({ id: channels.id, status: channels.status })
      .from(channels)
      .where(eq(channels.id, id))
      .limit(1);
    if (!row) return c.json({ error: "not_found", id }, 404);

    const gate = checkRequeueable(row);
    if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

    const [updated] = await db
      .update(channels)
      .set(buildRequeuePatch(new Date()))
      .where(and(eq(channels.id, id), eq(channels.status, "rejected")))
      .returning({ id: channels.id, status: channels.status });

    if (!updated) return c.json({ error: "invalid_state", id }, 409);
    return c.json(updated);
  });
