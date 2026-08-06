import { index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./users";

export const subscriptionTier = pgEnum("subscription_tier", ["free", "paid", "premium"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "trialing",
]);

export const subscriptionProvider = pgEnum("subscription_provider", [
  "telegram_stars",
  "yookassa",
  "manual",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: subscriptionTier("tier").notNull().default("free"),
    status: subscriptionStatus("status").notNull().default("active"),
    provider: subscriptionProvider("provider").notNull().default("manual"),
    providerSubscriptionId: varchar("provider_subscription_id", { length: 128 }),
    priceRub: integer("price_rub"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("subs_user_idx").on(t.userId, t.status),
    index("subs_period_idx").on(t.currentPeriodEnd),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
