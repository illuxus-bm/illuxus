/**
 * The store-release guard rails for the iOS and Android apps
 * (scripts/check-app-release.mjs, app-version.mjs, app-links.mjs).
 * Running the checker here means a change that would ship an unsafe or
 * mismatched app build fails CI, not the store review.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const load = (name: string) => import(/* @vite-ignore */ pathToFileURL(join(ROOT, "scripts", name)).href);

type Result = { errors: string[]; warnings: string[] };
let checkAppRelease: (root?: string, env?: Record<string, string | undefined>) => Result;
let versions: {
  readAndroidVersion: (t: string) => { versionName: string | null; versionCode: number | null };
  writeAndroidVersion: (t: string, n: string, c: number) => string;
  readIosVersions: (t: string) => { marketing: string[]; build: string[] };
  writeIosVersion: (t: string, n: string, c: number) => string;
};
let links: {
  appleAppSiteAssociation: (team: string) => { applinks: { details: Array<{ appIDs: string[]; components: unknown[] }> } };
  assetLinks: (prints: string[]) => Array<{ target: { package_name: string; sha256_cert_fingerprints: string[] } }>;
};

beforeAll(async () => {
  ({ checkAppRelease } = await load("check-app-release.mjs"));
  versions = await load("app-version.mjs");
  links = await load("app-links.mjs");
});

// A copy of just the files the checker reads, to break on purpose.
const FILES = [
  "capacitor.config.ts",
  "android/version.properties",
  "android/variables.gradle",
  "android/app/src/main/AndroidManifest.xml",
  "ios/App/App/Info.plist",
  "ios/App/App.xcodeproj/project.pbxproj",
  "public/app-config.json",
  "vercel.json",
];
let fixture: string | null = null;
const makeFixture = () => {
  fixture = mkdtempSync(join(tmpdir(), "app-release-"));
  for (const f of FILES) cpSync(join(ROOT, f), join(fixture, f), { recursive: true });
  return fixture;
};
const edit = (root: string, file: string, change: (s: string) => string) =>
  writeFileSync(join(root, file), change(readFileSync(join(root, file), "utf8")));

afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = null;
});

describe("check-app-release", () => {
  it("passes on the repository as it stands", () => {
    expect(checkAppRelease(ROOT).errors).toEqual([]);
  });

  it("refuses a build that backs up the signed-in session", () => {
    const root = makeFixture();
    edit(root, "android/app/src/main/AndroidManifest.xml", (s) => s.replace('android:allowBackup="false"', 'android:allowBackup="true"'));
    expect(checkAppRelease(root).errors.join("\n")).toMatch(/allowBackup/);
  });

  it("refuses a live-reload server URL", () => {
    const root = makeFixture();
    edit(root, "capacitor.config.ts", (s) => s.replace('androidScheme: "https",', 'androidScheme: "https",\n    url: "http://192.168.1.5:8080",'));
    expect(checkAppRelease(root).errors.join("\n")).toMatch(/server\.url/);
  });

  it("refuses iOS and Android versions that differ", () => {
    const root = makeFixture();
    edit(root, "android/version.properties", (s) => s.replace(/^versionName=.*$/m, "versionName=9.9.9"));
    expect(checkAppRelease(root).errors.join("\n")).toMatch(/MARKETING_VERSION/);
  });

  it("refuses a minimum version that would lock out the release itself", () => {
    const root = makeFixture();
    edit(root, "public/app-config.json", (s) => s.replace(/"ios": "[^"]+"/, '"ios": "99.0.0"'));
    expect(checkAppRelease(root).errors.join("\n")).toMatch(/lock itself out/);
  });

  it("warns, without failing, when signing and app links aren't set up", () => {
    const root = makeFixture();
    const { errors, warnings } = checkAppRelease(root, {});
    expect(errors).toEqual([]);
    expect(warnings.join("\n")).toMatch(/upload key/);
    expect(warnings.join("\n")).toMatch(/apple-app-site-association/);
  });
});

describe("app-version", () => {
  it("rewrites both projects' versions", () => {
    const props = "# c\nversionName=1.0.0\nversionCode=1\n";
    expect(versions.readAndroidVersion(versions.writeAndroidVersion(props, "1.4.0", 12))).toEqual({ versionName: "1.4.0", versionCode: 12 });
    const pbx = "MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\n";
    expect(versions.readIosVersions(versions.writeIosVersion(pbx, "1.4.0", 12))).toEqual({ marketing: ["1.4.0", "1.4.0"], build: ["12", "12"] });
  });
});

describe("app-links", () => {
  it("names the app for both stores", () => {
    const aasa = links.appleAppSiteAssociation("ABCDE12345");
    expect(aasa.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.illuxus.app"]);
    // Server endpoints never open the app; everything else does.
    expect(aasa.applinks.details[0].components).toContainEqual({ "/": "/api/*", exclude: true });
    expect(aasa.applinks.details[0].components.at(-1)).toEqual({ "/": "*" });
    const print = Array.from({ length: 32 }, () => "AB").join(":");
    expect(links.assetLinks([print])[0].target).toMatchObject({ package_name: "com.illuxus.app", sha256_cert_fingerprints: [print] });
  });
});
