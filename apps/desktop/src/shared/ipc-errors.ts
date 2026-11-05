import { createORPCErrorFromJson, isORPCErrorJson, ORPCError } from "@orpc/client";

import type { IpcResult, SerializedError } from "./ipc.ts";

/** Main side: keeps only the public fields. Causes and stacks stay in the main process. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof ORPCError) return error.toJSON();
  console.error(error);
  // fetch() rejects with a TypeError when the server cannot be reached.
  const replacement =
    error instanceof TypeError
      ? new ORPCError("SERVICE_UNAVAILABLE", { message: "Could not reach the server." })
      : new ORPCError("INTERNAL_SERVER_ERROR", { message: "Something went wrong." });
  return replacement.toJSON();
}

/** Renderer side: rebuilds a real `ORPCError`, so `isDefinedError` and `error.code` work as usual. */
export function deserializeError(json: unknown): ORPCError<string, unknown> {
  if (isORPCErrorJson(json)) return createORPCErrorFromJson(json);
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Malformed error from the main process.",
  });
}

export async function toIpcResult<T>(run: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw deserializeError(result.error);
}
