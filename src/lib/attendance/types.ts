// Feature: checkin-checkout-tabs
// Deterministic TypeScript port types for the `_apply_attendance` SQL helper.
// These shapes mirror the SQL state machine and serve as fixtures for
// property-based tests under src/lib/attendance/__tests__/*.pbt.test.ts.

/**
 * The persisted attendance state on a registration row, mirroring
 * `registrations.attendance_state` in the SQL schema.
 */
export type AttendanceState = "never" | "inside" | "outside";

/**
 * The two scanner tabs surfaced by `QRScannerDialog`.
 */
export type Tab = "check-in" | "check-out";

/**
 * The desired post-scan attendance state. The Tab → Target mapping is
 * `check-in → 'inside'` and `check-out → 'outside'`.
 */
export type Target = "inside" | "outside";

/**
 * Result codes emitted by `_apply_attendance` (and projected by
 * `set_attendance` / `bulk_set_attendance`). Mirrors the design's
 * `ScanResultCode` union exactly.
 */
export type ScanResultCode =
  | "applied_in"
  | "applied_out"
  | "already_inside"
  | "already_outside"
  | "not_checked_in_yet"
  | "cancelled"
  | "declined"
  | "pending_approval"
  | "wrong_event"
  | "not_found"
  | "invalid"
  | "tracking_closed"
  | "unauthorized"
  | "rpc_error"
  | "timeout";

/**
 * The four `registrations.approval_status` values enforced by the
 * `registrations_validate` trigger.
 */
export type ApprovalStatus = "pending" | "approved" | "waitlisted" | "declined";

/**
 * The `registrations.status` values used by the cancellation guard.
 */
export type RegistrationStatus = "confirmed" | "pending" | "cancelled";

/**
 * The `attendance_events.method` values recorded by every writer.
 */
export type Method = "qr" | "bulk" | "manual" | "self";

/**
 * Deterministic plain-JS shape of a registration row used by the TS state
 * machine. Mirrors the columns the SQL helper reads/writes.
 */
export interface RegistrationFixture {
  readonly id: string;
  readonly event_id: string;
  readonly status: RegistrationStatus;
  readonly approval_status: ApprovalStatus;
  readonly attendance_state: AttendanceState;
  readonly qr_code: string;
  readonly join_token: string;
  readonly kind: "attendee" | "speaker" | "sponsor_contact";
  readonly last_in_at: Date | null;
  readonly last_out_at: Date | null;
}

/**
 * Minimal event fixture carrying the two columns the helper inspects.
 * `end_date` is `null` for events with no scheduled end (tracking window
 * is then permissive).
 */
export interface EventFixture {
  readonly id: string;
  readonly end_date: Date | null;
}

/**
 * Caller identity. The SQL side enforces RLS via `auth.uid()` and the
 * `is_admin` / `is_event_owner` predicates; this port only models the
 * rejection-code surface those predicates produce.
 *
 * - `admin`  → platform admin, authorized for any event.
 * - `owner`  → owner of the event being acted on (event-scoped).
 * - `other`  → neither admin nor owner; produces `'unauthorized'`.
 */
export interface Actor {
  readonly id: string;
  readonly role: "admin" | "owner" | "other";
}

/**
 * One row of the immutable `attendance_events` audit table.
 */
export interface AttendanceEventRow {
  readonly registration_id: string;
  readonly kind: "in" | "out" | "auto_out";
  readonly method: Method;
  readonly actor_id: string;
  readonly occurred_at: Date;
}

/**
 * The deterministic in-memory world the TS state machine operates on.
 * Treated as immutable: every successful `applyAttendance` returns a new
 * `World` with updated `registrations` and `attendanceEvents`.
 */
export interface World {
  readonly registrations: ReadonlyMap<string, RegistrationFixture>;
  readonly events: ReadonlyMap<string, EventFixture>;
  readonly attendanceEvents: readonly AttendanceEventRow[];
  readonly now: Date;
}
