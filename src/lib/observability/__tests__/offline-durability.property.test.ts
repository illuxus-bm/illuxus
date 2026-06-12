// Feature: observability-foundation, Property 7: Offline_Queue is durable and FIFO across tab close
//
// For any sequence of emit-while-offline calls followed by a tab-close event,
// the records recoverable on the next page load equal the offline-emitted
// sequence in order; and successful delivery to the Remote_Sink removes
// exactly the delivered record before the next is dispatched.
//
// Validates: Requirements 5.6, 6.3, 6.4

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { OfflineQueue } from '../offline-queue';
import type { LogLevel, LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// Generators — small LogRecord values (message + level + fields)
// ---------------------------------------------------------------------------

const levelArb: fc.Arbitrary<LogLevel> = fc.constantFrom<LogLevel>(
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
);

const fieldValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 16 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

const fieldsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  fieldValueArb,
  { maxKeys: 4 },
);

const recordArb: fc.Arbitrary<LogRecord> = fc.record({
  level: levelArb,
  message: fc.string({ maxLength: 32 }),
  fields: fieldsArb,
  // The metadata fields below are normally stamped by the Logger; the
  // OfflineQueue treats LogRecord as opaque payload, so any consistent values
  // round-tripping through structured clone are sufficient for this property.
  timestamp: fc.constant(new Date(0).toISOString()),
  build_sha: fc.constant('test-sha'),
  route: fc.constant('/test'),
  correlation_id: fc.option(fc.uuid(), { nil: null }),
  user_id: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
});

// ---------------------------------------------------------------------------
// Per-iteration storage isolation
// ---------------------------------------------------------------------------

function resetStorage(): void {
  // Replacing the factory drops every IDB database from the previous
  // iteration, including the `observability` DB the queue creates lazily.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  try {
    localStorage.clear();
  } catch {
    /* jsdom may or may not expose localStorage; either way, ignore */
  }
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 7: Offline_Queue is durable and FIFO across tab close', () => {
  it('records survive `pagehide` and drain in input order with one-record-at-a-time ack', async () => {
    await fc.assert(
      fc.asyncProperty(
        // maxLength 20 keeps the one-by-one drain inside the
        // OfflineQueue's token-bucket capacity (20 tokens at construction).
        fc.array(recordArb, { minLength: 1, maxLength: 20 }),
        async (records) => {
          resetStorage();

          // 1. Construct an OfflineQueue and enqueue every record.
          //    This simulates `logger.warn(...)` while offline: each call
          //    persists asynchronously to the IndexedDB primary store.
          const original = new OfflineQueue();
          try {
            for (const record of records) {
              await original.enqueue(record);
            }

            // 2. Simulate `pagehide` (tab close). The OfflineQueue's
            //    listener mirrors the in-memory queue to localStorage as a
            //    durability backup before the unload completes.
            globalThis.dispatchEvent(new Event('pagehide'));
          } finally {
            // Closes the IDB connection so the fresh queue below can open
            // its own connection without a version-upgrade block.
            original.dispose();
          }

          // 3. Construct a fresh OfflineQueue (simulating page reload).
          //    Its lazy init reconciles from the IDB primary store and
          //    merges in any localStorage backup left by `pagehide`.
          const reloaded = new OfflineQueue();
          try {
            // 4 + 5. Successful delivery removes exactly the delivered
            //        record before the next is dispatched. Driving this
            //        with peekBatch(1) → ack also proves the records come
            //        back in the original input order: the i-th peek must
            //        match records[i]. Each iteration consumes one token
            //        from the queue's 20-token bucket, so this loop is
            //        bounded by maxLength: 20 above.
            for (let i = 0; i < records.length; i++) {
              const batch = await reloaded.peekBatch(1);
              expect(batch.length).toBe(1);
              expect(batch[0].record).toEqual(records[i]);

              // Ack removes exactly that record — count drops by exactly
              // one before the next peek is dispatched.
              const before = await reloaded.count();
              await reloaded.ack([batch[0].key]);
              const after = await reloaded.count();
              expect(after).toBe(before - 1);
            }

            // 6. Queue is exhausted and nothing reappears.
            //    peekBatch returns early on empty candidates, so this
            //    final call does not need a token.
            const empty = await reloaded.peekBatch(1);
            expect(empty.length).toBe(0);
            expect(await reloaded.count()).toBe(0);
          } finally {
            reloaded.dispose();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
