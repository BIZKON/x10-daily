import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, kbDocuments, kbShelves, sql } from "@x10/db";
import { Hono } from "hono";
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

/** Материал не должен раздувать промпт: полка целиком уезжает в запрос. */
const MAX_BODY = 20_000;

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

    const shelves = rows.map((r) => ({ ...r, documents: Number(r.documents), chars: Number(r.chars) }));
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
      .where(eq(kbDocuments.shelfId, shelf.id))
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
  .post("/knowledge/:slug/documents", zValidator("param", slugParam), zValidator("json", createSchema), async (c) => {
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
  })

  .patch("/knowledge/documents/:id", zValidator("param", idParam), zValidator("json", patchSchema), async (c) => {
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
  })

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
  });
