import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CLIENT_KIND_HEADER, clientKindSchema } from "@starter/contracts";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

import { router } from "../router.ts";
import type { Dependencies } from "./context.ts";

/**
 * `@hono/node-server`가 env로 넘기는 값 중 여기서 쓰는 부분. 테스트는 같은 모양으로 연결 주소를 준다.
 */
type Bindings = { incoming?: { socket: { remoteAddress?: string } } };

/**
 * 요청 횟수 제한이 세는 클라이언트 IP(RATE 규칙 5). 기본은 연결의 원격 주소이고, 프록시 뒤에서
 * `trustProxy`를 켰을 때만 X-Forwarded-For의 첫 주소를 쓴다. 꺼져 있으면 위조한 헤더는 무시된다.
 */
function clientIp(c: Context<{ Bindings: Bindings }>, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return c.env.incoming?.socket.remoteAddress ?? "unknown";
}

export function createHttpApp(
  deps: Dependencies,
  options: { corsOrigins: string[]; trustProxy: boolean },
) {
  const handler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        // 예상한 오류(검증, 인증, 찾을 수 없음)는 계약의 일부이므로 버그만 로그로 남긴다.
        if (!(error instanceof ORPCError) || error.status >= 500) console.error(error);
      }),
    ],
  });

  const app = new Hono<{ Bindings: Bindings }>();

  app.get("/health", (c) => c.json({ ok: true }));

  app.use(
    "/rpc/*",
    cors({
      origin: options.corsOrigins,
      credentials: true,
      allowHeaders: ["content-type", "authorization", CLIENT_KIND_HEADER],
    }),
  );

  app.use("/rpc/*", async (c, next) => {
    const resHeaders = new Headers();
    const kind = clientKindSchema.safeParse(c.req.header(CLIENT_KIND_HEADER));
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/rpc",
      context: {
        ...deps,
        // 헤더가 없거나 모르는 값이면 네이티브로 본다. 네이티브는 쿠키를 읽지 않는다.
        clientKind: kind.success ? kind.data : "native",
        clientIp: clientIp(c, options.trustProxy),
        reqHeaders: c.req.raw.headers,
        resHeaders,
      },
    });
    if (!matched) return next();

    const headers = new Headers(response.headers);
    for (const cookie of resHeaders.getSetCookie()) headers.append("set-cookie", cookie);
    for (const [key, value] of resHeaders) if (key !== "set-cookie") headers.set(key, value);
    for (const [key, value] of c.res.headers) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  });

  return app;
}
