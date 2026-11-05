import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "../src/platform/db.ts";
import { testDatabaseUrl } from "./database-url.ts";

/** Rebuilds the test database from the committed migrations once per test run. */
export default async function setup() {
  const { db, close } = createDatabase(testDatabaseUrl());
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  } finally {
    await close();
  }
}
