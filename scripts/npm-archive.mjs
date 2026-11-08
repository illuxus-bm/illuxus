#!/usr/bin/env node
/**
 * An archive of every npm package in bun.lock, so the app can be installed
 * and built even if a package is unpublished, the npm registry is down, or
 * a version disappears.
 *
 *   node scripts/npm-archive.mjs pack [--out <dir>]
 *       Downloads every package bun.lock names, checks each against the
 *       lockfile's SHA-512, and writes <dir>/illuxus-npm-<lock hash>.tar
 *       (default dir: release-assets/). CI does this whenever bun.lock
 *       changes on main and attaches it to the "npm-archive" GitHub release
 *       (.github/workflows/npm-archive.yml).
 *
 *   node scripts/npm-archive.mjs restore [<file.tar | URL>]
 *       Installs node_modules from the archive alone: it serves the archive
 *       as a registry on localhost and runs `bun install --frozen-lockfile`
 *       against it, with a fresh cache, so nothing comes from anywhere else.
 *       Without an argument it downloads this bun.lock's archive from the
 *       GitHub release.
 *
 *   node scripts/npm-archive.mjs name
 *       Prints the archive's file name for the current bun.lock.
 *
 *   node scripts/npm-archive.mjs check
 *       Fails if bun.lock fetches from anywhere but the public npm registry.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";
export const RELEASE_TAG = "npm-archive";
const RELEASE_BASE = `https://github.com/illuxus-bm/illuxus/releases/download/${RELEASE_TAG}`;

/** bun.lock is JSON with trailing commas. */
export function readLock(text) {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

export const lockHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
export const archiveName = (text) => `illuxus-npm-${lockHash(text)}.tar`;

/** Every package@version in the lockfile, once, with its integrity. */
export function lockedPackages(lock) {
  const seen = new Map();
  for (const entry of Object.values(lock.packages ?? {})) {
    const [id, registry, , integrity] = entry;
    const at = id.lastIndexOf("@");
    if (at <= 0) continue;
    const name = id.slice(0, at);
    const version = id.slice(at + 1);
    if (!/^\d/.test(version)) continue; // workspace:, file:, github: … (none today)
    seen.set(id, { name, version, registry, integrity });
  }
  return [...seen.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

/** Packages bun.lock would fetch from somewhere other than npm; [] when clean. */
export function lockProblems(lock) {
  const problems = [];
  for (const p of lockedPackages(lock)) {
    if (p.registry !== "") problems.push(`${p.name}@${p.version} comes from ${p.registry.split("/").slice(0, 3).join("/")}, not npm.`);
    if (!/^sha512-/.test(p.integrity ?? "")) problems.push(`${p.name}@${p.version} has no SHA-512 integrity.`);
  }
  return problems;
}

const tarballPath = ({ name, version }) => `${name}/-/${name.split("/").pop()}-${version}.tgz`;
const integrityOf = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 4) throw new Error(`Couldn't download ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function pool(items, size, work) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

function tar(args) {
  const run = spawnSync("tar", args, { stdio: ["ignore", "ignore", "inherit"] });
  if (run.status !== 0) throw new Error(`tar ${args[0]} failed`);
}

async function pack(outDir) {
  const lockText = readFileSync(join(ROOT, "bun.lock"), "utf8");
  const lock = readLock(lockText);
  const problems = lockProblems(lock);
  if (problems.length) throw new Error(`Fix bun.lock first:\n${problems.join("\n")}`);

  const packages = lockedPackages(lock);
  const stage = mkdtempSync(join(tmpdir(), "illuxus-npm-"));
  let done = 0;
  let bytes = 0;
  await pool(packages, 16, async (p) => {
    const data = await download(`${REGISTRY}/${tarballPath(p)}`);
    if (integrityOf(data) !== p.integrity) throw new Error(`${p.name}@${p.version} doesn't match bun.lock's checksum.`);
    const file = join(stage, "packages", tarballPath(p));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
    bytes += data.length;
    if (++done % 200 === 0) console.log(`  ${done}/${packages.length}`);
  });

  writeFileSync(join(stage, "bun.lock"), lockText);
  writeFileSync(join(stage, "package.json"), readFileSync(join(ROOT, "package.json")));
  writeFileSync(
    join(stage, "manifest.json"),
    `${JSON.stringify({ lockSha256: createHash("sha256").update(lockText).digest("hex"), created: new Date().toISOString(), registry: REGISTRY, packages: packages.map((p) => ({ name: p.name, version: p.version, integrity: p.integrity, file: `packages/${tarballPath(p)}` })) }, null, 1)}\n`,
  );
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, archiveName(lockText));
  tar(["-cf", out, "-C", stage, "."]);
  rmSync(stage, { recursive: true, force: true });
  console.log(`wrote ${out}: ${packages.length} packages, ${(bytes / 1048576).toFixed(0)} MB`);
  return out;
}

/** Serves an extracted archive as an npm registry on localhost. */
function serveRegistry(dir, manifest) {
  const byName = new Map();
  for (const p of manifest.packages) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  }
  const misses = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    if (path.endsWith(".tgz")) {
      const file = join(dir, "packages", path);
      if (existsSync(file)) {
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": statSync(file).size });
        return createReadStream(file).pipe(res);
      }
    } else if (byName.has(path)) {
      // Package metadata, for a client that asks (a frozen install doesn't).
      const origin = `http://${req.headers.host}`;
      const versions = Object.fromEntries(byName.get(path).map((p) => [p.version, { name: p.name, version: p.version, dist: { tarball: `${origin}/${tarballPath(p)}`, integrity: p.integrity } }]));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ name: path, versions, "dist-tags": { latest: Object.keys(versions).at(-1) } }));
    }
    misses.push(path);
    res.writeHead(404);
    res.end();
  });
  return new Promise((ready) => server.listen(0, "127.0.0.1", () => ready({ server, misses, origin: `http://127.0.0.1:${server.address().port}` })));
}

