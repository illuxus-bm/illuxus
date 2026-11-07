#!/usr/bin/env node
// Checks that the deployed edge functions accept the iOS and Android apps.
//
// The apps call the functions from capacitor://localhost (iOS) and
// https://localhost (Android). This sends each function the browser's CORS
// preflight from both origins and reports whether it would be allowed. It
// changes nothing: a preflight (OPTIONS) never runs the function's work.
//
//   node scripts/check-app-cors.mjs https://<project-ref>.supabase.co
//
// Which functions: every one under supabase/functions that answers browsers
// (uses _shared/cors.ts, or sets Access-Control-Allow-Origin itself), so a
// new one is covered without being listed. Exits 1 when any function refuses
// either origin.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ORIGINS = ["capacitor://localhost", "https://localhost"];
const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions");

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error("Usage: node scripts/check-app-cors.mjs https://<project-ref>.supabase.co");
  process.exit(2);
}

const functions = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => d.name)
  .filter((name) => {
    const index = join(FUNCTIONS_DIR, name, "index.ts");
    if (!existsSync(index)) return false;
    const source = readFileSync(index, "utf8");
    return /^import .*["']\.\.\/_shared\/cors\.ts["']/m.test(source) || source.includes("Access-Control-Allow-Origin");
  })
  .sort();

async function preflight(name, origin) {
  try {
    const res = await fetch(`${base}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type",
      },
      signal: AbortSignal.timeout(15000),
    });
    const allowed = res.headers.get("access-control-allow-origin");
    return { ok: allowed === origin || allowed === "*", detail: `${res.status} allow-origin=${allowed ?? "(none)"}` };
  } catch (err) {
    return { ok: false, detail: `request failed: ${err.message}` };
  }
}

let failed = 0;
for (const name of functions) {
  const results = await Promise.all(APP_ORIGINS.map((origin) => preflight(name, origin)));
  const ok = results.every((r) => r.ok);
  if (!ok) failed++;
  const detail = results.map((r, i) => `${APP_ORIGINS[i].split("://")[0]}: ${r.detail}`).join(" | ");
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(36)} ${ok ? "" : detail}`);
}
console.log(`\n${functions.length - failed} of ${functions.length} functions accept both app origins.`);
if (failed) {
  console.log("Redeploy the failing functions from main (supabase functions deploy <name>), then run this again.");
  process.exit(1);
}
