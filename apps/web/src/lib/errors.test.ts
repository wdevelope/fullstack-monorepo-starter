import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { describeError, safeRedirect } from "./errors.ts";

describe("describeError", () => {
  it("AUTH-6 tells a locked-out user how many minutes to wait", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", { data: { retryAfterSeconds: 840 } });
    expect(describeError(error)).toBe("Too many failed attempts. Try again in 14 minutes.");
  });

  it("AUTH-5 shows the server's message for wrong credentials", () => {
    const error = new ORPCError("INVALID_CREDENTIALS", {
      message: "Email or password is incorrect.",
    });
    expect(describeError(error)).toBe("Email or password is incorrect.");
  });

  it("treats non-API errors as a connection problem", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toMatch(/Could not reach/);
  });
});

describe("safeRedirect", () => {
  it.each([
    ["/posts/new", "/posts/new"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    [undefined, "/"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
