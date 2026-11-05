import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { CLIENT_KIND_HEADER, type ClientKind, type Contract } from "@starter/contracts";
import { sql } from "drizzle-orm";

import { allTables } from "../src/db/schema.ts";
import { createPasswordHasher } from "../src/features/auth/password.ts";
import { createDatabase } from "../src/platform/db.ts";
import { createHttpApp } from "../src/platform/http.ts";
import { createNotificationHub } from "../src/platform/notification-hub.ts";
import { testDatabaseUrl } from "./database-url.ts";

export const TEST_JWT_SECRET = "test-secret-that-is-at-least-32-characters";
export type Api = ContractRouterClient<Contract>;

/** A minimal browser-like cookie store: remembers Set-Cookie values and sends them back. */
export class CookieJar {
  readonly cookies = new Map<string, string>();
  readonly received: string[] = [];

  store(setCookies: string[]) {
    for (const header of setCookies) {
      this.received.push(header);
      const [pair = ""] = header.split(";");
      const [name = "", value = ""] = pair.split("=");
      if (/max-age=0/i.test(header) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

interface ClientOptions {
  /** `null` sends no client-kind header at all. */
  kind: ClientKind | null;
  accessToken?: string;
  jar?: CookieJar;
}

/**
 * Boots the real HTTP app against the test database with a controllable clock and a cheap
 * password hash. Calls go through `app.fetch`, so routing, CORS, cookies and validation are real.
 * Each test app has its own notification hub (its own LISTEN connection), like a server instance.
 */
export function createTestApp() {
  let now = new Date();
  const database = createDatabase(testDatabaseUrl());
  const notificationHub = createNotificationHub(testDatabaseUrl());
  const app = createHttpApp(
    {
      db: database.db,
      now: () => now,
      passwords: createPasswordHasher(2 ** 10),
      jwtSecret: TEST_JWT_SECRET,
      cookieSecure: true,
      notificationHub,
    },
    { corsOrigins: ["http://localhost:5173"] },
  );

  function client({ kind, accessToken, jar }: ClientOptions): Api {
    const link = new RPCLink({
      url: "http://localhost/rpc",
      headers: () => ({
        ...(kind && { [CLIENT_KIND_HEADER]: kind }),
        ...(accessToken && { authorization: `Bearer ${accessToken}` }),
        ...(jar && jar.cookies.size > 0 && { cookie: jar.header() }),
      }),
      fetch: async (request) => {
        const response = await app.fetch(request);
        jar?.store(response.headers.getSetCookie());
        return response;
      },
    });
    return createORPCClient(link);
  }

  let counter = 0;
  /** Signs up a fresh user as a native client and returns an API client acting as that user. */
  async function signUp(nickname = `user${++counter}`) {
    const session = await client({ kind: "native" }).auth.signup({
      email: `${nickname}@example.com`,
      password: "password1",
      nickname,
    });
    return { session, api: client({ kind: "native", accessToken: session.accessToken }) };
  }

  return {
    app,
    db: database.db,
    client,
    signUp,
    advanceClock(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** Resolves once the notification hub is LISTENing. */
    ready: () => notificationHub.ready(),
    async reset() {
      now = new Date();
      await database.db.execute(sql`TRUNCATE ${allTables} CASCADE`);
      await notificationHub.ready();
    },
    async close() {
      await notificationHub.close();
      await database.close();
    },
  };
}
