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
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ANDROID_VERSION_FILE = resolve(ROOT, "android/version.properties");
export const IOS_PROJECT_FILE = resolve(ROOT, "ios/App/App.xcodeproj/project.pbxproj");

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** { versionName, versionCode } from version.properties text. */
export function readAndroidVersion(text) {
  const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? null;
  const code = get("versionCode");
  return { versionName: get("versionName"), versionCode: code === null ? null : Number(code) };
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
    const problems = versionProblems(current, readIosVersions(iosText));
    console.log(`Version ${current.versionName}, build ${current.versionCode}`);
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
  writeFileSync(ANDROID_VERSION_FILE, writeAndroidVersion(androidText, versionName, versionCode));
  writeFileSync(IOS_PROJECT_FILE, writeIosVersion(iosText, versionName, versionCode));
  console.log(`Set version ${versionName}, build ${versionCode} for Android and iOS.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
