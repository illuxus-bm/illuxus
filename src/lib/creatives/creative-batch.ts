/**
 * Batch_Generator for the Social Creative Generator.
 *
 * Mirrors the architectural split described in `creative-templates.ts`'s and
 * `creative-renderer.ts`'s headers: those modules own the declarative
 * template model and the single-creative render pipeline respectively, while
 * this module owns running that pipeline across many (entity × format) pairs
 * in one batch — progress tracking, per-entity fault isolation, and ZIP
 * archive assembly of the resulting PNGs.
 *
 *  - **Progress reducer** (pure): `progressReducer` is the event-driven state
 *    update for a run's "N of M completed" counter, guaranteed monotonic and
 *    bounded by the total so a UI progress bar never overshoots or regresses.
 *  - **Batch orchestration** (imperative): `runBatch` drives `progressReducer`
 *    while isolating per-pair render failures so one failing entity never
 *    aborts the rest of the run.
 *  - **ZIP archive assembly** (imperative, not yet implemented in this file):
 *    `buildBatchArchive` will package every successful render into a single
 *    downloadable archive via `fflate`.
 */

import { zipSync } from "fflate";

import type { PlatformFormat } from "./creative-templates";
import { creativeFilename } from "./creative-renderer";

/** Tracks a Batch_Generator run's "N of M completed" progress. */
export interface BatchProgress {
  completed: number;
  total: number;
}

/**
 * Event-driven reducer for `BatchProgress`. On a `"completed"` event, returns
 * a NEW `BatchProgress` (the input `state` is never mutated) with `completed`
 * incremented by one and clamped so it never exceeds `total` — guaranteeing
 * the counter is both monotonic (never decreases) and bounded by the run's
 * total (never overshoots it).
 *
 * Property 13. Validates: Requirements 6.4.
 */
export function progressReducer(
  state: BatchProgress,
  event: "completed"
): BatchProgress {
  switch (event) {
    case "completed":
      return {
        completed: Math.min(state.total, state.completed + 1),
        total: state.total,
      };
  }
}

// ─── Batch orchestration (Property 14) ──────────────────────────────────────

/** One entity targeted by a Batch_Generator run. */
export interface BatchTarget<T> {
  entity: T;
}

/** The result of rendering one (entity × format) pair within a batch run. */
export type BatchOutcome<T> =
  | { entity: T; status: "success"; blob: Blob; format: PlatformFormat; filename: string }
  | { entity: T; status: "failed"; format: PlatformFormat; error: string };

/**
 * Runs `render` for every (entity × selected format) pair, applying the same
 * `formats` list to every entity (Requirement 6.3) and isolating per-pair
 * failures so a single failing render never aborts the rest of the run
 * (Requirement 6.5) — every pair gets its own try/catch, and a failure is
 * recorded as a `"failed"` outcome rather than thrown. `onProgress`, when
 * provided, is invoked once per pair (success OR failure counts as a
 * completed attempt) via `progressReducer`, reporting `(completed, total)`
 * so a UI progress bar can show "N of M completed" (Requirement 6.4).
 *
 * Pairs are processed sequentially (not `Promise.all`) so progress reporting
 * stays in a predictable order and failures don't need complex aggregation.
 * Returns exactly one outcome per (entity, format) pair — `entities.length *
 * formats.length` outcomes in total (Property 12). Property 14.
 */
export async function runBatch<T extends { id: string; name: string }>(
  entities: T[],
  formats: PlatformFormat[],
  render: (entity: T, format: PlatformFormat) => Promise<Blob>,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchOutcome<T>[]> {
  const total = entities.length * formats.length;
  let progress: BatchProgress = { completed: 0, total };

  const pairs = entities.flatMap((entity) => formats.map((format) => ({ entity, format })));

  const outcomes: BatchOutcome<T>[] = [];

  for (const { entity, format } of pairs) {
    try {
      const blob = await render(entity, format);
      outcomes.push({
        entity,
        status: "success",
        blob,
        format,
        filename: creativeFilename(entity.name, format),
      });
    } catch (err) {
      outcomes.push({
        entity,
        status: "failed",
        format,
        error: (err as Error)?.message ?? String(err),
      });
    }

    progress = progressReducer(progress, "completed");
    onProgress?.(progress.completed, progress.total);
  }

  return outcomes;
}

// ─── ZIP archive assembly (Property 15) ─────────────────────────────────────

/**
 * Disambiguates a candidate filename against a `Set` of names already used in
 * the archive, appending a numeric suffix (`-2`, `-3`, ...) before the `.png`
 * extension when a collision is detected, so no ZIP entry silently overwrites
 * another. Mutates `seen` with whichever name it returns.
 */
function dedupeFilename(filename: string, seen: Set<string>): string {
  if (!seen.has(filename)) {
    seen.add(filename);
    return filename;
  }

  const extIndex = filename.lastIndexOf(".");
  const base = extIndex === -1 ? filename : filename.slice(0, extIndex);
  const ext = extIndex === -1 ? "" : filename.slice(extIndex);

  let suffix = 2;
  let candidate = `${base}-${suffix}${ext}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}${ext}`;
  }

  seen.add(candidate);
  return candidate;
}

/**
 * Builds a ZIP `Blob` containing every successful outcome's PNG, named by its
 * `.filename` (already computed via `creativeFilename` by `runBatch`). Failed
 * outcomes are excluded entirely (Property 15). Uses `fflate`'s synchronous
 * `zipSync` — the async blob-to-bytes conversion happens first, concurrently,
 * via `Promise.all`, since `zipSync` itself needs raw `Uint8Array`s, not
 * `Blob`s. An all-failed or empty `outcomes` list still produces a valid
 * (empty) ZIP archive rather than throwing.
 */
export async function buildBatchArchive<T extends { id: string; name: string }>(
  outcomes: BatchOutcome<T>[]
): Promise<Blob> {
  const successes = outcomes.filter(
    (outcome): outcome is BatchOutcome<T> & { status: "success" } => outcome.status === "success"
  );

  const entries: Record<string, Uint8Array> = {};
  const seen = new Set<string>();

  const files = await Promise.all(
    successes.map(async (outcome) => {
      const arrayBuffer = await outcome.blob.arrayBuffer();
      return { filename: outcome.filename, bytes: new Uint8Array(arrayBuffer) };
    })
  );

  for (const { filename, bytes } of files) {
    entries[dedupeFilename(filename, seen)] = bytes;
  }

  const zipped = zipSync(entries);
  return new Blob([zipped], { type: "application/zip" });
}
