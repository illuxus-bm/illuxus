#!/usr/bin/env node
/**
 * An archive of everything the Android and iOS apps download to build, so
 * they can be built if Google's Maven, Maven Central, Gradle's servers or
 * GitHub lose a version or go offline. The npm side is scripts/npm-archive.mjs.
 *
 *   node scripts/native-archive.mjs pack [--out <dir>]
 *       Builds the Android app with an empty Gradle home, then keeps every
 *       library Gradle downloaded (as a Maven repository, with aapt2 for
 *       macOS, Linux and Windows) and the Gradle distribution. Downloads the
 *       iOS app's Swift packages and their prebuilt frameworks (checked
 *       against the checksums in their Package.swift) as git repositories
 *       that need nothing from GitHub. Writes <dir>/illuxus-native-<hash>.tar.
 *
 *   node scripts/native-archive.mjs restore <file.tar | URL> [--into <dir>]
 *       Unpacks it (default ~/.illuxus-offline/<hash>), installs the Gradle
 *       distribution, points Xcode's Swift packages at the local copies, and
 *       prints the Gradle command for an offline build.
 *
 *   node scripts/native-archive.mjs verify <file.tar>
 *       Restores into a temporary folder, builds Android with --offline, an
 *       empty Gradle home and the network blocked, checks each iOS Swift
 *       package checks out from the archive with its published frameworks,
 *       and (with Xcode) builds the iOS app from them with GitHub unreachable.
 *
 *   node scripts/native-archive.mjs name
 *       The archive's file name for the current native build inputs.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, symlinkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = join(ROOT, "android");
const SPM_ROOT = join(ROOT, "ios", "App", "CapApp-SPM");
const XCODE_MIRRORS = join(ROOT, "ios", "App", "App.xcodeproj", "project.xcworkspace", "xcshareddata", "swiftpm", "configuration", "mirrors.json");
const INIT_SCRIPT = join(ROOT, "scripts", "gradle-archive.init.gradle");
export const RELEASE_TAG = "native-archive";
const GOOGLE_MAVEN = "https://dl.google.com/dl/android/maven2";

/** Files whose change can change what the native builds download. */
const INPUTS = [
  "bun.lock",
  "android/build.gradle",
  "android/app/build.gradle",
  "android/app/capacitor.build.gradle",
  "android/capacitor.settings.gradle",
  "android/settings.gradle",
  "android/variables.gradle",
  "android/gradle.properties",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "ios/App/CapApp-SPM/Package.swift",
];

export function inputsHash(root = ROOT) {
  const h = createHash("sha256");
  for (const f of INPUTS) h.update(`${f}\0${existsSync(join(root, f)) ? readFileSync(join(root, f)) : ""}\0`);
  return h.digest("hex").slice(0, 12);
}
export const archiveName = (root = ROOT) => `illuxus-native-${inputsHash(root)}.tar`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed${r.stderr ? `:\n${r.stderr.slice(-2000)}` : ""}`);
  return r.stdout ?? "";
}
const sha256File = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

async function download(url, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      if (attempt >= 4) throw new Error(`Couldn't download ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── Android ────────────────────────────────────────────────────────────────

const GRADLE_TASKS = ["assembleDebug", "assembleRelease", "bundleRelease"];

