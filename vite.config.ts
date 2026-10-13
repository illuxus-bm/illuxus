import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

import {
  buildSitemap,
  buildSitemapIndex,
  extractRouteMeta,
  outputFile,
  renderRouteHtml,
  SITE_ORIGIN,
  type RouteMeta,
} from "./src/lib/seo/prerender";

/** Indexable addresses that have no page of their own to be discovered from. */
const SITEMAP_EXTRA_URLS = [`${SITE_ORIGIN}/llms.txt`];

/**
 * After the build, writes one HTML file per static public page with that
 * page's own title, description, canonical, Open Graph and breadcrumb tags
 * already in it, plus `sitemap.xml` and `sitemap-index.xml`. See
 * `src/lib/seo/prerender.ts` for why.
 *
 * The pages are discovered from their `<RouteSeo>` declarations, so a new
 * page is picked up without being listed anywhere. Search Console and Bing
 * verification tags are added when `VITE_GSC_VERIFICATION` /
 * `VITE_BING_VERIFICATION` are set in the build environment.
 */
function seoPrerender(): Plugin {
  const pagesDir = path.resolve(__dirname, "src/pages");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" || name === "dev" ? [] : walk(full);
      return full.endsWith(".tsx") ? [full] : [];
    });

  return {
    name: "illuxus-seo-prerender",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      let baseHtml: string;
      try {
        baseHtml = readFileSync(path.join(outDir, "index.html"), "utf8");
      } catch {
        return; // Nothing was built (a failed build has already reported why).
      }
      const routes = walk(pagesDir)
        .map((file) => extractRouteMeta(readFileSync(file, "utf8")))
        .filter((route): route is RouteMeta => route !== null)
        .sort((a, b) => a.path.localeCompare(b.path));
      const options = {
        googleVerification: process.env.VITE_GSC_VERIFICATION?.trim() || undefined,
        bingVerification: process.env.VITE_BING_VERIFICATION?.trim() || undefined,
      };
      for (const route of routes) {
        const file = path.join(outDir, outputFile(route));
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, renderRouteHtml(baseHtml, route, routes, options));
      }
      const today = new Date().toISOString().slice(0, 10);
      writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemap(routes, today, SITEMAP_EXTRA_URLS));
      writeFileSync(path.join(outDir, "sitemap-index.xml"), buildSitemapIndex(today));
      // eslint-disable-next-line no-console -- build-time notice; outside src/** lint scope
      console.log(`[seo] prerendered ${routes.length} pages, wrote sitemap.xml and sitemap-index.xml`);
    },
  };
}

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
    },
    plugins: [
      react(),
      seoPrerender(),
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
      // - skipWaiting: true — a new deploy's worker activates as soon as it
      //   installs, so a normal refresh / next visit shows the latest release.
      //   With `false` it waited until every illuxus tab was closed, leaving
      //   users on stale builds after each deploy. Open pages are NOT
      //   reloaded (no lost form state); a page that later fails to fetch a
      //   chunk removed by the deploy reloads itself once (see main.tsx).
      // - clientsClaim: true — once activated, take control of all open tabs.
      // - cleanupOutdatedCaches: true — drop precached assets from prior
      //   deploys so users don't accumulate stale chunks over time.
      // - navigationPreload: false — page navigations are answered from the
      //   precached `index.html` (navigateFallback), so a preload request would
      //   never be consumed: it wastes a network round trip and Chrome logs
      //   "navigation preload request was cancelled" on every page load.
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
          navigationPreload: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
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
