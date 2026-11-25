import { describe, expect, it } from "vitest";

import { createAppUrlCheck, DEFAULT_API_URL, readApiUrl } from "./urls.ts";

describe("앱 URL 검사", () => {
  it("DESK-14 운영에서는 번들된 페이지만 허용한다", () => {
    const isAppUrl = createAppUrlCheck(
      "file:///opt/app/resources/app.asar/out/renderer/index.html",
    );

    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/index.html")).toBe(true);
    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/index.html#/post")).toBe(true);
    expect(isAppUrl("file:///etc/passwd")).toBe(false);
    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/other.html")).toBe(false);
    expect(isAppUrl("https://example.com/index.html")).toBe(false);
  });

  it("DESK-14 개발에서는 개발 서버 origin만 허용한다", () => {
    const isAppUrl = createAppUrlCheck("http://localhost:5173/");

    expect(isAppUrl("http://localhost:5173/")).toBe(true);
    expect(isAppUrl("http://localhost:5173/src/main.tsx")).toBe(true);
    expect(isAppUrl("http://localhost:5174/")).toBe(false);
    expect(isAppUrl("http://localhost.evil.example:5173/")).toBe(false);
    expect(isAppUrl("file:///opt/app/index.html")).toBe(false);
  });

  it("DESK-14 URL이 아닌 값은 거부한다", () => {
    const isAppUrl = createAppUrlCheck("http://localhost:5173/");

    expect(isAppUrl("")).toBe(false);
    expect(isAppUrl("not a url")).toBe(false);
  });
});

describe("API 주소", () => {
  it("DESK-15 기본값은 로컬 서버다", () => {
    expect(readApiUrl({})).toBe(DEFAULT_API_URL);
    expect(readApiUrl({ STARTER_API_URL: "  " })).toBe(DEFAULT_API_URL);
  });

  it("DESK-15 STARTER_API_URL이 http(s) URL이면 그 값을 쓴다", () => {
    expect(readApiUrl({ STARTER_API_URL: "https://api.example.com/rpc" })).toBe(
      "https://api.example.com/rpc",
    );
  });

  it("DESK-15 다른 스킴은 거부한다", () => {
    expect(() => readApiUrl({ STARTER_API_URL: "file:///tmp/rpc" })).toThrow(/STARTER_API_URL/);
    expect(() => readApiUrl({ STARTER_API_URL: "localhost:3000" })).toThrow(/STARTER_API_URL/);
  });
});