/** Gradle's download cache (files-2.1/<group>/<module>/<version>/<sha1>/<file>) → a Maven repository. */
function cacheToMaven(gradleHome, repo) {
  const cache = join(gradleHome, "caches", "modules-2", "files-2.1");
  let count = 0;
  for (const file of walk(cache)) {
    const [group, module, version, , name] = relative(cache, file).split(/[\\/]/);
    if (!name) continue;
    const dest = join(repo, ...group.split("."), module, version, name);
    if (existsSync(dest)) {
      if (sha256File(dest) !== sha256File(file)) throw new Error(`Two different files named ${group}:${module}:${version}/${name}`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    count++;
  }
  return count + publishUnderMetadataNames(cache, repo);
}

/**
 * Gradle module metadata (.module) can give a file one name in the cache and
 * another on the server (lifecycle-runtime-ktx.aar is fetched as
 * lifecycle-runtime-ktx-android-2.10.0.aar). The cache keeps it in a folder
 * named after its SHA-1, which the metadata lists, so put each file where the
 * metadata says a repository serves it.
 */
function publishUnderMetadataNames(cache, repo) {
  let count = 0;
  for (const moduleFile of walk(cache).filter((f) => f.endsWith(".module"))) {
    const versionDir = dirname(dirname(moduleFile));
    const [group, module, version] = relative(cache, versionDir).split(/[\\/]/);
    let metadata;
    try {
      metadata = JSON.parse(readFileSync(moduleFile, "utf8"));
    } catch {
      continue;
    }
    for (const variant of metadata.variants ?? []) {
      for (const f of variant.files ?? []) {
        if (!f.url || !f.sha1 || !f.name) continue;
        const cached = join(versionDir, f.sha1, f.name);
        const dest = resolve(join(repo, ...group.split("."), module, version), f.url);
        if (!existsSync(cached) || existsSync(dest)) continue;
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(cached, dest);
        count++;
      }
    }
  }
  return count;
}

/** aapt2 is per operating system; keep all three so any machine can build. */
async function addAapt2ForEveryOs(repo) {
  const dir = join(repo, "com", "android", "tools", "build", "aapt2");
  if (!existsSync(dir)) return;
  for (const version of readdirSync(dir)) {
    for (const os of ["osx", "linux", "windows"]) {
      const name = `aapt2-${version}-${os}.jar`;
      const dest = join(dir, version, name);
      if (!existsSync(dest)) await download(`${GOOGLE_MAVEN}/com/android/tools/build/aapt2/${version}/${name}`, dest);
    }
  }
}

/**
 * The Gradle distribution the wrapper uses, checked against Gradle's published
 * SHA-256. (The wrapper deletes its own copy of the zip once unpacked.) It's
 * stored where the wrapper looks: <name>/<base-36 MD5 of the URL>/<name>.zip.
 */
async function packGradleDistribution(stage) {
  const props = readFileSync(join(ANDROID, "gradle", "wrapper", "gradle-wrapper.properties"), "utf8");
  const url = props.match(/^distributionUrl=(.+)$/m)[1].trim().replace(/\\:/g, ":");
  const zipName = url.split("/").pop();
  const hash = BigInt(`0x${createHash("md5").update(url).digest("hex")}`).toString(36);
  const dest = join(stage, "android", "gradle-dists", zipName.replace(/\.zip$/, ""), hash, zipName);
  await download(url, dest);
  const expected = (await (await fetch(`${url}.sha256`)).text()).trim();
  if (sha256File(dest) !== expected) throw new Error(`${zipName} doesn't match Gradle's published checksum.`);
  return zipName;
}

function gradle(args, env) {
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  run(gradlew, ["--no-daemon", ...args], { cwd: ANDROID, env: { ...process.env, ...env } });
}

async function packAndroid(stage) {
  const gradleHome = mkdtempSync(join(tmpdir(), "illuxus-gradle-home-"));
  try {
    console.log("building Android with an empty Gradle home (downloads everything once)…");
    gradle(GRADLE_TASKS, { GRADLE_USER_HOME: gradleHome });
    const repo = join(stage, "android", "maven");
    const count = cacheToMaven(gradleHome, repo);
    await addAapt2ForEveryOs(repo);
    const dist = await packGradleDistribution(stage);
    console.log(`android: ${count} library files, ${dist}`);
  } finally {
    rmSync(gradleHome, { recursive: true, force: true });
  }
}

// ── iOS ────────────────────────────────────────────────────────────────────

/** Remote Swift packages the iOS app uses, with the exact version it resolves. */
export function swiftPackages(root = ROOT) {
  const manifests = [join(root, "ios", "App", "CapApp-SPM", "Package.swift")];
  const app = readFileSync(manifests[0], "utf8");
  for (const [, path] of app.matchAll(/\.package\(name:\s*"[^"]+",\s*path:\s*"([^"]+)"\)/g)) {
    manifests.push(join(root, "ios", "App", "CapApp-SPM", path, "Package.swift"));
  }
  const exact = new Map();
  const seen = new Set();
  for (const file of manifests) {
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/\.package\(url:\s*"([^"]+)",\s*(exact|from):\s*"([^"]+)"\)/g)) {
      seen.add(m[1]);
      if (m[2] === "exact") exact.set(m[1], m[3]);
    }
  }
  return [...seen].map((url) => {
    if (!exact.has(url)) throw new Error(`No exact version for ${url}; pin it before archiving.`);
    return { url, version: exact.get(url), name: url.split("/").pop().replace(/\.git$/, "") };
  });
}

/** A copy of the package at `version` whose prebuilt frameworks are inside it. */
async function packSwiftPackage(pkg, stage) {
  const work = mkdtempSync(join(tmpdir(), `illuxus-spm-${pkg.name}-`));
  try {
    const src = join(work, "src");
    run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", pkg.version, pkg.url, src]);
    rmSync(join(src, ".git"), { recursive: true, force: true });
    const manifestFile = join(src, "Package.swift");
    let manifest = readFileSync(manifestFile, "utf8");
    const binaries = [...manifest.matchAll(/\.binaryTarget\(\s*name:\s*"([^"]+)",\s*url:\s*"([^"]+)",\s*checksum:\s*"([0-9a-f]{64})"\s*\)/g)];
    for (const [whole, name, url, checksum] of binaries) {
      const zip = `${name}.xcframework.zip`;
      await download(url, join(src, zip));
      if (sha256File(join(src, zip)) !== checksum) throw new Error(`${url} doesn't match the checksum in ${pkg.name}'s Package.swift.`);
      manifest = manifest.replace(whole, `.binaryTarget(\n            name: "${name}",\n            path: "${zip}"\n        )`);
    }
    if (/\.binaryTarget\([^)]*url:/.test(manifest)) throw new Error(`${pkg.name} has a binary target this script can't read.`);
    writeFileSync(manifestFile, manifest);
    const git = (...args) => run("git", ["-c", "user.name=illuxus archive", "-c", "user.email=archive@illuxus.invalid", ...args], { cwd: src, quiet: true });
    git("init", "--quiet");
    // --force: the package's own .gitignore excludes *.zip (its frameworks).
    git("add", "-A", "--force");
    git("commit", "--quiet", "-m", `${pkg.name} ${pkg.version} from ${pkg.url}, prebuilt frameworks included`);
    const committed = git("ls-files").split("\n");
    for (const [, name] of binaries) {
      if (!committed.includes(`${name}.xcframework.zip`)) throw new Error(`${name}.xcframework.zip didn't make it into the archived ${pkg.name}.`);
    }
    git("tag", pkg.version);
    mkdirSync(join(stage, "ios"), { recursive: true });
    git("bundle", "create", join(stage, "ios", `${pkg.name}.bundle`), "--all");
    console.log(`ios: ${pkg.name} ${pkg.version}${binaries.length ? ` with ${binaries.map((b) => b[1]).join(", ")}` : ""}`);
    return { ...pkg, binaries: binaries.map((b) => ({ name: b[1], url: b[2], checksum: b[3] })) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Makes git fail on GitHub and never ask the keychain or a terminal. */
const NO_GITHUB = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "url.https://github.invalid/.insteadOf",
  GIT_CONFIG_VALUE_0: "https://github.com/",
  GIT_CONFIG_KEY_1: "credential.helper",
  GIT_CONFIG_VALUE_1: "",
};

// ── Archive ────────────────────────────────────────────────────────────────

async function pack(outDir) {
  const stage = mkdtempSync(join(tmpdir(), "illuxus-native-"));
  try {
    const packages = [];
    for (const pkg of swiftPackages()) packages.push(await packSwiftPackage(pkg, stage));
    await packAndroid(stage);
    const files = Object.fromEntries(walk(stage).map((f) => [relative(stage, f).split("\\").join("/"), sha256File(f)]));
    writeFileSync(join(stage, "manifest.json"), `${JSON.stringify({ inputsHash: inputsHash(), created: new Date().toISOString(), gradleTasks: GRADLE_TASKS, swiftPackages: packages, files }, null, 1)}\n`);
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, archiveName());
    run("tar", ["-cf", out, "-C", stage, "."]);
    console.log(`wrote ${out} (${(statSync(out).size / 1048576).toFixed(0)} MB)`);
    return out;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

async function unpack(source, into) {
  let file = source;
  if (/^https?:/.test(source)) {
    file = join(mkdtempSync(join(tmpdir(), "illuxus-native-dl-")), "archive.tar");
    console.log(`downloading ${source}`);
    await download(source, file);
  }
  mkdirSync(into, { recursive: true });
  run("tar", ["-xf", resolve(file), "-C", into]);
  const manifest = JSON.parse(readFileSync(join(into, "manifest.json"), "utf8"));
  for (const [rel, sum] of Object.entries(manifest.files)) {
    if (sha256File(join(into, rel)) !== sum) throw new Error(`${rel} in the archive is damaged.`);
  }
  if (manifest.inputsHash !== inputsHash()) {
    console.warn("! This archive was made for different native build files; a build may need libraries it doesn't have.");
  }
  return manifest;
}

/** Puts the Gradle distribution where the wrapper looks, so it isn't downloaded. */
function installGradleDistribution(dir, gradleHome) {
  const dists = join(dir, "android", "gradle-dists");
  for (const zip of walk(dists)) {
    const dest = join(gradleHome, "wrapper", "dists", relative(dists, zip));
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(zip, dest);
    }
  }
}

/** Clones each Swift package from its bundle and returns { original URL → local repo }. */
function installSwiftMirrors(dir, manifest) {
  const mirrors = {};
  for (const pkg of manifest.swiftPackages) {
    const repo = join(dir, "ios", `${pkg.name}.git`);
    if (!existsSync(repo)) run("git", ["clone", "--quiet", "--bare", join(dir, "ios", `${pkg.name}.bundle`), repo]);
    mirrors[pkg.url] = repo;
  }
  return mirrors;
}

function writeMirrors(mirrors, configDir) {
  // As file:// URLs: with a plain path, SwiftPM records the pin as a local
  // package at a GitHub address and later refuses its own Package.resolved.
  const body = { object: Object.entries(mirrors).map(([original, mirror]) => ({ mirror: pathToFileURL(mirror).href, original })), version: 1 };
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "mirrors.json"), `${JSON.stringify(body, null, 2)}\n`);
}

async function restore(source, into) {
  const manifest = await unpack(source, into);
  const gradleHome = process.env.GRADLE_USER_HOME || join(homedir(), ".gradle");
  installGradleDistribution(into, gradleHome);
  const mirrors = installSwiftMirrors(into, manifest);
  writeMirrors(mirrors, join(SPM_ROOT, ".swiftpm", "configuration"));
  writeMirrors(mirrors, dirname(XCODE_MIRRORS));
  console.log(`\nRestored to ${into}.

Android, offline (from android/):
  ILLUXUS_MAVEN_ARCHIVE="${join(into, "android", "maven")}" ./gradlew --offline --init-script ../scripts/gradle-archive.init.gradle assembleRelease

iOS: Xcode now takes ${Object.keys(mirrors).length} Swift package(s) from ${join(into, "ios")}.
  To go back to GitHub, delete:
    ${relative(ROOT, XCODE_MIRRORS)}
    ${relative(ROOT, join(SPM_ROOT, ".swiftpm", "configuration", "mirrors.json"))}`);
}

async function verify(source) {
  const work = mkdtempSync(join(tmpdir(), "illuxus-native-verify-"));
  try {
    const dir = join(work, "archive");
    const manifest = await unpack(source, dir);
    console.log("archive checksums verified");

    // Android: empty Gradle home, no network repositories, --offline.
    const gradleHome = join(work, "gradle-home");
    installGradleDistribution(dir, gradleHome);
    // Every HTTP(S) request from the wrapper and the build goes to a dead
    // proxy: anything not in the archive fails the build instead of downloading.
    const deadProxy = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=9 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=9 -Dhttp.nonProxyHosts=";
    gradle(["--offline", "--init-script", INIT_SCRIPT, ...manifest.gradleTasks], {
      GRADLE_USER_HOME: gradleHome,
      GRADLE_OPTS: deadProxy,
      JAVA_TOOL_OPTIONS: deadProxy,
      ILLUXUS_MAVEN_ARCHIVE: join(dir, "android", "maven"),
    });
    console.log("android: built offline from the archive alone");

    // iOS: each package checks out from its archived copy at the pinned
    // version, nothing in it points at the internet, and its frameworks are
    // the ones the original Package.swift's checksums name.
    installSwiftMirrors(dir, manifest);
    for (const pkg of manifest.swiftPackages) {
      const checkout = join(work, "spm", pkg.name);
      run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--branch", pkg.version, join(dir, "ios", `${pkg.name}.git`), checkout]);
      const swift = readFileSync(join(checkout, "Package.swift"), "utf8");
      if (/\.(?:binaryTarget|package)\([^)]*url:\s*"https?:/.test(swift)) throw new Error(`${pkg.name}'s Package.swift still downloads from the internet.`);
      for (const bin of pkg.binaries) {
        const zip = join(checkout, `${bin.name}.xcframework.zip`);
        if (!existsSync(zip)) throw new Error(`${bin.name}.xcframework.zip is missing from ${pkg.name}.`);
        if (sha256File(zip) !== bin.checksum) throw new Error(`${bin.name}.xcframework.zip in ${pkg.name} isn't the published framework.`);
        if (!swift.includes(`path: "${bin.name}.xcframework.zip"`)) throw new Error(`${pkg.name}'s Package.swift doesn't use the archived ${bin.name}.`);
      }
    }
    console.log(`ios: ${manifest.swiftPackages.map((p) => `${p.name} ${p.version}`).join(", ")} check out from the archive with their frameworks`);

    // With Xcode (macOS): build the app itself from the archived packages,
    // in a copy of the project, with GitHub unreachable and empty caches.
    if (process.platform === "darwin" && spawnSync("xcodebuild", ["-version"], { stdio: "ignore" }).status === 0) {
      const proj = join(work, "project");
      cpSync(join(ROOT, "ios"), join(proj, "ios"), {
        recursive: true,
        filter: (src) => !/[\\/](build|DerivedData|xcuserdata|\.build)([\\/]|$)/.test(src) && !src.endsWith("Package.resolved"),
      });
      symlinkSync(join(ROOT, "node_modules"), join(proj, "node_modules"));
      const xcodeProject = join(proj, "ios", "App", "App.xcodeproj");
      writeMirrors(installSwiftMirrors(dir, manifest), join(xcodeProject, "project.xcworkspace", "xcshareddata", "swiftpm", "configuration"));
      run("xcodebuild", [
        "-quiet", "-scmProvider", "system", "-project", xcodeProject, "-scheme", "App", "-configuration", "Release",
        "-destination", "generic/platform=iOS", "-derivedDataPath", join(work, "xcode-dd"),
        "-clonedSourcePackagesDirPath", join(work, "xcode-spm"), "-packageCachePath", join(work, "xcode-spm-cache"),
        "CODE_SIGNING_ALLOWED=NO", "build",
      ], { env: { ...process.env, ...NO_GITHUB } });
      console.log("ios: built the app from the archive alone, with GitHub unreachable");
    } else {
      console.log("ios: Xcode isn't available here, so the app build from the archive was skipped");
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const opt = (flag, fallback) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : fallback);
  const source = rest.find((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
  try {
    if (command === "pack") await pack(resolve(opt("--out", join(ROOT, "release-assets"))));
    else if (command === "restore" && source) await restore(source, resolve(opt("--into", join(homedir(), ".illuxus-offline", inputsHash()))));
    else if (command === "verify" && source) await verify(source);
    else if (command === "name") console.log(archiveName());
    else {
      console.log("usage: node scripts/native-archive.mjs pack [--out <dir>] | restore <file|url> [--into <dir>] | verify <file> | name");
      process.exit(command ? 1 : 0);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
