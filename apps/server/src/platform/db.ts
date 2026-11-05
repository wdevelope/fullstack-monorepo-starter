import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../db/schema.ts";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(url: string): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, close: () => pool.end() };
}
