import { ORPCError } from "@orpc/client";

import { formatWait } from "./format";

const SESSION_ENDED = "Your session has ended. Please sign in again.";

function retryAfterSeconds(data: unknown): number | null {
  if (typeof data !== "object" || data === null || !("retryAfterSeconds" in data)) return null;
  return typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
}

/** Turns anything a call can throw into one sentence for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return "Email or password is incorrect.";
      case "ACCOUNT_LOCKED": {
        const seconds = retryAfterSeconds(error.data);
        return seconds
          ? `Too many failed attempts. Try again in ${formatWait(seconds)}.`
          : "Too many failed attempts. Try again later.";
      }
      case "EMAIL_TAKEN":
        return "This email is already registered. Try signing in instead.";
      case "BAD_REQUEST":
        return "Some details are not valid. Check them and try again.";
      case "UNAUTHORIZED":
      case "INVALID_REFRESH_TOKEN":
        return SESSION_ENDED;
      case "FORBIDDEN":
        return "Only the author can do this.";
      case "NOT_FOUND":
        return "This no longer exists. It may have been deleted.";
    }
    if (error.status >= 500) return "Something went wrong on our side. Try again in a moment.";
    return error.message;
  }
  if (isNetworkError(error)) return "Can't reach the server. Check your connection and try again.";
  return "Something went wrong. Try again.";
}

// React Native's fetch rejects with a TypeError; expo/fetch with an Error whose message starts with
// "fetch failed". oRPC passes both through unchanged.
function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.message.startsWith("fetch failed"))
  );
}

const MAX_RETRIES = 2;

/** TanStack Query retry policy: an error response below 500 is an answer, so retrying cannot help. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ORPCError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}
