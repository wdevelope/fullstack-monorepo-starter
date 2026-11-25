import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

/**
 * 운영 렌더러는 자기 파일만 불러올 수 있고 어떤 연결도 열 수 없다. 모든 요청은 preload 브리지를
 * 거쳐 메인으로 간다. 개발에서는 Vite의 인라인 React Refresh 프리앰블, 주입된 스타일,
 * HMR 웹소켓을 추가로 허용한다.
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
      // 정책 없는 페이지를 내보내느니 빌드를 실패시킨다.
      if (!html.includes(CSP_PLACEHOLDER)) throw new Error(`index.html lacks ${CSP_PLACEHOLDER}`);
      return html.replace(CSP_PLACEHOLDER, CSP[mode].join("; "));
    },
  };
}

export default defineConfig({
  main: {
    // 워크스페이스 패키지와 npm 의존성을 번들해 패키징한 앱에 node_modules가 들어가지 않게 한다.
    build: { externalizeDeps: false },
  },
  preload: {
    build: {
      externalizeDeps: false,
      // 샌드박스 preload는 ES 모듈일 수 없다.
      rollupOptions: { output: { format: "cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  },
});
