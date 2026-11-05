import { ORPCError } from "@orpc/client";

/** Turns an API error into a sentence for the user. Typed contract errors get specific wording. */
export function describeError(error: unknown): string {
  if (!(error instanceof ORPCError)) return "Could not reach the server. Check your connection.";

  switch (error.code) {
    case "ACCOUNT_LOCKED": {
      const seconds = (error.data as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60));
      return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "BAD_REQUEST":
      return "Some fields are not valid. Please check them and try again.";
    case "UNAUTHORIZED":
      return "Please sign in to continue.";
    case "INVALID_CREDENTIALS":
    case "EMAIL_TAKEN":
    case "FORBIDDEN":
    case "NOT_FOUND":
      return error.message;
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Only same-app paths are allowed as a post-login destination, so links cannot redirect off-site. */
export function safeRedirect(target: unknown): string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//")
    ? target
    : "/";
}
