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

// ─── internal helpers ──────────────────────────────────────────────────────

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
