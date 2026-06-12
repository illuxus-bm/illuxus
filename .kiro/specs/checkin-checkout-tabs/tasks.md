# Implementation Plan: Check-In / Check-Out Scanner Tabs

## Overview

This plan turns the design into incremental, testable coding steps. The implementation proceeds bottom-up:

1. **Database / SQL foundation** — Add the `_apply_attendance` helper, the new `set_attendance` per-row RPC, the tightened `bulk_set_attendance` return shape, and the `self_check_in` patch.
2. **TypeScript port + Property-Based Tests** — Mirror `_apply_attendance` line-for-line in a deterministic TypeScript module so the 13 consolidated correctness properties from `design.md` can be checked with `fast-check` (`numRuns: 100` minimum). The TS port is the canonical reference for the SQL state machine and lets PBTs run in milliseconds without round-tripping to Supabase.
3. **Client implementation** — Extend `useEventCheckinCounters` with `currentlyInside / checkedOut / notArrived`, rewrite `QRScannerDialog` as a tabbed dialog with dedup + in-flight lock + 10s timeout, and update `RegistrationsSection` to consume the new bulk return shape, render the "Live updates delayed" indicator, and replace `onCheckIn` with `onScanApplied`.
4. **Example / integration tests** — Component tests for `QRScannerDialog`, snapshot of `SelfCheckInPage`, an integration round-trip against a local Supabase, and a fake-timer test for the realtime SLA banner. These are marked optional.
5. **Cleanup** — HelpPage copy update and an optional belt-and-braces SQL sanity-check migration described in `design.md` Phase 3.

The 13 PBT sub-tasks (one per consolidated property in `design.md`) are tagged `[PBT]` so the spec-task-execution agent runs them with property-based testing. They live in `src/lib/attendance/__tests__/*.pbt.test.ts` and each one carries the comment header `// Feature: checkin-checkout-tabs, Property N: <text>`.

Implementation language is **TypeScript** (the design already specifies TS interfaces, the repo uses TS + Vite + Vitest, and the SQL migrations are plain PL/pgSQL).

## Tasks

