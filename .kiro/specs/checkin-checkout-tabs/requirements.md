# Requirements Document

## Introduction

The organizer-facing QR scanner currently performs an implicit toggle: if a participant is "inside" the next scan checks the participant out, otherwise the scan checks the participant in. Holding a camera over a code, scanning the same person twice in a row, or simply forgetting which mode the staff intended can silently flip a registration's attendance state. This feature replaces the toggle with two explicit, mutually exclusive scanner modes — "Check-In" and "Check-Out" — surfaced as tabs in the existing scanner dialog. Each tab scans the same single QR but performs only one kind of state transition, so accidental cross-actions are not possible.

The single QR per participant remains the source of truth. The data model already supports check-out tracking via `registrations.attendance_state` ("never" | "inside" | "outside"), `last_in_at`, `last_out_at`, `total_minutes`, and the `attendance_events` audit table. No new "checked_out" boolean column is required on `registrations`; the existing `attendance_state = 'outside'` and `last_out_at` together capture the same information and preserve the audit trail.

This spec covers the organizer scanner UI, the backend transition rules invoked by the scanner, edge-case handling, audit logging, counters, authorization, and the scope decision for the public self-check-in page.

## Glossary

- **Scanner**: The organizer-facing QR scanner UI rendered by `QRScannerDialog` inside the event dashboard's Registrations tab.
- **Self_Check_In_Page**: The public self-service page mounted at `/checkin/:eventId` (`src/pages/SelfCheckInPage.tsx`).
- **Registrations_List**: The registrations table in the event dashboard's Registrations tab, including its filter chips and counters.
- **Backend**: The Supabase database and the SECURITY DEFINER PostgreSQL functions invoked by the Scanner (e.g., `set_attendance`, `bulk_set_attendance`, `self_check_in`).
- **Organizer**: A signed-in user who is a platform admin or an owner of the event being managed.
- **Participant**: A person represented by a `registrations` row, including attendees, speakers, and sponsor contacts.
- **Registration**: A row in `public.registrations` with fields `id`, `event_id`, `qr_code`, `join_token`, `status`, `approval_status`, `attendance_state`, `last_in_at`, `last_out_at`.
- **QR_Code**: The string payload encoded in a Participant's QR. The QR_Code matches one of: a Registration `id` (UUID), a Registration `qr_code`, a Registration `join_token`, the literal `speaker:<UUID>`, or the literal `sponsor_contact:<UUID>`.
- **Attendance_State**: The value of `registrations.attendance_state`, restricted to one of "never", "inside", "outside".
- **Check_In_Tab**: The Scanner mode that performs only check-in transitions ("never" → "inside" or "outside" → "inside").
- **Check_Out_Tab**: The Scanner mode that performs only check-out transitions ("inside" → "outside").
- **Attendance_Event**: A row in `public.attendance_events` with `kind` in {"in", "out", "auto_out"} that records one scan.
- **Event_Tracking_Window**: The interval ending 2 hours after the event's `end_date` (or `date` when `end_date` is null), during which check-in and check-out are permitted.

## Requirements

### Requirement 1: Two Distinct Scanner Modes

**User Story:** As an Organizer, I want the QR scanner UI to expose two clearly labeled tabs for Check-In and Check-Out, so that each scan action is intentional and cannot be silently inverted.

#### Acceptance Criteria

1. THE Scanner SHALL present exactly two selectable tabs labeled "Check-In" and "Check-Out".
2. WHEN the Scanner is opened, THE Scanner SHALL select the Check_In_Tab as the initial active tab.
3. THE Scanner SHALL display the name of the active tab in the dialog header while the dialog is open.
4. WHEN the Organizer switches between the Check_In_Tab and the Check_Out_Tab, THE Scanner SHALL clear the previous scan result and SHALL reset any pending in-flight scan before processing the next decode.
5. WHILE the Check_In_Tab is active, THE Scanner SHALL only invoke check-in transitions on decoded QR_Codes.
6. WHILE the Check_Out_Tab is active, THE Scanner SHALL only invoke check-out transitions on decoded QR_Codes.

### Requirement 2: Single QR Identifies the Participant

**User Story:** As an Organizer, I want each Participant to keep one QR for both check-in and check-out, so that participants are not asked to manage two codes.

