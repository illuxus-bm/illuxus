#!/usr/bin/env node
/**
 * Keeps a copy of every library the edge functions use inside the repo, so a
 * deploy never fetches code from esm.sh, deno.land or npm, and keeps working
 * if one of them changes, goes down or drops a version.
 *
 *   node scripts/vendor-edge-deps.mjs          # download / refresh the copies
 *   node scripts/vendor-edge-deps.mjs --check  # verify (also run by the tests)
 *
 * Each library in LIBRARIES is downloaded with everything it imports into
 * supabase/functions/_vendor/<host>/<path>, imports rewritten to relative
 * paths, and the functions import that copy (`../_vendor/...`). The exact
 * source URL and SHA-256 of every file is in _vendor/manifest.json.
 *
 * To add or upgrade a library: edit LIBRARIES, run the script, then
 * `npm run functions:inline`, and commit _vendor/ with the functions.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";
import { init as lexerReady, parse } from "es-module-lexer";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const VENDOR = join(FUNCTIONS, "_vendor");
const MANIFEST = join(VENDOR, "manifest.json");

/**
 * What the functions import → the exact build kept in the repo. esm.sh
 * builds for Deno 2 (`target=denonext`, what the Supabase runtime is).
 * `@supabase/supabase-js@2` used to float to whatever 2.x was newest at each
 * deploy; it's pinned to the version the web app uses.
 */
export const LIBRARIES = {
  "https://esm.sh/@supabase/supabase-js@2": "https://esm.sh/@supabase/supabase-js@2.108.1?target=denonext",
  "https://esm.sh/@supabase/supabase-js@2.45.0": "https://esm.sh/@supabase/supabase-js@2.45.0?target=denonext",
  "https://esm.sh/livekit-server-sdk@2.9.7": "https://esm.sh/livekit-server-sdk@2.9.7?target=denonext",
  "npm:agora-token@2.0.5": "https://esm.sh/agora-token@2.0.5?target=denonext",
  "https://deno.land/x/denomailer@1.6.0/mod.ts": "https://deno.land/x/denomailer@1.6.0/mod.ts",
  "https://deno.land/x/zipjs@v2.7.45/index.js": "https://deno.land/x/zipjs@v2.7.45/index.js",
  "https://deno.land/x/imagescript@1.2.17/mod.ts": "https://deno.land/x/imagescript@1.2.17/mod.ts",
};

const CODE_EXT = /\.(m?js|ts|tsx|jsx|d\.ts|json)$/;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const toPosix = (p) => p.split("\\").join("/");

/** Where a URL's file lives under _vendor/ (relative, posix). */
function localPath(url, contentType = "") {
  const u = new URL(url);
  let path = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (!CODE_EXT.test(path)) {
    // An entry like esm.sh/pkg@1.2.3: a directory of its own, so it can't
    // collide with the files under it.
    path = posix.join(path, `_entry.${/typescript/.test(contentType) ? "ts" : "mjs"}`);
  }
  return posix.join(u.host, path);
}

/**
 * The modules a file imports, found by a real module lexer (so an import
 * written inside a string or comment, like a usage example, isn't taken for
 * one). TypeScript is lexed after esbuild strips its types; its type-only
 * imports are added back from the source, since Deno may read them too.
 */