- [x] 1. Database / SQL foundation

  - [x] 1.1 Add `_apply_attendance` helper migration
    - Create `supabase/migrations/004_apply_attendance_helper.sql` defining `public._apply_attendance(_reg_id uuid, _target text, _method text, _actor uuid) RETURNS text`.
    - Implement the ordered checks from `design.md` "Internal helper `_apply_attendance` (NEW, private)": existence → authorization → tracking window → status / approval guard → state machine. Insert into `attendance_events` only on the success branches; rely on the existing `_attendance_recompute` AFTER-INSERT trigger to refresh `registrations`.
    - Authorization: caller must be a platform admin (`is_admin(_actor)` or equivalent) or an owner of `(SELECT event_id FROM registrations WHERE id = _reg_id)`. Reuse whatever ownership predicate `bulk_set_attendance` and `toggle_attendance` already use.
    - DO NOT `GRANT EXECUTE` on the helper. It is private; only `SECURITY DEFINER` callers (`set_attendance`, `bulk_set_attendance`) reach it.
    - Files: `supabase/migrations/004_apply_attendance_helper.sql` (new).
    - _Validates: Requirements 3, 4, 5, 6, 7, 8, 12.1, 12.2, 13.2_
    - _Acceptance:_
      - `supabase db reset` (or `supabase migration up`) succeeds against a clean local Supabase.
      - `psql -c "SELECT public._apply_attendance('00000000-0000-0000-0000-000000000000','inside','qr','00000000-0000-0000-0000-000000000000');"` returns `not_found` (smoke test that the function compiled and the existence branch is reachable).

  - [x] 1.2 Add `set_attendance` RPC migration (depends on 1.1)
    - Create `supabase/migrations/005_set_attendance_rpc.sql` defining `public.set_attendance(p_reg_id uuid, p_target text, p_method text DEFAULT 'qr') RETURNS TABLE(code text, registration_id uuid, attendance_state text, last_in_at timestamptz, last_out_at timestamptz, total_minutes int, name text, ticket_type text)` per `design.md` "RPC surface (final shape)".
    - Body: call `_apply_attendance(p_reg_id, p_target, p_method, auth.uid())` to obtain the result code; then `SELECT … FROM registrations` to project the rich result row (so the client can render the success banner without a second round-trip).
    - `GRANT EXECUTE ON FUNCTION public.set_attendance(uuid, text, text) TO authenticated;`
    - Files: `supabase/migrations/005_set_attendance_rpc.sql` (new).
    - _Validates: Requirements 3, 4, 5, 6, 7, 8, 10, 12.1, 12.2, 13.2_
    - _Acceptance:_
      - Migration applies cleanly after 1.1.
      - From a Supabase shell impersonating an event owner, `select * from public.set_attendance('<reg_id>','inside','qr');` returns one row with `code='applied_in'` for a `state='never'` registration, and exactly one new row appears in `attendance_events`.

  - [x] 1.3 Tighten `bulk_set_attendance` return shape (depends on 1.1)
    - Create `supabase/migrations/006_bulk_set_attendance_per_row.sql` that `CREATE OR REPLACE`s `public.bulk_set_attendance(p_ids uuid[], p_target text, p_method text DEFAULT 'bulk')` with the new return shape `RETURNS TABLE(registration_id uuid, code text)`.
    - Body iterates `p_ids`, calling `_apply_attendance(_id, p_target, p_method, auth.uid())` once per id and yielding `(id, code)` for every input — including unauthorized / not-found / cancelled / declined ids — so REQ-15.3 holds: bulk result array length equals input length.
    - This is a breaking change for the one caller in `RegistrationsSection`; the client side ships in 3.3.
    - Files: `supabase/migrations/006_bulk_set_attendance_per_row.sql` (new).
    - _Validates: Requirements 15.1, 15.2, 15.3_
    - _Acceptance:_
      - Migration applies cleanly after 1.1.
      - `select * from public.bulk_set_attendance(ARRAY['<reg_a>','<reg_b>']::uuid[], 'inside','bulk');` returns exactly 2 rows.

  - [x] 1.4 Patch `self_check_in` to remove `kind='out'` insertion (independent of 1.1)
    - Create `supabase/migrations/007_self_check_in_no_out.sql` that `CREATE OR REPLACE`s `public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)` with the same signature, grants, and column projection as the current implementation.
    - Behavior change ONLY: when the resolved registration's `attendance_state = 'inside'`, return `status='already'` and DO NOT insert any `attendance_events` row (no `kind='out'`, no `kind='in'`). Re-entry behavior (`'outside' → 'inside'`) is preserved.
    - Re-grant `EXECUTE` to `anon, authenticated`.
    - Files: `supabase/migrations/007_self_check_in_no_out.sql` (new).
    - _Validates: Requirements 14.1, 14.2, 14.3_
    - _Acceptance:_
      - Migration applies cleanly.
      - With a registration in `attendance_state='inside'`, `select * from public.self_check_in('<join_token>','<event_id>');` returns `status='already'` and the count of `attendance_events` rows for the registration is unchanged.

