import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./platform/db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 설정되지 않았다");

const { db, close } = createDatabase(url);
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await close();
console.log("마이그레이션을 적용했다");
