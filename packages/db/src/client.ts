import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Drizzle client поверх node-postgres (Pool).
 *
 * До session 14 использовался `@neondatabase/serverless` (one-shot HTTP fetch
 * через Neon proxy). После переезда на Timeweb DBaaS PostgreSQL — обычный
 * TCP connection pool через `pg`. Это даёт:
 *  - реальные транзакции (BEGIN/COMMIT) — раньше neon-http был one-shot
 *  - connection re-use → меньше latency на повторных запросах
 *  - prepared statements cache
 *
 * Pool кэшируется per connection string — на CF Workers (если когда-нибудь
 * вернёмся) это бы создавало pool per isolate; здесь (Node) кэш shared в
 * пределах процесса.
 */

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

const pools = new Map<string, Pool>();

export function createDb(connectionString: string): Database {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      // Conservative defaults для App Platform — 4 dyno × 10 connections = 40,
      // Timeweb DBaaS Postgres базовый план поддерживает ~100 concurrent.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pools.set(connectionString, pool);
  }
  return drizzle(pool, { schema });
}

/**
 * Закрыть все pools (для graceful shutdown — Inngest worker, scripts).
 * Не нужно для long-running HTTP сервера.
 */
export async function closeAllPools(): Promise<void> {
  await Promise.all(Array.from(pools.values()).map((p) => p.end()));
  pools.clear();
}

export { schema };