- [x] 2. TypeScript state-machine port + property-based tests

  - [x] 2.1 Implement TypeScript port of `_apply_attendance`
    - Create `src/lib/attendance/types.ts` exporting `AttendanceState`, `Tab`, `Target`, `ScanResultCode`, `ApprovalStatus`, `RegistrationStatus`, `Method`, `RegistrationFixture` (a deterministic plain-JS shape with `id`, `event_id`, `status`, `approval_status`, `attendance_state`, `qr_code`, `join_token`, `kind` ('attendee' | 'speaker' | 'sponsor_contact')), `EventFixture` (`id`, `end_date`), `Actor` (`id`, `role: 'admin' | 'owner' | 'other'`), `AttendanceEventRow` (`registration_id`, `kind`, `method`, `actor_id`, `occurred_at`).
    - Create `src/lib/attendance/applyAttendance.ts` exporting:
      - `applyAttendance(world: World, regId: string, target: Target, method: Method, actor: Actor, now: Date): { code: ScanResultCode; world: World }`
      - `setAttendance(world, regId, target, method, actor, now)` — same as `applyAttendance` but also projects the rich result row used by the dialog.
      - `bulkSetAttendance(world, ids, target, method, actor, now): Array<{ registration_id: string; code: ScanResultCode }>`.
    - The `World` is an immutable struct `{ registrations: Map<id, RegistrationFixture>, events: Map<id, EventFixture>, attendanceEvents: AttendanceEventRow[], now: Date }`. After every `applyAttendance` success, the new world reflects the same state-machine update the existing `_attendance_recompute` trigger would produce (set `attendance_state`, `last_in_at`/`last_out_at`, push the new `attendance_events` row).
    - Mirror the SQL helper's branch order **exactly**: existence → authz → tracking window → status guards → state machine. This is the line-for-line port the design's "Property-based testing setup" section calls for.
    - Also export `resolveQr(world, token): RegistrationFixture | null` mirroring the resolution rules in REQ-2.1 (id / qr_code / join_token / `speaker:<UUID>` / `sponsor_contact:<UUID>`).
    - Files: `src/lib/attendance/types.ts` (new), `src/lib/attendance/applyAttendance.ts` (new).
    - _Validates: foundation for Properties 1–13_
    - _Acceptance:_
      - `pnpm vitest --run src/lib/attendance/applyAttendance.ts` — file compiles (typecheck via `pnpm tsc --noEmit`).
      - `pnpm tsc --noEmit` reports no errors in `src/lib/attendance/**`.

  - [x] 2.2 [PBT] Property 1: State-transition correctness
    - **Property 1: State-transition correctness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 12.1, 12.2**
    - Create `src/lib/attendance/__tests__/property-01-transitions.pbt.test.ts` with the comment header `// Feature: checkin-checkout-tabs, Property 1: State-transition correctness`.
    - Use `fast-check` with `numRuns: 100`. Generate `(arbRegState, arbTab)` and assert: if `(S, T)` matches a permitted transition, the post-scan `attendance_state` equals `T` and exactly one new `attendance_events` row exists with the correct `kind`, `method='qr'`, `actor_id = caller`; otherwise state is unchanged and `attendanceEvents.length` is unchanged.
    - Drives `applyAttendance` from 2.1.
    - Files: `src/lib/attendance/__tests__/property-01-transitions.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-01-transitions.pbt.test.ts` passes with `numRuns: 100`.

  - [x] 2.3 [PBT] Property 2: Mode-and-ordering invariant
    - **Property 2: Mode-and-ordering invariant**
    - **Validates: Requirements 5.1, 5.2, 6.1, 6.2**
    - Create `src/lib/attendance/__tests__/property-02-mode-ordering.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 2: Mode-and-ordering invariant`.
    - Generate `arbSequence = fc.array(fc.record({ tab: arbTab, qr: fc.constant(reg.id) }), { maxLength: 20 })` against a single registration. After replaying the sequence through `applyAttendance`:
      1. Every inserted `attendance_events` row's `kind` matches the originating tab (`check-in → 'in'`, `check-out → 'out'`).
      2. At every prefix, `count(kind='out') ≤ count(kind='in')`.
    - Use `fc.assert(prop, { numRuns: 100 })`.
    - Files: `src/lib/attendance/__tests__/property-02-mode-ordering.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-02-mode-ordering.pbt.test.ts` passes.

  - [x] 2.4 [PBT] Property 3: Per-tab idempotence
    - **Property 3: Per-tab idempotence**
    - **Validates: Requirements 5.3, 5.4**
    - Create `src/lib/attendance/__tests__/property-03-idempotence.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 3: Per-tab idempotence`.
    - For any `(regState, tab)`, applying the same scan twice produces the same final `attendance_state` and the same `attendanceEvents` set as applying it once. Equivalent: the second scan returns `'already_inside' | 'already_outside'` (or stays at the original rejection code) and writes nothing.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-03-idempotence.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-03-idempotence.pbt.test.ts` passes.

  - [x] 2.5 [PBT] Property 4: QR resolution is total and unique
    - **Property 4: QR resolution is total and unique**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
    - Create `src/lib/attendance/__tests__/property-04-qr-resolution.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 4: QR resolution is total and unique`.
    - For any registration, every accepted QR form (`id`, `qr_code`, `join_token`, `speaker:<id>` if `kind='speaker'`, `sponsor_contact:<id>` if `kind='sponsor_contact'`) resolves back to that registration and to no other. For any token not matching any form, `resolveQr` returns `null`.
    - Generators: `arbRegistration` with random `qr_code`, `join_token`, and randomly chosen `kind`. Generate also `arbBogusToken = fc.string()` filtered to not match any registration field, asserting `resolveQr` returns `null` (or that `applyAttendance` returns `'not_found' | 'invalid'` per the design's resolution rules).
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-04-qr-resolution.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-04-qr-resolution.pbt.test.ts` passes.

  - [x] 2.6 [PBT] Property 5: Cross-event QR rejection
    - **Property 5: Cross-event QR rejection**
    - **Validates: Requirements 2.4**
    - Create `src/lib/attendance/__tests__/property-05-wrong-event.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 5: Cross-event QR rejection`.
    - For any registration `r` and any `eventId E ≠ r.event_id`, calling `setAttendance` while the dashboard is scoped to `E` returns `code='wrong_event'` and `attendanceEvents` for `r` is unchanged. Implement scoping by passing `dashboardEventId` into the TS port (mirroring the SQL guard once it is added — note: the SQL helper itself does not currently scope by dashboardEventId because the client passes only the registration id; so this property is checked at the **client-resolution layer** in `QRScannerDialog`. Encode that layer as a small `resolveAndDispatch(world, token, dashboardEventId, …)` helper inside `applyAttendance.ts` so this property is testable without React).
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-05-wrong-event.pbt.test.ts` (new); extend `src/lib/attendance/applyAttendance.ts` with `resolveAndDispatch` if not yet present.
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-05-wrong-event.pbt.test.ts` passes.

  - [x] 2.7 [PBT] Property 6: Registration-status guard
    - **Property 6: Registration-status guard**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Create `src/lib/attendance/__tests__/property-06-status-guard.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 6: Registration-status guard`.
    - For any `(status, approval_status)` in the rejecting set and any `target ∈ {'inside','outside'}`, `setAttendance` returns the expected rejection code (`'cancelled' | 'declined' | 'pending_approval'`) and `attendanceEvents` is unchanged.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-06-status-guard.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-06-status-guard.pbt.test.ts` passes.

  - [x] 2.8 [PBT] Property 7: Tracking-window guard
    - **Property 7: Tracking-window guard**
    - **Validates: Requirements 8.1**
    - Create `src/lib/attendance/__tests__/property-07-tracking-window.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 7: Tracking-window guard`.
    - Generate `arbEventEnd = fc.date({ min: subHours(now, 12), max: addHours(now, 12) })`. For any registration whose event ended more than 2 hours before `now`, `setAttendance` returns `code='tracking_closed'` and `attendanceEvents` is unchanged. For events still inside the window, the property does not constrain the result code (other guards may fire).
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-07-tracking-window.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-07-tracking-window.pbt.test.ts` passes.

  - [x] 2.9 [PBT] Property 8: Authorization guard
    - **Property 8: Authorization guard**
    - **Validates: Requirements 13.2**
    - Create `src/lib/attendance/__tests__/property-08-authorization.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 8: Authorization guard`.
    - For any actor `a` whose role is neither `admin` nor `owner of r.event_id`, `setAttendance(r, …, a)` returns `code='unauthorized'` and `attendanceEvents` for `r` is unchanged. Same for `bulkSetAttendance` containing `r.id`.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-08-authorization.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-08-authorization.pbt.test.ts` passes.

  - [x] 2.10 [PBT] Property 9: Rapid-scan dedup
    - **Property 9: Rapid-scan dedup**
    - **Validates: Requirements 9.1, 9.3**
    - Create `src/lib/attendance/__tests__/property-09-rapid-scan-dedup.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 9: Rapid-scan dedup`.
    - This property exercises the **dialog** dedup logic, not the SQL helper. Add a small pure-TS scanner state machine `src/lib/attendance/scannerStateMachine.ts` modelling `recentDecodes: Map<string, number>` and `inFlight: boolean` per `design.md` "Internal state (per-tab)". Then for any token `t` and any pair of decode events with `Δt < 2000ms` while the active tab is unchanged, exactly one RPC dispatch is recorded.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/scannerStateMachine.ts` (new), `src/lib/attendance/__tests__/property-09-rapid-scan-dedup.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-09-rapid-scan-dedup.pbt.test.ts` passes.

  - [x] 2.11 [PBT] Property 10: Counter partition correctness
    - **Property 10: Counter partition correctness**
    - **Validates: Requirements 11.2, 11.5**
    - Create `src/lib/attendance/__tests__/property-10-counter-partition.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 10: Counter partition correctness`.
    - Test a pure function `partitionCounters(states: AttendanceState[]): { total, currentlyInside, checkedOut, notArrived }` that the `useEventCheckinCounters` hook will delegate to. For any `fc.array(arbRegState)`, the four numbers partition the input set: `currentlyInside + checkedOut + notArrived === total`.
    - Add `partitionCounters` to `src/lib/attendance/applyAttendance.ts` (or a new `src/lib/attendance/counters.ts`) so the hook (3.1) can import it.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/counters.ts` (new), `src/lib/attendance/__tests__/property-10-counter-partition.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-10-counter-partition.pbt.test.ts` passes.

  - [x] 2.12 [PBT] Property 11: Audit-trail immutability
    - **Property 11: Audit-trail immutability**
    - **Validates: Requirements 12.3**
    - Create `src/lib/attendance/__tests__/property-11-audit-immutability.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 11: Audit-trail immutability`.
    - For any sequence of scanner-initiated `setAttendance` calls against `r`, the set of `attendanceEvents` rows existing before the call is a subset of the set after (no row mutated or removed). Compare via deep-equal of every prior row tuple `(registration_id, kind, method, actor_id, occurred_at)` across each step.
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-11-audit-immutability.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-11-audit-immutability.pbt.test.ts` passes.

  - [x] 2.13 [PBT] Property 12: Bulk equivalence
    - **Property 12: Bulk equivalence**
    - **Validates: Requirements 15.1, 15.2, 15.3**
    - Create `src/lib/attendance/__tests__/property-12-bulk-equivalence.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 12: Bulk equivalence`.
    - Generate `fc.array(arbRegistration)` and a `target ∈ {'inside','outside'}`. Assert that `bulkSetAttendance(ids, target)` returns `[(id_i, c_i)]` where each `c_i` equals the code that `setAttendance(id_i, target)` returns when called as the same actor at the same instant against a fresh copy of the world. Length matches input length (REQ-15.3).
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-12-bulk-equivalence.pbt.test.ts` (new).
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-12-bulk-equivalence.pbt.test.ts` passes.

  - [x] 2.14 [PBT] Property 13: Self-check-in invariant
    - **Property 13: Self-check-in invariant**
    - **Validates: Requirements 14.1, 14.2, 14.3**
    - Create `src/lib/attendance/__tests__/property-13-self-checkin-invariant.pbt.test.ts` with header `// Feature: checkin-checkout-tabs, Property 13: Self-check-in invariant`.
    - Add `selfCheckIn(world, token, eventId, now): { status: 'ok' | 'already' | …; world: World }` to `src/lib/attendance/applyAttendance.ts` as the TS port of the patched `self_check_in` RPC. For any registration `r` and any invocation of `selfCheckIn` that resolves to `r`:
      - No `attendance_events` row with `kind='out'` is ever inserted as a result of the call.
      - When `r.attendance_state = 'outside'` immediately before the call, the post-call `attendance_state = 'inside'` (re-entry per REQ-14.3).
    - `numRuns: 100`.
    - Files: `src/lib/attendance/__tests__/property-13-self-checkin-invariant.pbt.test.ts` (new); extend `src/lib/attendance/applyAttendance.ts` with `selfCheckIn`.
    - _Acceptance:_ `pnpm vitest --run src/lib/attendance/__tests__/property-13-self-checkin-invariant.pbt.test.ts` passes.

