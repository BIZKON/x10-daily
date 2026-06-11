import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
};
