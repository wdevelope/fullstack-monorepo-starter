// E2E 서버를 띄우기 전에 테스트 DB의 요청 횟수 카운터를 비운다(apps/web/playwright.config.ts가 실행).
// E2E의 모든 요청은 같은 IP(127.0.0.1)에서 오므로, 비우지 않으면 한 시간 안에 여러 번 돌릴 때
// 가입 한도(RATE 규칙 1)에 걸린다. 이름에 "test"가 없는 DB에서는 실행을 거부한다.
import { sql } from "drizzle-orm";

import { rateLimitBuckets } from "../src/db/schema.ts";
import { createDatabase } from "../src/platform/db.ts";
import { testDatabaseUrl } from "./database-url.ts";

const database = createDatabase(testDatabaseUrl());
await database.db.execute(sql`TRUNCATE ${rateLimitBuckets}`);
await database.close();