- [x] 3. Client implementation

  - [x] 3.1 Extend `useEventCheckinCounters` with `currentlyInside`, `checkedOut`, `notArrived`
    - Modify `src/hooks/useEventCheckinCounters.ts` to expand the returned `CheckinCounters` to `{ total, checkedIn, currentlyInside, checkedOut, notArrived }` per `design.md` "`useEventCheckinCounters` (extended) — REQ-11.5".
    - Implementation: four `head: true` count queries against `registrations` filtered by `attendance_state in ('inside' | 'outside' | 'never')` plus `total`, run in parallel via `Promise.all`. Keep the existing realtime subscription on the `registrations` table; on every postgres_changes payload, re-run the counts (the hook already handles this).
    - Reuse `partitionCounters` from 2.11 only for tests / fallback derivation; the live numbers come from Supabase counts so the hook stays correct with paged datasets.
    - Files: `src/hooks/useEventCheckinCounters.ts` (modify).
    - _Validates: Requirements 11.5, 11.2_
    - _Acceptance:_ `pnpm tsc --noEmit` passes; existing callers of the hook still type-check.

  - [x] 3.2 Rewrite `QRScannerDialog` with tabs, dedup, in-flight lock, and 10s timeout
    - Rewrite `src/components/event/registrations/QRScannerDialog.tsx` as a tabbed dialog per `design.md` "`QRScannerDialog` (modified)". Key elements:
      - `Tabs` from `@/components/ui/tabs` with two values `'check-in' | 'check-out'`. Initial active tab `'check-in'` (REQ-1.2). Active tab name surfaced in dialog header (REQ-1.3).
      - One shared `Html5Qrcode` mount (do **not** stop+restart camera on tab switch).
      - On tab switch: clear `result`, set `inFlight = false`, reset `recentDecodes = new Map()` (REQ-1.4).
      - Decode handler:
        1. If `inFlight === true` or `result !== null`, ignore (REQ-9.2, REQ-9.3).
        2. If `recentDecodes.get(token)` is within 2000ms, ignore (REQ-9.1).
        3. Else set `inFlight = true`, dispatch `supabase.rpc('set_attendance', { p_reg_id, p_target, p_method: 'qr' })`.
      - Wrap the RPC in a 10s `Promise.race` timeout (REQ-10.2). On timeout → `result = { code: 'timeout', … }`.
      - Render success / warn / error banners per the table in `design.md` "Error Handling". Each banner has a "Scan another" button that clears `result` and re-arms the scanner without restarting the camera (REQ-10.3).
      - Replace the `onCheckIn(reg)` prop with `onScanApplied(result: ScanResult, tab: ScannerTab)`.
      - QR resolution: use the existing client-side resolver (id / qr_code / join_token / `speaker:<id>` / `sponsor_contact:<id>`) to map decoded text → `registrationId`. If resolution fails or the resolved registration's `event_id` differs from the dashboard event, set `result` to `{ code: 'not_found' | 'wrong_event' | 'invalid' }` without dispatching the RPC.
    - Files: `src/components/event/registrations/QRScannerDialog.tsx` (rewrite).
    - _Validates: Requirements 1.1–1.6, 2.1–2.5, 9.1–9.3, 10.1–10.3_
    - _Acceptance:_ `pnpm tsc --noEmit` passes; `pnpm vitest --run` does not break any unrelated test (component test added in 4.1).

  - [x] 3.3 Update `RegistrationsSection` (counters, banner, `onScanApplied`, bulk shape)
    - Modify `src/components/event/RegistrationsSection.tsx`:
      - Replace the inline `useMemo` attendance counts with the `currentlyInside / checkedOut / notArrived` fields from `useEventCheckinCounters` (3.1) so there is one source of truth.
      - Replace the `onCheckIn` prop wiring on `<QRScannerDialog>` with `onScanApplied={handleScanApplied}` where `handleScanApplied(result, tab)` (a) calls `reload()` and (b) on `result.code === 'applied_in' || 'applied_out'`, sets `liveLag = { regId: result.registrationId!, expiresAt: Date.now() + 5000 }`.
      - Render a non-blocking "Live updates delayed" indicator next to the section header when `liveLag.expiresAt < Date.now()` and the matching realtime UPDATE has not yet been observed. The realtime subscription clears `liveLag` on the matching UPDATE; the indicator emits a single `console.warn('UI sync failure')` when it first becomes visible (REQ-11.4).
      - Update `bulkCheckIn` and `bulkCheckOut` to consume the new `bulk_set_attendance` return shape (`Array<{ registration_id: string; code: string }>`). For codes that are not `'applied_in' | 'applied_out'`, surface a per-row toast describing the skip reason (cancelled / declined / pending_approval / wrong_event / tracking_closed / unauthorized / already_inside / already_outside / not_checked_in_yet) per REQ-15.3.
    - Files: `src/components/event/RegistrationsSection.tsx` (modify).
    - _Validates: Requirements 11.1–11.5, 15.1–15.3_
    - _Acceptance:_ `pnpm tsc --noEmit` passes; existing registrations render path is unchanged for non-scan flows (verified by running existing component tests, if any, with `pnpm vitest --run`).

