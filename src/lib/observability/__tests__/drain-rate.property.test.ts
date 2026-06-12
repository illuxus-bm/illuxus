// Feature: observability-foundation, Property 8: Offline drain is rate-limited to ≤ 20 records per 5 s window
//
// Validates: Requirement 5.7
//
// For any drain timeline starting from any queue size, the count of records
// dispatched in any 5-second sliding window is ≤ 20. This exercises the
// token-bucket rate limit built into `OfflineQueue.peekBatch`.
//
// Strategy:
//   1. Generate a queue prefill size (0..200) and a list of (advance, peekN)
//      timeline steps.
//   2. Inject a deterministic clock via `OfflineQueue` constructor option
//      `now` so we control wall time without touching real timers for
//      observation logic.
//   3. Apply each timeline step: advance the clock, call `peekBatch(N)`,
//      record the count of dispatched records and `ack()` them so the
//      queue's eligibility math reflects real drain semantics.
//   4. Slide a 5000 ms window over the dispatch log: for every window
//      bounded by a dispatch event timestamp `t_i`, sum every dispatch
//      count whose timestamp falls in `[t_i, t_i + 5000)` and assert the
//      sum is ≤ 20.

import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

import { OfflineQueue, type BackingStore } from '../offline-queue';
import type { LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// In-memory backing store (test isolation; avoids real IDB / localStorage).
// ---------------------------------------------------------------------------

interface StoredValue {
  record: LogRecord;
  attempts: number;
  nextAttemptAt: number;
}

class MemoryBacking implements BackingStore {
  private rows: Array<{ key: number; value: StoredValue }> = [];
  async getAll() {
    return this.rows.slice();
  }
  async add(key: number, value: StoredValue) {
    this.rows.push({ key, value });
  }
  async update(key: number, value: StoredValue) {
    const i = this.rows.findIndex((r) => r.key === key);
    if (i >= 0) this.rows[i] = { key, value };
  }
  async delete(keys: number[]) {
    const set = new Set(keys);
    this.rows = this.rows.filter((r) => !set.has(r.key));
  }
  async clear() {
    this.rows = [];
  }
}

function makeRecord(seq: number): LogRecord {
  return {
    level: 'info',
    message: `m${seq}`,
    fields: {},
    timestamp: new Date(0).toISOString(),
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
  };
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 8 — offline drain is rate-limited to ≤ 20 per 5s window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the count of records dispatched in any 5-second sliding window is ≤ 20', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Prefill size — bounded so the queue cap (1000) is never the gate.
        fc.integer({ min: 0, max: 200 }),
        // Timeline: each step advances the clock then peeks. `advanceMs`
        // covers sub-second, sub-window, and multi-window jumps so the
        // generator exercises all token-bucket refill regimes.
        fc.array(
          fc.record({
            advanceMs: fc.integer({ min: 0, max: 10_000 }),
            peekN: fc.integer({ min: 1, max: 30 }),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        async (prefill, timeline) => {
          let now = 0;
          const queue = new OfflineQueue({
            now: () => now,
            backing: new MemoryBacking(),
          });

          try {
            for (let i = 0; i < prefill; i++) {
              await queue.enqueue(makeRecord(i));
            }

            const dispatches: Array<{ t: number; count: number }> = [];

            for (const step of timeline) {
              now += step.advanceMs;
              const batch = await queue.peekBatch(step.peekN);
              if (batch.length > 0) {
                dispatches.push({ t: now, count: batch.length });
                await queue.ack(batch.map((b) => b.key));
              }
            }

            // Sliding window: for every dispatch event at time t_i, sum the
            // counts in [t_i, t_i + 5000) and assert ≤ 20. Dispatches are
            // already in chronological order because `now` is monotonic.
            for (let i = 0; i < dispatches.length; i++) {
              const start = dispatches[i].t;
              let sum = 0;
              for (let j = i; j < dispatches.length; j++) {
                if (dispatches[j].t < start + 5000) {
                  sum += dispatches[j].count;
                } else {
                  break;
                }
              }
              if (sum > 20) {
                return false;
              }
            }
            return true;
          } finally {
            queue.dispose();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
