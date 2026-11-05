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

/** Validation issues from the contract schema, whether main or the server caught them. */
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

/** The first message for each top-level field, e.g. `{ email: "Invalid email address" }`. */
export function fieldErrors(error: unknown): Partial<Record<string, string>> {
  const fields: Partial<Record<string, string>> = {};
  for (const issue of issuesOf(error)) {
    const field = issue.path[0];
    if (field !== undefined) fields[String(field)] ??= issue.message;
  }
  return fields;
}

/** One sentence for the user. Contract errors carry their own message; a few need context. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ORPCError)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "ACCOUNT_LOCKED": {
      const seconds = retryAfterSeconds(error.data);
      if (seconds === null) return error.message;
      const minutes = Math.ceil(seconds / 60);
      return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "BAD_REQUEST":
      return issuesOf(error).length > 0 ? "Please check the highlighted fields." : error.message;
    case "UNAUTHORIZED":
      return "Your session has ended. Please sign in again.";
    default:
      return error.message;
  }
}
