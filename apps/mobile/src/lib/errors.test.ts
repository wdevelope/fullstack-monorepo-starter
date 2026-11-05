import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { errorMessage, shouldRetry } from "./errors";

describe("errorMessage", () => {
  it("AUTH-5 says the credentials are wrong without saying which part", () => {
    const error = new ORPCError("INVALID_CREDENTIALS", { status: 401, defined: true });

    expect(errorMessage(error)).toBe("Email or password is incorrect.");
  });

  it("AUTH-6 tells a locked user how long to wait", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", {
      status: 423,
      defined: true,
      data: { retryAfterSeconds: 840 },
    });

    expect(errorMessage(error)).toBe("Too many failed attempts. Try again in 14 minutes.");
  });

  it("AUTH-6 still explains the lock when the wait time is missing", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", { status: 423 });

    expect(errorMessage(error)).toBe("Too many failed attempts. Try again later.");
  });

  it("AUTH-2 points an already registered email to sign-in", () => {
    const error = new ORPCError("EMAIL_TAKEN", { status: 409, defined: true });

    expect(errorMessage(error)).toBe("This email is already registered. Try signing in instead.");
  });

  it("AUTH-3 explains input the server rejected", () => {
    const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed" });

    expect(errorMessage(error)).toBe("Some details are not valid. Check them and try again.");
  });

  it("AUTH-12 asks the user to sign in again when the session is gone", () => {
    expect(errorMessage(new ORPCError("UNAUTHORIZED"))).toBe(
      "Your session has ended. Please sign in again.",
    );
    expect(errorMessage(new ORPCError("INVALID_REFRESH_TOKEN", { status: 401 }))).toBe(
      "Your session has ended. Please sign in again.",
    );
  });

  it("COM-4 says a missing post or comment may have been deleted", () => {
    expect(errorMessage(new ORPCError("NOT_FOUND", { defined: true }))).toBe(
      "This no longer exists. It may have been deleted.",
    );
  });

  it("COM-6 says only the author can change a post", () => {
    expect(errorMessage(new ORPCError("FORBIDDEN", { defined: true }))).toBe(
      "Only the author can do this.",
    );
  });

  it("hides server internals behind a generic message", () => {
    const error = new ORPCError("INTERNAL_SERVER_ERROR", { message: "relation does not exist" });

    expect(errorMessage(error)).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("treats a failed fetch as a connection problem", () => {
    const offline = "Can't reach the server. Check your connection and try again.";

    // React Native's own fetch, and expo/fetch, which Expo installs as the global fetch.
    expect(errorMessage(new TypeError("Network request failed"))).toBe(offline);
    expect(errorMessage(new Error("fetch failed: The Internet connection is offline."))).toBe(
      offline,
    );
  });

  it("falls back to a generic message for anything else", () => {
    expect(errorMessage("boom")).toBe("Something went wrong. Try again.");
  });
});

describe("shouldRetry", () => {
  it("does not retry answers the server gave on purpose", () => {
    expect(shouldRetry(0, new ORPCError("NOT_FOUND"))).toBe(false);
    expect(shouldRetry(0, new ORPCError("UNAUTHORIZED"))).toBe(false);
  });

  it("retries network and server failures twice", () => {
    const error = new TypeError("Network request failed");

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });
});
