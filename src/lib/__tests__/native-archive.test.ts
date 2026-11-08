/**
 * The native side of the dependency archive (scripts/native-archive.mjs):
 * every remote Swift package must be pinned to one version so the archive
 * can stand in for GitHub, and each archive is named after the build files
 * it was made from.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
let mod: {
  swiftPackages: (root?: string) => Array<{ url: string; version: string; name: string }>;
  archiveName: (root?: string) => string;
};

beforeAll(async () => {
  mod = await import(/* @vite-ignore */ pathToFileURL(join(ROOT, "scripts", "native-archive.mjs")).href);
});

describe("native archive", () => {
  it("finds the iOS app's remote Swift packages, each at an exact version", () => {
    const packages = mod.swiftPackages();
    expect(packages.map((p) => p.name)).toContain("capacitor-swift-pm");
    for (const p of packages) expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("names the archive after the native build files", () => {
    expect(mod.archiveName()).toMatch(/^illuxus-native-[0-9a-f]{12}\.tar$/);
  });
});
