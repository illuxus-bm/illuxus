// IndexedDB-backed FIFO offline queue for the observability remote sink.
//
// Per design.md "Offline Queue (offline-queue.ts)":
//
//   schema (IndexedDB store `observability_queue`):
//     key:    auto-increment number     // FIFO order
//     value:  { record: LogRecord, attempts: number, nextAttemptAt: number }
//
// Operations:
//   - enqueue(record)         : append; cap at 1000, evict oldest, emit one
//                               'offline queue overflow' warn per eviction
//                               event (not per evicted record).
//   - peekBatch(n)            : up to n entries with nextAttemptAt <= now.
//                               Built-in sliding-window rate limit: strictly
//                               ≤ 20 dispatches in any 5-second window
//                               (counts dispatches in [now-5000ms, now]).
//   - ack(keys)               : delete by keys.
//   - requeue(key)            : increment attempts, schedule next attempt
//                               with exponential backoff capped at 60 s.
//   - clear()                 : drop all (used by privacy opt-out toggle).
//   - count()                 : in-memory size.
//
// Storage strategy:
//   - If `globalThis.indexedDB` exists, use IDB with object store
//     `observability_queue` and out-of-line auto-increment keys.
//   - Else fall back to `localStorage` under key `observability:queue`.
//   - Else fall back to in-memory only (e.g., bare Node test env without
//     jsdom). Data is lost on close but the API still works.
//
// Durability backup: a single `pagehide` listener synchronously copies the
// in-memory mirror to `localStorage['observability:queue:backup']`. The
// next page load reconciles whatever made it to the primary store.
//
// All disk I/O is asynchronous; the in-memory mirror is updated
// synchronously inside each operation so the emit hot path never blocks
// on disk.
//
// Validates: Requirements 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6.

import type { LogRecord } from './sinks/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OfflineQueueEntry {
  /** Monotonic key; FIFO order is `keys` ascending. */
  key: number;
  /** Redacted record awaiting delivery. */
  record: LogRecord;
  /** Number of failed delivery attempts so far. */
  attempts: number;
  /** ms-epoch; eligible for dispatch when `<= now`. */
  nextAttemptAt: number;
}

