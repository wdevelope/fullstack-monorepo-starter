import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "../src/platform/db.ts";
import { testDatabaseUrl } from "./database-url.ts";

/** 테스트를 실행할 때마다 한 번, 커밋된 마이그레이션으로 테스트 데이터베이스를 다시 만든다. */
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
