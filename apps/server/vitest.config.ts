import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Integration tests share one database and empty it between cases, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
