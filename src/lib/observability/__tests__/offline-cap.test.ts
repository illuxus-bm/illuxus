// Feature: observability-foundation
//
// Validates: Requirement 5.8
//
// When the offline queue exceeds its 1000-record cap, it MUST evict the
// oldest record(s), retain at most 1000, and emit exactly one
// `warn 'offline queue overflow'` per eviction event (not per evicted
// record) via the `onOverflow` callback. The Logger wires `onOverflow`
// to a single `warn 'offline queue overflow'` emission per event.
//
// Strategy:
//   1. Construct an `OfflineQueue` backed by an in-memory store so the
//      test never touches real IDB or localStorage.
//   2. Enqueue 1001 records sequentially → assert count is 1000, the
//      oldest record was evicted, and `onOverflow` was called exactly
//      once with an eviction count of 1.
//   3. Enqueue one more record → assert `onOverflow` is called a second
//      time (one invocation per eviction event, not per record).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { OfflineQueue, type BackingStore } from '../offline-queue';
import type { LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// In-memory backing store — keeps the queue isolated from real I/O.
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

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRecord(seq: number): LogRecord {
  return {
    level: 'info',
    message: `m${seq}`,
    fields: { seq },
    timestamp: new Date(0).toISOString(),
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfflineQueue cap enforcement (REQ 5.8)', () => {
  let queue: OfflineQueue;
  let onOverflow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onOverflow = vi.fn();
    queue = new OfflineQueue({
      backing: new MemoryBacking(),
      onOverflow,
    });
  });

  afterEach(() => {
    queue.dispose();
  });

  it('retains 1000 records, evicts the oldest, and emits exactly one overflow warn when 1001 are enqueued', async () => {
    // Enqueue 1001 records sequentially. The 1001st enqueue triggers
    // the cap and evicts the oldest record (seq=0).
    for (let i = 0; i < 1001; i++) {
      await queue.enqueue(makeRecord(i));
    }

    // Cap holds at exactly 1000.
    expect(await queue.count()).toBe(1000);

    // onOverflow was called exactly once for the single eviction event,
    // and the argument is the number of records evicted in that event (1).
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenCalledWith(1);

    // Oldest record (seq=0) is gone; the surviving FIFO window is
    // seq=1..1000. peekBatch(1) returns the new head, which must be
    // seq=1 — proof that the oldest was evicted, not the newest.
    const head = await queue.peekBatch(1);
    expect(head).toHaveLength(1);
    expect(head[0].record.fields).toMatchObject({ seq: 1 });
  });

  it('emits one overflow warn per eviction event (one per enqueue past the cap, not per record)', async () => {
    // Fill the queue to exactly 1000 — no overflow yet.
    for (let i = 0; i < 1000; i++) {
      await queue.enqueue(makeRecord(i));
    }
    expect(await queue.count()).toBe(1000);
    expect(onOverflow).not.toHaveBeenCalled();

    // First over-cap enqueue → one overflow event.
    await queue.enqueue(makeRecord(1000));
    expect(await queue.count()).toBe(1000);
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenLastCalledWith(1);

    // Second over-cap enqueue → a second, independent overflow event
    // (REQ 5.8: one warn per eviction event, not coalesced).
    await queue.enqueue(makeRecord(1001));
    expect(await queue.count()).toBe(1000);
    expect(onOverflow).toHaveBeenCalledTimes(2);
    expect(onOverflow).toHaveBeenLastCalledWith(1);
  });
});
