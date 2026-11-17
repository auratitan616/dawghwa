import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// The app never talks to content providers directly: every request goes to the
// Dawghwa API (VITE_API_BASE_URL, or /api proxied to DAWGHWA_API_DEV in dev).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApi = env.DAWGHWA_API_DEV || "http://localhost:3100";
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["icons/*.png", "icons/*.svg", "robots.txt"],
        manifest: false, // public/manifest.webmanifest is the single source of truth
        workbox: {
          globPatterns: ["**/*.{js,css,html,woff2,svg,png,webmanifest}"],
          // Only the Latin font subsets are precached; other scripts load on demand (unicode-range) and are cached at runtime.
          globIgnores: ["**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,latin-ext}-*.woff2"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/sitemap/, /^\/robots/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "font",
              handler: "CacheFirst",
              options: { cacheName: "fonts", expiration: { maxEntries: 20 } },
            },
            {
              // Cover art: immutable per file name on MangaDex; bounded cache.
              urlPattern: ({ url }) => url.hostname === "uploads.mangadex.org" && url.pathname.startsWith("/covers/"),
              handler: "CacheFirst",
              options: {
                cacheName: "covers",
                expiration: { maxEntries: 600, maxAgeSeconds: 14 * 24 * 3600, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          // Chapter page images (MangaDex@Home) are deliberately NOT cached by the
          // service worker: their URLs expire and MangaDex asks clients to report
          // real network loads.
        },
      }),
    ],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: { "/api": { target: devApi, changeOrigin: true } },
    },
    preview: {
      port: 4173,
      proxy: { "/api": { target: devApi, changeOrigin: true } },
    },
    build: {
      target: "es2020",
      sourcemap: true,
      chunkSizeWarningLimit: 300,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
    worker: { format: "es" },
    test: {
      environment: "happy-dom",
      setupFiles: ["src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