#### Acceptance Criteria

1. THE Scanner SHALL accept a QR_Code that matches one of the following resolution rules: a Registration `id`, a Registration `qr_code`, a Registration `join_token`, a `speaker:<UUID>` literal, or a `sponsor_contact:<UUID>` literal.
2. WHEN a QR_Code is decoded in either tab, THE Scanner SHALL resolve the QR_Code to at most one Registration before invoking any state transition.
3. IF a decoded QR_Code resolves to no Registration, THEN THE Scanner SHALL display a "Ticket not found" result and SHALL NOT modify any Registration or insert any Attendance_Event.
4. IF a decoded QR_Code resolves to a Registration whose `event_id` differs from the event currently open in the dashboard, THEN THE Scanner SHALL display a "Wrong event" result and SHALL NOT modify any Registration or insert any Attendance_Event.
5. IF a decoded string fails QR_Code resolution rules in Requirement 2.1, THEN THE Scanner SHALL display an "Invalid code" result and SHALL NOT modify any Registration or insert any Attendance_Event.

### Requirement 3: Check-In Tab State Transitions

**User Story:** As an Organizer working the entrance, I want the Check-In tab to only mark Participants as inside, so that scanning never accidentally checks a Participant out.

#### Acceptance Criteria

1. WHEN a QR_Code is scanned in the Check_In_Tab and the resolved Registration's Attendance_State equals "never", THE Backend SHALL set the Attendance_State to "inside", SHALL set `last_in_at` to the server timestamp, and SHALL insert one Attendance_Event with kind "in" and method "qr".
2. WHEN a QR_Code is scanned in the Check_In_Tab and the resolved Registration's Attendance_State equals "outside", THE Backend SHALL set the Attendance_State to "inside", SHALL set `last_in_at` to the server timestamp, and SHALL insert one Attendance_Event with kind "in" and method "qr".
3. WHEN a QR_Code is scanned in the Check_In_Tab and the resolved Registration's Attendance_State equals "inside", THE Backend SHALL leave the Registration unchanged, THE Backend SHALL NOT insert an Attendance_Event, and THE Scanner SHALL display an "Already checked in" result.
4. WHEN a check-in transition succeeds, THE Scanner SHALL display the Participant's name, ticket type, and the recorded check-in timestamp.

### Requirement 4: Check-Out Tab State Transitions

**User Story:** As an Organizer working the exit, I want the Check-Out tab to only mark Participants as outside, so that scanning never accidentally re-checks a Participant in.

#### Acceptance Criteria

1. WHEN a QR_Code is scanned in the Check_Out_Tab and the resolved Registration's Attendance_State equals "inside", THE Backend SHALL set the Attendance_State to "outside", SHALL set `last_out_at` to the server timestamp, SHALL update `total_minutes` based on the elapsed time since `last_in_at`, and SHALL insert one Attendance_Event with kind "out" and method "qr".
2. IF a QR_Code is scanned in the Check_Out_Tab and the resolved Registration's Attendance_State equals "never", THEN THE Backend SHALL leave the Registration unchanged, THE Backend SHALL NOT insert an Attendance_Event, and THE Scanner SHALL display a "Not checked in yet" result.
3. IF a QR_Code is scanned in the Check_Out_Tab and the resolved Registration's Attendance_State equals "outside", THEN THE Backend SHALL leave the Registration unchanged, THE Backend SHALL NOT insert an Attendance_Event, and THE Scanner SHALL display an "Already checked out" result.
4. WHEN a check-out transition succeeds, THE Scanner SHALL display the Participant's name, ticket type, and the recorded check-out timestamp.

### Requirement 5: Mode Isolation Invariant

**User Story:** As an event owner, I want each Scanner tab to be strictly isolated, so that the active tab is the sole controller of the side effect produced by a scan.

#### Acceptance Criteria

