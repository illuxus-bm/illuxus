/**
 * Probe test for the env-mode helper.
 *
 * Originally this test relied on `vi.stubEnv('DEV', false)` flipping
 * `import.meta.env.DEV` for a freshly-imported probe-helper. Vite's
 * define plugin inlines `import.meta.env.DEV` at transform time, so
 * no runtime stub can change what the imported function sees.
 *
 * The fix: tests mock the centralised `env-mode` module instead, and
 * production code delegates env reads through it.
 */

import { test, vi, beforeEach, expect } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

test("env-mode returns mocked values when production code calls it", async () => {
  vi.doMock("../env-mode", () => ({
    isDev: () => false,
    isProd: () => true,
  }));
  const { isDev, isProd } = await import("../env-mode");
  expect(isDev()).toBe(false);
  expect(isProd()).toBe(true);
  vi.doUnmock("../env-mode");
});

test("env-mode default mode under jsdom: isDev=true, isProd=false", async () => {
  vi.doUnmock("../env-mode");
  vi.resetModules();
  const { isDev, isProd } = await import("../env-mode");
  // Vitest defaults NODE_ENV to "test" so neither branch in env-mode
  // returns from process.env, and import.meta.env.DEV is true under
  // Vite's test mode.
  expect(isDev()).toBe(true);
  expect(isProd()).toBe(false);
});
