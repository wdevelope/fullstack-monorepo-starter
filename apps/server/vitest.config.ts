import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // 통합 테스트는 데이터베이스 하나를 함께 쓰고 케이스마다 비우므로 파일을 하나씩 실행한다.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
