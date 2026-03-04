import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    hmr: {
      // Use a dedicated port to avoid conflicts with the Socket.IO ws proxy
      port: 5174,
      protocol: "ws",
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        configure: (proxy) => {
          // Strip conflicting headers — some upstream responses include both
          // Content-Length and Transfer-Encoding which violates HTTP/1.1
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["transfer-encoding"] && proxyRes.headers["content-length"]) {
              delete proxyRes.headers["content-length"];
            }
          });
        },
      },
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
