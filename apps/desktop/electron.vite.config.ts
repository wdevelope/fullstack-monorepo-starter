import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

/**
 * The production renderer may load only its own files and may not open any connection: every
 * request goes through the preload bridge to main. Dev additionally allows Vite's inline
 * React Refresh preamble, injected styles and the HMR websocket.
 */
const CSP = {
  production: [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ],
  development: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ],
};

const CSP_PLACEHOLDER = "__CONTENT_SECURITY_POLICY__";

function contentSecurityPolicy(): Plugin {
  let mode: keyof typeof CSP = "production";
  return {
    name: "desktop-content-security-policy",
    configResolved(config) {
      mode = config.command === "serve" ? "development" : "production";
    },
    transformIndexHtml(html) {
      // Fail the build rather than ship a page without a policy.
      if (!html.includes(CSP_PLACEHOLDER)) throw new Error(`index.html lacks ${CSP_PLACEHOLDER}`);
      return html.replace(CSP_PLACEHOLDER, CSP[mode].join("; "));
    },
  };
}

export default defineConfig({
  main: {
    // Bundle workspace packages and npm deps, so the packaged app ships without node_modules.
    build: { externalizeDeps: false },
  },
  preload: {
    build: {
      externalizeDeps: false,
      // Sandboxed preloads cannot be ES modules.
      rollupOptions: { output: { format: "cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  },
});
