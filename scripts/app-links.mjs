#!/usr/bin/env node
/**
 * Writes the two files that let illuxus.com links open the apps:
 *
 *   public/.well-known/apple-app-site-association   (iOS Universal Links)
 *   public/.well-known/assetlinks.json              (Android App Links)
 *
 *   node scripts/app-links.mjs --apple-team-id ABCDE12345 \
 *     --android-sha256 AA:BB:…:FF [--android-sha256 <another key>]
 *
 * The Team ID is in the Apple Developer account (Membership details). The
 * Android fingerprints are in the Play Console → Test and release → App
 * integrity → App signing: list the app signing key, and the upload key too
 * so builds installed straight from Android Studio verify as well. Commit the
 * two files and deploy the site; vercel.json serves them as JSON.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_ID = "com.illuxus.app";
export const WELL_KNOWN = resolve(ROOT, "public/.well-known");

export const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
export const SHA256_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Paths that never open the app: the server's own endpoints and files, which
 * the app couldn't show. Everything else on illuxus.com does, as on Android
 * (AndroidManifest.xml), where App Links can't exclude paths.
 */
const IOS_EXCLUDED = ["/api/*", "/.well-known/*", "/assets/*", "/embed.js", "/sitemap*", "/robots.txt", "/app-config.json"];

export function appleAppSiteAssociation(teamId) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: [
            ...IOS_EXCLUDED.map((path) => ({ "/": path, exclude: true })),
            { "/": "*" },
          ],
        },
      ],
    },
  };
}

export function assetLinks(fingerprints) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

function parseArgs(args) {
  const out = { teamId: null, sha256: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apple-team-id") out.teamId = (args[++i] ?? "").trim().toUpperCase();
    else if (args[i] === "--android-sha256") out.sha256.push((args[++i] ?? "").trim().toUpperCase());
    else throw new Error(`Unknown argument ${args[i]}`);
  }
  return out;
}

function main(args) {
  let opts;
  try {
    opts = parseArgs(args);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  if (!opts.teamId && opts.sha256.length === 0) {
    console.error("Usage: node scripts/app-links.mjs --apple-team-id <TEAMID> --android-sha256 <AA:BB:…> [--android-sha256 …]");
    return 2;
  }
  if (opts.teamId && !TEAM_ID_PATTERN.test(opts.teamId)) {
    console.error(`"${opts.teamId}" isn't a Team ID (10 letters and digits).`);
    return 2;
  }
  const bad = opts.sha256.find((f) => !SHA256_PATTERN.test(f));
  if (bad) {
    console.error(`"${bad}" isn't a SHA-256 fingerprint (32 pairs of hex digits separated by colons).`);
    return 2;
  }
  mkdirSync(WELL_KNOWN, { recursive: true });
  if (opts.teamId) {
    writeFileSync(resolve(WELL_KNOWN, "apple-app-site-association"), `${JSON.stringify(appleAppSiteAssociation(opts.teamId), null, 2)}\n`);
    console.log("Wrote public/.well-known/apple-app-site-association");
  }
  if (opts.sha256.length) {
    writeFileSync(resolve(WELL_KNOWN, "assetlinks.json"), `${JSON.stringify(assetLinks([...new Set(opts.sha256)]), null, 2)}\n`);
    console.log("Wrote public/.well-known/assetlinks.json");
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
