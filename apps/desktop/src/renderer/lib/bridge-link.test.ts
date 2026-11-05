import { createORPCClient, isDefinedError, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { describe, expect, it, vi } from "vitest";

import { serializeError } from "../../shared/ipc-errors.ts";
import type { DesktopBridge, RendererContract } from "../../shared/ipc.ts";
import { createBridgeLink } from "./bridge-link.ts";

const POST_ID = "00000000-0000-4000-8000-0000000000aa";

describe("bridge link", () => {
  it("sends the dotted path and input to main and returns the data", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const rpc = vi.fn<DesktopBridge["rpc"]>(async () =>
      structuredClone({ ok: true as const, data: { id: POST_ID, createdAt } }),
    );
    const client: ContractRouterClient<RendererContract> = createORPCClient(createBridgeLink(rpc));

    const result = await client.posts.create({ title: "Hello", body: "World" });

    expect(rpc).toHaveBeenCalledWith("posts.create", { title: "Hello", body: "World" });
    expect(result).toEqual({ id: POST_ID, createdAt });
  });

  it("rethrows main's error as a typed ORPCError", async () => {
    const error = new ORPCError("FORBIDDEN", {
      defined: true,
      status: 403,
      message: "Only the author can do this.",
    });
    const rpc = vi.fn<DesktopBridge["rpc"]>(async () =>
      structuredClone({ ok: false as const, error: serializeError(error) }),
    );
    const client: ContractRouterClient<RendererContract> = createORPCClient(createBridgeLink(rpc));

    const thrown = await client.posts.delete({ id: POST_ID }).catch((caught: unknown) => caught);

    expect(thrown).toBeInstanceOf(ORPCError);
    expect(isDefinedError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
