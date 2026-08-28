// Feature: utm-attribution-coverage, Property 58: Attendee non-regression tripwire
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
//
// This spec is strictly additive — attendee UTM display and export must
// remain byte-identical to the shipped `638c185` implementation. This
// tripwire property checks the file hashes of three attendee files.
// If any of them changes, this test fails, prompting a review to confirm
// the change was intentional and does not regress attendee behavior.
//
// The three files are:
//   - `src/components/EventRsvpCard.tsx`
//       Attendee_Registration submit path — stamps First_Touch_UTM onto
//       the row and calls `clearStoredUtm()` on success (Requirements
//       6.1, 6.2, 6.3).
//   - `src/components/event/RegistrationsSection.tsx`
//       Attribution_UI list rows with `via <utm_source>` inline hint and
//       the registrations CSV export with five contiguous UTM columns
//       (Requirements 6.4, 6.6).
//   - `src/components/event/registrations/RegistrantQuickView.tsx`
//       Attribution_UI detail drawer with five labelled UTM_Field values
//       (Requirement 6.5).
//
// The hashes below were captured from the shipped attendee implementation
// at the moment the utm-attribution-coverage spec landed. Any change to
// these files — intentional or accidental — will fail this test, forcing
// a human to re-audit that the change is not a regression before updating
// the locked fingerprints.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Locked fingerprints for the three attendee files. Hashes are SHA-256
 * over the raw file bytes (matches `shasum -a 256 <file>`). Update these
 * only after auditing that the change to the underlying file does not
 * regress Requirements 6.1 through 6.6.
 */
const ATTENDEE_FILES = [
  {
    path: "src/components/EventRsvpCard.tsx",
    // Bumped after removing the "N spots left · X/Y registered" capacity
    // indicator from the approval-flow and free-registration idle states.
    // Manually re-audited against Requirements 6.1, 6.2, 6.3: the
    // first-touch UTM stamping onto the registration row, the five
    // utm_source/medium/campaign/content/term columns, and the
    // clearStoredUtm() call on successful submit are all intact
    // (see the `first_touch_utm attribution` block in the submit
    // handler). The edit is display-only and does not touch any UTM
    // code path.
    hash: "b6dd2208a5de70ae4f645021a7f543f3b76a0aba4800cee5642da7b2dd0b51dc",
  },
  {
    path: "src/components/event/RegistrationsSection.tsx",
    // Bumped after replacing a ternary-used-as-a-statement in `toggleSelect`
    // with an explicit if/else, to clear an
    // `@typescript-eslint/no-unused-expressions` error. The old form
    // (`next.has(id) ? next.delete(id) : next.add(id);`) discarded its result
    // purely for side effects.
    //
    // Manually re-audited against Requirements 6.4 and 6.6 — both intact:
    //   • 6.4 — the `via <utm_source>` inline row hint still reads
    //     `utm_source` off the registration (the `const src = ...utm_source`
    //     line in the row renderer).
    //   • 6.6 — the CSV export still emits the five contiguous UTM columns in
    //     order: utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    //     each `?? ""`, alongside the unchanged comma-escaping that keeps a
    //     value like `utm_content=blog,post` in one cell.
    //
    // `toggleSelect` is the bulk-action row-selection Set toggle. It shares no
    // code path with UTM display or export, and the diff is confined to that
    // one function. The contractual single `console.warn('UI sync failure')`
    // (REQ-11.4) and its scoped eslint-disable are also untouched.
    hash: "f9d27239f6066c9c9f928ade0a40d0da6bfe86a7955eea707d028a09744f7c20",
  },
  {
    path: "src/components/event/registrations/RegistrantQuickView.tsx",
    hash: "ec06902692c6739a243aa3e37722f1e357ae9f64e8cbd35f37594e9e1b5af76c",
  },
] as const;

function fileSha256(relPath: string): string {
  const abs = resolve(process.cwd(), relPath);
  // Hash raw bytes — matches `shasum -a 256` exactly, side-steps any
  // UTF-8 re-encoding subtleties from string-mode reads.
  const content = readFileSync(abs);
  return createHash("sha256").update(content).digest("hex");
}

describe("Property 58: Attendee non-regression tripwire", () => {
  for (const { path, hash } of ATTENDEE_FILES) {
    it(`${path} SHA-256 matches locked fingerprint`, () => {
      expect(fileSha256(path)).toBe(hash);
    });
  }

  it("every attendee file's SHA-256 is stable across 100 checks", () => {
    // Property framing: for any file picked from the tripwire set, its
    // current SHA-256 must equal its locked fingerprint. Constant-space
    // input generator (three-element set), so `numRuns: 100` exercises
    // each file ~33× on average — enough to catch a flaky reader while
    // keeping the test cheap.
    fc.assert(
      fc.property(fc.constantFrom(...ATTENDEE_FILES), ({ path, hash }) => {
        return fileSha256(path) === hash;
      }),
      { numRuns: 100 },
    );
  });
});