- [ ] 4. Example & integration tests

  - [ ]* 4.1 Component tests for `QRScannerDialog` (tabs, banner per code, retry without camera restart)
    - Create `src/components/event/registrations/__tests__/QRScannerDialog.test.tsx`:
      - Render with `open={true}`; assert tabs `Check-In` and `Check-Out` exist and `Check-In` is active by default (REQ-1.1, REQ-1.2).
      - Assert dialog header shows the active tab name; switch tabs, re-assert (REQ-1.3).
      - Mock `supabase.rpc('set_attendance', …)` to return each `ScanResultCode`; assert the rendered banner copy / colour matches the table in `design.md` "Error Handling".
      - Assert "Scan another" button re-arms the scanner without remounting / restarting the `Html5Qrcode` instance (verify the camera-mount ref is the same node before and after).
      - Assert that switching tabs while a banner is shown clears the banner and resets `recentDecodes` (REQ-1.4).
    - Files: `src/components/event/registrations/__tests__/QRScannerDialog.test.tsx` (new).
    - _Validates: Requirements 1.1–1.4, 9.2, 10.1, 10.3, plus the banner table in design.md_
    - _Acceptance:_ `pnpm vitest --run src/components/event/registrations/__tests__/QRScannerDialog.test.tsx` passes.

  - [ ]* 4.2 `SelfCheckInPage` snapshot — no check-out affordance
    - Create `src/pages/__tests__/SelfCheckInPage.test.tsx`:
      - Render `SelfCheckInPage` with mocked `useParams({ eventId })` and a stubbed `supabase.rpc('self_check_in', …)` returning `status='ok'`.
      - Assert the rendered DOM contains no element whose accessible name matches `/check[- ]?out|end visit/i`.
      - Snapshot the rendered tree once for regression detection.
    - Files: `src/pages/__tests__/SelfCheckInPage.test.tsx` (new).
    - _Validates: Requirements 14.4_
    - _Acceptance:_ `pnpm vitest --run src/pages/__tests__/SelfCheckInPage.test.tsx` passes.

  - [ ]* 4.3 Integration round-trip against local Supabase: check-in → check-out → re-entry
    - Create `src/integrations/__tests__/attendance-roundtrip.integration.test.ts`:
      - Skipped unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars are set (so CI without Supabase doesn't break).
      - Seed a dummy event + registration; impersonate an event owner; call `set_attendance(reg_id, 'inside', 'qr')` → assert `code='applied_in'` and one new row in `attendance_events` with `kind='in'`.
      - Call `set_attendance(reg_id, 'outside', 'qr')` → assert `code='applied_out'`, `total_minutes >= 0`, and a new row with `kind='out'`.
      - Call `set_attendance(reg_id, 'inside', 'qr')` → assert re-entry succeeds and `attendance_state='inside'`.
      - Tear down the seeded rows in `afterAll`.
    - Files: `src/integrations/__tests__/attendance-roundtrip.integration.test.ts` (new).
    - _Validates: Requirements 3.1, 3.2, 4.1, 12.1, 12.2 (end-to-end Supabase wiring)_
    - _Acceptance:_ With local Supabase running (`supabase start`) and env vars set, `pnpm vitest --run src/integrations/__tests__/attendance-roundtrip.integration.test.ts` passes.

  - [ ]* 4.4 Realtime SLA + "Live updates delayed" example test (fake timers)
    - Create `src/components/event/__tests__/RegistrationsSection-live-updates.test.tsx`:
      - Render `RegistrationsSection` with mocked `supabase.rpc('set_attendance', …)` returning `{ code: 'applied_in', registration_id, … }` and a stubbed realtime channel that does NOT emit a postgres_changes payload.
      - Use `vi.useFakeTimers()`; trigger `handleScanApplied` directly (or via the dialog's `onScanApplied`); advance the clock 5001 ms.
      - Assert a "Live updates delayed" indicator becomes visible and `console.warn` was called once with `'UI sync failure'`.
      - Then have the stubbed channel emit the matching UPDATE; assert the indicator is removed.
    - Files: `src/components/event/__tests__/RegistrationsSection-live-updates.test.tsx` (new).
    - _Validates: Requirements 11.3, 11.4_
    - _Acceptance:_ `pnpm vitest --run src/components/event/__tests__/RegistrationsSection-live-updates.test.tsx` passes.

- [x] 5. Cleanup

  - [x] 5.1 Update HelpPage copy referencing "Bulk Check-In"
    - Locate the section in `src/pages/dashboard/HelpPage.tsx` that mentions the QR scanner / bulk check-in flow. Reword it to describe the two scanner tabs (Check-In / Check-Out) and the fact that a single QR code per participant works for both. Keep the existing screenshot anchors if any.
    - Files: `src/pages/dashboard/HelpPage.tsx` (modify).
    - _Validates: User-facing documentation alignment with REQ-1, REQ-3, REQ-4_
    - _Acceptance:_ `pnpm tsc --noEmit` passes; visual review of the rendered Help page shows the updated copy with no broken markdown / heading levels.

  - [ ]* 5.2 OPTIONAL — belt-and-braces SQL sanity-check migration
    - **OPTIONAL.** Per `design.md` "Phase 3 — Cleanup (post-rollout)": create `supabase/migrations/008_attendance_ordering_check.sql` adding either (a) a `BEFORE INSERT` trigger on `attendance_events` that re-asserts `count(out) ≤ count(in)` per registration, or (b) a `NOT VALID CHECK` constraint enforcing the same.
    - Also include the read-only sanity query from `design.md` Phase 1 wrapped in a `DO $$ … $$;` block that raises a notice (or fails the migration) if any registration currently has `out_n > in_n`.
    - Files: `supabase/migrations/008_attendance_ordering_check.sql` (new).
    - _Validates: Defense-in-depth for Requirements 6.1, 12.3_
    - _Acceptance:_ `supabase migration up` succeeds; the read-only query reports `0` violators against the seeded local database. (Skip this task entirely if the team prefers application-layer enforcement only.)

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full suite: `pnpm vitest --run` and `pnpm tsc --noEmit`.
  - For SQL: `supabase db reset` against a clean local Supabase to confirm migrations 004–007 (and optional 008) apply in order.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster rollout. The 13 PBT tasks in section 2 are **not** optional because they are the formal correctness layer for the state machine.
- Each PBT task references a single property from `design.md` ("Correctness Properties") and runs `fast-check` with `numRuns: 100` minimum. The header `// Feature: checkin-checkout-tabs, Property N: <text>` is mandatory so the spec-task-execution agent recognises the file as a property-based test.
- The `[PBT]` tag on sub-tasks 2.2 through 2.14 signals the spec-task-execution agent to invoke the property-based test runner and to record `update_pbt_status` after each run.
- The DB migration files are kept one-task-per-file to allow Wave 1 SQL tasks to run in parallel without merge conflicts. The integration test in 4.3 verifies the four migrations compose correctly end-to-end.
- The client deploy (3.x) and DB migration (1.x) must ship together because `bulk_set_attendance` changes its return shape (a breaking change for the one caller in `RegistrationsSection`).
- `fast-check@^3` will be added as a dev dependency the first time it is imported; the spec-task-execution agent should run `pnpm add -D fast-check` before executing any 2.x sub-task if `fast-check` is not yet in `package.json`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["5.1", "5.2"] }
  ]
}
```
