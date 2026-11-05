import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

import boundaries from "./tooling/eslint/boundaries.mjs";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/out/",
    "**/.expo/",
    "apps/server/drizzle/",
    "apps/mobile/babel.config.js",
    "apps/mobile/metro.config.js",
    "apps/mobile/tailwind.config.js",
    "**/*.gen.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { boundaries },
    rules: {
      "boundaries/no-cross-workspace-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["apps/{web,desktop,mobile}/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
  },
);
