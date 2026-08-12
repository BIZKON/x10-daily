import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, kbDocuments, kbImports, kbShelves, ne, sql } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * База знаний клиента — раздел, из которого система узнаёт о его бизнесе
 * (миграция 0024, реестр разрыва §3.1).
 *
 * Смысл одной фразой: в чате контекст — часть запроса, здесь контекст — часть
 * системы. Клиент один раз рассказывает о себе, дальше все агенты пишут, зная
 * его продукты, цены, возражения и запреты.
 *
 * 🔴 Полка и вопрос анкеты — одна сущность, а не два экрана. Поле `question`
 * лежит в самой полке, поэтому режим анкеты — это другой способ показать те же
 * данные, а не отдельная труба. Как только на полке появляется материал, она
 * перестаёт быть вопросом и становится полкой; никакой синхронизации между
 * двумя представлениями не требуется, потому что представление одно.
 *
 * Права: смотреть — `content.view` (наблюдателю знание о бизнесе видеть можно,
 * это не деньги), менять — `catalog.manage`, как у источников и рубрик.
 */

/**
 * Материал не должен раздувать промпт: полка целиком уезжает в запрос.
 *
 * 🔴 Потолок обязан совпадать с `KB_BODY_LIMIT` в `@x10/agents`: воркер пишет
 * найденное на сайте НАПРЯМУЮ в базу, минуя этот маршрут. Разъедутся — человек
 * не сможет сохранить предложение после правки, и причина будет неочевидна.
 * Договор закреплён тестом `admin-knowledge-import.test.ts`.
 */
export const MAX_BODY = 20_000;

const KNOWLEDGE_IMPORT_REQUESTED = "knowledge/import.requested" as const;

let cachedClient: Inngest | undefined;
function getInngest(env: ReturnType<typeof getEnv>): Inngest {
  if (cachedClient) return cachedClient;
  cachedClient = new Inngest({
    id: "x10-api",
    eventKey: env.INNGEST_EVENT_KEY,
    isDev: env.NODE_ENV !== "production",
  });
  return cachedClient;
}

/**
 * Привести адрес сайта к тому, что можно обходить.
 *
 * Человек пишет «veles.ru» или кидает ссылку на внутреннюю страницу с utm — и
 * то и другое значит «мой сайт». Обходим мы всегда корень, поэтому путь и
 * параметры отбрасываем здесь, а не гадаем о них в воркере.
 *
 * 🔴 Внутренние имена отсекаем ЗДЕСЬ, хотя загрузчик отсечёт их снова. Дело не
 * в защите — она там, — а в объяснении: отказ на вводе называет причину сразу,
 * а не после минуты ожидания и пустого отчёта.
 */
export function normalizeSiteUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Введите адрес сайта." };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: "Это не похоже на адрес сайта. Пример: veles-logistics.ru" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Поддерживаются только адреса http и https." };
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    !host.includes(".")
  ) {
    return { ok: false, message: "Такой адрес недоступен. Нужен адрес сайта в интернете." };
  }

  return { ok: true, url: `${url.origin}/` };
}

export type AcceptGate = { ok: true } | { ok: false; error: string; message: string };

/**
 * Можно ли принять материал.
 *
 * Принимают только предложенное. Молча пропустить повторное нажатие нельзя:
 * человек не поймёт, сработала кнопка или нет.
 */
export function checkAcceptable(row: { status: string }): AcceptGate {
  if (row.status !== "proposed") {
    return {
      ok: false,
      error: "not_proposed",
      message:
        row.status === "ready"
          ? "Этот материал уже принят."
          : "Принять можно только то, что система предложила по ссылке.",
    };
  }
  return { ok: true };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(MAX_BODY),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().trim().min(1).max(MAX_BODY).optional(),
});

const slugParam = z.object({ slug: z.string().trim().min(1).max(48) });
const idParam = z.object({ id: z.string().uuid() });

/** Адрес сайта клиента. Приводим его к корню в `normalizeSiteUrl`. */
const importSchema = z.object({ siteUrl: z.string().trim().min(1).max(300) });

