import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 개발에서는 같은 origin이다. 브라우저는 Vite 서버의 /rpc를 보므로 리프레시 쿠키가
    // 퍼스트 파티 쿠키가 되고 CORS 프리플라이트도 필요 없다.
    proxy: { "/rpc": "http://localhost:3000" },
  },
});
