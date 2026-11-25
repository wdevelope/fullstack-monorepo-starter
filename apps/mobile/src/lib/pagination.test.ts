import { describe, expect, it } from "vitest";

import { shouldLoadMore, showsLoadError } from "./pagination";

const idle = {
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
};

describe("목록 조회 실패", () => {
  it("PLAT-5 첫 페이지가 실패해 보여 줄 글이 없으면 빈 목록 대신 오류를 보인다", () => {
    expect(showsLoadError({ isError: true, data: undefined })).toBe(true);
  });

  it("PLAT-5 이미 받은 글이 있으면 다시 읽기가 실패해도 목록을 그대로 보인다", () => {
    expect(showsLoadError({ isError: true, data: [] })).toBe(false);
    expect(showsLoadError({ isError: false, data: undefined })).toBe(false);
  });
});

describe("다음 페이지 불러오기", () => {
  it("PLAT-5 다음 페이지가 있고 요청 중이 아닐 때만 더 불러온다", () => {
    expect(shouldLoadMore(idle)).toBe(true);
    expect(shouldLoadMore({ ...idle, hasNextPage: false })).toBe(false);
    expect(shouldLoadMore({ ...idle, isFetchingNextPage: true })).toBe(false);
  });

  it("PLAT-5 다음 페이지가 실패한 뒤에는 끝에 닿아도 자동으로 다시 요청하지 않는다", () => {
    expect(shouldLoadMore({ ...idle, isFetchNextPageError: true })).toBe(false);
  });
});
