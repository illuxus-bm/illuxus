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
  /** Changes arriving within this many ms of the previous one are folded into
   *  the same undo step. Default 400. */
  coalesceMs?: number;
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
const DEFAULT_COALESCE_MS = 400;

export function useHistory<T>(initial: T, options?: UseHistoryOptions): UseHistoryResult<T> {
  const maxSize = options?.maxSize ?? DEFAULT_MAX;
  const coalesceMs = options?.coalesceMs ?? DEFAULT_COALESCE_MS;
  const [value, setValue] = useState<T>(initial);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  /** When the last `set` landed. Undo, redo and reset clear it, so the next
   *  change after any of them always starts a fresh step. */
  const lastSetAt = useRef(0);
  const [, forceTick] = useState(0);
  const tick = () => forceTick((n) => n + 1);

  const set = useCallback(
    (next: T) => {
      // A burst of changes is one edit. Typing in a field or dragging a slider
      // fires a change per keystroke / per pixel; recording each one filled the
      // whole 50-step history with a single word, and Undo took back one
      // letter at a time. Keeping only the snapshot from BEFORE the burst makes
      // one Undo restore what the organizer had before they started.
      const now = Date.now();
      const continuing = undoStack.current.length > 0 && now - lastSetAt.current < coalesceMs;
      lastSetAt.current = now;
      if (!continuing) {
        undoStack.current.push(value);
        if (undoStack.current.length > maxSize) {
          undoStack.current.shift();
        }
      }
      redoStack.current.length = 0; // any redo future is invalidated
      setValue(next);
      tick();
    },
    // The lint suggestion to include `value` in deps is intentional —
    // we need the LATEST `value` at call time so the undo snapshot
    // corresponds to what the user just changed FROM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, maxSize, coalesceMs]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    lastSetAt.current = 0;
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
    lastSetAt.current = 0;
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
    lastSetAt.current = 0;
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
