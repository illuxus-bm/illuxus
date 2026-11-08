/**
 * The edge functions' libraries live in supabase/functions/_vendor
 * (scripts/vendor-edge-deps.mjs), so deploys never fetch code from esm.sh,
 * deno.land or npm. This fails CI if a function imports from the internet
 * again, or a vendored file was edited by hand or lost.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

it("edge functions import only vendored, unmodified libraries", () => {
  // Its own Node process: the checker uses esbuild, which can't run in jsdom.
  const run = spawnSync(process.execPath, ["scripts/vendor-edge-deps.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  expect(run.stderr.trim()).toBe("");
  expect(run.status).toBe(0);
}, 60_000);
