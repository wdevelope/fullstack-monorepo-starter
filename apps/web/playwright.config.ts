import { defineConfig, devices } from "@playwright/test";

// 사람이 띄우는 개발 서버(3000·5173)와 겹치지 않게 E2E는 다른 포트를 쓴다.
const API_PORT = 3100;
const WEB_PORT = 5174;

// E2E는 데이터를 만들므로 이름에 "test"가 든 DB에서만 돈다(서버 통합 테스트와 같은 안전장치).
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://starter:starter@localhost:5432/starter_test";
if (!new URL(databaseUrl).pathname.includes("test")) {
  throw new Error(`E2E는 이름에 "test"가 든 DB에서만 실행한다: ${databaseUrl}`);
}

export default defineConfig({
  testDir: "e2e",
  // 한 DB를 함께 쓰고 서버도 하나라 차례로 돈다.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // 테스트 DB에 마이그레이션을 적용한 뒤 실제 API 서버를 띄운다.
      command: "node src/migrate-command.ts && node src/main.ts",
      cwd: "../server",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: "e2e-only-signing-key-not-used-anywhere-else",
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        COOKIE_SECURE: "false",
      },
    },
    {
      command: `vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/rpc` },
    },
  ],
});
