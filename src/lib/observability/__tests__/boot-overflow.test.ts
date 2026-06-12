// Feature: observability-foundation — Example test: boot-overflow
//
// Validates: Requirements 4.5, 12.4
//
// The Boot_Buffer is a bounded FIFO ring with capacity 64. Once a 65th
// pre-init emit lands, the oldest entry is evicted and a single-shot
// `overflowed` flag is raised. On drain, the flag MUST cause a synthetic
// `warn 'boot buffer overflowed'` record to be emitted as the FIRST
// replay record — before any of the 64 retained entries (REQ 4.5).
//
// Strategy:
//   1. Reset the module cache and clear `window.__observabilityBoot` so a
//      fresh boot stub is installed by re-importing `../boot`. This is
//      necessary because the install side-effect guards on
//      `!window.__observabilityBoot`, so without a reset we'd inherit a
//      stub mutated by other tests in the same jsdom realm.
//   2. Push 65 typed `info` records carrying their ordinal in the message
//      and fields; record 0 is the canary that MUST be evicted.
//   3. Read `__buffer__` and `__overflowed__` directly to assert the
//      retention contract before draining.
//   4. Build a mock logger whose six emit methods append `{ level, message,
//      fields }` tuples to a shared `calls` array — preserving order is
//      what we want to assert about the drain.
//   5. Call `__drain__(mockLogger)` and assert:
//        - calls[0] is `warn 'boot buffer overflowed'` (REQ 4.5)
//        - calls[1..64] are `info 'msg1' … 'msg64'` in order (REQ 12.4)
//        - `'msg0'` appears nowhere in the drain (FIFO eviction proof)

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ObservabilityBootStub } from '../boot';

interface DrainCall {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  fields: Record<string, unknown>;
}

function makeMockLogger() {
  const calls: DrainCall[] = [];
  const make = (level: DrainCall['level']) =>
    vi.fn((message: string, fields: Record<string, unknown> = {}) => {
      calls.push({ level, message, fields });
    });
  const logger = {
    trace: make('trace'),
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    fatal: make('fatal'),
  };
  return { logger, calls };
}

describe('Boot_Buffer overflow handling (REQ 4.5, 12.4)', () => {
  let stub: ObservabilityBootStub;

  beforeEach(async () => {
    // Wipe any previously-installed stub from another test in this realm
    // and clear the module cache so the side-effect re-runs and installs
    // a fresh stub on the global.
    delete (window as { __observabilityBoot?: unknown }).__observabilityBoot;
    vi.resetModules();
    await import('../boot');
    const installed = window.__observabilityBoot;
    if (!installed) {
      throw new Error(
        'expected boot.ts side-effect to install window.__observabilityBoot under jsdom',
      );
    }
    stub = installed;
  });

  it('caps the buffer at 64 entries via FIFO eviction and replays overflow warn first', () => {
    // ── 1. Push 65 pre-init emits ──────────────────────────────────────
    for (let i = 0; i < 65; i += 1) {
      stub.info(`msg${i}`, { i });
    }

    // ── 2. Buffer state before drain ───────────────────────────────────
    expect(stub.__buffer__.length).toBe(64);
    expect(stub.__overflowed__).toBe(true);
    // FIFO eviction → 'msg0' (the oldest) was dropped, 'msg1' is now the
    // head and 'msg64' (the most recent) is the tail.
    expect(stub.__buffer__[0].message).toBe('msg1');
    expect(stub.__buffer__[stub.__buffer__.length - 1].message).toBe('msg64');
    expect(stub.__buffer__.every((e) => e.message !== 'msg0')).toBe(true);

    // ── 3. Drain into the mock logger ──────────────────────────────────
    const { logger, calls } = makeMockLogger();
    stub.__drain__(logger);

    // 1 synthetic overflow warn + 64 retained info records = 65 calls.
    expect(calls).toHaveLength(65);

    // ── 4. REQ 4.5 — overflow warn is the FIRST replay record ──────────
    expect(calls[0]).toMatchObject({
      level: 'warn',
      message: 'boot buffer overflowed',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenNthCalledWith(1, 'boot buffer overflowed', {});

    // ── 5. REQ 12.4 — drain order preserves FIFO of retained entries ───
    for (let i = 0; i < 64; i += 1) {
      const replayed = calls[i + 1];
      expect(replayed.level).toBe('info');
      expect(replayed.message).toBe(`msg${i + 1}`);
      // The original `i` field is preserved alongside the threaded
      // `_capturedAt` capture timestamp added by the drainer.
      expect(replayed.fields.i).toBe(i + 1);
      expect(typeof replayed.fields._capturedAt).toBe('number');
    }

    // The evicted `msg0` MUST NOT appear anywhere in the drain — this is
    // the strongest single assertion that FIFO eviction (not e.g. LIFO,
    // not "drop newest") was applied.
    expect(calls.some((c) => c.message === 'msg0')).toBe(false);

    // The 64 info replays should each fire on `logger.info` exactly once
    // and only the levels we expect should have been touched.
    expect(logger.info).toHaveBeenCalledTimes(64);
    expect(logger.trace).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.fatal).not.toHaveBeenCalled();
  });
});
