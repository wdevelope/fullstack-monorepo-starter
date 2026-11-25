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

/** 브라우저를 흉내 낸 최소한의 쿠키 저장소다. Set-Cookie 값을 기억했다가 다시 보낸다. */
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
  /** `null`이면 client-kind 헤더를 아예 보내지 않는다. */
  kind: ClientKind | null;
  accessToken?: string;
  jar?: CookieJar;
}

/**
 * 테스트 데이터베이스에 붙은 실제 HTTP 앱을, 조절할 수 있는 시계와 값싼 비밀번호 해시로 띄운다.
 * 호출은 `app.fetch`를 거치므로 라우팅, CORS, 쿠키, 검증이 모두 실제와 같다.
 * 테스트 앱마다 서버 인스턴스처럼 자기 알림 허브(자기 LISTEN 연결)를 가진다.
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
  /** 새 사용자를 네이티브 클라이언트로 가입시키고, 그 사용자로 호출하는 API 클라이언트를 돌려준다. */
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
    /** 서버가 보는 현재 시각. 테스트에서 직접 토큰을 만들 때 쓴다. */
    now: () => now,
    advanceClock(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** 알림 허브가 LISTEN을 시작하면 resolve된다. */
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
