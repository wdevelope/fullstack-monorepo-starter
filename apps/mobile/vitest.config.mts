import { defineConfig } from "vitest/config";

// 순수 TypeScript 모듈만 단위 테스트한다. 화면은 기기나 시뮬레이터가 필요하다.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });
