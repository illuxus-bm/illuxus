import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

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
      port: 8082,
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
