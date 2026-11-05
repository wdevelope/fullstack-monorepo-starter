import { defineConfig } from "vitest/config";

// Only plain TypeScript modules are unit-tested; screens need a device or simulator.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });
