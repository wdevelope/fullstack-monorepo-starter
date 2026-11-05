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
  { corsOrigins: config.corsOrigins },
);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Server listening on http://${info.address}:${info.port}`);
});

function shutdown() {
  // Open notification streams end with the hub, so the server can finish closing.
  void notificationHub.close();
  server.close(() => void database.close());
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
