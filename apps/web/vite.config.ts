import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin in development: the browser sees /rpc on the Vite server, so the refresh
    // cookie is first-party and no CORS preflight is needed.
    proxy: { "/rpc": "http://localhost:3000" },
  },
});
