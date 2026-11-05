import { describe, it } from "node:test";

import { RuleTester } from "eslint";

import boundaries from "./boundaries.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const rule = boundaries.rules["no-cross-workspace-imports"];
const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });

tester.run("no-cross-workspace-imports", rule, {
  valid: [
    {
      filename: "/repo/apps/web/src/main.tsx",
      code: 'import { contract } from "@starter/contracts";',
    },
    {
      filename: "/repo/apps/web/src/routes/home.tsx",
      code: 'import { api } from "../lib/api.ts";',
    },
    { filename: "/repo/apps/server/src/main.ts", code: 'import { Hono } from "hono";' },
    { filename: "/repo/tooling/harness/x.mjs", code: 'import "../../apps/web/src/main.tsx";' },
  ],
  invalid: [
    {
      filename: "/repo/apps/web/src/main.tsx",
      code: 'import { router } from "@starter/server";',
      errors: [{ messageId: "otherWorkspace" }],
    },
    {
      filename: "/repo/apps/desktop/src/renderer/main.tsx",
      code: 'import { PostList } from "../../../web/src/posts.tsx";',
      errors: [{ messageId: "otherWorkspace" }],
    },
    {
      filename: "/repo/packages/contracts/src/index.ts",
      code: 'export * from "@starter/server";',
      errors: [{ messageId: "packageImportsApp" }],
    },
    {
      filename: "/repo/apps/mobile/app/index.tsx",
      code: 'const m = import("../../server/src/router.ts");',
      errors: [{ messageId: "otherWorkspace" }],
    },
  ],
});