async function restore(source) {
  const lockText = readFileSync(join(ROOT, "bun.lock"), "utf8");
  const work = mkdtempSync(join(tmpdir(), "illuxus-npm-restore-"));
  let file = source;
  if (!file || /^https?:/.test(file)) {
    const url = file || `${RELEASE_BASE}/${archiveName(lockText)}`;
    console.log(`downloading ${url}`);
    file = join(work, "archive.tar");
    writeFileSync(file, await download(url));
  }
  const dir = join(work, "x");
  mkdirSync(dir);
  tar(["-xf", resolve(file), "-C", dir]);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if (manifest.lockSha256 !== createHash("sha256").update(lockText).digest("hex")) {
    throw new Error("This archive was made for a different bun.lock. Use the archive for this commit, or check out the commit the archive was made from (its bun.lock is inside it).");
  }
  for (const p of manifest.packages) {
    if (integrityOf(readFileSync(join(dir, p.file))) !== p.integrity) throw new Error(`${p.name}@${p.version} in the archive is damaged.`);
  }
  console.log(`archive verified: ${manifest.packages.length} packages`);

  const { server, misses, origin } = await serveRegistry(dir, manifest);
  const cache = join(work, "bun-cache");
  const code = await new Promise((done) => {
    const child = spawn("bun", ["install", "--frozen-lockfile"], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, BUN_CONFIG_REGISTRY: origin, NPM_CONFIG_REGISTRY: origin, BUN_INSTALL_CACHE_DIR: cache },
    });
    child.on("exit", done);
  });
  server.close();
  rmSync(work, { recursive: true, force: true });
  if (misses.length) console.error(`not in the archive: ${[...new Set(misses)].slice(0, 20).join(", ")}`);
  if (code !== 0 || misses.length) throw new Error("Install from the archive failed.");
  console.log("installed node_modules from the archive alone.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const opt = (flag, fallback) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : fallback);
  try {
    if (command === "pack") await pack(resolve(opt("--out", join(ROOT, "release-assets"))));
    else if (command === "restore") await restore(rest.find((a) => !a.startsWith("--")));
    else if (command === "name") console.log(archiveName(readFileSync(join(ROOT, "bun.lock"), "utf8")));
    else if (command === "check") {
      const problems = lockProblems(readLock(readFileSync(join(ROOT, "bun.lock"), "utf8")));
      for (const p of problems) console.error(`✗ ${p}`);
      if (problems.length) process.exit(1);
      console.log("bun.lock installs everything from the public npm registry.");
    } else {
      console.log("usage: node scripts/npm-archive.mjs pack [--out <dir>] | restore [<file|url>] | name | check");
      process.exit(command ? 1 : 0);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
