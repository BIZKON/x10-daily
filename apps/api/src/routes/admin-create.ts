import { zValidator } from "@hono/zod-validator";
import { creationModes, creations, desc, eq } from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";

/**
 * Раздел «Создать» — ручной режим (реестр разрыва §3.2).
 *
 * Человек выбирает режим, коротко говорит тему и получает материал. Разница с
 * чатом держится на поле `creation_modes.guidance`: «как делается правильно»
 * уже прописано внутри режима, поэтому от человека нужна только тема.
 *
 * Права: смотреть — `content.view`, создавать — `content.edit`. Создание
 * тратит деньги клиента, поэтому оно на праве правки, а не просмотра.
 */

/**
 * 🔴 Потолок темы обязан совпадать с `creationInputSchema.topic` в
 * `@x10/agents`. Разъедутся — api примет задание, а конвейер отвергнет его на
 * валидации входа, и человек увидит «не удалось создать» без объяснения.
 * Договор закреплён тестом `apps/api/test/admin-create.test.ts`.
 */
export const MAX_PROMPT = 2000;

const createSchema = z.object({
  modeSlug: z.string().trim().min(1).max(48),
  prompt: z.string().trim().min(1).max(MAX_PROMPT),
});

const idParam = z.object({ id: z.string().uuid() });

const CREATION_RUN_REQUESTED = "creation/run.requested" as const;

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

type ModeRow = { title: string; available: boolean; enabled: boolean };
export type ModeGate = { ok: true } | { ok: false; error: string; message: string };

/**
 * Можно ли работать этим режимом.
 *
 * Выключенный отвечает «нет такого»: он скрыт из списка, и признаться, что он
 * существует, значит показать человеку дверь, которую он не открывал и открыть
 * не может. А вот «готовится» — видимое состояние, и молчать о нём нельзя:
 * из шести режимов сегодня работает один, человек видит остальные и вправе
 * получить причину, а не общий отказ.
 */
export function checkMode(mode: ModeRow | undefined): ModeGate {
  if (!mode || !mode.enabled) {
    return { ok: false, error: "not_found", message: "Такого режима нет." };
  }
  if (!mode.available) {
    return {
      ok: false,
      error: "mode_unavailable",
      message: `Режим «${mode.title}» ещё готовится — материал по нему пока не создаётся.`,
    };
  }
  return { ok: true };
}

export const adminCreateRoute = new Hono<AppEnv>()
  /**
   * Режимы для экрана. Отдаём и недоступные: честная пометка «готовится»
   * объясняет, что будет дальше, а пустой экран из одной кнопки читается как
   * недоделка. Порядок задан позицией — он же порядок важности.
   */
  .get("/create/modes", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const items = await db
      .select({
        slug: creationModes.slug,
        title: creationModes.title,
        subtitle: creationModes.subtitle,
        purpose: creationModes.purpose,
        available: creationModes.available,
      })
      .from(creationModes)
      .where(eq(creationModes.enabled, true))
      .orderBy(creationModes.position);

    return c.json({ items });
  })

  /** Последние задания — лента раздела. Результат целиком здесь не нужен. */
  .get("/create", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const items = await db
      .select({
        id: creations.id,
        prompt: creations.prompt,
        status: creations.status,
        statusReason: creations.statusReason,
        articleId: creations.articleId,
        createdAt: creations.createdAt,
        modeSlug: creationModes.slug,
        modeTitle: creationModes.title,
      })
      .from(creations)
      .innerJoin(creationModes, eq(creations.modeId, creationModes.id))
      .orderBy(desc(creations.createdAt))
      .limit(50);

    return c.json({ items });
  })

  /**
   * Одно задание целиком — этим экран опрашивает готовность.
   *
   * `knowledgeUsed` отдаём: на вопрос «почему получилось так» отвечает именно
   * снимок знаний, ушедших в модель, а не пересказ по памяти.
   */
  .get("/create/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");
    const { id } = c.req.valid("param");

    const [row] = await db
      .select({
        id: creations.id,
        prompt: creations.prompt,
        status: creations.status,
        statusReason: creations.statusReason,
        result: creations.result,
        knowledgeUsed: creations.knowledgeUsed,
        articleId: creations.articleId,
        createdAt: creations.createdAt,
        updatedAt: creations.updatedAt,
        modeSlug: creationModes.slug,
        modeTitle: creationModes.title,
      })
      .from(creations)
      .innerJoin(creationModes, eq(creations.modeId, creationModes.id))
      .where(eq(creations.id, id))
      .limit(1);

    if (!row) return c.json({ error: "not_found", message: "Задание не найдено." }, 404);
    return c.json(row);
  })

  /**
   * Создать задание и поставить его в очередь.
   *
   * Строку заводим ДО события: она и есть то, что человек видит на экране, а
   * событие несёт только её id. Иначе пришлось бы дублировать тему и режим в
   * событии и получить второй источник правды, который разойдётся с базой.
   */
  .post("/create", zValidator("json", createSchema), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "content.edit");
    const body = c.req.valid("json");

    const [mode] = await db
      .select({
        id: creationModes.id,
        title: creationModes.title,
        available: creationModes.available,
        enabled: creationModes.enabled,
      })
      .from(creationModes)
      .where(eq(creationModes.slug, body.modeSlug))
      .limit(1);

    const gate = checkMode(mode);
    if (!gate.ok) {
      return c.json(
        { error: gate.error, message: gate.message },
        gate.error === "not_found" ? 404 : 409,
      );
    }
    // checkMode уже отверг пустой режим; условие для компилятора.
    if (!mode) return c.json({ error: "not_found", message: "Такого режима нет." }, 404);

    const [row] = await db
      .insert(creations)
      .values({
        modeId: mode.id,
        prompt: body.prompt,
        status: "queued",
        createdBy: me.userId,
      })
      .returning({ id: creations.id });

    if (!row) {
      return c.json({ error: "not_created", message: "Не удалось создать задание." }, 500);
    }

    try {
      await getInngest(env).send({
        name: CREATION_RUN_REQUESTED,
        data: { creationId: row.id },
      });
    } catch (e) {
      /**
       * 🔴 Событие и есть работа. Провалилось — задание навсегда осталось бы
       * «в очереди», и экран честно показывал бы ожидание того, что уже
       * никогда не начнётся. Помечаем сбой сразу, чтобы человек мог повторить.
       */
      await db
        .update(creations)
        .set({
          status: "failed",
          statusReason: "Не удалось поставить задание в очередь. Попробуйте ещё раз.",
          updatedAt: new Date(),
        })
        .where(eq(creations.id, row.id));

      console.error(
        `admin-create: событие ${CREATION_RUN_REQUESTED} не ушло для ${row.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return c.json(
        { error: "queue_failed", message: "Не удалось поставить задание в очередь.", id: row.id },
        502,
      );
    }

    return c.json({ id: row.id, status: "queued" }, 201);
  });
