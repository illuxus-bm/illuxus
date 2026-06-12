// Correlation context for the observability layer.
//
// This module threads a single correlation id through synchronous and
// asynchronous code without resorting to Node's `AsyncLocalStorage` (we
// run in the browser only) or the heavyweight `zone.js` patch.
//
// Strategy
// ────────
// 1. A module-scoped `currentCorrelationId` holds the id of the active
//    scope, or `null` when no scope is active.
// 2. `runWithCorrelationId(id, fn)` saves the previous value, sets the
//    new id, calls `fn()`, and restores in a `try/finally`. When `fn`
//    returns a Promise, the restore is deferred to the promise's
//    `.finally` so that synchronous post-scope reads see the prior id.
// 3. To thread the id across `await` boundaries (and concurrent chains)
//    `installPromisePatch()` patches `Promise.prototype.then` once. The
//    patch captures the active id at the moment a `.then` callback is
//    REGISTERED and re-installs that captured id for the duration of the
//    callback's execution. Two concurrent chains therefore each see the
//    id captured at their own registration, never crossing.
//
// The patch is installed lazily on the first `runWithCorrelationId`
// call, so test environments and code paths that never use correlation
// pay zero cost.
//
// _Validates: Requirements 9.4, 9.5, 9.7_

let currentCorrelationId: string | null = null;
let patchInstalled = false;

/** Returns the active correlation id, or null when no scope is active. */
export function getCorrelationId(): string | null {
  return currentCorrelationId;
}

/**
 * Runs `fn` with `id` set as the active correlation id.
 *
 * - For synchronous `fn`, the previous id is restored immediately after
 *   `fn` returns (or throws).
 * - For async `fn` (returns a thenable), the previous id is restored
 *   when that promise settles, via `.finally`. Concurrency isolation
 *   across `await` boundaries is provided by the `Promise.then` patch.
 */
export function runWithCorrelationId<T>(
  id: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  installPromisePatch();
  const prev = currentCorrelationId;
  currentCorrelationId = id;
  try {
    const result = fn();
    if (
      result !== null &&
      typeof result === 'object' &&
      typeof (result as { then?: unknown }).then === 'function'
    ) {
      return (result as Promise<T>).finally(() => {
        currentCorrelationId = prev;
      });
    }
    currentCorrelationId = prev;
    return result;
  } catch (err) {
    currentCorrelationId = prev;
    throw err;
  }
}

/**
 * Idempotently patches `Promise.prototype.then` so that a callback
 * registered while a correlation id is active observes that same id at
 * execution time, regardless of who else has mutated the module state
 * between registration and execution.
 *
 * Must remain a no-op on second and later calls (the second
 * `runWithCorrelationId` invocation must not produce nested wrappers).
 */
export function installPromisePatch(): void {
  if (patchInstalled) return;
  patchInstalled = true;

  const origThen = Promise.prototype.then;

  // The runtime signature mirrors `Promise.prototype.then` but we use a
  // permissive type here so the wrapper compiles cleanly under strict
  // TypeScript. The behavioural contract is unchanged: any callback that
  // would have been called by the unpatched `then` is still called with
  // the same arguments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ThenCb<T> = ((value: any) => T | PromiseLike<T>) | null | undefined;

  function patchedThen<TResult1, TResult2>(
    this: Promise<unknown>,
    onFulfilled?: ThenCb<TResult1>,
    onRejected?: ThenCb<TResult2>,
  ): Promise<TResult1 | TResult2> {
    const captured = currentCorrelationId;

    const wrap = <R>(cb: ThenCb<R>): ThenCb<R> => {
      if (cb === null || cb === undefined) return cb;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (value: any) => {
        const prev = currentCorrelationId;
        currentCorrelationId = captured;
        try {
          return cb(value);
        } finally {
          currentCorrelationId = prev;
        }
      };
    };

    return origThen.call(this, wrap(onFulfilled), wrap(onRejected)) as Promise<
      TResult1 | TResult2
    >;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Promise.prototype.then = patchedThen as any;
}
