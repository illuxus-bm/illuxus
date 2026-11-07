#!/usr/bin/env node
/**
 * Pre-release check for the iOS and Android apps. Run before every store
 * upload (`bun run app:check`); the test suite runs it too, so a change that
 * would ship a broken or unsafe build fails CI.
 *
 * Errors (exit 1) are things that must not ship: a live-reload server URL,
 * backups of the signed-in session, versions that differ between the stores,
 * a minimum version that would lock out the release itself, …
 * Warnings are things to finish before launch that the code can't do alone:
 * the app-link files, release signing, the App Store link.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readAndroidVersion, readIosVersions, versionProblems } from "./app-version.mjs";
import { APP_ID, SHA256_PATTERN } from "./app-links.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const compare = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
};

/** { errors, warnings } for the repository at `root`. */
export function checkAppRelease(root = DEFAULT_ROOT, env = process.env) {
  const errors = [];
  const warnings = [];
  const read = (rel) => {
    const p = resolve(root, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const json = (rel) => {
    const text = read(rel);
    if (text === null) return { missing: true };
    try {
      return { value: JSON.parse(text) };
    } catch (err) {
      return { invalid: err.message };
    }
  };

  // ── Capacitor ──────────────────────────────────────────────────────────────
  const cap = read("capacitor.config.ts") ?? "";
  if (/\burl\s*:/.test(cap.replace(/\/\/.*$/gm, ""))) {
    errors.push("capacitor.config.ts sets server.url (live reload). The store build must load its bundled files.");
  }
  if (/cleartext\s*:\s*true/.test(cap)) errors.push("capacitor.config.ts allows cleartext (http) traffic.");
  if (!cap.includes(`appId: "${APP_ID}"`)) errors.push(`capacitor.config.ts appId isn't ${APP_ID}.`);

  // ── Versions ───────────────────────────────────────────────────────────────
  const android = readAndroidVersion(read("android/version.properties") ?? "");
  const ios = readIosVersions(read("ios/App/App.xcodeproj/project.pbxproj") ?? "");
  errors.push(...versionProblems(android, ios));

  // ── Android ────────────────────────────────────────────────────────────────
  const manifest = read("android/app/src/main/AndroidManifest.xml") ?? "";
  if (!/android:allowBackup="false"/.test(manifest)) {
    errors.push("AndroidManifest.xml must set android:allowBackup=\"false\": backups would copy the signed-in session.");
  }
  if (!/android:dataExtractionRules=/.test(manifest)) {
    errors.push("AndroidManifest.xml needs android:dataExtractionRules (Android 12+ device transfer).");
  }
  if (/android:debuggable="true"/.test(manifest)) errors.push("AndroidManifest.xml sets android:debuggable=\"true\".");
  if (/android:usesCleartextTraffic="true"/.test(manifest)) errors.push("AndroidManifest.xml allows cleartext (http) traffic.");
  const variables = read("android/variables.gradle") ?? "";
  const targetSdk = Number(variables.match(/targetSdkVersion\s*=\s*(\d+)/)?.[1]);
  if (!(targetSdk >= 35)) errors.push(`Android targetSdkVersion is ${targetSdk || "unset"}; Google Play requires 35 or later.`);
  const signed = existsSync(resolve(root, "android/keystore.properties")) || Boolean(env.ILLUXUS_UPLOAD_STORE_FILE);
  if (!signed) {
    warnings.push("No Android upload key configured (android/keystore.properties or ILLUXUS_UPLOAD_*): release builds will be unsigned.");
  }

  // ── iOS ────────────────────────────────────────────────────────────────────
  const plist = read("ios/App/App/Info.plist") ?? "";
  if (!plist.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
    errors.push("Info.plist lacks ITSAppUsesNonExemptEncryption; every upload would stop at export compliance.");
  }
  if (/<string>armv7<\/string>/.test(plist)) errors.push("Info.plist requires armv7; iOS 15+ devices are arm64.");
  for (const key of ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSPhotoLibraryAddUsageDescription"]) {
    if (!plist.includes(`<key>${key}</key>`)) errors.push(`Info.plist lacks ${key}; iOS ends the app when the permission is asked for.`);
  }
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj") ?? "";
  if (!pbx.includes("PrivacyInfo.xcprivacy")) errors.push("PrivacyInfo.xcprivacy isn't part of the Xcode project; App Store uploads are refused without it.");

  // ── Retiring old versions (public/app-config.json) ─────────────────────────
  const config = json("public/app-config.json");
  if (config.missing) {
    errors.push("public/app-config.json is missing; old app versions couldn't be retired.");
  } else if (config.invalid) {
    errors.push(`public/app-config.json isn't valid JSON: ${config.invalid}`);
  } else {
    for (const platform of ["ios", "android"]) {
      const min = config.value?.minimumVersion?.[platform];
      if (min && android.versionName && compare(min, android.versionName) > 0) {
        errors.push(`app-config.json requires ${platform} ${min}, above this release's ${android.versionName}: it would lock itself out.`);
      }
    }
    if (!config.value?.storeUrl?.ios) {
      warnings.push("app-config.json has no iOS storeUrl: add https://apps.apple.com/app/id<App Store ID> once the app is listed, so \"Update\" opens it.");
    }
  }

  // ── App Links / Universal Links ────────────────────────────────────────────
  const aasa = json("public/.well-known/apple-app-site-association");
  if (aasa.missing) {
    warnings.push("No apple-app-site-association: illuxus.com links open in Safari, not the app. Run scripts/app-links.mjs.");
  } else if (aasa.invalid) {
    errors.push(`apple-app-site-association isn't valid JSON: ${aasa.invalid}`);
  } else {
    const ids = (aasa.value?.applinks?.details ?? []).flatMap((d) => d.appIDs ?? (d.appID ? [d.appID] : []));
    if (!ids.some((id) => /^[A-Z0-9]{10}\./.test(id) && id.endsWith(`.${APP_ID}`))) {
      errors.push(`apple-app-site-association doesn't name <TeamID>.${APP_ID}.`);
    }
  }
  const links = json("public/.well-known/assetlinks.json");
  if (links.missing) {
    warnings.push("No assetlinks.json: illuxus.com links open in the browser on Android. Run scripts/app-links.mjs.");
  } else if (links.invalid) {
    errors.push(`assetlinks.json isn't valid JSON: ${links.invalid}`);
  } else {
    const ours = (Array.isArray(links.value) ? links.value : []).find((s) => s?.target?.package_name === APP_ID);
    const prints = ours?.target?.sha256_cert_fingerprints ?? [];
    if (!ours || prints.length === 0 || !prints.every((f) => SHA256_PATTERN.test(f))) {
      errors.push(`assetlinks.json needs ${APP_ID} with valid SHA-256 fingerprints.`);
    }
  }
  const vercel = read("vercel.json") ?? "";
  if (!vercel.includes('"/.well-known/apple-app-site-association"')) {
    errors.push("vercel.json must serve apple-app-site-association as application/json.");
  }
  if (!vercel.includes('"/app-config.json"')) {
    errors.push("vercel.json must let the app read /app-config.json (CORS).");
  }

  return { errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, warnings } = checkAppRelease();
  for (const w of warnings) console.warn(`! ${w}`);
  for (const e of errors) console.error(`✗ ${e}`);
  console.log(errors.length ? `\n${errors.length} problem(s) to fix before release.` : `\nReady to build${warnings.length ? `, with ${warnings.length} thing(s) to finish before launch` : ""}.`);
  process.exit(errors.length ? 1 : 0);
}
