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
    //
    // Bumped again after adding the Terms / Refund / Privacy consent
    // checkbox above the Register button. Re-audited against 6.1–6.3:
    // the only change to the submit handler is an early return when the
    // box is unticked, placed before any registration is created; once
    // ticked, the handler runs exactly as before — `loadStoredUtm()`,
    // the five utm_* columns on the insert, and `clearStoredUtm()` on
    // success are untouched.
    //
    // Bumped again for guest registration. Re-audited against 6.1–6.3:
    // the signed-in submit handler is unchanged apart from dropping the
    // redirect to sign-in — its `loadStoredUtm()` values, the five utm_*
    // columns on the insert and `clearStoredUtm()` on success are as
    // before. Visitors who are not signed in now register through
    // `GuestRegistrationForm`, which receives the same `utmParams`; the
    // `guest-registration` edge function saves the five utm_* values with
    // the registration, and this card calls `clearStoredUtm()` when that
    // succeeds (covered by guest-registration-server.test.ts).
    //
    // Bumped again for the event-page redesign. Re-audited against 6.1–6.3:
    // only the returned markup changed (status pill, heading and line per
    // state, Calendar / Share buttons, the phone bottom bar) plus an
    // optional `organiserHref` prop. `handleRsvp` — `loadStoredUtm()`, the
    // five utm_* columns on the insert and `clearStoredUtm()` on success —
    // is untouched, and `GuestRegistrationForm` still receives `utmParams`
    // and clears the stored UTM when it succeeds.
    //
    // Bumped again for paid events without online checkout (security review
    // F-01, 2026-10-28). Re-audited against 6.1–6.3: a priced event's seat
    // now starts as 'pending' (`isPaid` in the initial state and copy only).
    // `loadStoredUtm()`, the five utm_* columns on the insert and
    // `clearStoredUtm()` on success are untouched; the UTM lines are the
    // same as at the previous bump.
    hash: "5d39839f19a4178d3b1462438e94c952b04744a7a9fe1dc216a3ceec35810548",
  },
  {
    path: "src/components/event/RegistrationsSection.tsx",
    // Bumped after re-audit against Requirements 6.4 and 6.6. Since the
    // locked version (638c185) the file gained the Declined / Pending tabs,
    // the meeting-interest filter and an "Interested Sponsors" column (and
    // CSV column, appended after the UTM block). The `via <utm_source>`
    // inline hint is unchanged, and the CSV still has the five contiguous
    // UTM Source / Medium / Campaign / Content / Term columns from the
    // registration row, blank for speaker and sponsor rows.
    //
    // Bumped again for live Meeting Interest updates and speaker interests.
    // Re-audited against 6.4 and 6.6: only the interest loading (now a
    // realtime subscription) and how rows are matched to interests changed.
    // The `via <utm_source>` hint and the five UTM CSV columns are untouched.
    //
    // Bumped again for meeting status (migration 052). Re-audited against
    // 6.4 and 6.6: the Interested Sponsors cell became a meetings popover, the
    // filter gained statuses, and the CSV gained Meeting Status / Met At after
    // Interested Sponsors. The UTM hint and five UTM CSV columns are untouched.
    //
    // Bumped again for meeting disputes and history (migration 054). Re-audited
    // against 6.4 and 6.6: only the meetings popover, filter and event end date
    // changed. The UTM hint and five UTM CSV columns are untouched.
    //
    // Re-pinned 2026-10-28: the file changed after the previous bump without
    // one. Re-audited against 6.4 and 6.6: compared with 638c185 its UTM
    // lines differ only by two added comments — the `via <utm_source>` hint
    // and the five UTM CSV columns are untouched.
    hash: "065a95aecb98312cda1a4a6a7d9d94fa7ccef071c3263624c9993de977695cf8",
  },
  {
    path: "src/components/event/registrations/RegistrantQuickView.tsx",
    // Re-pinned 2026-10-28: the file changed without a bump. Re-audited
    // against 6.5: its UTM lines are identical to 638c185.
    hash: "450811526f43ee66cdb02ee2ebf65824322883ff2ec39df232cd5ebbbc687bb6",
  },
] as const;

function fileSha256(relPath: string): string {
  const abs = resolve(process.cwd(), relPath);
  // Hash the bytes with CRLF folded to LF, so a Windows checkout
  // (core.autocrlf) hashes the same as the committed file. Matches
  // `tr -d '\r' < file | shasum -a 256`.
  const content = readFileSync(abs);
  const lf = Buffer.from(content.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  return createHash("sha256").update(lf).digest("hex");
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