async function imports(source, isTs) {
  await lexerReady;
  const js = isTs
    ? transformSync(source, { loader: "ts", format: "esm", tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } } }).code
    : source;
  const [found] = parse(js);
  const specs = new Set(found.filter((i) => typeof i.n === "string" && i.d !== -2).map((i) => i.n));
  if (isTs) {
    for (const m of source.matchAll(/^\s*(?:import|export)\s+type\s[^;]*?\bfrom\s*(["'])([^"'\n]+)\1/gm)) specs.add(m[2]);
  }
  return [...specs];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Replaces each import of `spec` with `map.get(spec)`. */
function rewrite(source, map) {
  let out = source;
  for (const [spec, to] of map) {
    const q = `(["'])${escapeRe(spec)}\\2`;
    const re = new RegExp(`(\\bfrom\\s*|\\bimport\\s*|\\bimport\\s*\\(\\s*)${q}`, "g");
    out = out.replace(re, (_m, lead, quote) => `${lead}${quote}${to}${quote}`);
  }
  return out;
}

const isRemote = (spec) => /^(https?:|npm:|jsr:)/.test(spec);
const isLocalOrBuiltin = (spec) => spec.startsWith("node:") || spec.startsWith("./") || spec.startsWith("../");

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Deno's user agent, so esm.sh answers exactly as it would a deploy.
      const res = await fetch(url, { headers: { "User-Agent": "Deno/2.1.4" }, redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return { text: await res.text(), finalUrl: res.url, contentType: res.headers.get("content-type") ?? "" };
    } catch (err) {
      if (attempt >= 3) throw new Error(`Couldn't download ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Deno/2.1.4" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * imagescript loads its WebAssembly from the file next to each module
 * (`import.meta.url` → .wasm): from deno.land at run time, and a deploy
 * bundle wouldn't carry a loose .wasm file anyway. Its bytes go into a
 * module of their own that is imported like any other, so they ship with
 * the function.
 */
const WASM_LOADER = /const path = new URL\(import\.meta\.url\.replace\('\.js', '\.wasm'\)\);\s*wasm_mod = new WebAssembly\.Module\(await \([^;]*\);/;

async function embedWasm(body, url, local, files) {
  if (!WASM_LOADER.test(body)) return body;
  const wasmUrl = url.replace(/\.js$/, ".wasm");
  const bytes = await fetchBytes(wasmUrl);
  const name = `${posix.basename(local, ".js")}.wasm.js`;
  const module =
    `// The WebAssembly from ${wasmUrl}, kept as a module so it ships with the function.\n` +
    `const base64 = "${bytes.toString("base64")}";\n` +
    `export default Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));\n`;
  const moduleLocal = posix.join(posix.dirname(local), name);
  writeFileSync(join(VENDOR, moduleLocal), module);
  files[moduleLocal] = { url: wasmUrl, sha256: sha256(module) };
  return `import wasmBytes from "./${name}";\n${body.replace(WASM_LOADER, "wasm_mod = new WebAssembly.Module(wasmBytes);")}`;
}

/** Downloads every library and what it imports; returns the manifest. */
async function vendor() {
  rmSync(VENDOR, { recursive: true, force: true });
  const files = {}; // local path → { url, sha256 }
  const located = new Map(); // url → promise of its local path
  const jobs = [];

  // Resolves as soon as the file is downloaded and placed, before what it
  // imports is: modules that import each other would otherwise wait forever.
  const mirror = (url) => {
    if (located.has(url)) return located.get(url);
    let place, fail;
    const where = new Promise((res, rej) => { place = res; fail = rej; });
    where.catch(() => {}); // reported through `jobs`
    located.set(url, where);
    jobs.push((async () => {
      try {
        const { text, finalUrl, contentType } = await fetchText(url);
        const local = localPath(url, contentType);
        place(local);
        const isTs = /typescript/.test(contentType) || /\.tsx?$/.test(new URL(finalUrl).pathname);
        const map = new Map();
        for (const spec of await imports(text, isTs)) {
          if (spec.startsWith("node:")) continue;
          if (spec.startsWith("npm:") || spec.startsWith("jsr:")) {
            throw new Error(`${url} imports ${spec}; add an esm.sh equivalent to LIBRARIES.`);
          }
          const targetLocal = await mirror(new URL(spec, finalUrl).href);
          let rel = toPosix(posix.relative(posix.dirname(local), targetLocal));
          if (!rel.startsWith(".")) rel = `./${rel}`;
          map.set(spec, rel);
        }
        let body = rewrite(text, map);
        mkdirSync(dirname(join(VENDOR, local)), { recursive: true });
        body = await embedWasm(body, finalUrl, local, files);
        if (/import\.meta\.url\.replace\(/.test(body)) throw new Error(`${url} loads a file next to itself at run time; vendor it like the .wasm files.`);
        // The web app's TypeScript check follows the functions into these
        // files; they're Deno code, checked by their authors, not by us.
        if (local.endsWith(".ts") && !body.startsWith("// @ts-nocheck")) body = `// @ts-nocheck vendored from ${url}\n${body}`;
        const file = join(VENDOR, local);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        files[local] = { url, sha256: sha256(body) };
      } catch (err) {
        fail(err);
        throw err;
      }
    })());
    return where;
  };
  const settle = async () => {
    for (let done = 0; done < jobs.length; ) {
      const batch = jobs.slice(done);
      await Promise.all(batch);
      done += batch.length;
    }
  };

  const libraries = {};
  for (const [spec, url] of Object.entries(LIBRARIES)) {
    libraries[spec] = { url, entry: await mirror(url) };
  }
  await settle();
  for (const spec of Object.keys(libraries)) console.log(`vendored ${spec}`);

  // Types for the web app's editor and tests: esm.sh's Supabase builds
  // carry none, so point them at the npm package's.
  for (const [spec, { entry }] of Object.entries(libraries)) {
    if (!spec.includes("@supabase/supabase-js")) continue;
    const decl = join(VENDOR, entry.replace(/\.mjs$/, ".d.mts"));
    const body = `// Types for the web app's TypeScript check only (Deno doesn't read this).\nexport * from "@supabase/supabase-js";\n`;
    writeFileSync(decl, body);
    files[toPosix(relative(VENDOR, decl))] = { url: null, sha256: sha256(body) };
  }

  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const manifest = { note: "Generated by scripts/vendor-edge-deps.mjs. Do not edit.", libraries, files: sorted };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** The function sources (not the vendored copies or generated dashboard files). */
function functionSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full !== VENDOR) walk(full);
      } else if (/\.(ts|js|mjs)$/.test(name) && name !== "dashboard-inline.ts") {
        out.push(full);
      }
    }
  };
  walk(FUNCTIONS);
  return out;
}

/** Points the functions' imports at the vendored copies. */
async function pointFunctionsAtVendor(manifest) {
  for (const file of functionSources()) {
    const source = readFileSync(file, "utf8");
    const map = new Map();
    for (const spec of await imports(source, file.endsWith(".ts"))) {
      const lib = manifest.libraries[spec];
      if (!lib) continue;
      let rel = toPosix(relative(dirname(file), join(VENDOR, lib.entry)));
      if (!rel.startsWith(".")) rel = `./${rel}`;
      map.set(spec, rel);
    }
    if (map.size) writeFileSync(file, rewrite(source, map));
  }
}

/** Problems with the vendored copies or the functions' imports; [] when sound. */
export async function checkVendoredEdgeDeps() {
  const problems = [];
  if (!existsSync(MANIFEST)) return ["supabase/functions/_vendor/manifest.json is missing: run node scripts/vendor-edge-deps.mjs"];
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  for (const [local, { sha256: expected }] of Object.entries(manifest.files)) {
    const file = join(VENDOR, local);
    if (!existsSync(file)) problems.push(`_vendor/${local} is missing.`);
    else if (sha256(readFileSync(file)) !== expected) problems.push(`_vendor/${local} was changed by hand (checksum differs).`);
  }
  // A .gitignore rule (like `dist`) would keep files out of commits: they'd
  // exist here and be missing everywhere else.
  const ignored = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: VENDOR,
    input: Object.keys(manifest.files).join("\n"),
    encoding: "utf8",
  });
  for (const local of (ignored.stdout ?? "").split("\n").filter(Boolean)) {
    problems.push(`_vendor/${local} is ignored by .gitignore, so it wouldn't be committed.`);
  }

  for (const [local] of Object.entries(manifest.files)) {
    if (!/\.(m?js|ts)$/.test(local) || local.endsWith(".d.mts")) continue;
    const file = join(VENDOR, local);
    if (!existsSync(file)) continue;
    for (const spec of await imports(readFileSync(file, "utf8"), local.endsWith(".ts"))) {
      if (!isLocalOrBuiltin(spec)) problems.push(`_vendor/${local} imports ${spec} from outside the repo.`);
      else if (!spec.startsWith("node:") && !existsSync(resolve(dirname(file), spec))) problems.push(`_vendor/${local} imports ${spec}, which isn't vendored.`);
    }
  }
  for (const file of functionSources()) {
    for (const spec of await imports(readFileSync(file, "utf8"), file.endsWith(".ts"))) {
      if (isRemote(spec)) {
        problems.push(`${toPosix(relative(ROOT, file))} imports ${spec} from the internet: add it to LIBRARIES in scripts/vendor-edge-deps.mjs.`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    const problems = await checkVendoredEdgeDeps();
    for (const p of problems) console.error(`✗ ${p}`);
    console.log(problems.length ? `\n${problems.length} problem(s).` : "Edge function libraries are all vendored.");
    process.exit(problems.length ? 1 : 0);
  }
  const manifest = await vendor();
  await pointFunctionsAtVendor(manifest);
  const problems = await checkVendoredEdgeDeps();
  for (const p of problems) console.error(`✗ ${p}`);
  console.log(`\n${Object.keys(manifest.files).length} files in supabase/functions/_vendor.`);
  process.exit(problems.length ? 1 : 0);
}