export interface OfflineQueueOptions {
  /**
   * Called once per eviction event when the cap is exceeded. The argument
   * is the number of records evicted in that single event. The Logger
   * wires this to a single `warn 'offline queue overflow'` emission.
   */
  onOverflow?: (evictedCount: number) => void;
  /** Injected clock for deterministic testing. */
  now?: () => number;
  /** Inject a backing store (mainly for tests). */
  backing?: BackingStore;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'observability';
const DB_VERSION = 1;
const STORE_NAME = 'observability_queue';
const LS_PRIMARY_KEY = 'observability:queue';
const LS_BACKUP_KEY = 'observability:queue:backup';

const MAX_ENTRIES = 1000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

const MAX_DISPATCHES_PER_WINDOW = 20;
const DISPATCH_WINDOW_MS = 5_000;

// ---------------------------------------------------------------------------
// Backing store contract
// ---------------------------------------------------------------------------

/** Value-side payload stored alongside an out-of-line numeric key. */
interface StoredValue {
  record: LogRecord;
  attempts: number;
  nextAttemptAt: number;
}

/** Raw row read back from a backing store, key + value. */
interface StoredRow {
  key: number;
  value: StoredValue;
}

export interface BackingStore {
  /** Read all rows (any order; caller will sort). */
  getAll(): Promise<StoredRow[]>;
  /** Insert with caller-supplied key. Implementations may reject duplicates. */
  add(key: number, value: StoredValue): Promise<void>;
  /** Overwrite the row at `key`. */
  update(key: number, value: StoredValue): Promise<void>;
  /** Delete every row whose key is in `keys`. Missing keys are ignored. */
  delete(keys: number[]): Promise<void>;
  /** Drop all rows. */
  clear(): Promise<void>;
  /**
   * Optional cooperative close hook. For IDB this releases the underlying
   * `IDBDatabase` connection so that `deleteDatabase` and version upgrades
   * are not blocked. No-op for in-memory and localStorage backings.
   */
  close?(): void;
}

// ---------------------------------------------------------------------------
// IndexedDB backing
// ---------------------------------------------------------------------------

class IDBBacking implements BackingStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly idb: IDBFactory) {}

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.idb.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    return this.dbPromise;
  }

  async getAll(): Promise<StoredRow[]> {
    const db = await this.openDb();
    return new Promise<StoredRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const out: StoredRow[] = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          out.push({
            key: Number(cursor.key),
            value: cursor.value as StoredValue,
          });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async add(key: number, value: StoredValue): Promise<void> {
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      try {
        store.add(value, key);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IDB add aborted'));
    });
  }

  async update(key: number, value: StoredValue): Promise<void> {
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      try {
        store.put(value, key);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IDB update aborted'));
    });
  }

  async delete(keys: number[]): Promise<void> {
    if (keys.length === 0) return;
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      try {
        for (const k of keys) store.delete(k);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IDB delete aborted'));
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  close(): void {
    if (!this.dbPromise) return;
    const captured = this.dbPromise;
    this.dbPromise = null;
    captured.then(
      (db) => {
        try {
          db.close();
        } catch {
          /* already closed */
        }
      },
      () => {
        /* open failed; nothing to close */
      }
    );
  }
}

// ---------------------------------------------------------------------------
// localStorage backing
// ---------------------------------------------------------------------------

class LocalStorageBacking implements BackingStore {
  private cache: StoredRow[] | null = null;

  constructor(private readonly ls: Storage) {}

  private load(): StoredRow[] {
    if (this.cache) return this.cache;
    try {
      const raw = this.ls.getItem(LS_PRIMARY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          // Light validation: each entry must have a numeric key and a value
          // object. Anything else is dropped silently — best-effort recovery.
          this.cache = (parsed as StoredRow[]).filter(
            (r) =>
              r &&
              typeof r.key === 'number' &&
              r.value &&
              typeof r.value === 'object'
          );
          return this.cache;
        }
      }
    } catch {
      /* corrupt backup — start empty */
    }
    this.cache = [];
    return this.cache;
  }

  private persist(): void {
    if (!this.cache) return;
    try {
      this.ls.setItem(LS_PRIMARY_KEY, JSON.stringify(this.cache));
    } catch {
      /* quota — best effort */
    }
  }

  async getAll(): Promise<StoredRow[]> {
    return this.load().slice();
  }

  async add(key: number, value: StoredValue): Promise<void> {
    const rows = this.load();
    rows.push({ key, value });
    this.persist();
  }

  async update(key: number, value: StoredValue): Promise<void> {
    const rows = this.load();
    const idx = rows.findIndex((r) => r.key === key);
    if (idx >= 0) {
      rows[idx] = { key, value };
      this.persist();
    }
  }

  async delete(keys: number[]): Promise<void> {
    if (keys.length === 0) return;
    const set = new Set(keys);
    const rows = this.load();
    const next = rows.filter((r) => !set.has(r.key));
    this.cache = next;
    this.persist();
  }

  async clear(): Promise<void> {
    this.cache = [];
    try {
      this.ls.removeItem(LS_PRIMARY_KEY);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory backing (final fallback for bare Node test envs)
// ---------------------------------------------------------------------------

class MemoryBacking implements BackingStore {
  private rows: StoredRow[] = [];
  async getAll() {
    return this.rows.slice();
  }
  async add(key: number, value: StoredValue) {
    this.rows.push({ key, value });
  }
  async update(key: number, value: StoredValue) {
    const idx = this.rows.findIndex((r) => r.key === key);
    if (idx >= 0) this.rows[idx] = { key, value };
  }
  async delete(keys: number[]) {
    const set = new Set(keys);
    this.rows = this.rows.filter((r) => !set.has(r.key));
  }
  async clear() {
    this.rows = [];
  }
}

function pickBackingStore(): BackingStore {
  const g = globalThis as {
    indexedDB?: IDBFactory;
    localStorage?: Storage;
  };
  if (typeof g.indexedDB !== 'undefined' && g.indexedDB) {
    return new IDBBacking(g.indexedDB);
  }
  if (typeof g.localStorage !== 'undefined' && g.localStorage) {
    return new LocalStorageBacking(g.localStorage);
  }
  return new MemoryBacking();
}

// ---------------------------------------------------------------------------
// Sliding-window dispatch counter
// ---------------------------------------------------------------------------

/**
 * Strict sliding-window rate limiter. Counts dispatches in
 * [nowMs - windowMs, nowMs] and refuses to allocate more than
 * `maxCount - inWindow` tokens at any instant. This is stronger than a
 * token bucket: a token bucket admits `capacity + refillRate × windowMs`
 * dispatches in a single window in the worst case, while this counter
 * caps the window total at exactly `maxCount`.
 */
class SlidingWindowCounter {
  // Chronological log of dispatch events in the current window. Oldest
  // entries are pruned on every call before any allocation decision.
  private readonly dispatches: Array<{ t: number; count: number }> = [];

  constructor(
    private readonly maxCount: number,
    private readonly windowMs: number
  ) {}

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    let drop = 0;
    while (drop < this.dispatches.length && this.dispatches[drop].t <= cutoff) {
      drop++;
    }
    if (drop > 0) this.dispatches.splice(0, drop);
  }

  private inWindow(): number {
    let sum = 0;
    for (const d of this.dispatches) sum += d.count;
    return sum;
  }

  /**
   * Try to acquire `n` whole tokens. Returns the number actually
   * acquired (0 .. n) such that the count of dispatches in the current
   * window stays ≤ `maxCount`.
   */
  acquire(n: number, nowMs: number): number {
    if (n <= 0) return 0;
    this.prune(nowMs);
    const available = Math.max(0, this.maxCount - this.inWindow());
    const take = Math.min(n, available);
    if (take > 0) this.dispatches.push({ t: nowMs, count: take });
    return take;
  }

  /** Consume one token if available; for the optional `tryAcquire` API. */
  tryAcquireOne(nowMs: number): boolean {
    return this.acquire(1, nowMs) === 1;
  }
}

// ---------------------------------------------------------------------------
// OfflineQueue
// ---------------------------------------------------------------------------

export class OfflineQueue {
  private mirror: OfflineQueueEntry[] = [];
  private nextKey = 1;
  private readonly backing: BackingStore;
  private readonly now: () => number;
  private readonly onOverflow?: (count: number) => void;
  private readonly bucket: SlidingWindowCounter;

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private pagehideHandler: (() => void) | null = null;

  constructor(opts: OfflineQueueOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.onOverflow = opts.onOverflow;
    this.backing = opts.backing ?? pickBackingStore();
    this.bucket = new SlidingWindowCounter(
      MAX_DISPATCHES_PER_WINDOW,
      DISPATCH_WINDOW_MS
    );
    this.installPagehideListener();
  }

  /**
   * Lazily load the persisted queue and reconcile any localStorage backup
   * left behind by the previous tab's `pagehide`. Idempotent and safe to
   * call from every public method.
   */
  private ensureInit(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.runInit();
    }
    return this.initPromise;
  }

  private async runInit(): Promise<void> {
    let primary: StoredRow[] = [];
    try {
      primary = await this.backing.getAll();
    } catch {
      primary = [];
    }

    // Reconcile pagehide backup. Anything in the backup whose key is not in
    // the primary store represents an in-memory entry the previous tab
    // never managed to persist — we adopt it.
    const backup = this.readBackup();
    if (backup && backup.length > 0) {
      const known = new Set(primary.map((r) => r.key));
      for (const row of backup) {
        if (!known.has(row.key)) {
          primary.push(row);
          // Best-effort persist into the primary store; ignore failures.
          try {
            await this.backing.add(row.key, row.value);
          } catch {
            /* keep mirror; primary may catch up later */
          }
        }
      }
      this.clearBackup();
    }

    primary.sort((a, b) => a.key - b.key);
    this.mirror = primary.map((r) => ({
      key: r.key,
      record: r.value.record,
      attempts: r.value.attempts,
      nextAttemptAt: r.value.nextAttemptAt,
    }));
    if (this.mirror.length > 0) {
      this.nextKey = this.mirror[this.mirror.length - 1].key + 1;
    }
    this.initialized = true;
  }

  // ----- public API ---------------------------------------------------------

  async enqueue(record: LogRecord): Promise<void> {
    await this.ensureInit();

    const key = this.nextKey++;
    const value: StoredValue = {
      record,
      attempts: 0,
      nextAttemptAt: this.now(),
    };
    // Mirror first so callers that don't await still see the entry.
    this.mirror.push({
      key,
      record,
      attempts: value.attempts,
      nextAttemptAt: value.nextAttemptAt,
    });

    const writes: Promise<void>[] = [
      this.backing.add(key, value).catch(() => {
        /* keep in mirror; durability degraded but API still works */
      }),
    ];

    // Cap enforcement: emit at most one warn per eviction event.
    if (this.mirror.length > MAX_ENTRIES) {
      const evictCount = this.mirror.length - MAX_ENTRIES;
      const evicted = this.mirror.splice(0, evictCount);
      const evictedKeys = evicted.map((e) => e.key);
      writes.push(
        this.backing.delete(evictedKeys).catch(() => {
          /* mirror already trimmed */
        })
      );
      if (this.onOverflow) {
        try {
          this.onOverflow(evictCount);
        } catch {
          /* never throw from a queue operation */
        }
      }
    }

    await Promise.all(writes);
  }

  async peekBatch(n: number): Promise<OfflineQueueEntry[]> {
    await this.ensureInit();
    if (n <= 0) return [];
    const nowMs = this.now();

    // Sliding-window gate: never return more than the window allows.
    // We materialise eligible candidates first (bounded by `n`), then
    // acquire dispatch slots for exactly that count. If fewer slots are
    // available, trim. Slots are consumed on a best-effort basis — the
    // caller is expected to dispatch the returned entries.
    const candidates: OfflineQueueEntry[] = [];
    for (const entry of this.mirror) {
      if (entry.nextAttemptAt <= nowMs) {
        candidates.push({
          key: entry.key,
          record: entry.record,
          attempts: entry.attempts,
          nextAttemptAt: entry.nextAttemptAt,
        });
        if (candidates.length >= n) break;
      }
    }

    if (candidates.length === 0) return [];
    const allowed = this.bucket.acquire(candidates.length, nowMs);
    return candidates.slice(0, allowed);
  }

  async ack(keys: number[]): Promise<void> {
    await this.ensureInit();
    if (keys.length === 0) return;
    const set = new Set(keys);
    this.mirror = this.mirror.filter((e) => !set.has(e.key));
    await this.backing.delete(keys).catch(() => {
      /* mirror already updated; primary will reconcile on next run */
    });
  }

  async requeue(key: number): Promise<void> {
    await this.ensureInit();
    const entry = this.mirror.find((e) => e.key === key);
    if (!entry) return;
    entry.attempts += 1;
    const backoff = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** entry.attempts);
    entry.nextAttemptAt = this.now() + backoff;
    await this.backing
      .update(key, {
        record: entry.record,
        attempts: entry.attempts,
        nextAttemptAt: entry.nextAttemptAt,
      })
      .catch(() => {
        /* mirror updated; durability degraded for this update */
      });
  }

  async clear(): Promise<void> {
    await this.ensureInit();
    this.mirror = [];
    this.nextKey = 1;
    await this.backing.clear().catch(() => {
      /* mirror cleared regardless */
    });
    this.clearBackup();
  }

  async count(): Promise<number> {
    await this.ensureInit();
    return this.mirror.length;
  }

  /**
   * Optional standalone rate-limit helper. Not used by `peekBatch` (which
   * has its own built-in gate) — exposed for callers that want to gate
   * other dispatch paths against the same window.
   */
  tryAcquire(): boolean {
    return this.bucket.tryAcquireOne(this.now());
  }

  /**
   * Test/teardown helper. Removes the `pagehide` listener so a fresh queue
   * can be constructed without leaking event handlers, and closes any
   * underlying IDB connection so `deleteDatabase` / version upgrades are
   * not blocked.
   */
  dispose(): void {
    if (
      this.pagehideHandler &&
      typeof globalThis.removeEventListener === 'function'
    ) {
      globalThis.removeEventListener('pagehide', this.pagehideHandler);
    }
    this.pagehideHandler = null;
    if (typeof this.backing.close === 'function') {
      try {
        this.backing.close();
      } catch {
        /* ignore */
      }
    }
  }

  // ----- pagehide durability backup ----------------------------------------

  private installPagehideListener(): void {
    if (typeof globalThis.addEventListener !== 'function') return;
    this.pagehideHandler = () => {
      try {
        const ls = (globalThis as { localStorage?: Storage }).localStorage;
        if (!ls) return;
        const snapshot: StoredRow[] = this.mirror.map((e) => ({
          key: e.key,
          value: {
            record: e.record,
            attempts: e.attempts,
            nextAttemptAt: e.nextAttemptAt,
          },
        }));
        ls.setItem(LS_BACKUP_KEY, JSON.stringify(snapshot));
      } catch {
        /* never throw at unload */
      }
    };
    globalThis.addEventListener('pagehide', this.pagehideHandler);
  }

  private readBackup(): StoredRow[] | null {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (!ls) return null;
      const raw = ls.getItem(LS_BACKUP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return null;
      return (parsed as StoredRow[]).filter(
        (r) =>
          r &&
          typeof r.key === 'number' &&
          r.value &&
          typeof r.value === 'object'
      );
    } catch {
      return null;
    }
  }

  private clearBackup(): void {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (ls) ls.removeItem(LS_BACKUP_KEY);
    } catch {
      /* ignore */
    }
  }
}
