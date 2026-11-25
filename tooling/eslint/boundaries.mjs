import path from "node:path";

/** 앱이 import할 수 있는 packages/ 아래 워크스페이스 패키지. 앱 자체는 어디서도 import할 수 없다. */
const SHARED_PACKAGES = ["@starter/contracts", "@starter/api-client"];

/**
 * 파일이 속한 워크스페이스를 찾는다. 예: { kind: "apps", name: "web", root: "/repo/apps/web" }.
 * apps/와 packages/ 밖의 파일(tooling, 설정)은 검사하지 않는다.
 */
function workspaceOf(filename) {
  const parts = filename.split(path.sep);
  for (let i = parts.length - 2; i >= 0; i--) {
    if ((parts[i] === "apps" || parts[i] === "packages") && parts[i + 1]) {
      return { kind: parts[i], name: parts[i + 1], root: parts.slice(0, i + 2).join(path.sep) };
    }
  }
  return null;
}

/**
 * 앱은 서로 import하지 않고, 패키지는 앱을 import하지 않는다. 앱은 packages/로만 코드를 나누므로
 * 한 앱의 변경이 다른 앱을 몰래 깨뜨리지 못한다.
 */
const noCrossWorkspaceImports = {
  meta: {
    type: "problem",
    docs: { description: "앱을 서로 독립시킨다: 코드는 packages/로만 공유한다" },
    messages: {
      otherWorkspace:
        "'{{source}}'는 다른 워크스페이스를 직접 가리킨다. 앱은 packages/({{shared}})로만 코드를 공유한다.",
      packageImportsApp: "패키지는 앱을 import할 수 없다('{{source}}').",
    },
    schema: [],
  },
  create(context) {
    const workspace = workspaceOf(context.filename);
    if (!workspace) return {};

    function check(node, source) {
      if (typeof source !== "string") return;

      if (source.startsWith("@starter/")) {
        if (SHARED_PACKAGES.some((name) => source === name || source.startsWith(`${name}/`)))
          return;
        const messageId = workspace.kind === "packages" ? "packageImportsApp" : "otherWorkspace";
        context.report({ node, messageId, data: { source, shared: SHARED_PACKAGES.join(", ") } });
        return;
      }

      if (source.startsWith(".")) {
        const target = path.resolve(path.dirname(context.filename), source);
        if (!target.startsWith(workspace.root + path.sep)) {
          context.report({
            node,
            messageId: "otherWorkspace",
            data: { source, shared: SHARED_PACKAGES.join(", ") },
          });
        }
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) =>
        node.source.type === "Literal" && check(node.source, node.source.value),
    };
  },
};

export default {
  meta: { name: "starter-boundaries" },
  rules: { "no-cross-workspace-imports": noCrossWorkspaceImports },
};
