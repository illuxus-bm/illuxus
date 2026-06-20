/**
 * Single-source env-mode helpers for the observability layer.
 *
 * Why these live in their own module
 * ----------------------------------
 * `import.meta.env.DEV` and `import.meta.env.PROD` are inlined by Vite's
 * define plugin at transform time as literal `true` / `false`. That means
 * any module that reads them directly is locked to whatever Vite saw at
 * compile time — including in vitest, where `vi.stubEnv` and direct
 * mutation of `import.meta.env` cannot retroactively change the inlined
 * literal inside an already-transformed module.
 *
 * Tests need to flip these values to assert the dev-only / prod-only
 * branches in `rpc.ts` and `logger.ts`. By centralising the reads here,
 * tests can `vi.mock('@/lib/observability/env-mode', ...)` to inject
 * controlled return values without touching the production code path.
 *
 * Production code keeps reading `import.meta.env`. The dual-read on
 * `process.env.NODE_ENV` is a belt-and-braces fallback for Node / CI
 * runners that don't go through Vite's transform — `process.env`
 * mutation always works.
 */

export function isDev(): boolean {
  try {
    if (typeof process !== "undefined") {
      const node = process.env?.NODE_ENV;
      if (node === "production") return false;
      if (node === "development") return true;
    }
  } catch {
    /* fall through */
  }
  try {
    return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

export function isProd(): boolean {
  try {
    if (typeof process !== "undefined") {
      const node = process.env?.NODE_ENV;
      if (node === "production") return true;
      if (node === "development") return false;
    }
  } catch {
    /* fall through */
  }
  try {
    return (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;
  } catch {
    return false;
  }
}
