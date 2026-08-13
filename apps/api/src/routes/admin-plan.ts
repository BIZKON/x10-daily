import { zValidator } from "@hono/zod-validator";
import { PLAN_TOPICS_TARGET, buildCreationTopic } from "@x10/agents";
import {
  and,
  asc,
  contentPlans,
  creationModes,
  creations,
  desc,
  eq,
  gte,
  inArray,
  kbDocuments,
  lte,
  planItems,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import {
  PLAN_SLOTS,
  groupByDate,
  monthGrid,
  parseRange,
  parseView,
  periodBounds,
  weekDays,
} from "../lib/plan-calendar";

/**
 * Контент-план на месяц (спека 13.08, реестр разрыва §3.3).
 *
 * Обещан главной фишкой тарифа за 120 тысяч: «снимает главный вопрос — о чём
 * вообще писать и что зайдёт».
 *
 * 🔴 План НИЧЕГО не публикует. Тема — заготовка задания для раздела «Создать»:
 * кнопка «сделать» гонит её общим путём конвейера через HumanGate. Второй трубы
 * рядом не появляется — ровно как при отправке ручного материала в очередь.
 *
 * Права: смотреть — `content.view`, собирать и править — `content.edit`. Это
 * работа автора, как и создание материала.
 */

/** Сколько тем в месячном плане. Договор с агентом закреплён тестом. */
export const PLAN_MONTH_TOPICS = PLAN_TOPICS_TARGET;

const PLAN_BUILD_REQUESTED = "plan/build.requested" as const;
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

const idParam = z.object({ id: z.string().uuid() });
const moveSchema = z.object({
  plannedFor: z.string().trim().min(1).max(10),
  slot: z.string().trim().max(5).nullable().optional(),
});

export type PlanGate = { ok: true } | { ok: false; error: string; message: string };

/**
 * Можно ли сделать материал из темы.
 *
 * 🔴 Решает наличие задания, а не статус: статус мог не успеть обновиться, а
 * второе нажатие завело бы вторую статью с тем же текстом — в канал ушёл бы
 * дубль, а автор решил бы, что первая кнопка не сработала. Та же защита, что в
 * разделе «Создать».
 */
export function checkMakeable(row: { status: string; creationId: string | null }): PlanGate {
  if (row.creationId || row.status === "done") {
    return {
      ok: false,
      error: "already_made",
      message: "Из этой темы материал уже сделан.",
    };
  }
  if (row.status !== "planned") {
    return {
      ok: false,
      error: "not_planned",
      message: "Тема уже в работе. Дождитесь, пока задание выполнится.",
    };
  }
  return { ok: true };
}

/**
 * Куда можно перенести тему.
 *
 * Дату проверяем строго, а не через `new Date`: тот молча превращает 29 февраля
 * невисокосного года в 1 марта, и тема уехала бы на день вперёд без ведома
 * человека.
 */
export function checkMoveTarget(target: {
  plannedFor: string;
  slot?: string | null;
}): PlanGate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(target.plannedFor);
  if (!m) {
    return { ok: false, error: "bad_date", message: "Дата должна быть в виде ГГГГ-ММ-ДД." };
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== d) {
    return { ok: false, error: "bad_date", message: "Такой даты не существует." };
  }

  if (target.slot && !(PLAN_SLOTS as readonly string[]).includes(target.slot)) {
    return {
      ok: false,
      error: "bad_slot",
      message: `Время выхода выбирается из расписания: ${PLAN_SLOTS.join(", ")}.`,
    };
  }
  return { ok: true };
}

