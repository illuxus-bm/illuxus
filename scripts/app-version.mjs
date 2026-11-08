#!/usr/bin/env node
/**
 * The iOS and Android apps' version, kept in step.
 *
 *   node scripts/app-version.mjs                 show both, fail if they differ
 *   node scripts/app-version.mjs 1.2.0 7         set version 1.2.0, build 7
 *
 * The version (1.2.0) is what people see in the stores. The build number must
 * go up with every upload to either store, even for the same version. Android
 * reads both from android/version.properties; iOS from MARKETING_VERSION and
 * CURRENT_PROJECT_VERSION in the Xcode project.
 *
 * Live updates (src/lib/native/live-update.ts) send a release's web code to
 * installed apps without a reinstall, but only to app shells it works with.
 * version.properties records that: `liveUpdateMinBuild`, the oldest build
 * whose native code matches, and `nativeFingerprint`, a hash of every native
 * input (the android/ and ios/ projects, capacitor.config.ts, the native
 * plugins in package.json). A bump checks the fingerprint: when native code
 * has changed, the new build becomes the minimum, so older shells are asked
 * to update instead of receiving code they can't run.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ANDROID_VERSION_FILE = resolve(ROOT, "android/version.properties");
export const IOS_PROJECT_FILE = resolve(ROOT, "ios/App/App.xcodeproj/project.pbxproj");

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** { versionName, versionCode, liveUpdateMinBuild, nativeFingerprint } from version.properties text. */
export function readAndroidVersion(text) {
  const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? null;
  const code = get("versionCode");
  const min = get("liveUpdateMinBuild");
  return {
    versionName: get("versionName"),
    versionCode: code === null ? null : Number(code),
    liveUpdateMinBuild: min === null ? null : Number(min),
    nativeFingerprint: get("nativeFingerprint"),
  };
}

/** Sets (or adds) one key in version.properties text. */
export function setProperty(text, key, value) {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${text.replace(/\n*$/, "\n")}${line}\n`;
}

// Package names whose code runs natively: adding, removing or upgrading one
// needs a new app shell.
const NATIVE_PACKAGE = /^(@capacitor\/(?!cli$|assets$)|@capgo\/|@capawesome|cordova-|capacitor-)/;

/**
 * A hash of everything native in the repository at `root`: the git-tracked
 * files under android/ and ios/ (without the version numbers, which change
 * every release), capacitor.config.ts, and the native plugins' versions.
 */
export function nativeFingerprint(root = ROOT) {
  const hash = createHash("sha256");
  const tracked = execFileSync("git", ["ls-files", "-z", "android", "ios", "capacitor.config.ts"], { cwd: root })
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((f) => f !== "android/version.properties")
    .sort();
  for (const file of tracked) {
    let content;
    try {
      content = readFileSync(resolve(root, file));
    } catch {
      continue; // deleted in the working tree
    }
    if (file.endsWith("project.pbxproj")) {
      content = Buffer.from(content.toString("utf8").replace(/(MARKETING_VERSION|CURRENT_PROJECT_VERSION) = [^;]+;/g, "$1;"));
    }
    hash.update(file).update("\0").update(content).update("\0");
  }
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps).filter((n) => NATIVE_PACKAGE.test(n)).sort()) {
    hash.update(`${name}@${deps[name]}\0`);
  }
  return hash.digest("hex").slice(0, 16);
}

/** Problems with the live-update fields; empty when consistent. */
export function liveUpdateProblems(android, fingerprint) {
  const problems = [];
  if (!Number.isInteger(android.liveUpdateMinBuild) || android.liveUpdateMinBuild < 1) {
    problems.push("android/version.properties has no liveUpdateMinBuild: bump the version with scripts/app-version.mjs.");
  } else if (Number.isInteger(android.versionCode) && android.liveUpdateMinBuild > android.versionCode) {
    problems.push(`liveUpdateMinBuild ${android.liveUpdateMinBuild} is above this build (${android.versionCode}).`);
  }
  if (android.nativeFingerprint !== fingerprint) {
    problems.push(
      `Native code has changed since build ${android.liveUpdateMinBuild ?? "?"} (fingerprint ${android.nativeFingerprint ?? "none"} → ${fingerprint}). ` +
        "Bump the build with scripts/app-version.mjs, so older app shells are asked to update instead of getting code they can't run.",
    );
  }
  return problems;
}

export function writeAndroidVersion(text, versionName, versionCode) {
  return text
    .replace(/^versionName=.*$/m, `versionName=${versionName}`)
    .replace(/^versionCode=.*$/m, `versionCode=${versionCode}`);
}

/** Every MARKETING_VERSION / CURRENT_PROJECT_VERSION in the Xcode project (one per build configuration). */
export function readIosVersions(text) {
  const all = (key) => [...text.matchAll(new RegExp(`${key} = ([^;]+);`, "g"))].map((m) => m[1].trim());
  return { marketing: all("MARKETING_VERSION"), build: all("CURRENT_PROJECT_VERSION") };
}

export function writeIosVersion(text, versionName, versionCode) {
  return text
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
}

/** Problems with the two projects' versions; empty when they agree. */
export function versionProblems(android, ios) {
  const problems = [];
  if (!android.versionName || !VERSION_PATTERN.test(android.versionName)) {
    problems.push(`Android versionName "${android.versionName}" isn't of the form 1.2.3.`);
  }
  if (!Number.isInteger(android.versionCode) || android.versionCode < 1) {
    problems.push(`Android versionCode "${android.versionCode}" isn't a whole number from 1 up.`);
  }
  if (ios.marketing.length === 0 || ios.build.length === 0) {
    problems.push("The Xcode project has no MARKETING_VERSION or CURRENT_PROJECT_VERSION.");
  }
  if (ios.marketing.some((v) => v !== android.versionName)) {
    problems.push(`iOS MARKETING_VERSION (${[...new Set(ios.marketing)].join(", ")}) differs from Android's ${android.versionName}.`);
  }
  if (ios.build.some((v) => v !== String(android.versionCode))) {
    problems.push(`iOS CURRENT_PROJECT_VERSION (${[...new Set(ios.build)].join(", ")}) differs from Android's ${android.versionCode}.`);
  }
  return problems;
}

