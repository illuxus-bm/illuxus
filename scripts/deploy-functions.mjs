#!/usr/bin/env node
// Deploys the edge functions with the Supabase CLI, each one bundled first
// into a single file.
//
//   npm run functions:deploy                       # every function
//   npm run functions:deploy -- livekit-token og-event
//   npm run functions:deploy -- --project-ref <ref>
//
// Why bundle: the functions import their libraries from ../_vendor, and
// `supabase functions deploy --use-api` (no Docker) only uploads the files it
// finds by following imports a couple of levels deep. It misses deeper ones
// (supabase-js → auth-js → tslib), so the deploy fails with "Module not
// found". Bundling each function with esbuild, as functions:inline does for
// the Dashboard copies, leaves nothing to follow.
//
// The project defaults to project_id in supabase/config.toml. The CLI must be
// signed in to an account that can see it (`supabase login`).
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const functionsDir = join(repo, "supabase", "functions");
const configPath = join(repo, "supabase", "config.toml");

const args = process.argv.slice(2);
let projectRef = readFileSync(configPath, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--project-ref") projectRef = args[++i];
  else names.push(args[i]);
}
if (!projectRef) {
  console.error("No project: pass --project-ref <ref> or set project_id in supabase/config.toml.");
  process.exit(1);
}

const all = readdirSync(functionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(join(functionsDir, d.name, "index.ts")))
  .map((d) => d.name);
const unknown = names.filter((n) => !all.includes(n));
if (unknown.length) {
  console.error(`No such function: ${unknown.join(", ")}`);
  process.exit(1);
}
const targets = names.length ? names : all;

const work = mkdtempSync(join(tmpdir(), "illuxus-functions-"));
try {
  mkdirSync(join(work, "supabase", "functions"), { recursive: true });
  copyFileSync(configPath, join(work, "supabase", "config.toml"));   // verify_jwt per function
  for (const name of targets) {
    const result = await build({
      entryPoints: [join(functionsDir, name, "index.ts")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      external: ["https://*", "npm:*", "jsr:*", "node:*"],
      write: false,
      legalComments: "inline",
      logLevel: "error",
    });
    mkdirSync(join(work, "supabase", "functions", name));
    writeFileSync(
      join(work, "supabase", "functions", name, "index.ts"),
      `// Bundled from supabase/functions/${name}/index.ts by scripts/deploy-functions.mjs.\n` + result.outputFiles[0].text,
    );
  }
  console.log(`Bundled ${targets.length} function(s); deploying to ${projectRef}…`);
  const run = spawnSync(
    "supabase",
    ["functions", "deploy", ...(names.length ? targets : []), "--project-ref", projectRef, "--use-api", "--workdir", work],
    { stdio: "inherit", cwd: work },
  );
  if (run.error) {
    console.error(`Couldn't run the Supabase CLI: ${run.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
