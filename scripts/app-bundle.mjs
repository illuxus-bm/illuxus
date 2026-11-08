#!/usr/bin/env node
/**
 * Packages the app's web code for live updates (src/lib/native/live-update.ts).
 *
 *   bun run build:app && node scripts/app-bundle.mjs [outDir]
 *
 * Zips dist/ (the `vite build --mode capacitor` output) into
 * <outDir>/illuxus-web.zip and describes it in <outDir>/illuxus-web.json:
 * version and build from android/version.properties, `minNativeBuild` (the
 * oldest app shell it runs on, kept by scripts/app-version.mjs) and the zip's
 * SHA-256, which the app checks before using it. Attach both to the GitHub
 * release with the APK; installed apps pick it up from the latest release.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readAndroidVersion } from "./app-version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function bundleManifest({ versionName, versionCode, liveUpdateMinBuild }, sha256) {
  return { version: versionName, build: versionCode, minNativeBuild: liveUpdateMinBuild, sha256 };
}

function main(args) {
  const out = resolve(ROOT, args[0] ?? "release-assets");
  const dist = resolve(ROOT, "dist");
  const version = readAndroidVersion(readFileSync(resolve(ROOT, "android/version.properties"), "utf8"));
  if (!existsSync(resolve(dist, "index.html"))) {
    console.error("No dist/index.html: run `bun run build:app` first.");
    return 1;
  }
  // The app bundle has no service worker; a website build would.
  if (existsSync(resolve(dist, "sw.js"))) {
    console.error("dist/ is a website build (it has sw.js). Build the app with `bun run build:app`.");
    return 1;
  }
  if (!Number.isInteger(version.liveUpdateMinBuild)) {
    console.error("android/version.properties has no liveUpdateMinBuild: bump the version with scripts/app-version.mjs.");
    return 1;
  }
  mkdirSync(out, { recursive: true });
  const zip = resolve(out, "illuxus-web.zip");
  rmSync(zip, { force: true });
  // -X: no extra file attributes, so the same build zips the same way.
  execFileSync("zip", ["-q", "-r", "-X", zip, "."], { cwd: dist });
  const sha256 = createHash("sha256").update(readFileSync(zip)).digest("hex");
  const manifest = bundleManifest(version, sha256);
  writeFileSync(resolve(out, "illuxus-web.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Packaged web code ${manifest.version} (build ${manifest.build}) for app shells from build ${manifest.minNativeBuild}: ${zip}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
