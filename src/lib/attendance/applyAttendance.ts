// Feature: checkin-checkout-tabs
// Deterministic TypeScript port of the SQL `_apply_attendance` helper plus
// the per-row `set_attendance`, the `bulk_set_attendance` shape, and the
// QR resolver from REQ-2.1. This module is the canonical reference the
// property-based tests under src/lib/attendance/__tests__/ drive against.
//
// Branch order mirrors the SQL helper EXACTLY:
//   existence → authorization → tracking window → status guards → state machine.

import type {
  Actor,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  Method,
  RegistrationFixture,
  ScanResultCode,
  Target,
  World,
} from "./types";

/**
 * Tracking window cutoff: the SQL helper rejects with `tracking_closed`
 * when `now() > end_date + interval '2 hours'`.
 */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * UUIDv* shape used by the `speaker:<UUID>` / `sponsor_contact:<UUID>`
 * resolver. The SQL side delegates to PostgreSQL's `uuid` cast which
 * accepts canonical 8-4-4-4-12 hex form. We mirror that here.
 */
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Apply one attendance transition deterministically.
 *
 * Returns the result code and the new world. On any rejection branch the
 * world is returned unchanged. On a success branch the new world reflects
 * the same state-machine update the existing `_attendance_recompute`
 * AFTER-INSERT trigger would produce: `attendance_state` is set to the
 * target, `last_in_at` / `last_out_at` is bumped to `now`, and a new
 * `attendance_events` row is appended.
 */
export function applyAttendance(
  world: World,
  regId: string,
  target: Target,
  method: Method,
  actor: Actor,
  now: Date
): { code: ScanResultCode; world: World } {
  // 1. Existence
  const reg = world.registrations.get(regId);
  if (!reg) {
    return { code: "not_found", world };
  }

  // 2. Authorization (REQ-13.2)
  // The SQL side checks `is_admin(actor) OR is_event_owner(actor, reg.event_id)`.
  // We model `role === 'owner'` as event-scoped: callers set the role to
  // 'owner' only when the actor is genuinely an owner of `reg.event_id`.
  if (actor.role !== "admin" && actor.role !== "owner") {
    return { code: "unauthorized", world };
  }

  // 3. Tracking window (REQ-8.1)
  const event = world.events.get(reg.event_id);
  if (event && isTrackingClosed(event, now)) {
    return { code: "tracking_closed", world };
  }

  // 4. Status / approval guards (REQ-7.1, 7.2, 7.3)
  if (reg.status === "cancelled") {
    return { code: "cancelled", world };
  }
  if (reg.approval_status === "declined") {
    return { code: "declined", world };
  }
  if (
    reg.approval_status === "pending" ||
    reg.approval_status === "waitlisted"
  ) {
    return { code: "pending_approval", world };
  }

  // 5. State machine (REQ-3, REQ-4, REQ-5, REQ-6)
  if (target === "inside") {
    if (reg.attendance_state === "inside") {
      return { code: "already_inside", world };
    }
    return {
      code: "applied_in",
      world: appendEvent(world, reg, "in", method, actor, now),
    };
  }

  // target === 'outside'
  if (reg.attendance_state === "never") {
    // REQ-6.1 ordering invariant: cannot insert 'out' before any 'in'.
    return { code: "not_checked_in_yet", world };
  }
  if (reg.attendance_state === "outside") {
    return { code: "already_outside", world };
  }
  // attendance_state === 'inside'
  return {
    code: "applied_out",
    world: appendEvent(world, reg, "out", method, actor, now),
  };
}

/**
 * Rich projection mirroring the columns `set_attendance` returns to the
 * dialog. `name` and `ticket_type` live on the SQL row but are not part of
 * the deterministic fixture shape, so they are omitted here; the dialog
 * surfaces them from the registrations list it already holds.
 */
export interface SetAttendanceResult {
  readonly code: ScanResultCode;
  readonly registrationId: string | null;
  readonly attendanceState: AttendanceState | null;
  readonly lastInAt: Date | null;
  readonly lastOutAt: Date | null;
}

/**
 * Per-row RPC equivalent of `set_attendance`. Same semantics as
 * `applyAttendance`, plus a projected result row the dialog renders the
 * success / warn / error banner from.
 */
