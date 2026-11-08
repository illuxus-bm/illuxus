/**
 * The npm side of the dependency archive (scripts/npm-archive.mjs): every
 * package must come from the public registry with a SHA-512, so the archive
 * can stand in for it. A lockfile that pulls from a third-party cache (as 71
 * packages once did, from Lovable's) fails here.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
type Pkg = { name: string; version: string; registry: string; integrity: string };
let mod: {
  readLock: (t: string) => unknown;
  lockedPackages: (l: unknown) => Pkg[];
  lockProblems: (l: unknown) => string[];
  archiveName: (t: string) => string;
};

beforeAll(async () => {
  mod = await import(/* @vite-ignore */ pathToFileURL(join(ROOT, "scripts", "npm-archive.mjs")).href);
});

describe("npm archive", () => {
  it("bun.lock installs everything from the public npm registry", () => {
    const lock = mod.readLock(readFileSync(join(ROOT, "bun.lock"), "utf8"));
    expect(mod.lockedPackages(lock).length).toBeGreaterThan(500);
    expect(mod.lockProblems(lock)).toEqual([]);
  });

  it("flags a package fetched from somewhere else", () => {
    const lock = { packages: { a: ["left-pad@1.3.0", "https://example-npm.pkg.dev/cache/left-pad/-/left-pad-1.3.0.tgz", {}, "sha512-x"] } };
    expect(mod.lockProblems(lock).join()).toMatch(/not npm/);
  });

  it("names each archive after its bun.lock", () => {
    expect(mod.archiveName("a")).toMatch(/^illuxus-npm-[0-9a-f]{12}\.tar$/);
    expect(mod.archiveName("a")).not.toBe(mod.archiveName("b"));
  });
});
