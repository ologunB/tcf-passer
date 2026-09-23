/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "TCF Passer",
        short_name: "TCF Passer",
        description: "TCF Canada prep: A0 to NCLC 7",
        theme_color: "#2446d6",
        background_color: "#f4f2ec",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
  // The study plan (data/plan.json) is most of the bundle; it's cached offline after first load.
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: "node" },
});
