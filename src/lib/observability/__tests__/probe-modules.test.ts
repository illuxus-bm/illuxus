import { test, vi, beforeEach, afterEach, expect } from 'vitest';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); });

test('rpc-style isDev/isProd respects vi.stubEnv', async () => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('DEV', false);
  
  const { isDev, isProd } = await import('./probe-helper');
  expect(isDev()).toBe(false);
  expect(isProd()).toBe(true);
});

test('default mode: isDev=true, isProd=false', async () => {
  const { isDev, isProd } = await import('./probe-helper');
  expect(isDev()).toBe(true);
  expect(isProd()).toBe(false);
});