/** Первое число месяца, к которому относится дата. */
function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export const adminPlanRoute = new Hono<AppEnv>()
  /**
   * Календарь периода: темы, раскладка и состояние последней сборки.
   *
   * Границы периода и сетку считает СЕРВЕР — иначе вёрстка и запрос считали бы
   * неделю по-разному, и человек попадал бы то в одну неделю, то в другую.
   */
  .get("/plan", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.view");

    const view = parseView(c.req.query("view"));
    const range = parseRange(c.req.query("range"));
    const anchorRaw = c.req.query("anchor");
    const anchor =
      anchorRaw && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw)
        ? anchorRaw
        : new Date().toISOString().slice(0, 10);
    const bounds = periodBounds(range, anchor);

    const items = await db
      .select({
        id: planItems.id,
        plannedFor: planItems.plannedFor,
        slot: planItems.slot,
        category: planItems.category,
        modeSlug: planItems.modeSlug,
        title: planItems.title,
        angle: planItems.angle,
        rationale: planItems.rationale,
        status: planItems.status,
        creationId: planItems.creationId,
      })
      .from(planItems)
      .where(and(gte(planItems.plannedFor, bounds.start), lte(planItems.plannedFor, bounds.end)))
      .orderBy(asc(planItems.plannedFor), asc(planItems.slot), asc(planItems.position));

    const [plan] = await db
      .select({
        id: contentPlans.id,
        periodStart: contentPlans.periodStart,
        status: contentPlans.status,
        statusReason: contentPlans.statusReason,
        createdAt: contentPlans.createdAt,
      })
      .from(contentPlans)
      .orderBy(desc(contentPlans.createdAt))
      .limit(1);

    /**
     * Наполненность базы знаний отдаём экрану: пустая база — не повод показывать
     * кнопку, которая соберёт тридцать тем про отрасль вообще. Считает сервер,
     * чтобы экран и воркер отвечали на этот вопрос одинаково.
     */
    const [knowledge] = await db
      .select({ ready: sql<number>`count(*)` })
      .from(kbDocuments)
      .where(eq(kbDocuments.status, "ready"));

    return c.json({
      view,
      range,
      anchor,
      bounds,
      days: range === "week" ? weekDays(bounds.start) : undefined,
      grid: range === "month" ? monthGrid(bounds.start) : undefined,
      items,
      byDate: Object.fromEntries(groupByDate(items)),
      plan: plan ?? null,
      knowledgeReady: Number(knowledge?.ready ?? 0),
      slots: PLAN_SLOTS,
    });
  })

  /**
   * Собрать план на месяц.
   *
   * 🔴 Гейт пустой базы знаний стоит и здесь, хотя воркер проверяет то же самое.
   * Дело не в защите, а во времени: отказ на кнопке приходит сразу, а из воркера
   * человек ждал бы его минуту и получил бы строку «не удалось».
   */
  .post("/plan", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "content.edit");

    const [knowledge] = await db
      .select({ ready: sql<number>`count(*)` })
      .from(kbDocuments)
      .where(eq(kbDocuments.status, "ready"));
    if (Number(knowledge?.ready ?? 0) === 0) {
      return c.json(
        {
          error: "empty_knowledge",
          message:
            "В базе знаний пока пусто — плану не на что опереться. Заполните хотя бы одну полку, и соберём план по вашим услугам, ценам и возражениям.",
        },
        409,
      );
    }

    const [available] = await db
      .select({ id: creationModes.id })
      .from(creationModes)
      .where(and(eq(creationModes.enabled, true), eq(creationModes.available, true)))
      .limit(1);
    if (!available) {
      return c.json(
        { error: "no_formats", message: "Ни один формат не включён — план собирать не из чего." },
        409,
      );
    }

    const [running] = await db
      .select({ id: contentPlans.id })
      .from(contentPlans)
      .where(inArray(contentPlans.status, ["queued", "running"]))
      .limit(1);
    if (running) {
      return c.json(
        {
          error: "already_running",
          message: "План уже собирается. Дождитесь окончания.",
          id: running.id,
        },
        409,
      );
    }

    const period = monthStart(new Date().toISOString().slice(0, 10));
    const [row] = await db
      .insert(contentPlans)
      .values({ periodStart: period, status: "queued", createdBy: me.userId })
      .returning({ id: contentPlans.id });

    if (!row) return c.json({ error: "not_created", message: "Не удалось начать сборку." }, 500);

    try {
      await getInngest(env).send({ name: PLAN_BUILD_REQUESTED, data: { planId: row.id } });
    } catch (e) {
      // Событие и есть работа: без него сборка навсегда осталась бы «в очереди».
      await db
        .update(contentPlans)
        .set({
          status: "failed",
          statusReason: "Не удалось поставить сборку в очередь. Попробуйте ещё раз.",
          updatedAt: new Date(),
        })
        .where(eq(contentPlans.id, row.id));
      console.error(
        `admin-plan: событие ${PLAN_BUILD_REQUESTED} не ушло для ${row.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return c.json(
        { error: "queue_failed", message: "Не удалось начать сборку.", id: row.id },
        502,
      );
    }

    return c.json({ id: row.id, status: "queued", periodStart: period }, 201);
  })

  /**
   * Сделать материал из темы.
   *
   * Повторяет путь раздела «Создать» шаг в шаг: строка `creations` → событие →
   * агент → очередь → HumanGate. Тема отдаёт режим и текст задания, человек
   * ничего не перепечатывает.
   */
  .post("/plan/items/:id/make", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const me = await requirePermission(c, db, "content.edit");
    const { id } = c.req.valid("param");

    const [item] = await db
      .select({
        id: planItems.id,
        status: planItems.status,
        creationId: planItems.creationId,
        modeSlug: planItems.modeSlug,
        title: planItems.title,
        angle: planItems.angle,
      })
      .from(planItems)
      .where(eq(planItems.id, id))
      .limit(1);
    if (!item) return c.json({ error: "not_found", message: "Тема не найдена." }, 404);

    const gate = checkMakeable(item);
    if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

    const [mode] = await db
      .select({
        id: creationModes.id,
        title: creationModes.title,
        available: creationModes.available,
      })
      .from(creationModes)
      .where(eq(creationModes.slug, item.modeSlug))
      .limit(1);
    if (!mode || !mode.available) {
      return c.json(
        {
          error: "mode_unavailable",
          message: `Формат «${mode?.title ?? item.modeSlug}» сейчас недоступен.`,
        },
        409,
      );
    }

    const [creation] = await db
      .insert(creations)
      .values({
        modeId: mode.id,
        prompt: buildCreationTopic({ title: item.title, angle: item.angle }),
        status: "queued",
        createdBy: me.userId,
      })
      .returning({ id: creations.id });
    if (!creation) {
      return c.json({ error: "not_created", message: "Не удалось создать задание." }, 500);
    }

    await db
      .update(planItems)
      .set({ status: "running", creationId: creation.id, updatedAt: new Date() })
      .where(eq(planItems.id, id));

    try {
      await getInngest(env).send({
        name: CREATION_RUN_REQUESTED,
        data: { creationId: creation.id },
      });
    } catch (e) {
      await db
        .update(planItems)
        .set({ status: "planned", creationId: null, updatedAt: new Date() })
        .where(eq(planItems.id, id));
      console.error(
        `admin-plan: событие ${CREATION_RUN_REQUESTED} не ушло для ${creation.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return c.json(
        { error: "queue_failed", message: "Не удалось поставить задание в очередь." },
        502,
      );
    }

    return c.json({ creationId: creation.id, status: "running" }, 201);
  })

  /** Перенести тему на другой день или слот. */
  .patch(
    "/plan/items/:id",
    zValidator("param", idParam),
    zValidator("json", moveSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "content.edit");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const gate = checkMoveTarget(body);
      if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 400);

      const [row] = await db
        .update(planItems)
        .set({ plannedFor: body.plannedFor, slot: body.slot ?? null, updatedAt: new Date() })
        .where(eq(planItems.id, id))
        .returning({ id: planItems.id });

      if (!row) return c.json({ error: "not_found", message: "Тема не найдена." }, 404);
      return c.json({ id: row.id, plannedFor: body.plannedFor, slot: body.slot ?? null });
    },
  )

  /**
   * Убрать тему. Без мягкого удаления: непринятая тема ничего не значит, а
   * «корзину убранного» пришлось бы объяснять в интерфейсе. То же решение, что
   * с отклонением предложений базы знаний.
   */
  .delete("/plan/items/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "content.edit");
    const { id } = c.req.valid("param");

    const [row] = await db
      .delete(planItems)
      .where(eq(planItems.id, id))
      .returning({ id: planItems.id });
    if (!row) return c.json({ error: "not_found", message: "Тема не найдена." }, 404);
    return c.json({ ok: true });
  });
