import { describe, expect, it } from "vitest";

import { createAppUrlCheck, DEFAULT_API_URL, readApiUrl } from "./urls.ts";

describe("app URL check", () => {
  it("accepts only the bundled page in production", () => {
    const isAppUrl = createAppUrlCheck(
      "file:///opt/app/resources/app.asar/out/renderer/index.html",
    );

    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/index.html")).toBe(true);
    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/index.html#/post")).toBe(true);
    expect(isAppUrl("file:///etc/passwd")).toBe(false);
    expect(isAppUrl("file:///opt/app/resources/app.asar/out/renderer/other.html")).toBe(false);
    expect(isAppUrl("https://example.com/index.html")).toBe(false);
  });

  it("accepts only the dev server origin in development", () => {
    const isAppUrl = createAppUrlCheck("http://localhost:5173/");

    expect(isAppUrl("http://localhost:5173/")).toBe(true);
    expect(isAppUrl("http://localhost:5173/src/main.tsx")).toBe(true);
    expect(isAppUrl("http://localhost:5174/")).toBe(false);
    expect(isAppUrl("http://localhost.evil.example:5173/")).toBe(false);
    expect(isAppUrl("file:///opt/app/index.html")).toBe(false);
  });

  it("rejects values that are not URLs", () => {
    const isAppUrl = createAppUrlCheck("http://localhost:5173/");

    expect(isAppUrl("")).toBe(false);
    expect(isAppUrl("not a url")).toBe(false);
  });
});

describe("API URL", () => {
  it("defaults to the local server", () => {
    expect(readApiUrl({})).toBe(DEFAULT_API_URL);
    expect(readApiUrl({ STARTER_API_URL: "  " })).toBe(DEFAULT_API_URL);
  });

  it("uses STARTER_API_URL when it is an http(s) URL", () => {
    expect(readApiUrl({ STARTER_API_URL: "https://api.example.com/rpc" })).toBe(
      "https://api.example.com/rpc",
    );
  });

  it("refuses other schemes", () => {
    expect(() => readApiUrl({ STARTER_API_URL: "file:///tmp/rpc" })).toThrow(/STARTER_API_URL/);
    expect(() => readApiUrl({ STARTER_API_URL: "localhost:3000" })).toThrow(/STARTER_API_URL/);
  });
});
