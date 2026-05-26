import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NeonHttpDatabase<Schema>;

export function createDb(connectionString: string): Database {
  const sql: NeonQueryFunction<false, false> = neon(connectionString);
  return drizzle(sql, { schema });
}

export { schema };
