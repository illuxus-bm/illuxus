import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

function resolveBuildSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const BUILD_SHA = resolveBuildSha();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  const observabilityAuthToken = process.env.OBSERVABILITY_AUTH_TOKEN;
  const shouldUploadSourceMaps = isProduction && Boolean(observabilityAuthToken);

  if (isProduction && !observabilityAuthToken) {
    // eslint-disable-next-line no-console -- build-time notice; outside src/** lint scope
    console.warn(
      "[observability] OBSERVABILITY_AUTH_TOKEN not set; skipping source-map upload",
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
      strictPort: true,
      hmr: {
        overlay: false,
      },
    },
    define: {
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify(BUILD_SHA),
    },
    build: {
      sourcemap: isProduction ? "hidden" : true,
      rollupOptions: {
        output: {
          // ── Vendor chunk splitting ────────────────────────────────────
          //
          // Motivation, measured rather than assumed. Before this, the entry
          // chunk `index-*.js` was 1,078 kB (318 kB gzip) and every visitor
          // downloaded it. Attributing its sourcemap by package showed it was
          // ~86% third-party:
          //
          //     445 kB  app code (src/)
          //     766 kB  @supabase/*  (auth-js 390, postgrest 132,
          //                           storage 102, realtime 89, phoenix 53)
          //     452 kB  framer-motion + motion-dom
          //     307 kB  react-router + @remix-run/router
          //     186 kB  @sentry/core
          //     146 kB  zod
          //     131 kB  react-dom
          //      76 kB  @tanstack/query-core
          //
          // Because app code changes on essentially every deploy while these
          // libraries change only on upgrade, bundling them together meant a
          // one-line app change invalidated the whole 318 kB for returning
          // visitors. Splitting the stable dependencies into their own
          // content-hashed chunks lets them stay in cache across deploys.
          //
          // WHY THIS IS SAFE: every package listed below is ALREADY in the
          // eager entry chunk (that is how it was measured). Moving it to a
          // named chunk changes only cache granularity — nothing becomes
          // eagerly loaded that was previously lazy. Route-level
          // `React.lazy` splitting is untouched, and `/assets/*` is served
          // `immutable` with a 1-year max-age (vercel.json), so cache hits
          // are real.
          //
          // DELIBERATELY NOT SPLIT:
          //   - Radix UI: ~30 small packages tightly interleaved with app
          //     components. Splitting them creates many tiny chunks and more
          //     request overhead than it saves.
          //   - Heavy, genuinely lazy libraries (Agora, LiveKit, exceljs,
          //     jspdf, Konva, recharts, html5-qrcode). Vite already emits
          //     these as separate lazy chunks because they are only reached
          //     through dynamic imports. Naming them here would FORCE them
          //     eager and regress first paint — the opposite of the goal.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;

            // React core. Kept as ONE chunk on purpose: splitting `react`
            // from `react-dom` is a well-known way to end up with two React
            // instances and "invalid hook call" at runtime. `resolve.dedupe`
            // below guards the same hazard from the resolution side.
            if (
              /node_modules\/(react|react-dom|scheduler)\//.test(id) ||
              /node_modules\/react\/jsx-(dev-)?runtime/.test(id)
            ) {
              return "vendor-react";
            }

            // Supabase SDK family — the single largest contributor.
            if (id.includes("node_modules/@supabase/")) return "vendor-supabase";

            // Routing.
            if (
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/@remix-run/router")
            ) {
              return "vendor-router";
            }

            // Animation. framer-motion re-exports motion-dom/motion-utils, so
            // they belong in one chunk to avoid a cross-chunk import cycle.
            if (
              id.includes("node_modules/framer-motion") ||
              id.includes("node_modules/motion-dom") ||
              id.includes("node_modules/motion-utils")
            ) {
              return "vendor-motion";
            }

            // Observability. Also keeps the Sentry SDK out of the app chunk so
            // an SDK upgrade doesn't invalidate app code.
            if (id.includes("node_modules/@sentry/")) return "vendor-observability";

            // Forms + validation. Grouped because react-hook-form and its
            // zod resolver are always used together here.
            if (
              id.includes("node_modules/zod") ||
              id.includes("node_modules/react-hook-form") ||
              id.includes("node_modules/@hookform/")
            ) {
              return "vendor-forms";
            }

            // Server-state.
            if (id.includes("node_modules/@tanstack/")) return "vendor-query";

            // Everything else keeps Vite's default behaviour.
            return undefined;
          },
        },
      },
    },
    plugins: [
      react(),
      // PWA / service-worker layer.
      //
      // - registerType: 'prompt' — we control update timing via PWAUpdatePrompt
      //   so users see a non-intrusive toast rather than a surprise reload.
      // - manifest: false — we already ship `public/site.webmanifest` referenced
      //   from `index.html`. The plugin's generator would produce a duplicate.
      // - workbox.navigateFallback — single-page app shell served from cached
      //   `index.html` so already-visited pages keep working offline.
      // - runtimeCaching — Google Fonts (cache-first, long lived) and Supabase
      //   storage assets (cache-first, ~30 days). The Supabase REST API is
      //   network-first with a 3s timeout so a slow link still falls back to
      //   the last-known response without locking the user out of fresh data.
      // - skipWaiting: false — never silently swap the SW. The new worker waits
      //   until the user clicks "Update" in the toast.
      // - clientsClaim: true — once activated, take control of all open tabs.
      // - cleanupOutdatedCaches: true — drop precached assets from prior
      //   deploys so users don't accumulate stale chunks over time.
      // - navigationPreload: true — start fetching the navigation request in
      //   parallel with SW boot for snappier cold navigations.
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        manifest: false,
        manifestFilename: "site.webmanifest",
        includeAssets: [
          "favicon.ico",
          "icon.svg",
          "apple-touch-icon.png",
          "favicon-32.png",
          "favicon-192.png",
          "favicon-512.png",
          "og-image.png",
          "robots.txt",
          "site.webmanifest",
        ],
        devOptions: {
          // Keep SW disabled in dev — it makes HMR/cache debugging painful.
          enabled: false,
          type: "module",
        },
        workbox: {
          globPatterns: [
            "**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}",
          ],
          // Don't precache the giant source maps; they're huge and not used at runtime.
          globIgnores: ["**/*.map", "sw.js", "workbox-*.js"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [
            // Auth callback / supabase URLs must always hit the network.
            /^\/api\//,
            /^\/auth\//,
            // Edge function URLs (full https URLs are denylisted automatically).
          ],
          navigationPreload: true,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "illuxus-google-fonts-stylesheets",
              },
            },
            {
              urlPattern: ({ url }) =>
                url.origin === "https://fonts.gstatic.com",
              handler: "CacheFirst",
              options: {
                cacheName: "illuxus-google-fonts-webfonts",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Supabase Storage public assets (logos, banners, avatars).
              urlPattern: ({ url }) =>
                /supabase\.co$/.test(url.host) &&
                url.pathname.startsWith("/storage/v1/object/public/"),
              handler: "CacheFirst",
              options: {
                cacheName: "illuxus-supabase-storage",
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Supabase REST API — try the network first, fall back to a
              // recent cached response if the network is slow or offline.
              urlPattern: ({ url }) =>
                /supabase\.co$/.test(url.host) &&
                url.pathname.startsWith("/rest/v1/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "illuxus-supabase-rest",
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 5, // 5 minutes — fallback only
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Realtime + edge functions must always hit the network.
              urlPattern: ({ url }) =>
                /supabase\.co$/.test(url.host) &&
                (url.pathname.startsWith("/realtime/") ||
                  url.pathname.startsWith("/functions/v1/") ||
                  url.pathname.startsWith("/auth/v1/")),
              handler: "NetworkOnly",
            },
            {
              // Generic image assets (cover photos, OG images on other CDNs).
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "illuxus-images",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
      shouldUploadSourceMaps &&
        sentryVitePlugin({
          org: process.env.OBSERVABILITY_ORG,
          project: process.env.OBSERVABILITY_PROJECT,
          authToken: observabilityAuthToken,
          sourcemaps: {
            assets: "./dist/**/*.{js,map}",
            filesToDeleteAfterUpload: "./dist/**/*.map",
          },
          release: { name: BUILD_SHA },
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
