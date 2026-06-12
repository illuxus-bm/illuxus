// Feature: checkin-checkout-tabs
// Tabbed QR scanner dialog. One shared `Html5Qrcode` mount drives both
// `Check-In` and `Check-Out` tabs; switching tabs does NOT stop or
// restart the camera. Dedup + in-flight gating is delegated to the pure
// `scannerReducer` from `@/lib/attendance/scannerStateMachine`, and QR
// resolution to `resolveQr` from `@/lib/attendance/applyAttendance`. The
// dialog owns RPC dispatch (calling `set_attendance` from migration 005)
// and renders a result banner per the table in `design.md` "Error
// Handling".
//
// Validates: Requirements 1.1–1.6, 2.1–2.5, 9.1–9.3, 10.1–10.3.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle,
  RefreshCw,
  ScanLine,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  initialScannerState,
  scannerReducer,
  type ScannerEvent,
  type ScannerState,
} from "@/lib/attendance/scannerStateMachine";
import { resolveQr } from "@/lib/attendance/applyAttendance";
import type {
  ApprovalStatus,
  AttendanceState,
  RegistrationFixture,
  RegistrationStatus,
  World,
} from "@/lib/attendance/types";

type Registration = Tables<"registrations">;

// ─── Public types ──────────────────────────────────────────────────────────

export type ScannerTab = "check-in" | "check-out";

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

export interface ScanResult {
  code: ScanResultCode;
  registrationId?: string;
  name?: string;
  ticketType?: string;
  /** `last_in_at` for `applied_in` / `already_inside`, `last_out_at` for `applied_out` / `already_outside`. */
  occurredAt?: string;
  /** Present on `applied_out`; total minutes the attendee was onsite. */
  totalMinutes?: number;
  /** Free-form message used by `rpc_error` / `timeout`. */
  message?: string;
}

export interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrations: Registration[];
  /** Dashboard scope — drives the wrong_event guard (REQ-2.4). */
  eventId: string;
  /** Invoked AFTER every scan result (success, warn, or error). */
  onScanApplied: (result: ScanResult, tab: ScannerTab) => void;
  /** Optional initial tab. Default `'check-in'` (REQ-1.2). */
  initialTab?: ScannerTab;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** RPC timeout — REQ-10.2. */
const RPC_TIMEOUT_MS = 10_000;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ─── Token helpers ─────────────────────────────────────────────────────────

/**
 * `resolveQr` returns `null` for any token that doesn't match an accepted
 * form. The dialog needs to distinguish two failure modes per the design
 * "Error Handling" table:
 *
 *   - `'invalid'`   — the token is empty / whitespace-only, OR a
 *                     `speaker:<…>` / `sponsor_contact:<…>` token whose
 *                     UUID payload is malformed (REQ-2.5).
 *   - `'not_found'` — the token is a well-formed id / qr_code /
 *                     join_token / scoped UUID that simply doesn't match
 *                     any registration in scope (REQ-2.3).
 */
function classifyResolveFailure(token: string): "invalid" | "not_found" {
  if (!token || token.trim().length === 0) return "invalid";
  for (const prefix of ["speaker:", "sponsor_contact:"] as const) {
    if (token.startsWith(prefix)) {
      const id = token.slice(prefix.length);
      return UUID_RE.test(id) ? "not_found" : "invalid";
    }
  }
  return "not_found";
}

/**
 * Map a Supabase `Registration` row to the `RegistrationFixture` shape
 * that `resolveQr` operates on. The dialog only ever reads the
 * registrations array the dashboard already loaded, so we synthesize a
 * read-only `World` containing those rows and feed that to `resolveQr`.
 *
 * `kind` is derived from `ticket_type`: `'speaker'` and `'sponsor'` map
 * to `'speaker'` and `'sponsor_contact'` respectively (matching the
 * `speaker:<UUID>` / `sponsor_contact:<UUID>` token forms in REQ-2.1);
 * everything else is `'attendee'`.
 */
