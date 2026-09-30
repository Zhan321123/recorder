import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const isWindows = process.env.TAURI_ENV_PLATFORM === "windows";
const isDebug = !!process.env.TAURI_ENV_DEBUG;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Tauri 官方模板配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Windows 用 WebView2（Chromium）；移动端按 WebView 能力降级
    target: isWindows ? "chrome105" : "safari13",
    minify: !isDebug ? "esbuild" : false,
    sourcemap: isDebug,
  },
});
