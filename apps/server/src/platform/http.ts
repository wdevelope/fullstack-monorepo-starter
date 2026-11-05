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
        // Expected errors (validation, auth, not found) are part of the contract; log only bugs.
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
        // A missing or unknown header is treated as native, which never reads the cookie.
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
