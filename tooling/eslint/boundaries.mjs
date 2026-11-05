import path from "node:path";

/** Workspace packages under packages/ that apps may import. Apps themselves are never importable. */
const SHARED_PACKAGES = ["@starter/contracts", "@starter/api-client"];

/**
 * Finds which workspace a file belongs to, e.g. { kind: "apps", name: "web", root: "/repo/apps/web" }.
 * Files outside apps/ and packages/ (tooling, configs) are not checked.
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
 * Apps never import each other, and packages never import apps. Apps share code only through
 * packages/, so a change in one app cannot silently break another.
 */
const noCrossWorkspaceImports = {
  meta: {
    type: "problem",
    docs: { description: "Keep apps independent: share code only through packages/" },
    messages: {
      otherWorkspace:
        "'{{source}}' reaches into another workspace. Apps share code only through packages/ ({{shared}}).",
      packageImportsApp: "Packages must not import apps ('{{source}}').",
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
