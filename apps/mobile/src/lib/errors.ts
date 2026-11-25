import { ORPCError } from "@orpc/client";

import { formatWait } from "./format";

const SESSION_ENDED = "로그인이 필요해요.";

function retryAfterSeconds(data: unknown): number | null {
  if (typeof data !== "object" || data === null || !("retryAfterSeconds" in data)) return null;
  return typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
}

/** 호출이 던질 수 있는 모든 것을 사용자에게 보일 한 문장으로 바꾼다. */
export function errorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return "이메일 또는 비밀번호가 맞지 않아요.";
      case "ACCOUNT_LOCKED": {
        const seconds = retryAfterSeconds(error.data);
        return seconds
          ? `로그인 시도가 너무 많아요. ${formatWait(seconds)} 뒤에 다시 시도해 주세요.`
          : "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.";
      }
      case "TOO_MANY_REQUESTS": {
        const seconds = retryAfterSeconds(error.data);
        return seconds
          ? `요청이 너무 많아요. ${formatWait(seconds)} 뒤에 다시 시도해 주세요.`
          : "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
      }
      case "EMAIL_TAKEN":
        return "이미 가입한 이메일이에요. 로그인해 주세요.";
      case "BAD_REQUEST":
        return "입력한 내용을 다시 확인해 주세요.";
      case "UNAUTHORIZED":
      case "INVALID_REFRESH_TOKEN":
        return SESSION_ENDED;
      case "FORBIDDEN":
        return "작성자만 할 수 있어요.";
      case "NOT_FOUND":
        return "찾을 수 없어요. 삭제되었을 수 있어요.";
    }
    if (error.status >= 500) return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
    return error.message;
  }
  if (isNetworkError(error)) return "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.";
  return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}

// React Native의 fetch는 TypeError로, expo/fetch는 메시지가 "fetch failed"로 시작하는 Error로
// 거부한다. oRPC는 둘 다 그대로 넘긴다.
function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.message.startsWith("fetch failed"))
  );
}

const MAX_RETRIES = 2;

/** TanStack Query 재시도 정책: 500 미만의 오류 응답은 서버의 답이므로 재시도해도 소용없다. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ORPCError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}
