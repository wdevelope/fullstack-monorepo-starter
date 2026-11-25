import { ORPCError } from "@orpc/client";

/** API 오류를 사용자에게 보일 문장으로 바꾼다. 계약에 정의된 타입 있는 오류는 따로 문구를 정한다. */
export function describeError(error: unknown): string {
  if (!(error instanceof ORPCError))
    return "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.";

  switch (error.code) {
    case "ACCOUNT_LOCKED": {
      const seconds = (error.data as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60));
      return `로그인 시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해 주세요.`;
    }
    case "BAD_REQUEST":
      return "입력한 내용을 다시 확인해 주세요.";
    case "UNAUTHORIZED":
      return "로그인이 필요해요.";
    case "INVALID_CREDENTIALS":
    case "EMAIL_TAKEN":
    case "FORBIDDEN":
    case "NOT_FOUND":
    case "USER_NOT_FOUND":
    case "ALREADY_MEMBER":
      return error.message;
    default:
      return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
  }
}

/** 로그인 뒤 이동할 곳은 이 앱 안의 경로만 허용한다. 그래서 링크로 외부 사이트에 보낼 수 없다. */
export function safeRedirect(target: unknown): string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
    ? target
    : "/";
}
