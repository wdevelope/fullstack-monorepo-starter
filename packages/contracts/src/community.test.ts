import { describe, expect, it } from "vitest";

import { POST_TITLE_MAX, postInputSchema } from "./community.ts";

describe("글 입력", () => {
  it("COM-5 제목과 본문의 앞뒤 공백을 지운다", () => {
    expect(postInputSchema.parse({ title: "  Hello ", body: "\n World \n" })).toEqual({
      title: "Hello",
      body: "World",
    });
  });

  it.each([
    ["공백뿐인 제목은", { title: "   ", body: "body" }],
    ["공백뿐인 본문은", { title: "title", body: " \n " }],
    ["길이 제한을 넘는 제목은", { title: "x".repeat(POST_TITLE_MAX + 1), body: "body" }],
  ])("COM-5 %s 거부한다", (_, input) => {
    expect(postInputSchema.safeParse(input).success).toBe(false);
  });
});
