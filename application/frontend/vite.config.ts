import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8420" },
  },
  build: {
    target: "es2022",
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
    chunkSizeWarningLimit: 700,
  },
});
