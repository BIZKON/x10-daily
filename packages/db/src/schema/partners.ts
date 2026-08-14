import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { users } from "./users";

/**
 * Партнёрская программа (спека 14.08.2026, миграция 0034).
 *
 * Партнёр приводит клиента и получает 20% с каждого ПОСТУПИВШЕГО платежа —
 * не с суммы договора: мы не платим раньше, чем получили сами. Наставник, то
 * есть тот, кто привёл самого партнёра, получает 5% сверх, из нашей маржи, и
 * только год с регистрации приведённого. Глубина строго один уровень.
 *
 * 🔴 Партнёр НЕ член команды. Роли `owner/editor/author/viewer` открывают
 * очередь, конвейер и расходы — партнёру там нечего делать. Доступ в кабинет
 * даёт строка в `partners`, а не роль, поэтому новых значений в PG-enum
 * `user_role` не появляется.
 */

export const PARTNER_STATUSES = ["active", "paused"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const DEAL_PACKAGES = ["manual", "line"] as const;
export type DealPackage = (typeof DEAL_PACKAGES)[number];

export const DEAL_STATUSES = ["negotiating", "awaiting_payment", "signed", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const ACCRUAL_REASONS = ["sale", "mentor", "refund", "manual"] as const;
export type AccrualReason = (typeof ACCRUAL_REASONS)[number];

export const partners = pgTable(
  "partners",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Адрес его версии КП: `/kp/<slug>/`. Пусто — персональной страницы нет. */
    slug: varchar("slug", { length: 64 }),
    name: varchar("name", { length: 160 }).notNull(),
    contact: varchar("contact", { length: 200 }),
    /** Ставка для НОВЫХ сделок. В сделку копируется, прошлое не переписывает. */
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull().default("20"),
    /** Кто пригласил. `null` — пришёл сам. Глубина начислений — один уровень. */
    parentId: uuid("parent_id"),
    status: varchar("status", { length: 16 }).$type<PartnerStatus>().notNull().default("active"),
    /** От этой даты живёт срок наставнических (`MENTOR_BONUS_MONTHS`). */
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Один человек — один партнёрский аккаунт: второй завёл бы вторую ветку
    // дерева на того же человека, и начисления разъехались бы между ними.
    uniqueIndex("partners_user_uidx").on(t.userId),
    index("partners_parent_idx").on(t.parentId),
  ],
);

export const partnerDeals = pgTable(
  "partner_deals",
  {
    id: id(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    clientName: varchar("client_name", { length: 200 }).notNull(),
    clientContact: varchar("client_contact", { length: 200 }),
    package: varchar("package", { length: 16 }).$type<DealPackage>().notNull(),
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    /** 🔴 Копия ставки на момент сделки — источник истины для начислений. */
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).$type<DealStatus>().notNull().default("negotiating"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partner_deals_partner_idx").on(t.partnerId, t.createdAt)],
);

export const dealPayments = pgTable(
  "deal_payments",
  {
    id: id(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => partnerDeals.id, { onDelete: "cascade" }),
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    /** Платёж ЮKassa, когда появится магазин. Пока платежи заводятся руками. */
    providerPaymentId: varchar("provider_payment_id", { length: 64 }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_payments_deal_idx").on(t.dealId, t.paidAt)],
);

export const partnerAccruals = pgTable(
  "partner_accruals",
  {
    id: id(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => dealPayments.id, { onDelete: "cascade" }),
    /** 0 — продавец, 1 — наставник. Третьего уровня нет. */
    level: integer("level").notNull().default(0),
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    /** Возврат приходит ОТРИЦАТЕЛЬНОЙ суммой — сеть не зарабатывает на возврате. */
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 16 }).$type<AccrualReason>().notNull().default("sale"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partner_accruals_partner_idx").on(t.partnerId, t.createdAt)],
);

export const partnerPayouts = pgTable(
  "partner_payouts",
  {
    id: id(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    /** Свободный текст: карта, СБП, счёт ИП. Справочник способов устарел бы. */
    method: varchar("method", { length: 64 }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partner_payouts_partner_idx").on(t.partnerId, t.paidAt)],
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type PartnerDeal = typeof partnerDeals.$inferSelect;
export type DealPayment = typeof dealPayments.$inferSelect;
export type PartnerAccrual = typeof partnerAccruals.$inferSelect;
export type PartnerPayout = typeof partnerPayouts.$inferSelect;
