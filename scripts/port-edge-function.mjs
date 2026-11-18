#!/usr/bin/env node
/**
 * Ports Supabase edge functions (Deno) to Node for the Prisma API:
 * supabase/functions/<name>/*.ts → server/functions/<name>/*.ts.
 *
 *   node scripts/port-edge-function.mjs <name>... | --all
 *
 * Only mechanical changes, so a port can be diffed against its source:
 *   - supabase-js → server/edge/supabase.ts (same API; data through Prisma)
 *   - denomailer → server/edge/smtp-client.ts (same API; nodemailer)
 *   - vendored esm.sh / deno.land libraries → their npm packages
 *   - `.ts` relative imports → `.js` (Node ESM)
 *   - `Deno.env` → server/edge/deno.ts;  `Deno.serve(h)` → `export default defineHandler(h)`
 * The source stays in supabase/functions as the deployed version until the
 * port is switched on. Re-running overwrites the port.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "supabase/functions");
const DST = join(ROOT, "server/functions");

const NPM = [
  [/["']\.\.\/_vendor\/esm\.sh\/@supabase\/supabase-js@[^"']+["']/g, null], // handled below
  [/["']\.\.\/_vendor\/deno\.land\/x\/denomailer@[^"']+["']/g, '"../../edge/smtp-client.js"'],
  [/["']\.\.\/_vendor\/esm\.sh\/livekit-server-sdk@[^"']+["']/g, '"livekit-server-sdk"'],
  [/["']\.\.\/_vendor\/esm\.sh\/agora-token@[^"']+["']/g, '"agora-token"'],
  [/["']\.\.\/_vendor\/deno\.land\/x\/zipjs@[^"']+["']/g, '"@zip.js/zip.js"'],
  [/["']\.\.\/_vendor\/deno\.land\/x\/imagescript@[^"']+["']/g, '"imagescript"'],
];

function portSupabaseImport(src) {
  return src.replace(
    /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']\.\.\/_vendor\/esm\.sh\/@supabase\/supabase-js@[^"']+["'];?/g,
    (_m, typeOnly, names) => {
      const parts = names.split(",").map((s) => s.trim()).filter(Boolean);
      const values = typeOnly ? [] : parts.filter((p) => !p.startsWith("type "));
      const types = typeOnly ? parts : parts.filter((p) => p.startsWith("type ")).map((p) => p.slice(5));
      const out = [];
      if (values.length) out.push(`import { ${values.join(", ")} } from "../../edge/supabase.js";`);
      if (types.length) out.push(`import type { ${types.join(", ")} } from "@supabase/supabase-js";`);
      return out.join("\n");
    },
  );
}

/**
 * Per-function changes that aren't mechanical, each with its reason. A
 * patch whose text is no longer found fails the port, so a change to the
 * source can't silently drop one.
 */
const PATCHES = {
  "og-event/index.ts": [
    // imagescript's npm build renders text asynchronously (its Deno build
    // doesn't); without await the card would get a Promise, not an Image.
    ["function renderText(font: Uint8Array | null, size: number, text: string, color: number): Image | null {",
     "async function renderText(font: Uint8Array | null, size: number, text: string, color: number): Promise<Image | null> {"],
    ["return Image.renderText(font, size, text, color);", "return await Image.renderText(font, size, text, color);"],
    [/= renderText\(/g, "= await renderText("],
  ],
  // These two register their handler through `(globalThis as any).Deno`, so
  // their tests can import them without a Deno runtime.
  ...Object.fromEntries(["guest-registration/index.ts", "team-invitation/index.ts"].map((f) => [f, [
    ["const runtime = (globalThis as any).Deno;",
     "let served: EdgeHandler | null = null;\nconst runtime = { env: Deno.env, serve: (h: EdgeHandler) => { served = h; } };\n" +
     "export default defineHandler((req: Request) => (served ? served(req) : new Response(\"Not ready\", { status: 503 })));"],
  ]])),
};

function applyPatches(name, file, s) {
  for (const [from, to] of PATCHES[`${name}/${file}`] ?? []) {
    const found = typeof from === "string" ? s.includes(from) : from.test(s);
    if (!found) throw new Error(`${name}/${file}: patch no longer applies: ${from}`);
    s = typeof from === "string" ? s.split(from).join(to) : s.replace(from, to);
  }
  return s;
}

export function portSource(name, file, src) {
  let s = portSupabaseImport(src);
  for (const [re, to] of NPM) if (to) s = s.replace(re, to);
  s = s.replace(/from\s+["'](\.\.?\/[^"']+)\.ts["']/g, 'from "$1.js"');
  s = s.replace(/import\(\s*["'](\.\.?\/[^"']+)\.ts["']\s*\)/g, 'import("$1.js")');
  const serves = (s.match(/\bDeno\.serve\(/g) ?? []).length;
  if (serves > 1) throw new Error(`${name}/${file}: more than one Deno.serve`);
  s = s.replace(/\bDeno\.serve\(/, "export default defineHandler(");
  s = applyPatches(name, file, s);
  const usesRuntimeServe = s.includes("defineHandler(");
  const header = [`// Node port of supabase/functions/${name}/${file} (scripts/port-edge-function.mjs).`];
  if (/\bDeno\./.test(s)) header.push('import { Deno } from "../../edge/deno.js";');
  if (serves || usesRuntimeServe) header.push('import { defineHandler, type EdgeHandler } from "../../edge/deno.js";');
  return `${header.join("\n")}\n${s}`;
}

function port(name) {
  const from = join(SRC, name);
  if (!existsSync(join(from, "index.ts"))) throw new Error(`no such function: ${name}`);
  const to = join(DST, name);
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from)) {
    if (!file.endsWith(".ts") || file === "dashboard-inline.ts") continue;
    writeFileSync(join(to, file), portSource(name, file, readFileSync(join(from, file), "utf8")));
  }
  return name;
}

const args = process.argv.slice(2);
const names = args.includes("--all")
  ? readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name)
  : args;
if (!names.length) {
  console.error("usage: node scripts/port-edge-function.mjs <name>... | --all");
  process.exit(1);
}
for (const n of names) console.log(`ported ${port(n)}`);
