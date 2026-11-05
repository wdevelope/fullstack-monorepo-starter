import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./platform/db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { db, close } = createDatabase(url);
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await close();
console.log("Migrations applied");