1. WHILE the Check_In_Tab is active, THE Backend SHALL NOT insert an Attendance_Event with kind "out" for any scan originating from the Scanner.
2. WHILE the Check_Out_Tab is active, THE Backend SHALL NOT insert an Attendance_Event with kind "in" for any scan originating from the Scanner.
3. FOR ANY Registration with Attendance_State equal to "inside", repeated scans of the same QR_Code in the Check_In_Tab SHALL leave the Attendance_State equal to "inside" (idempotence).
4. FOR ANY Registration with Attendance_State equal to "outside", repeated scans of the same QR_Code in the Check_Out_Tab SHALL leave the Attendance_State equal to "outside" (idempotence).

### Requirement 6: Cross-Mode Ordering Invariant

**User Story:** As an event owner, I want a Participant's first scan to always be a check-in, so that no Participant can ever appear "checked out" without a prior check-in.

#### Acceptance Criteria

1. FOR ANY Registration, the running count of Attendance_Events with kind "out" SHALL be less than or equal to the running count of Attendance_Events with kind "in" at every point in time.
2. IF a check-out transition would violate the ordering invariant in Requirement 6.1, THEN THE Backend SHALL reject the transition and THE Scanner SHALL display a "Not checked in yet" result.

### Requirement 7: Cancelled, Declined, or Pending Registrations

**User Story:** As an Organizer, I want cancelled or unapproved Registrations to be blocked from scanning, so that stale or unapproved QR_Codes cannot mark attendance.

#### Acceptance Criteria

1. IF a scanned QR_Code resolves to a Registration whose `status` equals "cancelled", THEN THE Backend SHALL reject the transition in either tab, and THE Scanner SHALL display a "Registration cancelled" result.
2. IF a scanned QR_Code resolves to a Registration whose `approval_status` equals "declined", THEN THE Backend SHALL reject the transition in either tab, and THE Scanner SHALL display a "Registration declined" result.
3. IF a scanned QR_Code resolves to a Registration whose `approval_status` equals "pending" or "waitlisted", THEN THE Backend SHALL reject the transition in either tab, and THE Scanner SHALL display an "Awaiting approval" result.

### Requirement 8: Event Tracking Window Enforcement

**User Story:** As an event owner, I want check-in and check-out blocked once the event is well past its end, so that attendance cannot be retroactively edited via the Scanner.

#### Acceptance Criteria

1. IF a scanned QR_Code resolves to a Registration whose event ended more than 2 hours before the current server time, THEN THE Backend SHALL reject the transition in either tab, and THE Scanner SHALL display a "Tracking closed" result.

### Requirement 9: Rapid Double-Scan Handling

**User Story:** As an Organizer using a continuous video scanner, I want repeated decodes of the same QR_Code to not produce duplicate side effects, so that the camera holding on a code does not spam the queue.

#### Acceptance Criteria

1. WHEN the same QR_Code is decoded by the Scanner more than once within 2000 milliseconds while the active tab is unchanged, THE Scanner SHALL process the first decode and SHALL ignore subsequent decodes within the 2000 millisecond window.
2. WHILE the Scanner is displaying a result for a previous scan, THE Scanner SHALL NOT initiate a new transition for any QR_Code until the result is dismissed or a different QR_Code is decoded.
3. WHILE a transition request is in flight, THE Scanner SHALL ignore additional decodes of any QR_Code.

### Requirement 10: Backend Failure Surfacing

**User Story:** As an Organizer, I want clear feedback when a scan fails for technical reasons, so that retries and escalations do not depend on guessing whether the action succeeded.

#### Acceptance Criteria

1. IF the Backend RPC call for a scan returns an error response, THEN THE Scanner SHALL display the error message returned by the Backend, and THE Backend SHALL leave the Registration's Attendance_State and Attendance_Events unchanged.
2. IF the Backend RPC call for a scan does not complete within 10000 milliseconds, THEN THE Scanner SHALL display a "Request timed out" result, and THE Backend SHALL leave the Registration's Attendance_State and Attendance_Events unchanged once the request is observed to have not been committed.
3. WHEN a scan returns an error or times out, THE Scanner SHALL allow the Organizer to retry the same scan without restarting the camera.

### Requirement 11: Counters and List Reflect Both States

**User Story:** As an Organizer, I want the registrations list and counters to reflect inside-now and checked-out states, so that staff can see who is currently on-site at a glance.

#### Acceptance Criteria