function main(args) {
  const androidText = readFileSync(ANDROID_VERSION_FILE, "utf8");
  const iosText = readFileSync(IOS_PROJECT_FILE, "utf8");
  const current = readAndroidVersion(androidText);

  if (args.length === 0) {
    const problems = [...versionProblems(current, readIosVersions(iosText)), ...liveUpdateProblems(current, nativeFingerprint())];
    console.log(`Version ${current.versionName}, build ${current.versionCode} (live updates reach build ${current.liveUpdateMinBuild ?? "?"} and later)`);
    for (const p of problems) console.error(`✗ ${p}`);
    return problems.length ? 1 : 0;
  }

  const [versionName, codeArg] = args;
  const versionCode = Number(codeArg);
  if (!VERSION_PATTERN.test(versionName ?? "") || !Number.isInteger(versionCode) || versionCode < 1) {
    console.error("Usage: node scripts/app-version.mjs <version like 1.2.0> <build number>");
    return 2;
  }
  if (Number.isInteger(current.versionCode) && versionCode <= current.versionCode) {
    console.warn(`! Build ${versionCode} isn't above the current ${current.versionCode}; the stores refuse a build number they've seen.`);
  }
  const fingerprint = nativeFingerprint();
  const nativeChanged = current.nativeFingerprint !== fingerprint || !Number.isInteger(current.liveUpdateMinBuild);
  let props = writeAndroidVersion(androidText, versionName, versionCode);
  if (nativeChanged) {
    props = setProperty(props, "liveUpdateMinBuild", versionCode);
    props = setProperty(props, "nativeFingerprint", fingerprint);
  }
  writeFileSync(ANDROID_VERSION_FILE, props);
  writeFileSync(IOS_PROJECT_FILE, writeIosVersion(iosText, versionName, versionCode));
  console.log(`Set version ${versionName}, build ${versionCode} for Android and iOS.`);
  console.log(
    nativeChanged
      ? `Native code changed: this release needs the new app shell. Live updates of it go to build ${versionCode} and later; older apps are asked to update.`
      : `Native code unchanged: installed apps from build ${current.liveUpdateMinBuild} up get this release as a live update.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
