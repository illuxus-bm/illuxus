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

/**
 * Loads the app stylesheet without blocking first paint. The splash screen in
 * `index.html` is styled inline, so it can paint before this CSS arrives; it
 * stays up until the stylesheet has applied (see `appStylesApplied` in
 * `src/main.tsx`), so the app itself is never seen unstyled.
 */
function nonBlockingAppCss(): Plugin {
  return {
    name: "illuxus-non-blocking-app-css",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html.replace(
          /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
          (_tag, href: string) =>
            `<link rel="preload" as="style" crossorigin href="${href}" data-app-css onload="this.onload=null;this.rel='stylesheet'">` +
            `<noscript><link rel="stylesheet" crossorigin href="${href}"></noscript>`,
        ),
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
/**
 * Unique per build (the commit alone isn't: a redeploy with new settings
 * rebuilds the same commit). Open tabs compare it with /version.json to
 * notice a newer deploy; see src/lib/web-update.ts.
 */
const BUILD_ID = `${BUILD_SHA}.${Date.now().toString(36)}`;

/** The part of the service worker's Cache Storage the page-load rule uses. */
type CacheLookup = { match(url: string, options: { ignoreSearch: boolean }): Promise<Response | undefined> };

/** Writes /version.json, the build open tabs compare themselves against. */
function buildVersionFile(): Plugin {
  return {
    name: "illuxus-build-version",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: `${JSON.stringify({ build: BUILD_ID })}\n` });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  // The iOS / Android build (capacitor.config.ts). The app ships its bundle,
  // so it needs no service worker and no per-page HTML for search engines.
  const isNativeApp = mode === "capacitor";
  const observabilityAuthToken = process.env.OBSERVABILITY_AUTH_TOKEN;
  const shouldUploadSourceMaps = (isProduction || isNativeApp) && Boolean(observabilityAuthToken);

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
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
    },
    build: {
      // The app bundle carries no source maps unless they are uploaded (and
      // then deleted from dist) by the Sentry plugin below.
      sourcemap: isNativeApp ? (shouldUploadSourceMaps ? "hidden" : false) : isProduction ? "hidden" : true,
    },
    plugins: [
      react(),
      nonBlockingAppCss(),
      !isNativeApp && seoPrerender(),
      !isNativeApp && buildVersionFile(),
      // PWA / service-worker layer.
      //
      // Every deploy must reach people without them clearing site data, so:
      //
      // - Pages come from the network first. The worker answers a page load
      //   with the latest index.html from Vercel and falls back to the cached
      //   copy only offline or after 4 s, so the app still opens on a dead
      //   connection. (It used to answer every load from the cache, which kept
      //   people on the build they first installed.) No HTML is precached
      //   except that offline copy, and `directoryIndex: null` stops "/" from
      //   being answered out of the precache.
      // - navigationPreload: the page request starts while the worker boots,
      //   so going to the network first costs no extra time.
      // - skipWaiting + clientsClaim: a new worker takes over as soon as it
      //   has installed; cleanupOutdatedCaches drops the old build's files.
      // - An open tab notices a newer deploy through /version.json and
      //   reloads at a moment nothing is lost (src/lib/web-update.ts,
      //   WebAppUpdater). A chunk the deploy removed reloads once (main.tsx).
      // - registerType 'prompt' / injectRegister false: WebAppUpdater
      //   registers the worker itself.
      // - manifest: false: public/site.webmanifest is the manifest.
      // - Supabase REST/auth/realtime/functions are never cached: answers
      //   carry a person's data and must be current.
      VitePWA({
        // Still provides `virtual:pwa-register` (as a no-op) in the app build.
        disable: isNativeApp,
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
            "**/*.{js,css,svg,png,ico,webmanifest,woff,woff2}",
            // The offline copy of the app. The prerendered pages are left
            // out: they're the same app, and pages load from the network.
            "index.html",
          ],
          // Don't precache the giant source maps; they're huge and not used at runtime.
          globIgnores: ["**/*.map", "sw.js", "workbox-*.js"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: null,
          directoryIndex: null,
          navigationPreload: true,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Page loads: the latest HTML from the network; the offline
              // copy only when that fails or takes over 4 s. Server routes
              // and the sign-in callback are left alone.
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" &&
                !url.pathname.startsWith("/api/") &&
                !url.pathname.startsWith("/auth/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "illuxus-pages",
                networkTimeoutSeconds: 4,
                plugins: [
                  {
                    // Never keep individual pages: one offline copy, always
                    // the one installed with this worker, can't go stale.
                    cacheWillUpdate: async () => null,
                    // Offline or slow: answer with the precached index.html.
                    // (Written out in full: workbox copies this function into
                    // sw.js as text, so it can't refer to anything here.)
                    cachedResponseWillBeUsed: async ({ cachedResponse }) =>
                      cachedResponse ??
                      (await (globalThis as unknown as { caches: CacheLookup }).caches.match("/index.html", { ignoreSearch: true })) ??
                      null,
                  },
                ],
              },
            },
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
              // Supabase data, sign-in, realtime and functions: network only.
              urlPattern: ({ url }) =>
                /supabase\.co$/.test(url.host) &&
                (url.pathname.startsWith("/rest/v1/") ||
                  url.pathname.startsWith("/realtime/") ||
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