export const adminKnowledgeRoute = new Hono<AppEnv>()
  /**
   * Полки со счётчиками. Отдаём и `filled` — сколько обязательных полок уже
   * наполнено: по нему экран решает, показать анкету или картотеку полок.
   * Решение принимает сервер, а не вёрстка, — иначе два места будут считать
   * «пусто ли» по-разному.
   */
  .get("/knowledge", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const rows = await db
      .select({
        id: kbShelves.id,
        slug: kbShelves.slug,
        title: kbShelves.title,
        purpose: kbShelves.purpose,
        question: kbShelves.question,
        hint: kbShelves.hint,
        position: kbShelves.position,
        required: kbShelves.required,
        // Считаем только готовое: материал в разборе ещё не знание.
        documents: sql<number>`count(${kbDocuments.id}) filter (where ${kbDocuments.status} = 'ready')`,
        chars: sql<number>`coalesce(sum(${kbDocuments.charCount}) filter (where ${kbDocuments.status} = 'ready'), 0)`,
      })
      .from(kbShelves)
      .leftJoin(kbDocuments, eq(kbDocuments.shelfId, kbShelves.id))
      .where(eq(kbShelves.enabled, true))
      .groupBy(kbShelves.id)
      .orderBy(asc(kbShelves.position));

    const shelves = rows.map((r) => ({
      ...r,
      documents: Number(r.documents),
      chars: Number(r.chars),
    }));
    const required = shelves.filter((s) => s.required);
    const filled = required.filter((s) => s.documents > 0).length;

    return c.json({
      items: shelves,
      progress: {
        required: required.length,
        filled,
        /**
         * Пока не заполнена ни одна обязательная полка, экран открывается
         * анкетой: пустая картотека ничего не объясняет и читается как
         * поломка. Дальше показываем полки — вернувшийся клиент хочет
         * докинуть материал, а не проходить опрос заново.
         */
        mode: filled === 0 ? ("survey" as const) : ("shelves" as const),
      },
    });
  })

  /** Полка целиком: её описание и материалы, свежие сверху. */
  .get("/knowledge/:slug", zValidator("param", slugParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");
    const { slug } = c.req.valid("param");

    const [shelf] = await db.select().from(kbShelves).where(eq(kbShelves.slug, slug)).limit(1);
    if (!shelf) return c.json({ error: "not_found", message: "Такой полки нет." }, 404);

    /**
     * 🔴 Предложенное сюда НЕ попадает. Полка отвечает на вопрос «что система
     * знает о моём бизнесе», и непринятое предложение сделало бы этот ответ
     * неправдой ровно там, где человек ему верит. Разбор живёт на своём экране.
     */
    const documents = await db
      .select({
        id: kbDocuments.id,
        title: kbDocuments.title,
        source: kbDocuments.source,
        body: kbDocuments.body,
        status: kbDocuments.status,
        statusReason: kbDocuments.statusReason,
        charCount: kbDocuments.charCount,
        createdAt: kbDocuments.createdAt,
      })
      .from(kbDocuments)
      .where(and(eq(kbDocuments.shelfId, shelf.id), ne(kbDocuments.status, "proposed")))
      .orderBy(desc(kbDocuments.createdAt));

    return c.json({ shelf, documents });
  })

  /**
   * Добавить материал на полку.
   *
   * Источник здесь всегда `answer` — это текст, который человек написал или
   * вставил руками. Загрузка файлов появится отдельно и поставит `file`:
   * у неё другой путь (извлечение текста, состояние `parsing`), и делать вид,
   * что это одно действие, значило бы обещать разбор, которого пока нет.
   */
  .post(
    "/knowledge/:slug/documents",
    zValidator("param", slugParam),
    zValidator("json", createSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const me = await requirePermission(c, db, "catalog.manage");
      const { slug } = c.req.valid("param");
      const body = c.req.valid("json");

      const [shelf] = await db
        .select({ id: kbShelves.id })
        .from(kbShelves)
        .where(and(eq(kbShelves.slug, slug), eq(kbShelves.enabled, true)))
        .limit(1);
      if (!shelf) return c.json({ error: "not_found", message: "Такой полки нет." }, 404);

      const [row] = await db
        .insert(kbDocuments)
        .values({
          shelfId: shelf.id,
          title: body.title,
          body: body.body,
          source: "answer",
          status: "ready",
          // Считает сервер: длина — производное от текста, и клиент не должен
          // иметь возможности прислать своё число.
          charCount: body.body.length,
          createdBy: me.userId,
        })
        .returning({ id: kbDocuments.id });

      return c.json({ id: row?.id }, 201);
    },
  )

  .patch(
    "/knowledge/documents/:id",
    zValidator("param", idParam),
    zValidator("json", patchSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "catalog.manage");
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");

      if (patch.title === undefined && patch.body === undefined) {
        return c.json({ error: "empty_patch", message: "Нечего менять." }, 400);
      }

      const [row] = await db
        .update(kbDocuments)
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.body !== undefined ? { body: patch.body, charCount: patch.body.length } : {}),
          updatedAt: new Date(),
        })
        .where(eq(kbDocuments.id, id))
        .returning({ id: kbDocuments.id });

      if (!row) return c.json({ error: "not_found", message: "Материал не найден." }, 404);
      return c.json({ id: row.id });
    },
  )

  /**
   * Удалить материал. Без корзины и без мягкого удаления: знание удаляет тот,
   * кто его завёл, и восстановить его дешевле пересказом, чем механикой
   * отмены, которую пришлось бы объяснять в интерфейсе.
   */
  .delete("/knowledge/documents/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "catalog.manage");
    const { id } = c.req.valid("param");

    const [row] = await db
      .delete(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .returning({ id: kbDocuments.id });

    if (!row) return c.json({ error: "not_found", message: "Материал не найден." }, 404);
    return c.json({ ok: true });
  })

  /* ── База знаний по ссылке ──────────────────────────────────────────────
   * Клиент даёт адрес сайта, система читает его и ПРЕДЛАГАЕТ материалы. Час в
   * анкете заменяется одной кнопкой, но решение остаётся за человеком.
   *
   * Права: `catalog.manage` — обход тратит деньги клиента и ходит по чужому
   * сайту от нашего имени. Наблюдателю и автору этого не доверяем.
   * ------------------------------------------------------------------- */

  .post("/knowledge/import", zValidator("json", importSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "catalog.manage");
    const body = c.req.valid("json");

    const site = normalizeSiteUrl(body.siteUrl);
    if (!site.ok) return c.json({ error: "bad_url", message: site.message }, 400);

    // Два обхода разом — это два счёта и два набора предложений на разбор.
    const [running] = await db
      .select({ id: kbImports.id })
      .from(kbImports)
      .where(inArray(kbImports.status, ["queued", "running"]))
      .limit(1);
    if (running) {
      return c.json(
        {
          error: "already_running",
          message: "Обход сайта уже идёт. Дождитесь его окончания.",
          id: running.id,
        },
        409,
      );
    }

    const [row] = await db
      .insert(kbImports)
      .values({ siteUrl: site.url, status: "queued", createdBy: me.userId })
      .returning({ id: kbImports.id });

    if (!row) return c.json({ error: "not_created", message: "Не удалось начать обход." }, 500);

    try {
      await getInngest(env).send({
        name: KNOWLEDGE_IMPORT_REQUESTED,
        data: { importId: row.id },
      });
    } catch (e) {
      /**
       * Событие и есть работа. Провалилось — задание навсегда осталось бы «в
       * очереди», и экран честно показывал бы ожидание того, что уже никогда
       * не начнётся.
       */
      await db
        .update(kbImports)
        .set({
          status: "failed",
          statusReason: "Не удалось поставить обход в очередь. Попробуйте ещё раз.",
          updatedAt: new Date(),
        })
        .where(eq(kbImports.id, row.id));

      console.error(
        `admin-knowledge: событие ${KNOWLEDGE_IMPORT_REQUESTED} не ушло для ${row.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return c.json(
        { error: "queue_failed", message: "Не удалось начать обход.", id: row.id },
        502,
      );
    }

    return c.json({ id: row.id, status: "queued", siteUrl: site.url }, 201);
  })

  /** Последний обход — по нему экран базы знаний решает, что показывать. */
  .get("/knowledge/imports/latest", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const [row] = await db
      .select({
        id: kbImports.id,
        siteUrl: kbImports.siteUrl,
        status: kbImports.status,
        statusReason: kbImports.statusReason,
        proposed: kbImports.proposed,
        createdAt: kbImports.createdAt,
        updatedAt: kbImports.updatedAt,
      })
      .from(kbImports)
      .orderBy(desc(kbImports.createdAt))
      .limit(1);

    return c.json({ item: row ?? null });
  })

  /**
   * Разбор одного обхода: что нашли, куда предлагаем и чего не нашлось.
   *
   * Предложения отдаём вместе с полками — экран группирует их по полкам, и
   * считать эту связь на клиенте значило бы завести второй порядок полок.
   */
  .get("/knowledge/imports/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");
    const { id } = c.req.valid("param");

    const [item] = await db.select().from(kbImports).where(eq(kbImports.id, id)).limit(1);
    if (!item) return c.json({ error: "not_found", message: "Обход не найден." }, 404);

    const documents = await db
      .select({
        id: kbDocuments.id,
        title: kbDocuments.title,
        body: kbDocuments.body,
        sourceUrl: kbDocuments.sourceUrl,
        charCount: kbDocuments.charCount,
        shelfSlug: kbShelves.slug,
        shelfTitle: kbShelves.title,
        shelfPosition: kbShelves.position,
      })
      .from(kbDocuments)
      .innerJoin(kbShelves, eq(kbDocuments.shelfId, kbShelves.id))
      .where(and(eq(kbDocuments.importId, id), eq(kbDocuments.status, "proposed")))
      .orderBy(asc(kbShelves.position), asc(kbDocuments.createdAt));

    return c.json({ item, documents });
  })

  /** Принять предложение: `proposed` → `ready`, и только теперь оно знание. */
  .post("/knowledge/documents/:id/accept", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "catalog.manage");
    const { id } = c.req.valid("param");

    const [row] = await db
      .select({ id: kbDocuments.id, status: kbDocuments.status })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .limit(1);
    if (!row) return c.json({ error: "not_found", message: "Материал не найден." }, 404);

    const gate = checkAcceptable(row);
    if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

    await db
      .update(kbDocuments)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(kbDocuments.id, id));

    return c.json({ id, status: "ready" });
  })

  /**
   * Принять всё найденное обходом. Без этой кнопки «принять» на двенадцати
   * материалах превращается в двенадцать нажатий, и человек перестаёт читать
   * уже на третьем.
   */
  .post("/knowledge/imports/:id/accept-all", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "catalog.manage");
    const { id } = c.req.valid("param");

    const rows = await db
      .update(kbDocuments)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(kbDocuments.importId, id), eq(kbDocuments.status, "proposed")))
      .returning({ id: kbDocuments.id });

    return c.json({ accepted: rows.length });
  });
