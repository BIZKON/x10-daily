import { createDb, type Database } from "@x10/db";

let cached: { url: string; db: Database } | undefined;

export function getDb(connectionString: string): Database {
  if (cached && cached.url === connectionString) return cached.db;
  cached = { url: connectionString, db: createDb(connectionString) };
  return cached.db;
}