function buildScopedWorld(regs: readonly Registration[]): World {
  const map = new Map<string, RegistrationFixture>();
  for (const r of regs) {
    const kind: RegistrationFixture["kind"] =
      r.ticket_type === "speaker"
        ? "speaker"
        : r.ticket_type === "sponsor"
          ? "sponsor_contact"
          : "attendee";
    map.set(r.id, {
      id: r.id,
      event_id: r.event_id,
      status: (r.status ?? "confirmed") as RegistrationStatus,
      approval_status: (r.approval_status ?? "approved") as ApprovalStatus,
      attendance_state: (r.attendance_state ?? "never") as AttendanceState,
      qr_code: r.qr_code ?? "",
      join_token: r.join_token ?? "",
      kind,
      last_in_at: r.last_in_at ? new Date(r.last_in_at) : null,
      last_out_at: r.last_out_at ? new Date(r.last_out_at) : null,
    });
  }
  return {
    registrations: map,
    events: new Map(),
    attendanceEvents: [],
    now: new Date(),
  };
}

// ─── RPC row shape ─────────────────────────────────────────────────────────

/** Shape of a row returned by the `set_attendance` RPC (migration 005). */
interface SetAttendanceRow {
  code: ScanResultCode;
  registration_id: string | null;
  attendance_state: string | null;
  last_in_at: string | null;
  last_out_at: string | null;
  total_minutes: number | null;
  name: string | null;
  ticket_type: string | null;
}

function projectScanResult(
  row: SetAttendanceRow,
  target: "inside" | "outside",
  fallbackReg: Registration | undefined
): ScanResult {
  const occurredAt = target === "inside" ? row.last_in_at : row.last_out_at;
  return {
    code: row.code,
    registrationId: row.registration_id ?? fallbackReg?.id,
    name: row.name ?? fallbackReg?.name,
    ticketType: row.ticket_type ?? fallbackReg?.ticket_type,
    occurredAt: occurredAt ?? undefined,
    totalMinutes: row.total_minutes ?? undefined,
  };
}

