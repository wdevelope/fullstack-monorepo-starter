import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CLIENT_KIND_HEADER, clientKindSchema } from "@starter/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { router } from "../router.ts";
import type { Dependencies } from "./context.ts";

export function createHttpApp(deps: Dependencies, options: { corsOrigins: string[] }) {
  const handler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        // 예상한 오류(검증, 인증, 찾을 수 없음)는 계약의 일부이므로 버그만 로그로 남긴다.
        if (!(error instanceof ORPCError) || error.status >= 500) console.error(error);
      }),
    ],
  });

  const app = new Hono();

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
        reqHeaders: c.req.raw.headers,
        resHeaders,
      },
    });
    if (!matched) return next();

    const headers = new Headers(response.headers);
    for (const cookie of resHeaders.getSetCookie()) headers.append("set-cookie", cookie);
    for (const [key, value] of c.res.headers) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  });

  return app;
}
