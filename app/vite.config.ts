import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the same bundle runs on GitHub Pages, in an Android WebView
// (capacitor://localhost) and in an iOS WKWebView (capacitor://localhost).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "zustand"],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
