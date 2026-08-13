import { date, index, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { articleCategory } from "./articles";
import { creations } from "./creations";
import { users } from "./users";

/**
 * Контент-план на месяц (миграция 0031, реестр разрыва §3.3).
 *
 * Обещан главной фишкой тарифа за 120 тысяч. Строился после базы знаний
 * сознательно: качество плана упирается в тот же вход, что и качество постов —
 * при пустой базе получаются тридцать тем про отрасль вообще.
 *
 * 🔴 План НИЧЕГО не публикует. Тема — заготовка задания для раздела «Создать»:
 * человек нажимает «сделать», и материал идёт общим путём конвейера через
 * HumanGate. Второй трубы рядом не появляется.
 */

export const PLAN_STATUSES = ["queued", "running", "ready", "failed"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Сборка плана: один прогон агента на один месяц. */
export const contentPlans = pgTable(
  "content_plans",
  {
    id: id(),
    /** Первое число месяца, на который собран план. */
    periodStart: date("period_start").notNull(),
    status: varchar("status", { length: 16 }).$type<PlanStatus>().notNull().default("queued"),
    statusReason: text("status_reason"),
    /**
     * 🔴 Что реально ушло в модель из базы знаний. База меняется, и без снимка
     * на вопрос «почему такие темы» через неделю ответить нечем.
     */
    knowledgeUsed: text("knowledge_used"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("content_plans_period_idx").on(t.periodStart, t.createdAt)],
);

export const PLAN_ITEM_STATUSES = ["planned", "running", "done", "dropped"] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

/** Тема плана. */
export const planItems = pgTable(
  "plan_items",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => contentPlans.id, { onDelete: "cascade" }),
    plannedFor: date("planned_for").notNull(),
    /** Время выхода МСК. Пусто — день без времени, слот подберёт очередь. */
    slot: varchar("slot", { length: 5 }),
    /** Тот же сквозной рубрикатор, что у статей. */
    category: articleCategory("category").notNull().default("news"),
    /** Формат = слаг режима из `creation_modes`, только доступный. */
    modeSlug: varchar("mode_slug", { length: 48 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    /** Под каким углом раскрывать — уезжает в `CreationAgent` с заголовком. */
    angle: text("angle").notNull(),
    /**
     * 🔴 Почему эта тема и на что опирается в базе знаний. Это и есть товар:
     * тридцать заголовков придумает кто угодно, а связь с прайсом и
     * возражениями клиента показывает только обоснование.
     */
    rationale: text("rationale"),
    status: varchar("status", { length: 16 }).$type<PlanItemStatus>().notNull().default("planned"),
    /** Материал, сделанный из темы. */
    creationId: uuid("creation_id").references(() => creations.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("plan_items_calendar_idx").on(t.plannedFor, t.slot),
    index("plan_items_plan_idx").on(t.planId, t.status),
  ],
);

export type ContentPlan = typeof contentPlans.$inferSelect;
export type NewContentPlan = typeof contentPlans.$inferInsert;
export type PlanItem = typeof planItems.$inferSelect;
export type NewPlanItem = typeof planItems.$inferInsert;