1. THE Registrations_List SHALL display, for each Registration, the current Attendance_State, the most recent check-in timestamp, and the most recent check-out timestamp.
2. THE Registrations_List SHALL provide separate counts labeled "Inside now", "Checked out", and "Not arrived".
3. WHEN a check-in or check-out transition succeeds, THE Registrations_List SHALL update the affected Registration's displayed state and counters within 5000 milliseconds of the Backend confirming the transition, without requiring a manual page reload.
4. IF the Registrations_List does not reflect a successful transition within 5000 milliseconds, THEN THE Registrations_List SHALL log a UI sync failure to the browser console and SHALL display a non-blocking "Live updates delayed" indicator until the next successful refresh.
5. THE event check-in counter component (`useEventCheckinCounters`) SHALL expose, in addition to the existing `total` and `checkedIn` fields, a `currentlyInside` count and a `checkedOut` count derived from `attendance_state`.

### Requirement 12: Audit Trail

**User Story:** As an event owner, I want every scan logged immutably, so that attendance history can be audited and disputes reconciled.

#### Acceptance Criteria

1. WHEN a check-in transition succeeds via the Scanner, THE Backend SHALL insert exactly one Attendance_Event with kind "in", method "qr", `actor_id` equal to the scanning Organizer's `auth.uid()`, and a server-generated `occurred_at` timestamp.
2. WHEN a check-out transition succeeds via the Scanner, THE Backend SHALL insert exactly one Attendance_Event with kind "out", method "qr", `actor_id` equal to the scanning Organizer's `auth.uid()`, and a server-generated `occurred_at` timestamp.
3. THE Backend SHALL NOT modify or delete existing Attendance_Events rows during scanner-initiated transitions.

### Requirement 13: Authorization

**User Story:** As an event owner, I want only authorized staff to perform scanner-initiated transitions, so that attendance cannot be tampered with by users from other tenants.

#### Acceptance Criteria

1. THE Scanner SHALL be reachable only from a route gated by the dashboard authentication and event ownership checks already enforced for the Registrations tab.
2. IF the Backend receives a scanner-initiated transition request from a user who is neither a platform admin nor an owner of the Registration's event, THEN THE Backend SHALL reject the request and SHALL leave the Registration and Attendance_Events unchanged.

### Requirement 14: Self-Check-In Public Flow Scope

**User Story:** As a product owner, I want the public self-check-in page to remain check-in only, so that participants cannot accidentally check themselves out without staff oversight.

#### Acceptance Criteria

1. THE Self_Check_In_Page SHALL only invoke check-in transitions on scanned QR_Codes and SHALL never invoke a check-out transition.
2. WHEN a QR_Code is scanned on the Self_Check_In_Page and the resolved Registration's Attendance_State equals "inside", THE Self_Check_In_Page SHALL display an "Already checked in" result, THE Backend SHALL leave the Registration unchanged, and THE Backend SHALL NOT insert any Attendance_Event for that scan.
3. WHEN a QR_Code is scanned on the Self_Check_In_Page and the resolved Registration's Attendance_State equals "outside", THE Backend SHALL set the Attendance_State to "inside" (re-entry), SHALL set `last_in_at` to the server timestamp, and SHALL insert one Attendance_Event with kind "in" and method "self".
4. THE Self_Check_In_Page SHALL NOT expose any control or affordance that initiates a check-out transition.

### Requirement 15: Backwards Compatibility With Existing Bulk Operations

**User Story:** As an Organizer, I want the existing bulk check-in and bulk check-out actions in the registrations list to remain consistent with the new tabbed scanner, so that the two surfaces never disagree on a Registration's state.

#### Acceptance Criteria

1. WHEN the Organizer triggers bulk check-in from the Registrations_List, THE Backend SHALL apply the same "inside" transition rules defined in Requirement 3 to every selected Registration whose Attendance_State is not already "inside".
2. WHEN the Organizer triggers bulk check-out from the Registrations_List, THE Backend SHALL apply the same "outside" transition rules defined in Requirement 4 to every selected Registration whose Attendance_State equals "inside".
3. WHERE one or more selected Registrations are blocked by Requirement 7 or Requirement 8, THE Backend SHALL still process the non-blocked Registrations to completion and SHALL return a per-Registration result code for every selected Registration indicating either the applied transition or the skip reason.
