import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // e2e/는 Playwright가 실제 브라우저로 돌린다(`pnpm --filter @starter/web test:e2e`).
  test: { environment: "jsdom", exclude: [...configDefaults.exclude, "e2e/**"] },
});
