// Feature: observability-foundation
//
// Validates: Requirement 6.6
//
// When the wrapped transport returns a non-retryable HTTP status
// (any 4xx other than 408 / 425 / 429), the offline-queue drain path
// MUST drop the record (ack it) and emit exactly one
// `warn 'remote sink rejected record'` via the `onError` callback,
// carrying the offending status code in the structured fields. This
// covers the "drop + warn" branch of the retry classification table
// in design.md ("Remote_Sink") for codes 401, 403, 404, and 422.
//
// Strategy:
//   1. Construct an `OfflineQueue` backed by an in-memory store so the
//      test never touches real IDB or localStorage.
//   2. Construct a Remote_Sink with a stub `SinkClient` that records
//      `captureMessage` / `captureException` calls, the queue, an
//      `onError` callback that captures `(message, fields)` pairs,
//      and the `_dispatchHook` test escape hatch that simulates a
//      wrapped transport returning the configured HTTP status code.
//   3. Enqueue a single record, drive the drain via the
//      `_drainOfflineQueue` test hook, and assert:
//        - the queue count drops to 0 (record acked)
//        - the stub client's capture method received exactly one call
//        - `onError` received exactly one
//          `('remote sink rejected record', { status })` call

import { describe, it, expect, beforeEach } from 'vitest';

import { createRemoteSink, type SinkClient } from '../sinks/remote';
import {
  OfflineQueue,
  type BackingStore,
} from '../offline-queue';
import type { LogRecord, Sink } from '../sinks/types';

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

function makeRecord(): LogRecord {
  return {
    level: 'info',
    message: 'hello world',
    fields: {},
    timestamp: '1970-01-01T00:00:00.000Z',
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
  };
}

interface CaptureRecord {
  kind: 'message' | 'exception';
  message?: string;
  level?: unknown;
  exception?: unknown;
}

function makeStubClient(): { client: SinkClient; captures: CaptureRecord[] } {
  const captures: CaptureRecord[] = [];
  const client: SinkClient = {
    captureMessage(message, level) {
      captures.push({ kind: 'message', message, level });
      return 'stub-event-id';
    },
    captureException(exception) {
      captures.push({ kind: 'exception', exception });
      return 'stub-event-id';
    },
  };
  return { client, captures };
}

/**
 * Sink with the test-only `_drainOfflineQueue` escape hatch exposed by
 * `createRemoteSink` (see `sinks/remote.ts`). Cast at the call site so
 * production callers never see the hook.
 */
type DrainableSink = Sink & { _drainOfflineQueue: () => Promise<void> };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Remote_Sink — non-retryable HTTP status drops record (REQ 6.6)', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue({ backing: new MemoryBacking() });
  });

  // The non-retryable branch covers any 4xx other than 408 / 425 / 429.
  // 401 / 403 / 404 / 422 are the realistic codes a Sentry-compatible
  // backend returns for auth, permission, missing project, and payload
  // validation failures respectively.
  const NON_RETRYABLE_CODES = [401, 403, 404, 422] as const;

  for (const status of NON_RETRYABLE_CODES) {
    it(`drops the record and emits one 'remote sink rejected record' warn for HTTP ${status}`, async () => {
      const { client, captures } = makeStubClient();
      const onErrorCalls: Array<{
        message: string;
        fields: Record<string, unknown>;
      }> = [];

      const sink = createRemoteSink({
        client,
        queue,
        onError: (message, fields) => {
          onErrorCalls.push({ message, fields });
        },
        // Wrapped-transport simulator: resolves to the configured
        // status code so the retry classifier sees the same input it
        // would see from a real Sentry endpoint returning that status.
        _dispatchHook: async () => ({ code: status, networkError: false }),
      }) as DrainableSink;

      // Pre-condition: enqueue one record so drain has something to do.
      await queue.enqueue(makeRecord());
      expect(await queue.count()).toBe(1);

      // Drive the drain path directly. The test hook awaits the full
      // pipeline (peekBatch → dispatchRecord → status hook → ack /
      // requeue) before resolving.
      await sink._drainOfflineQueue();

      // Record was acked (dropped from the queue).
      expect(await queue.count()).toBe(0);

      // Stub client saw exactly one capture call. The record carried
      // `level: 'info'` and no `error` field, so it routes to
      // `captureMessage` rather than `captureException`.
      expect(captures).toHaveLength(1);
      expect(captures[0].kind).toBe('message');
      expect(captures[0].message).toBe('hello world');

      // Exactly one `warn 'remote sink rejected record'` was emitted,
      // carrying the rejecting status code.
      expect(onErrorCalls).toHaveLength(1);
      expect(onErrorCalls[0].message).toBe('remote sink rejected record');
      expect(onErrorCalls[0].fields).toMatchObject({ status });
    });
  }

  it('does not emit the warn for retryable statuses (sanity check that the classifier does not over-fire)', async () => {
    // 408 / 425 / 429 are explicitly retryable per the classification
    // table — they MUST NOT trigger the drop+warn branch. This guards
    // against a regression where the classifier collapses every 4xx
    // into "drop", which would silently hide retry behaviour.
    const { client } = makeStubClient();
    const onErrorCalls: Array<{ message: string }> = [];

    const sink = createRemoteSink({
      client,
      queue,
      onError: (message, fields) => {
        onErrorCalls.push({ message, fields: { ...fields } });
      },
      _dispatchHook: async () => ({ code: 429, networkError: false }),
    }) as DrainableSink;

    await queue.enqueue(makeRecord());
    await sink._drainOfflineQueue();

    // Record stays in the queue (requeued with backoff), and no warn
    // was emitted for a retryable status.
    expect(await queue.count()).toBe(1);
    expect(onErrorCalls).toHaveLength(0);
  });
});
