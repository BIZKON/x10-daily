import { index, pgEnum, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

export const userRole = pgEnum("user_role", ["reader", "subscriber", "author", "editor", "admin"]);

export const userPlatform = pgEnum("user_platform", ["telegram", "max", "web"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    platform: userPlatform("platform").notNull(),
    platformUserId: varchar("platform_user_id", { length: 64 }).notNull(),
    username: varchar("username", { length: 64 }),
    displayName: varchar("display_name", { length: 128 }),
    email: varchar("email", { length: 254 }),
    role: userRole("role").notNull().default("reader"),
    locale: varchar("locale", { length: 8 }).notNull().default("ru"),
    avatarUrl: text("avatar_url"),
    ...timestamps,
  },
  (t) => [
    index("users_platform_uid_idx").on(t.platform, t.platformUserId),
    index("users_email_idx").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
