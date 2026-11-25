import { createORPCErrorFromJson, isORPCErrorJson, ORPCError } from "@orpc/client";

import type { IpcResult, SerializedError } from "./ipc.ts";

/** 메인 쪽: 공개 필드만 남긴다. cause와 stack은 메인 프로세스에 남는다. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof ORPCError) return error.toJSON();
  console.error(error);
  // 서버에 닿지 못하면 fetch()는 TypeError로 거부된다.
  const replacement =
    error instanceof TypeError
      ? new ORPCError("SERVICE_UNAVAILABLE", {
          message: "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.",
        })
      : new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
        });
  return replacement.toJSON();
}

/** 렌더러 쪽: 진짜 `ORPCError`로 다시 만들어 `isDefinedError`와 `error.code`가 평소처럼 동작하게 한다. */
export function deserializeError(json: unknown): ORPCError<string, unknown> {
  if (isORPCErrorJson(json)) return createORPCErrorFromJson(json);
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "메인 프로세스에서 받은 오류의 형식이 잘못됐어요.",
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