function tabTitle(tab: ScannerTab): string {
  return tab === "check-in" ? "Check-In" : "Check-Out";
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function QRScannerDialog({
  open,
  onOpenChange,
  registrations,
  eventId,
  onScanApplied,
  initialTab = "check-in",
}: QRScannerDialogProps) {
  const [activeTab, setActiveTab] = useState<ScannerTab>(initialTab);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Refs visible to the html5-qrcode decode callback. The callback is
  // captured once at `Html5Qrcode.start()` time, so we can't read state
  // through normal closures without going stale on tab switch / new
  // registrations / new event scope.
  const scannerStateRef = useRef<ScannerState>(initialScannerState);
  const activeTabRef = useRef<ScannerTab>(initialTab);
  const registrationsRef = useRef<readonly Registration[]>(registrations);
  const eventIdRef = useRef<string>(eventId);
  const onScanAppliedRef = useRef(onScanApplied);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    registrationsRef.current = registrations;
  }, [registrations]);
  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);
  useEffect(() => {
    onScanAppliedRef.current = onScanApplied;
  }, [onScanApplied]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef<string>(
    "qr-reader-" + Math.random().toString(36).slice(2)
  );

  /**
   * Drive the pure `scannerReducer` from `@/lib/attendance/scannerStateMachine`
   * and return the dispatch outcome. Stable across renders because the
   * underlying state lives in a ref.
   */
  const dispatchScannerEvent = useCallback(
    (event: ScannerEvent): "rpc" | "ignored" => {
      const step = scannerReducer(scannerStateRef.current, event);
      scannerStateRef.current = step.state;
      return step.dispatch;
    },
    []
  );

  // Decode handler. Branch order:
  //   1. Reducer dispatch — covers REQ-9.1 (same-token dedup within
  //      2000ms), REQ-9.3 (in-flight lock), and indirectly REQ-9.2 (a
  //      result-shown banner keeps `inFlight=true` because we never send
  //      `rpc-end` until the user clicks "Scan another").
  //   2. Client-side resolution via `resolveQr` (REQ-2.1, REQ-2.3, REQ-2.5).
  //   3. Cross-event guard (REQ-2.4).
  //   4. RPC dispatch raced against a 10s timeout (REQ-10.1, REQ-10.2).
  const handleScan = useCallback(
    async (decodedText: string) => {
      // 1. REQ-9.1 / REQ-9.2 / REQ-9.3 — single dedup gate via the reducer.
      const dispatch = dispatchScannerEvent({
        type: "decode",
        token: decodedText,
        timestamp: Date.now(),
      });
      if (dispatch === "ignored") return;

      const tab = activeTabRef.current;
      const regsAtScan = registrationsRef.current;
      const dashboardEventId = eventIdRef.current;
      const onApplied = onScanAppliedRef.current;

      // 2. Client-side resolution via `resolveQr` (REQ-2.1).
      // We DO NOT send `rpc-end` on the failure paths below: the
      // result-shown banner is what gates further decodes (REQ-9.2), and
      // the user dismisses it via the "Scan another" button (which then
      // sends `rpc-end` to re-arm the dispatch path).
      const world = buildScopedWorld(regsAtScan);
      const reg = resolveQr(world, decodedText);

      if (!reg) {
        const code: ScanResultCode = classifyResolveFailure(decodedText);
        const next: ScanResult = { code };
        setResult(next);
        onApplied(next, tab);
        return;
      }

      // 3. REQ-2.4 — wrong-event guard. NO RPC is dispatched.
      if (reg.event_id !== dashboardEventId) {
        const dbReg = regsAtScan.find((r) => r.id === reg.id);
        const next: ScanResult = {
          code: "wrong_event",
          registrationId: reg.id,
          name: dbReg?.name,
          ticketType: dbReg?.ticket_type,
        };
        setResult(next);
        onApplied(next, tab);
        return;
      }

      const fallbackReg = regsAtScan.find((r) => r.id === reg.id);
      const target: "inside" | "outside" =
        tab === "check-in" ? "inside" : "outside";

      // 4. RPC dispatch, raced against a 10s timeout (REQ-10.2).
      type RaceShape =
        | {
            kind: "rpc";
            data: SetAttendanceRow[] | null;
            error: { message: string } | null;
          }
        | { kind: "timeout" };

      let timerId: number | undefined;
      const rpcCall = supabase
        // The generated `Database` types in this repo are committed before
        // migration 005 is applied; the `set_attendance` RPC is therefore
        // not yet present in `Database['public']['Functions']`. The
        // existing codebase uses the same `as never` escape elsewhere
        // (see `RegistrationsSection.toggleCheckIn`).
        .rpc("set_attendance" as never, {
          p_reg_id: reg.id,
          p_target: target,
          p_method: "qr",
        } as never)
        .then(
          (res: {
            data: SetAttendanceRow[] | null;
            error: { message: string } | null;
          }): RaceShape => ({
            kind: "rpc",
            data: res.data ?? null,
            error: res.error ?? null,
          })
        );

      const timeoutPromise = new Promise<RaceShape>((resolve) => {
        timerId = window.setTimeout(
          () => resolve({ kind: "timeout" }),
          RPC_TIMEOUT_MS
        );
      });

      let raceResult: RaceShape;
      try {
        raceResult = await Promise.race([rpcCall, timeoutPromise]);
      } catch (err) {
        // Network-level failures throw rather than surface as `{error}`.
        raceResult = {
          kind: "rpc",
          data: null,
          error: {
            message: err instanceof Error ? err.message : String(err),
          },
        };
      } finally {
        if (timerId !== undefined) window.clearTimeout(timerId);
      }

      let next: ScanResult;
      if (raceResult.kind === "timeout") {
        // REQ-10.2 — timeout branch.
        next = {
          code: "timeout",
          registrationId: reg.id,
          name: fallbackReg?.name,
          ticketType: fallbackReg?.ticket_type,
        };
      } else if (raceResult.error) {
        // REQ-10.1 — RPC error branch. The DB-side guarantee that no row
        // is inserted on a rejection follows from the SECURITY DEFINER
        // helper only INSERTing in success branches, plus PostgreSQL's
        // transactional rollback on raise.
        next = {
          code: "rpc_error",
          registrationId: reg.id,
          name: fallbackReg?.name,
          ticketType: fallbackReg?.ticket_type,
          message: raceResult.error.message,
        };
      } else {
        const row = raceResult.data?.[0];
        if (!row) {
          // The RPC returns exactly one row per call (see migration 005);
          // an empty result indicates a wire-level malformation.
          next = {
            code: "rpc_error",
            registrationId: reg.id,
            name: fallbackReg?.name,
            ticketType: fallbackReg?.ticket_type,
            message: "No result returned from set_attendance.",
          };
        } else {
          next = projectScanResult(row, target, fallbackReg);
        }
      }
      setResult(next);
      onApplied(next, tab);
    },
    [dispatchScannerEvent]
  );

  const startScanner = async () => {
    setCameraError(null);
    setResult(null);
    // Clear dedup state and in-flight on a fresh camera start.
    scannerStateRef.current = initialScannerState;
    try {
      const scanner = new Html5Qrcode(containerIdRef.current);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // html5-qrcode invokes the callback once per decoded frame.
          // Fire-and-forget; the handler self-gates via the reducer.
          void handleScan(decodedText);
        },
        () => {
          /* per-frame decode failures are noisy; swallow. */
        }
      );
      setScanning(true);
    } catch {
      setCameraError(
        "Could not access camera. Please allow camera permissions."
      );
      scannerRef.current = null;
    }
  };

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner && scanner.isScanning) {
      try {
        await scanner.stop();
      } catch {
        /* html5-qrcode throws when stop() races with internal teardown. */
      }
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  // REQ-1.4 — switching tabs clears `result` and resets the per-tab
  // dedup buffer + in-flight flag via a `tab-switch` event to the
  // reducer. The shared camera mount is NOT stopped or restarted.
  const handleTabChange = useCallback(
    (value: string) => {
      if (value !== "check-in" && value !== "check-out") return;
      setActiveTab(value);
      setResult(null);
      dispatchScannerEvent({ type: "tab-switch" });
    },
    [dispatchScannerEvent]
  );

  // REQ-10.3 — "Scan another" dismisses the banner and sends `rpc-end`
  // to the reducer to re-arm the dispatch path. The camera stays
  // running; `recentDecodes` is preserved so the same QR still pointing
  // at the lens is suppressed by the 2s window (and not double-applied
  // immediately).
  const scanAnother = useCallback(() => {
    setResult(null);
    dispatchScannerEvent({ type: "rpc-end" });
  }, [dispatchScannerEvent]);

  // Reset state on open; tear the camera down on close.
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      activeTabRef.current = initialTab;
      setResult(null);
      scannerStateRef.current = initialScannerState;
      setCameraError(null);
    } else {
      void stopScanner();
      setResult(null);
      scannerStateRef.current = initialScannerState;
      setCameraError(null);
    }
  }, [open, initialTab, stopScanner]);

  // Tear the camera down on unmount.
  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  // Memoize the dialog header copy so React doesn't re-render the icon
  // on every parent update.
  const headerTitle = useMemo(
    () => `QR Scanner — ${tabTitle(activeTab)}`,
    [activeTab]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* REQ-1.3 — active tab name appears in the dialog header. */}
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            <span>{headerTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {activeTab === "check-in"
              ? "Scan a ticket to check the attendee in."
              : "Scan a ticket to check the attendee out."}
          </DialogDescription>
        </DialogHeader>

        {/* REQ-1.1 / REQ-1.2 — two tabs, default = 'check-in'. */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="check-in">Check-In</TabsTrigger>
            <TabsTrigger value="check-out">Check-Out</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {/*
            Shared `Html5Qrcode` mount. Lives outside <TabsContent> so the
            DOM node is stable across tab switches — the camera is not
            stopped or restarted (REQ-1.4 carve-out).
          */}
          <div
            id={containerIdRef.current}
            className="w-full rounded-lg overflow-hidden bg-muted/50 min-h-[250px]"
          />

          {cameraError && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-[13px] font-medium bg-red-500/10 text-red-600 border border-red-500/20">
              <XCircle className="h-4 w-4 shrink-0" />
              {cameraError}
            </div>
          )}

          {result && (
            <ResultBanner result={result} onScanAnother={scanAnother} />
          )}

          <div className="flex gap-2">
            {!scanning ? (
              <Button
                onClick={startScanner}
                size="sm"
                className="w-full gap-1.5 text-[13px]"
              >
                <Camera className="h-3.5 w-3.5" /> Start Scanning
              </Button>
            ) : (
              <Button
                onClick={() => void stopScanner()}
                size="sm"
                variant="outline"
                className="w-full gap-1.5 text-[13px]"
              >
                <CameraOff className="h-3.5 w-3.5" /> Stop Scanning
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Result banner ─────────────────────────────────────────────────────────

type BannerKind = "success" | "warn" | "error";

function bannerKindFor(code: ScanResultCode): BannerKind {
  switch (code) {
    case "applied_in":
    case "applied_out":
      return "success";
    case "already_inside":
    case "already_outside":
      return "warn";
    default:
      return "error";
  }
}

interface BannerCopy {
  title: string;
  body: string;
}

/**
 * Banner copy table from `design.md` "Error Handling". Every code in
 * `ScanResultCode` produces a deterministic title + body string.
 */
function bannerCopyFor(result: ScanResult): BannerCopy {
  const name = result.name ?? "Attendee";
  const ticketLabel = result.ticketType ? ` (${result.ticketType})` : "";
  const occurred = result.occurredAt
    ? formatTimestamp(result.occurredAt)
    : null;
  const totalLabel =
    result.totalMinutes != null
      ? ` Total onsite ${formatMinutes(result.totalMinutes)}.`
      : "";

  switch (result.code) {
    case "applied_in":
      return {
        title: "Checked in",
        body: `Welcome, ${name}${ticketLabel}.`,
      };
    case "applied_out":
      return {
        title: "Checked out",
        body: `${name}${ticketLabel}.${totalLabel}`,
      };
    case "already_inside":
      return {
        title: "Already checked in",
        body: occurred
          ? `${name} is already inside (${occurred}).`
          : `${name} is already inside.`,
      };
    case "already_outside":
      return {
        title: "Already checked out",
        body: occurred
          ? `${name} was last checked out at ${occurred}.`
          : `${name} was last checked out.`,
      };
    case "not_checked_in_yet":
      return {
        title: "Not checked in yet",
        body: `${name} has not checked in. Switch to the Check-In tab first.`,
      };
    case "cancelled":
      return {
        title: "Registration cancelled",
        body: "This ticket was cancelled and can't be used.",
      };
    case "declined":
      return {
        title: "Registration declined",
        body: "This registration was declined.",
      };
    case "pending_approval":
      return {
        title: "Awaiting approval",
        body: "This registration is still pending approval.",
      };
    case "wrong_event":
      return {
        title: "Wrong event",
        body: "This ticket is for a different event.",
      };
    case "not_found":
      return {
        title: "Ticket not found",
        body: "We couldn't find this ticket.",
      };
    case "invalid":
      return {
        title: "Invalid code",
        body: "That doesn't look like a valid ticket code.",
      };
    case "tracking_closed":
      return {
        title: "Tracking closed",
        body: "Check-in and check-out closed for this event.",
      };
    case "unauthorized":
      return {
        title: "Not allowed",
        body: "You're not authorized to scan for this event.",
      };
    case "rpc_error":
      return {
        title: "Something went wrong",
        body: result.message ?? "Please try again.",
      };
    case "timeout":
      return {
        title: "Request timed out",
        body: "We didn't hear back from the server. Try again.",
      };
  }
}

interface ResultBannerProps {
  result: ScanResult;
  onScanAnother: () => void;
}

function ResultBanner({ result, onScanAnother }: ResultBannerProps) {
  const kind = bannerKindFor(result.code);
  const { title, body } = bannerCopyFor(result);
  const tone =
    kind === "success"
      ? "bg-green-500/10 text-green-600 border-green-500/20"
      : kind === "warn"
        ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
        : "bg-red-500/10 text-red-600 border-red-500/20";
  const Icon =
    kind === "success"
      ? CheckCircle
      : kind === "warn"
        ? AlertTriangle
        : XCircle;

  return (
    <div
      role="status"
      data-banner-kind={kind}
      data-result-code={result.code}
      className={`flex items-start gap-2 p-3 rounded-lg text-[13px] border ${tone}`}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <div className="font-semibold">{title}</div>
        <div className="text-[12px]">{body}</div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onScanAnother}
        className="gap-1 text-[12px] h-auto py-1 px-2"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Scan another
      </Button>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatMinutes(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
