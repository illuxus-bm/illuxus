/**
 * `useHistory` — a generic undo/redo hook layered on top of `useState`.
 *
 * Given an initial value, exposes the current snapshot plus:
 *  - `set(next)` — replaces the current snapshot AND pushes the
 *    previous one onto the undo stack. Clears the redo stack (any
 *    forked future edits after an undo are discarded, matching every
 *    editor's undo semantics).
 *  - `undo()` — pops from the undo stack back into the current
 *    snapshot, pushes the current snapshot onto the redo stack.
 *  - `redo()` — inverse of undo.
 *  - `canUndo` / `canRedo` — booleans for enabling toolbar buttons.
 *  - `reset(value)` — clears both stacks and sets the current snapshot
 *    unconditionally. Used when loading a brand new document (e.g. on
 *    template swap or opening from Supabase).
 *
 * The stacks are capped at `maxSize` snapshots (default 50) to bound
 * memory usage — a Brochure_Document with a couple dozen elements is
 * ~5-15 KB of JSON, so 50 snapshots is ~500 KB in the worst case. When
 * the cap is reached, the oldest undo entry is dropped so newer edits
 * still land.
 */
import { useCallback, useRef, useState } from "react";

export interface UseHistoryOptions {
  /** Maximum history depth. Default 50. */
  maxSize?: number;
}

export interface UseHistoryResult<T> {
  value: T;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const DEFAULT_MAX = 50;

export function useHistory<T>(initial: T, options?: UseHistoryOptions): UseHistoryResult<T> {
  const maxSize = options?.maxSize ?? DEFAULT_MAX;
  const [value, setValue] = useState<T>(initial);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const [, forceTick] = useState(0);
  const tick = () => forceTick((n) => n + 1);

  const set = useCallback(
    (next: T) => {
      undoStack.current.push(value);
      if (undoStack.current.length > maxSize) {
        undoStack.current.shift();
      }
      redoStack.current.length = 0; // any redo future is invalidated
      setValue(next);
      tick();
    },
    // The lint suggestion to include `value` in deps is intentional —
    // we need the LATEST `value` at call time so the undo snapshot
    // corresponds to what the user just changed FROM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, maxSize]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    redoStack.current.push(value);
    if (redoStack.current.length > maxSize) {
      redoStack.current.shift();
    }
    setValue(prev);
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxSize]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(value);
    if (undoStack.current.length > maxSize) {
      undoStack.current.shift();
    }
    setValue(next);
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxSize]);

  const reset = useCallback((v: T) => {
    undoStack.current.length = 0;
    redoStack.current.length = 0;
    setValue(v);
    tick();
  }, []);

  return {
    value,
    set,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