export function setAttendance(
  world: World,
  regId: string,
  target: Target,
  method: Method,
  actor: Actor,
  now: Date
): { code: ScanResultCode; world: World; result: SetAttendanceResult } {
  const { code, world: nextWorld } = applyAttendance(
    world,
    regId,
    target,
    method,
    actor,
    now
  );
  const reg = nextWorld.registrations.get(regId) ?? null;
  return {
    code,
    world: nextWorld,
    result: {
      code,
      registrationId: reg ? reg.id : null,
      attendanceState: reg ? reg.attendance_state : null,
      lastInAt: reg ? reg.last_in_at : null,
      lastOutAt: reg ? reg.last_out_at : null,
    },
  };
}

/**
 * Bulk RPC equivalent of `bulk_set_attendance`. Iterates the input ids in
 * order, threading the world through each call so duplicate ids see the
 * effects of earlier ops (matching the SQL FOREACH loop).
 *
 * Returns `Array<{ registration_id, code }>` of the same length as the
 * input — including not-found, unauthorized, cancelled, and declined ids
 * — to satisfy REQ-15.3.
 */
export function bulkSetAttendance(
  world: World,
  ids: readonly string[],
  target: Target,
  method: Method,
  actor: Actor,
  now: Date
): Array<{ registration_id: string; code: ScanResultCode }> {
  const results: Array<{ registration_id: string; code: ScanResultCode }> = [];
  let current = world;
  for (const id of ids) {
    const { code, world: next } = applyAttendance(
      current,
      id,
      target,
      method,
      actor,
      now
    );
    results.push({ registration_id: id, code });
    current = next;
  }
  return results;
}

/**
 * Resolve a decoded QR token to a registration per REQ-2.1.
 *
 * Accepted forms:
 *   - Registration `id` (UUID)
 *   - Registration `qr_code`
 *   - Registration `join_token`
 *   - `speaker:<UUID>` literal (only when the resolved registration's
 *     `kind === 'speaker'`)
 *   - `sponsor_contact:<UUID>` literal (only when `kind === 'sponsor_contact'`)
 *
 * Returns `null` for tokens that match no accepted form or that match a
 * form whose UUID is malformed. The caller (the `QRScannerDialog`
 * dispatch layer added in task 2.6) translates `null` into either
 * `'invalid'` (malformed form) or `'not_found'` (well-formed but
 * unknown). This pure resolver does not draw that distinction.
 */
export function resolveQr(
  world: World,
  token: string | null | undefined
): RegistrationFixture | null {
  if (token == null || token.length === 0) {
    return null;
  }

  // speaker:<UUID>
  if (token.startsWith("speaker:")) {
    const id = token.slice("speaker:".length);
    if (!UUID_RE.test(id)) return null;
    for (const reg of world.registrations.values()) {
      if (reg.id === id && reg.kind === "speaker") return reg;
    }
    return null;
  }

  // sponsor_contact:<UUID>
  if (token.startsWith("sponsor_contact:")) {
    const id = token.slice("sponsor_contact:".length);
    if (!UUID_RE.test(id)) return null;
    for (const reg of world.registrations.values()) {
      if (reg.id === id && reg.kind === "sponsor_contact") return reg;
    }
    return null;
  }

  // id / qr_code / join_token (REQ-2.2 guarantees uniqueness in the fixture)
  for (const reg of world.registrations.values()) {
    if (
      reg.id === token ||
      reg.qr_code === token ||
      reg.join_token === token
    ) {
      return reg;
    }
  }
  return null;
}

/**
 * Client-resolution layer used by `QRScannerDialog` (REQ-2.4).
 *
 * The SQL `set_attendance` helper takes only a registration id, so the
 * "wrong event" guard cannot live there: by the time the RPC runs, the
 * caller has already named the registration. The dashboard is what is
 * scoped to a single event, and the dialog is what decodes a raw QR
 * token. So this function models the dispatch path the dialog takes:
 *
 *   1. Resolve the decoded token to a registration via `resolveQr`.
 *   2. If resolution fails:
 *        - For malformed `speaker:` / `sponsor_contact:` tokens, return
 *          `'invalid'` (per REQ-2.5).
 *        - Otherwise return `'not_found'` (per REQ-2.3).
 *      Either way no RPC is dispatched and the world is unchanged.
 *   3. If the resolved registration belongs to a different event than the
 *      dashboard scope, return `'wrong_event'` and write nothing
 *      (REQ-2.4). This mirrors the SQL guard a `set_attendance` overload
 *      would impose if the client passed `dashboardEventId`.
 *   4. Otherwise delegate to `setAttendance`.
 *
 * Encoding the layer here (rather than inside the React dialog) keeps it
 * testable from `fast-check` without React.
 */
