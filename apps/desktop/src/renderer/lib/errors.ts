import { ORPCError } from "@orpc/client";

interface Issue {
  message: string;
  path: unknown[];
}

function isIssue(value: unknown): value is Issue {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "path" in value &&
    Array.isArray(value.path)
  );
}

/** 계약 스키마의 검증 문제. 메인이 잡았든 서버가 잡았든 같다. */
function issuesOf(error: unknown): Issue[] {
  if (!(error instanceof ORPCError) || error.code !== "BAD_REQUEST") return [];
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("issues" in data)) return [];
  return Array.isArray(data.issues) ? data.issues.filter(isIssue) : [];
}

function retryAfterSeconds(data: unknown): number | null {
  if (typeof data !== "object" || data === null || !("retryAfterSeconds" in data)) return null;
  return typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
}

/** 최상위 필드마다 첫 번째 메시지. 예: `{ email: "이메일 형식이 올바르지 않아요." }`. */
export function fieldErrors(error: unknown): Partial<Record<string, string>> {
  const fields: Partial<Record<string, string>> = {};
  for (const issue of issuesOf(error)) {
    const field = issue.path[0];
    if (field !== undefined) fields[String(field)] ??= issue.message;
  }
  return fields;
}

/** 사용자에게 보여 줄 한 문장. 계약 오류는 자기 메시지를 갖고 있고, 몇 가지만 맥락이 더 필요하다. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ORPCError)) return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
  switch (error.code) {
    case "ACCOUNT_LOCKED": {
      const seconds = retryAfterSeconds(error.data);
      if (seconds === null) return error.message;
      const minutes = Math.ceil(seconds / 60);
      return `로그인 시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해 주세요.`;
    }
    case "TOO_MANY_REQUESTS": {
      const seconds = retryAfterSeconds(error.data);
      if (seconds === null) return error.message;
      const wait = seconds < 60 ? `${seconds}초` : `${Math.ceil(seconds / 60)}분`;
      return `요청이 너무 많아요. ${wait} 뒤에 다시 시도해 주세요.`;
    }
    case "BAD_REQUEST":
      return issuesOf(error).length > 0 ? "입력한 내용을 다시 확인해 주세요." : error.message;
    case "UNAUTHORIZED":
      return "로그인이 필요해요.";
    default:
      return error.message;
  }
}
