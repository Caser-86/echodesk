import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本地开发后端使用 8001，前端 5173；开发转发 /api 到后端，前端无需硬编码跨域地址
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1", // Windows 下 localhost 仅绑 IPv6，浏览器走 IPv4 会拒连
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
