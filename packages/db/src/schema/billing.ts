import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { partnerDeals } from "./partners";
import { pipelineRuns } from "./pipeline";
import { users } from "./users";

/**
 * Деньги клиента (Спека 6, миграция 0020).
 *
 * Токены оплачиваем мы, клиент платит нам себестоимость ×3. Здесь живут три
 * вещи: сколько у него осталось, откуда это взялось и что про наши деньги знает
 * ЮKassa.
 *
 * Шаг 1 не останавливает конвейер и не берёт денег — он только двигает баланс,
 * чтобы на живом потоке стало видно, сходится ли расчёт с реальностью.
 */

/** `topup` — пополнение · `charge` — списание за прогон · `adjust` — ручная правка. */
export const balanceEntryKind = pgEnum("balance_entry_kind", ["topup", "charge", "adjust"]);

/** Назначение платежа. varchar + CHECK в базе: enum не умеет DROP VALUE. */
export const PAYMENT_PURPOSES = ["topup", "entry"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/** Повторяет статусы ЮKassa — чужую модель здесь не выдумываем. */
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "canceled"]);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    /**
     * id платежа в ЮKassa. NULL до ответа шлюза: строку создаём ПЕРЕД вызовом,
     * чтобы её id пошёл в `Idempotence-Key`. UNIQUE держит одноразовость
     * зачисления — ЮKassa повторяет уведомление, пока не получит 200.
     */
    providerPaymentId: varchar("provider_payment_id", { length: 64 }).unique(),
    amountRub: numeric("amount_rub", { precision: 14, scale: 4 }).notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    /** Кто нажал «Пополнить». SET NULL: увольнение не стирает факт платежа. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Почта плательщика — без неё касса не выбьет чек (54-ФЗ). Заполняется с шага 6. */
    payerEmail: varchar("payer_email", { length: 254 }),
    /** Момент зачисления на баланс. NULL = деньги ещё не зачислены. */
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    /**
     * За что платят (спека 7, миграция 0035): `topup` — пополнение баланса,
     * `entry` — вход в продукт. Третьим станет ежемесячное сопровождение.
     *
     * 🔴 Труба одна на оба назначения. Различает их это поле, а не второй
     * платёжный код: два кода — это два места, где платёж считается принятым, и
     * два места, где можно забыть чек 54-ФЗ.
     */
    purpose: varchar("purpose", { length: 16 }).$type<PaymentPurpose>().notNull().default("topup"),
    /** Заказ, за который платят. NULL у пополнения баланса — там заказа нет. */
    dealId: uuid("deal_id").references(() => partnerDeals.id, { onDelete: "set null" }),
    /** Что клиент видит в банке и в чеке — одна строка на оба места. */
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_deal_idx").on(t.dealId),
  ],
);

/**
 * Баланс экземпляра — ровно одна строка на копию системы.
 *
 * `tenant_id` не вводим (решение 06.08.2026): клиента отличает сам экземпляр.
 * Синглтон держится типом ключа — boolean со значением true и CHECK в базе,
 * поэтому вторая строка не появится даже при вставке руками.
 */
export const clientBalance = pgTable("client_balance", {
  id: boolean("id").primaryKey().default(true),
  balanceRub: numeric("balance_rub", { precision: 14, scale: 4 }).notNull().default("0"),
  /**
   * Ниже этого остатка предупреждаем (шаг 2). 500 ₽ ≈ 12 публикаций ≈ три дня
   * при ритме 4 поста в день — человек успевает оплатить, а предупреждение не
   * превращается в фон.
   */
  lowThresholdRub: numeric("low_threshold_rub", { precision: 14, scale: 4 })
    .notNull()
    .default("500"),
  /**
   * Включён ли денежный контур в этой копии: остановка по нулю И предупреждения
   * о низком остатке. У клиента — true.
   *
   * У НАШЕЙ копии `false`: мы платим шлюзу напрямую и сами себе не переводим,
   * остаток тут уходит в минус и должен уходить. С включённым контуром она
   * каждый день получала бы ложное «деньги кончились» — а это способ научить
   * людей не читать тревоги. Миграция 0021 (переименован из `stop_on_zero`,
   * который описывал только половину поведения).
   */
  billingEnforced: boolean("billing_enforced").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

/**
 * Журнал движений — ответ на вопрос «почему остаток именно такой».
 *
 * Без него спор с клиентом неразрешим: остаток это одно число, а претензия
 * всегда про конкретный день.
 */
export const balanceEntries = pgTable(
  "balance_entries",
  {
    id: id(),
    kind: balanceEntryKind("kind").notNull(),
    /**
     * Со знаком: пополнение плюс, списание минус. Знак в самой сумме, а не в
     * отдельной колонке, — тогда остаток это буквально `sum(amount_rub)`, и
     * расхождение с `client_balance` видно одним запросом.
     */
    amountRub: numeric("amount_rub", { precision: 14, scale: 4 }).notNull(),
    /** Остаток ПОСЛЕ операции — чтобы показывать историю, не пересчитывая её. */
    balanceAfterRub: numeric("balance_after_rub", { precision: 14, scale: 4 }).notNull(),
    /**
     * 🔴 SET NULL, а не CASCADE. `pipeline_runs` удаляются каскадом вместе со
     * статьёй; при CASCADE удаление статьи стирало бы и запись о деньгах.
     */
    runId: uuid("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    /** Пояснение. Обязательно по смыслу для `adjust`: правка без причины = ошибка. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    /**
     * Один прогон — одно списание. Повторно списать сейчас неоткуда, но
     * инвариант должна держать база, а не аккуратность вызывающего кода.
     * NULL-ы в уникальном индексе не конфликтуют → пополнения не трогает.
     */
    uniqueIndex("balance_entries_run_uidx")
      .on(t.runId)
      .where(sql`kind = 'charge'`),
    index("balance_entries_created_idx").on(sql`${t.createdAt} desc`),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ClientBalance = typeof clientBalance.$inferSelect;
export type BalanceEntry = typeof balanceEntries.$inferSelect;
export type NewBalanceEntry = typeof balanceEntries.$inferInsert;