export function resolveAndDispatch(
  world: World,
  token: string | null | undefined,
  dashboardEventId: string,
  target: Target,
  method: Method,
  actor: Actor,
  now: Date
): { code: ScanResultCode; world: World; result: SetAttendanceResult } {
  const reg = resolveQr(world, token);
  if (!reg) {
    const code: ScanResultCode = isMalformedScopedToken(token)
      ? "invalid"
      : "not_found";
    return {
      code,
      world,
      result: {
        code,
        registrationId: null,
        attendanceState: null,
        lastInAt: null,
        lastOutAt: null,
      },
    };
  }
  if (reg.event_id !== dashboardEventId) {
    const code: ScanResultCode = "wrong_event";
    return {
      code,
      world,
      result: {
        code,
        registrationId: reg.id,
        attendanceState: reg.attendance_state,
        lastInAt: reg.last_in_at,
        lastOutAt: reg.last_out_at,
      },
    };
  }
  return setAttendance(world, reg.id, target, method, actor, now);
}

/**
 * Return shape of the patched `self_check_in` SQL RPC, projected to the
 * deterministic surface this TS port models. The full SQL row also
 * carries `id`, `event_id`, `name`, `email`, `ticket_type`, and
 * `checked_in_at`; those are not part of the property-13 surface and
 * are omitted here.
 */
export type SelfCheckInStatus =
  | "ok"
  | "already"
  | "wrong_event"
  | "not_found"
  | "invalid"
  | "cancelled"
  | "expired";

/**
 * Synthetic actor used when `selfCheckIn` appends an `attendance_events`
 * row. The SQL `self_check_in` RPC is `SECURITY DEFINER` and inserts
 * without an `actor_id` column value, so the wire row carries `NULL`. In
 * the deterministic TS port `actor_id` is a non-null `string`; we use
 * the sentinel `'self'` to make the source of the row obvious in test
 * traces. Property 13 does not assert on `actor_id`, so the choice is
 * cosmetic.
 */
const SELF_CHECKIN_ACTOR: Actor = { id: "self", role: "admin" };

/**
 * TypeScript port of the patched `public.self_check_in(p_token, p_event_id)`
 * RPC (see `supabase/migrations/007_self_check_in_no_out.sql`).
 *
 * Critical invariant (REQ-14, this is the whole reason the migration
 * exists): when the resolved registration's `attendance_state = 'inside'`
 * the function MUST return `status = 'already'` WITHOUT inserting any
 * `attendance_events` row — no `kind = 'out'` (REQ-14.1, REQ-14.2) and no
 * `kind = 'in'`. Re-entry from `'outside'` (REQ-14.3) and first check-in
 * from `'never'` both insert `kind = 'in', method = 'self'` and return
 * `status = 'ok'`.
 *
 * Resolution mirrors the SQL flow:
 *   1. Empty / whitespace-only token → `'invalid'`.
 *   2. `speaker:<UUID>` and `sponsor_contact:<UUID>` are scoped tokens:
 *        - `eventId == null`               → `'wrong_event'`
 *        - malformed UUID payload          → `'invalid'`
 *        - speaker / sponsor not in event  → `'not_found'`
 *      The TS port simplifies the SQL `JOIN event_speakers` /
 *      `JOIN event_sponsors` lookup to "registration with the matching
 *      `id`, matching `kind`, and matching `event_id`". This is enough
 *      to drive Property 13.
 *   3. Otherwise the token is matched against `id`, `qr_code`, or
 *      `join_token`; misses produce `'not_found'`.
 *   4. If `eventId` is provided and differs from the resolved
 *      registration's `event_id` → `'wrong_event'`.
 *   5. If the registration's event ended more than 2 hours before `now`
 *      → `'expired'` (the SQL helper uses the literal token `'expired'`
 *      here, not `'tracking_closed'` — Property 13 does not assert on
 *      this branch but we mirror the SQL anyway for fidelity).
 *   6. If `r.status = 'cancelled'` → `'cancelled'`.
 *   7. State machine (the patched branch):
 *        - `'inside'`           → `'already'`, NO write.
 *        - `'outside'` or `'never'` → INSERT `kind='in', method='self'`,
 *          return `'ok'`.
 *
 * Note: the public self-check-in flow does NOT check `approval_status`.
 * The SQL function only guards on `r.status = 'cancelled'` and the
 * tracking window, and so does this port.
 */
