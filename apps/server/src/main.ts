import { serve } from "@hono/node-server";

import { createPasswordHasher } from "./features/auth/password.ts";
import { readConfig } from "./platform/config.ts";
import { createDatabase } from "./platform/db.ts";
import { createHttpApp } from "./platform/http.ts";
import { createNotificationHub } from "./platform/notification-hub.ts";

const config = readConfig();
const database = createDatabase(config.databaseUrl);
const notificationHub = createNotificationHub(config.databaseUrl);
await notificationHub.ready();

const app = createHttpApp(
  {
    db: database.db,
    now: () => new Date(),
    passwords: createPasswordHasher(),
    jwtSecret: config.jwtSecret,
    cookieSecure: config.cookieSecure,
    notificationHub,
  },
  { corsOrigins: config.corsOrigins, trustProxy: config.trustProxy },
);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`서버 실행 중: http://${info.address}:${info.port}`);
});

function shutdown() {
  // 열린 알림 스트림은 허브와 함께 끝나므로 서버가 닫기를 마칠 수 있다.
  void notificationHub.close();
  server.close(() => void database.close());
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
