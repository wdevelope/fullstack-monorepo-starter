import { describe, expect, it } from "vitest";

import { POST_TITLE_MAX, postInputSchema } from "./community.ts";

describe("post input", () => {
  it("COM-5 trims the title and body", () => {
    expect(postInputSchema.parse({ title: "  Hello ", body: "\n World \n" })).toEqual({
      title: "Hello",
      body: "World",
    });
  });

  it.each([
    ["a blank title", { title: "   ", body: "body" }],
    ["a blank body", { title: "title", body: " \n " }],
    ["a title over the limit", { title: "x".repeat(POST_TITLE_MAX + 1), body: "body" }],
  ])("COM-5 rejects %s", (_, input) => {
    expect(postInputSchema.safeParse(input).success).toBe(false);
  });
});