export function selfCheckIn(
  world: World,
  token: string | null | undefined,
  eventId: string | null | undefined,
  now: Date
): { status: SelfCheckInStatus; world: World } {
  // 1. Invalid / empty token
  if (token == null || token.trim().length === 0) {
    return { status: "invalid", world };
  }

  // 2. Resolve the registration the token refers to.
  let reg: RegistrationFixture | null = null;

  if (
    token.startsWith("speaker:") ||
    token.startsWith("sponsor_contact:")
  ) {
    // Scoped tokens require the dashboard to pass an event id (the SQL
    // returns 'wrong_event' immediately when `p_event_id IS NULL`).
    if (eventId == null) {
      return { status: "wrong_event", world };
    }
    const prefix = token.startsWith("speaker:")
      ? "speaker:"
      : "sponsor_contact:";
    const parsedId = token.slice(prefix.length);
    if (!UUID_RE.test(parsedId)) {
      return { status: "invalid", world };
    }
    const expectedKind: RegistrationFixture["kind"] =
      prefix === "speaker:" ? "speaker" : "sponsor_contact";
    for (const r of world.registrations.values()) {
      if (
        r.id === parsedId &&
        r.kind === expectedKind &&
        r.event_id === eventId
      ) {
        reg = r;
        break;
      }
    }
    if (!reg) {
      return { status: "not_found", world };
    }
  } else {
    // Plain id / qr_code / join_token lookup (mirrors the SQL OR-list).
    for (const r of world.registrations.values()) {
      if (
        r.id === token ||
        r.qr_code === token ||
        r.join_token === token
      ) {
        reg = r;
        break;
      }
    }
    if (!reg) {
      return { status: "not_found", world };
    }
  }

  // 3. Cross-event guard: only fires when the dashboard supplied an
  //    event id and it disagrees with the resolved registration.
  if (eventId != null && reg.event_id !== eventId) {
    return { status: "wrong_event", world };
  }

  // 4. Tracking window (the SQL labels this branch `'expired'`, not
  //    `'tracking_closed'`).
  const event = world.events.get(reg.event_id);
  if (event && isTrackingClosed(event, now)) {
    return { status: "expired", world };
  }

  // 5. Cancelled-registration guard.
  if (reg.status === "cancelled") {
    return { status: "cancelled", world };
  }

  // 6. State machine — REQ-14.1 / REQ-14.2: `'inside'` is a NO-OP.
  if (reg.attendance_state === "inside") {
    return { status: "already", world };
  }

  // `'never'` (first check-in) and `'outside'` (re-entry, REQ-14.3) both
  // insert `kind='in', method='self'` and return `'ok'`.
  return {
    status: "ok",
    world: appendEvent(world, reg, "in", "self", SELF_CHECKIN_ACTOR, now),
  };
}

// ─── internal helpers ──────────────────────────────────────────────────────

/**
 * `speaker:<bad-uuid>` and `sponsor_contact:<bad-uuid>` are the only
 * tokens whose form is recognized but whose UUID payload is malformed.
 * Per REQ-2.5 those produce `'invalid'`; every other unresolved token
 * is `'not_found'`.
 */
function isMalformedScopedToken(token: string | null | undefined): boolean {
  if (token == null || token.length === 0) return false;
  const prefixes = ["speaker:", "sponsor_contact:"];
  for (const p of prefixes) {
    if (token.startsWith(p)) {
      const id = token.slice(p.length);
      return !UUID_RE.test(id);
    }
  }
  return false;
}


function isTrackingClosed(event: EventFixture, now: Date): boolean {
  if (event.end_date === null) {
    return false;
  }
  return now.getTime() - event.end_date.getTime() > TWO_HOURS_MS;
}

function appendEvent(
  world: World,
  reg: RegistrationFixture,
  kind: "in" | "out",
  method: Method,
  actor: Actor,
  now: Date
): World {
  const row: AttendanceEventRow = {
    registration_id: reg.id,
    kind,
    method,
    actor_id: actor.id,
    occurred_at: now,
  };
  const updatedReg: RegistrationFixture = {
    ...reg,
    attendance_state: kind === "in" ? "inside" : "outside",
    last_in_at: kind === "in" ? now : reg.last_in_at,
    last_out_at: kind === "out" ? now : reg.last_out_at,
  };
  const newRegs = new Map(world.registrations);
  newRegs.set(reg.id, updatedReg);
  return {
    registrations: newRegs,
    events: world.events,
    attendanceEvents: [...world.attendanceEvents, row],
    now: world.now,
  };
}
