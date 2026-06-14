import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger, supabaseRpc } from "@/lib/observability";
import { Search, Users, Download, Filter, UserCheck, CheckCircle, XCircle, ScanLine, Printer, Tag, History, ListChecks, Undo2, ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal, UserX } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";
import QRScannerDialog, { type ScanResult, type ScannerTab } from "./registrations/QRScannerDialog";
import SelfServiceCheckDialog from "./registrations/SelfServiceCheckDialog";
import { useEventCheckinCounters } from "@/hooks/useEventCheckinCounters";
import AddParticipantDialog from "./AddParticipantDialog";
import PrintBadgesDialog from "./registrations/PrintBadgesDialog";
import BulkCheckInDialog from "./registrations/BulkCheckInDialog";
import RegistrantQuickView, { type QuickViewRow } from "./registrations/RegistrantQuickView";
import AttendanceHistoryDialog from "./attendance/AttendanceHistoryDialog";
import EventAttendanceHistoryDialog from "./attendance/EventAttendanceHistoryDialog";
import type { BadgeData, PrintMode } from "@/lib/print-badges";
import { formatMoney } from "@/lib/currency";
import { REGISTRATION_STATUSES } from "@/lib/ticket-categories";

type Registration = Tables<"registrations">;

type RowKind = "attendee" | "speaker" | "sponsor";
type AttState = "never" | "inside" | "outside";
type Row = {
  id: string;            // row id (registration id, or synthetic speaker:X / sponsor_contact:X)
  kind: RowKind;
  refId: string;         // underlying entity id (speaker.id, sponsor_members.id, or registration.id)
  name: string;
  email: string;
  company: string | null;
  ticket_type: string;
  status: string;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_method: string | null;
  attendance_state: AttState;
  last_in_at: string | null;
  last_out_at: string | null;
  total_minutes: number;
  amount_paid: number;
  created_at: string;
  qr_payload: string;
  registration?: Registration; // only present when kind === 'attendee'
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-500/10 text-green-600 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

const kindColors: Record<RowKind, string> = {
  attendee: "bg-muted text-muted-foreground border-border",
  speaker:  "bg-blue-500/10 text-blue-600 border-blue-500/20",
  sponsor:  "bg-amber-500/10 text-amber-700 border-amber-500/20",
};

/**
 * Human-readable labels for the non-success per-row codes returned by
 * the new `bulk_set_attendance` RPC (migration 006). Used by `bulkCheckIn`
 * / `bulkCheckOut` to surface a per-row skip reason via toast — REQ-15.3.
 *
 * The success codes (`applied_in` / `applied_out`) are intentionally
 * absent so they never produce a skip toast.
 */
const BULK_SKIP_REASONS: Record<string, string> = {
  already_inside: "Already inside",
  already_outside: "Already checked out",
  not_checked_in_yet: "Not checked in yet",
  cancelled: "Registration cancelled",
  declined: "Registration declined",
  pending_approval: "Awaiting approval",
  tracking_closed: "Tracking closed",
  unauthorized: "Not allowed",
  wrong_event: "Wrong event",
  invalid: "Invalid request",
  not_found: "Not found",
};

function ticketKind(ticket_type: string | null | undefined): RowKind {
  if (ticket_type === "speaker") return "speaker";
  if (ticket_type === "sponsor") return "sponsor";
  return "attendee";
}

function fmtMinutes(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function RegistrationsSection({ eventId }: { eventId: string }) {
  const [currency, setCurrency] = useState<string>("INR");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [extras, setExtras] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<RowKind | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qrOpen, setQrOpen] = useState(false);
  const [selfKioskOpen, setSelfKioskOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [printState, setPrintState] = useState<{ open: boolean; badges: BadgeData[]; mode: PrintMode }>({ open: false, badges: [], mode: "badge" });
  const [eventInfo, setEventInfo] = useState<{ event_format: string | null; slug: string; title: string; user_id: string } | null>(null);
  const [quickView, setQuickView] = useState<QuickViewRow | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [attTab, setAttTab] = useState<"all" | "inside" | "outside" | "never">("all");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [eventHistoryOpen, setEventHistoryOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "state" | "last_in" | "last_out" | "minutes" | "ticket">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ─── Live-update lag tracking (REQ-11.4) ────────────────────────────────
  // After a successful scanner-initiated RPC, we expect a postgres_changes
  // UPDATE on the matching `registrations` row to arrive within 5s. If it
  // doesn't, render a non-blocking "Live updates delayed" pill and emit a
  // single `console.warn('UI sync failure')` per occurrence. The banner
  // clears as soon as the matching realtime UPDATE is observed.
  const [liveLag, setLiveLag] = useState<{ regId: string; expiresAt: number } | null>(null);
  const [showLag, setShowLag] = useState(false);
  const lagWarnedRef = useRef(false);

  // Live counters from a single source of truth (REQ-11.5).
  const liveCounters = useEventCheckinCounters(eventId);

  const reload = () => supabase.from("registrations").select("*").eq("event_id", eventId)
    .order("created_at", { ascending: false }).then(({ data }) => { if (data) setRegistrations(data); });

  const reloadExtras = async () => {
    const [{ data: spLinks }, { data: spLinksSponsors }] = await Promise.all([
      supabase.from("event_speakers").select("speaker_id, speakers:speaker_id(id, name, email, company)").eq("event_id", eventId),
      supabase.from("event_sponsors").select("sponsor_id, sponsors:sponsor_id(id, name)").eq("event_id", eventId),
    ]);
    const sponsorIds = (spLinksSponsors || []).map((l: any) => l.sponsor_id);
    let members: any[] = [];
    if (sponsorIds.length > 0) {
      const { data } = await supabase
        .from("sponsor_members")
        .select("id, sponsor_id, email, display_name")
        .in("sponsor_id", sponsorIds);
      members = data || [];
    }
    const speakerRows: Row[] = (spLinks || [])
      .map((l: any) => l.speakers)
      .filter(Boolean)
      .map((s: any): Row => ({
        id: `speaker:${s.id}`,
        kind: "speaker",
        refId: s.id,
        name: s.name,
        email: s.email || "",
        company: s.company || null,
        ticket_type: "speaker",
        status: "confirmed",
        checked_in: false,
        checked_in_at: null,
        checked_in_method: null,
        amount_paid: 0,
        created_at: new Date(0).toISOString(),
        qr_payload: `speaker:${s.id}`,
        attendance_state: "never",
        last_in_at: null,
        last_out_at: null,
        total_minutes: 0,
      }));
    const sponsorByMap = new Map<string, string>(); // sponsor_id -> name
    (spLinksSponsors || []).forEach((l: any) => {
      if (l.sponsors) sponsorByMap.set(l.sponsor_id, l.sponsors.name);
    });
    const sponsorRows: Row[] = members.map((m): Row => ({
      id: `sponsor_contact:${m.id}`,
      kind: "sponsor",
      refId: m.id,
      name: m.display_name || m.email,
      email: m.email,
      company: sponsorByMap.get(m.sponsor_id) || null,
      ticket_type: "sponsor",
      status: "confirmed",
      checked_in: false,
      checked_in_at: null,
      checked_in_method: null,
      amount_paid: 0,
      created_at: new Date(0).toISOString(),
      qr_payload: `sponsor_contact:${m.id}`,
        attendance_state: "never",
        last_in_at: null,
        last_out_at: null,
        total_minutes: 0,
    }));
    setExtras([...speakerRows, ...sponsorRows]);
  };

  useEffect(() => {
    Promise.all([reload(), reloadExtras()]).then(() => setLoading(false));
    supabase.from("events").select("event_format, slug, title, user_id, currency").eq("id", eventId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEventInfo(data as never);
          setCurrency((data as { currency?: string | null }).currency || "INR");
        }
      });

    const channel = supabase
      .channel(`registrations-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${eventId}` },
        (payload) => {
          // REQ-11.4 — clear the live-lag tracker as soon as the realtime
          // UPDATE for the lagged registration arrives. Using the setState
          // callback avoids a stale closure on `liveLag`.
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Registration;
            setLiveLag((prev) => (prev && prev.regId === updated.id ? null : prev));
          }
          setRegistrations((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Registration;
              if (prev.some((r) => r.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Registration;
              return prev.map((r) => (r.id === row.id ? row : r));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Registration;
              return prev.filter((r) => r.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // REQ-11.4 — flip `showLag` true `expiresAt - now` ms after a lag is
  // recorded. If `liveLag` clears (realtime UPDATE arrived in time, or a
  // new scan replaced the previous tracker), reset the indicator and
  // re-arm the one-shot console.warn.
  useEffect(() => {
    if (!liveLag) {
      setShowLag(false);
      lagWarnedRef.current = false;
      return;
    }
    const delta = liveLag.expiresAt - Date.now();
    if (delta <= 0) {
      setShowLag(true);
      return;
    }
    const t = window.setTimeout(() => setShowLag(true), delta);
    return () => window.clearTimeout(t);
  }, [liveLag]);

  // REQ-11.4 — emit a single `console.warn('UI sync failure')` the first
  // time the indicator becomes visible per liveLag occurrence.
  useEffect(() => {
    if (showLag && !lagWarnedRef.current) {
      // eslint-disable-next-line no-console -- contract: live-updates-delayed indicator
      console.warn("UI sync failure");
      logger.warn("ui sync failure", { reg_id: liveLag?.regId ?? null });
      lagWarnedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: warn once per off→on transition of showLag; liveLag is read for context only
  }, [showLag]);

  // Merge attendees + virtual rows (speakers/sponsors). For speakers/sponsors
  // that already have a registration row in the DB, hide the virtual duplicate.
  const allRows: Row[] = useMemo(() => {
    const attendeeRows: Row[] = registrations.map((r) => ({
      id: r.id,
      kind: ticketKind(r.ticket_type),
      refId: r.id,
      name: r.name,
      email: r.email,
      company: (r as Registration & { company?: string | null }).company ?? null,
      ticket_type: r.ticket_type,
      status: r.status,
      checked_in: !!r.checked_in,
      checked_in_at: r.checked_in_at,
      checked_in_method: r.checked_in_method,
      attendance_state: ((r as Registration & { attendance_state?: string }).attendance_state as AttState) || (r.checked_in ? "inside" : "never"),
      last_in_at: (r as Registration & { last_in_at?: string | null }).last_in_at ?? r.checked_in_at,
      last_out_at: (r as Registration & { last_out_at?: string | null }).last_out_at ?? null,
      total_minutes: Number((r as Registration & { total_minutes?: number }).total_minutes || 0),
      amount_paid: Number(r.amount_paid || 0),
      created_at: r.created_at,
      qr_payload: r.qr_code || r.id,
      registration: r,
    }));
    // Dedupe virtual extras: hide once a registration exists for the same person.
    // Match by email (lowercased) AND by synthesized fallback email so synthetic
    // <name>@no-email.local rows still hide the virtual entry.
    const synthEmailFor = (name: string) =>
      `${(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "")}@no-email.local`;
    const checkedInKeys = new Set<string>();
    registrations
      .filter((r) => r.ticket_type === "speaker" || r.ticket_type === "sponsor")
      .forEach((r) => {
        checkedInKeys.add(`${r.ticket_type}:${(r.email || "").toLowerCase()}`);
      });
    const visibleExtras = extras.filter((e) => {
      const k1 = `${e.kind}:${(e.email || "").toLowerCase()}`;
      const k2 = `${e.kind}:${synthEmailFor(e.name)}`;
      return !checkedInKeys.has(k1) && !checkedInKeys.has(k2);
    });
    // Merge attendee check-in state into the visible extras where possible (so
    // a speaker who has been checked in shows as such).
    return [...attendeeRows, ...visibleExtras];
  }, [registrations, extras]);

  const filtered = allRows.filter((r) => {
    const matchSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchKind = kindFilter === "all" || r.kind === kindFilter;
    const matchTab = attTab === "all" || r.attendance_state === attTab;
    return matchSearch && matchStatus && matchKind && matchTab;
  });

  const sorted = useMemo(() => {
    const stateRank: Record<AttState, number> = { inside: 0, outside: 1, never: 2 };
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "state": cmp = stateRank[a.attendance_state] - stateRank[b.attendance_state]; break;
        case "last_in": cmp = (a.last_in_at || "").localeCompare(b.last_in_at || ""); break;
        case "last_out": cmp = (a.last_out_at || "").localeCompare(b.last_out_at || ""); break;
        case "minutes": cmp = a.total_minutes - b.total_minutes; break;
        case "ticket": cmp = a.ticket_type.localeCompare(b.ticket_type); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const stats = {
    total: allRows.length,
    confirmed: registrations.filter((r) => r.status === "confirmed").length,
    pending: registrations.filter((r) => r.status === "pending").length,
    cancelled: registrations.filter((r) => r.status === "cancelled").length,
    checkedIn: registrations.filter((r) => r.checked_in === true).length,
    // REQ-11.5 — single source of truth via `useEventCheckinCounters`.
    // Counts are derived from `registrations.attendance_state` server-side
    // so they stay correct with paged datasets and match the tab filter.
    insideNow: liveCounters.currentlyInside,
    outside: liveCounters.checkedOut,
    notArrived: liveCounters.notArrived,
    speakers: allRows.filter((r) => r.kind === "speaker").length,
    sponsors: allRows.filter((r) => r.kind === "sponsor").length,
  };

  const checkInVirtual = async (row: Row) => {
    // Lazy-create a registration via the SECURITY DEFINER self_check_in RPC.
    const { data, error, correlationId } = await supabaseRpc("self_check_in" as never, {
      p_token: row.qr_payload,
      p_event_id: eventId,
    } as never);
    const result = Array.isArray(data) ? (data as any[])[0] : (data as any);
    if (error || !result) {
      logger.warn("self-check-in failed", {
        row_id: row.id,
        error_message: error?.message ?? null,
        result_code: result?.status ?? null,
      });
      toast.error("Could not check in", { description: `Reference: ${correlationId}` });
      return;
    }
    if (result.status !== "ok" && result.status !== "already" && result.status !== "checked_out") {
      logger.warn("self-check-in status", { result_code: result?.status ?? null });
      toast.error("Could not check in", { description: result.status });
      return;
    }
    toast.success(
      result.status === "checked_out"
        ? `${row.name} checked out`
        : `${row.kind === "speaker" ? "Speaker" : "Sponsor"} checked in`
    );
    await reload();
  };

  const withPending = async (rowId: string, fn: () => Promise<void>) => {
    if (pendingIds.has(rowId)) return;
    setPendingIds((p) => { const n = new Set(p); n.add(rowId); return n; });
    try { await fn(); } finally {
      setPendingIds((p) => { const n = new Set(p); n.delete(rowId); return n; });
    }
  };

  const toggleCheckIn = (row: Row, method: "manual" | "door" | "qr" = "manual") =>
    withPending(row.id, async () => {
      if (!row.registration) {
        await checkInVirtual(row);
        return;
      }
      const reg = row.registration;
      const { data, error, correlationId } = await supabaseRpc("toggle_attendance" as never, {
        p_reg_id: reg.id,
        p_method: method,
      } as never);
      const result = Array.isArray(data) ? (data as any[])[0] : (data as any);
      if (error) {
        logger.warn("toggle-attendance error", { error_message: error.message });
        toast.error("Failed to update check-in", { description: `Reference: ${correlationId}` });
        return;
      }
      if (!result) {
        logger.warn("toggle-attendance empty result", { reg_id: reg.id });
        toast.error("Failed to update check-in", { description: `Reference: ${correlationId}` });
        return;
      }
      if (result.state === "tracking_closed") {
        toast.error("Tracking is closed", { description: "This event ended more than 2 hours ago." });
        return;
      }
      await reload();
      if (result.state === "inside") {
        toast.success(`${row.name} checked in`);
      } else if (result.state === "outside") {
        toast.success(`${row.name} checked out`, {
          description: result.total_minutes ? `Total onsite: ${fmtMinutes(result.total_minutes)}` : undefined,
        });
      }
    });

  const undoAttendance = async (row: Row, kind: "in" | "out") => {
    if (!row.registration) return;
    const { data, error, correlationId } = await supabaseRpc("undo_attendance" as never, {
      p_reg_id: row.registration.id,
      p_kind: kind,
    } as never);
    if (error) {
      toast.error("Failed to undo", { description: `Reference: ${correlationId}` });
      return;
    }
    const result = Array.isArray(data) ? (data as any[])[0] : (data as any);
    if (result && result.deleted === false) {
      toast.error("Nothing to undo", { description: `No previous check-${kind} event found.` });
      await reload();
      return;
    }
    await reload();
    toast.success(kind === "in" ? `${row.name} check-in removed` : `${row.name} check-out removed`);
  };

  const updateStatus = async (row: Row, newStatus: string) => {
    if (row.kind !== "attendee") {
      toast.info("Status can only be changed for attendee registrations");
      return;
    }
    const { error } = await supabase
      .from("registrations")
      .update({ status: newStatus })
      .eq("id", row.id);
    if (error) {
      toast.error("Failed to update status", { description: error.message });
      return;
    }
    setRegistrations((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r))
    );
    toast.success(`Status set to ${newStatus}`);
  };

  /**
   * Handler invoked by `<QRScannerDialog>` after every applied scan.
   * Reload the registrations list (the realtime subscription will
   * eventually catch up too, but `reload()` keeps the table snappy on
   * the dashboard) and start a 5s lag tracker on `applied_*` codes so
   * the "Live updates delayed" indicator can flag stalled realtime
   * delivery (REQ-11.4).
   */
  const handleScanApplied = (result: ScanResult, _tab: ScannerTab) => {
    void reload();
    if ((result.code === "applied_in" || result.code === "applied_out") && result.registrationId) {
      setLiveLag({ regId: result.registrationId, expiresAt: Date.now() + 5000 });
    }
  };

  /**
   * Render per-row toasts for the non-success codes returned by the new
   * `bulk_set_attendance` RPC (migration 006). Codes that are not
   * `applied_in` / `applied_out` are surfaced individually so the
   * organiser can see why a row was skipped (REQ-15.3). To keep the
   * volume reasonable, more than 5 skips collapse into a single summary
   * toast.
   */
  const surfaceBulkSkips = (
    skipped: Array<{ registration_id: string; code: string }>,
    source: Row[]
  ) => {
    if (skipped.length === 0) return;
    if (skipped.length > 5) {
      toast.warning(`${skipped.length} skipped`, {
        description: "Some rows could not be updated. Open them individually to see why.",
      });
      return;
    }
    for (const row of skipped) {
      const reg = source.find((r) => r.registration?.id === row.registration_id);
      const name = reg?.name ?? "Registration";
      const reason = BULK_SKIP_REASONS[row.code] ?? row.code;
      toast.warning(`${name}: ${reason}`);
    }
  };

  const bulkCheckIn = async () => {
    const selectedRows = filtered.filter((r) => selected.has(r.id) && r.attendance_state !== "inside");
    const haveReg = selectedRows.filter((r) => !!r.registration);
    const virtual = selectedRows.filter((r) => !r.registration);
    if (selectedRows.length === 0) {
      toast.info("All selected are already inside");
      return;
    }
    let appliedCount = 0;
    if (haveReg.length > 0) {
      const { data, error, correlationId } = await supabaseRpc("bulk_set_attendance" as never, {
        p_ids: haveReg.map((r) => r.registration!.id),
        p_target: "inside",
        p_method: "bulk",
      } as never);
      if (error) {
        toast.error("Failed to bulk check in", { description: `Reference: ${correlationId}` });
        return;
      }
      // REQ-15.3 — `bulk_set_attendance` now returns one row per input id.
      // Iterate every row (the array length equals the input length) and
      // partition into success vs. skip categories.
      const rows = (Array.isArray(data) ? data : []) as Array<{ registration_id: string; code: string }>;
      const skipped: Array<{ registration_id: string; code: string }> = [];
      for (const row of rows) {
        if (row.code === "applied_in" || row.code === "applied_out") {
          appliedCount += 1;
        } else {
          skipped.push(row);
        }
      }
      surfaceBulkSkips(skipped, haveReg);
    }
    for (const row of virtual) {
      const { data } = await supabaseRpc("self_check_in" as never, {
        p_token: row.qr_payload,
        p_event_id: eventId,
      } as never);
      const result = Array.isArray(data) ? (data as any[])[0] : (data as any);
      if (result?.status === "ok" || result?.status === "checked_out") {
        appliedCount += 1;
      }
    }
    await reload();
    setSelected(new Set());
    if (appliedCount > 0) {
      toast.success(`${appliedCount} checked in`);
    } else {
      toast.info("No changes applied");
    }
  };

  const bulkCheckOut = async () => {
    const toRevert = filtered.filter((r) => selected.has(r.id) && r.attendance_state === "inside" && r.registration);
    if (toRevert.length === 0) {
      toast.info("No one to check out in selection");
      return;
    }
    const { data, error, correlationId } = await supabaseRpc("bulk_set_attendance" as never, {
      p_ids: toRevert.map((r) => r.registration!.id),
      p_target: "outside",
      p_method: "bulk",
    } as never);
    if (error) {
      toast.error("Failed to check out", { description: `Reference: ${correlationId}` });
      return;
    }
    // REQ-15.3 — same per-row partitioning as bulkCheckIn.
    const rows = (Array.isArray(data) ? data : []) as Array<{ registration_id: string; code: string }>;
    let appliedCount = 0;
    const skipped: Array<{ registration_id: string; code: string }> = [];
    for (const row of rows) {
      if (row.code === "applied_in" || row.code === "applied_out") {
        appliedCount += 1;
      } else {
        skipped.push(row);
      }
    }
    surfaceBulkSkips(skipped, toRevert);
    await reload();
    setSelected(new Set());
    if (appliedCount > 0) {
      toast.success(`${appliedCount} checked out`);
    } else {
      toast.info("No changes applied");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const exportCSV = () => {
    const headers = ["Name", "Email", "Role", "Ticket Type", "Status", "Amount Paid", "Registered At"];
    const rows = filtered.map((r) => [
      r.name, r.email, r.kind, r.ticket_type, r.status,
      r.amount_paid ?? 0,
      new Date(r.created_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toBadges = (rows: Row[]) => rows.map((r) => ({
    name: r.name,
    email: r.email,
    company: r.company,
    ticket_type: r.ticket_type,
    qr_payload: r.qr_payload,
    event_title: eventInfo?.title,
  }));

  const openPrintSelected = (mode: PrintMode) => {
    const rows = filtered.filter((r) => selected.has(r.id));
    if (rows.length === 0) return toast.info("Select attendees to print");
    setPrintState({ open: true, badges: toBadges(rows), mode });
  };

  const openPrintSingle = (r: Row, mode: PrintMode) => {
    setPrintState({ open: true, badges: toBadges([r]), mode });
  };

  // "Overall" print: prints what the user is currently looking at. If any rows
  // are selected we honor the selection, otherwise fall back to the current
  // filtered view (search + role + reg status + attendance tab applied).
  const openPrintAll = (mode: PrintMode) => {
    const rows = selected.size > 0
      ? filtered.filter((r) => selected.has(r.id))
      : filtered;
    if (rows.length === 0) return toast.info("No attendees in the current view");
    setPrintState({ open: true, badges: toBadges(rows), mode });
  };

  const openSelfServiceKiosk = () => setSelfKioskOpen(true);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">Registrations</h2>
            {/* REQ-11.4 — non-blocking pill when realtime delivery has
                stalled past the 5s SLA after a known-successful RPC. */}
            {showLag && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-700 border border-yellow-500/30"
              >
                Live updates delayed
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">Manage attendees for this event</p>
        </div>
        <div className="flex items-center gap-2">
          <AddParticipantDialog
            eventId={eventId}
            eventFormat={eventInfo?.event_format}
            eventSlug={eventInfo?.slug}
            onAdded={reload}
          />
          <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" onClick={() => setQrOpen(true)}>
            <ScanLine className="h-3 w-3" /> Scan
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" title="More actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setBulkOpen(true)}>
                <ListChecks className="h-3.5 w-3.5 mr-2" /> Bulk check-in
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openSelfServiceKiosk}>
                <ScanLine className="h-3.5 w-3.5 mr-2" /> Self-service kiosk
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportCSV}>
                <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats — concise summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: Users, label: "Total", value: stats.total, color: "text-foreground" },
          { icon: UserCheck, label: "Inside now", value: stats.insideNow, color: "text-[hsl(var(--success))]" },
          { icon: XCircle, label: "Checked out", value: stats.outside, color: "text-muted-foreground" },
          { icon: UserX, label: "Not arrived", value: stats.notArrived, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="border border-border rounded-lg p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <s.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground truncate">{s.label}</span>
            </div>
            <p className={`text-[15px] font-semibold leading-tight truncate ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-[13px]" />
        </div>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as RowKind | "all")}>
          <SelectTrigger className="w-[130px] h-8 text-[13px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="attendee">Attendees</SelectItem>
            <SelectItem value="speaker">Speakers</SelectItem>
            <SelectItem value="sponsor">Sponsors</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-8 text-[13px] shrink-0 hidden sm:inline-flex">
            <Filter className="h-3 w-3 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Attendance segment tabs + global icon actions */}
      <div className="flex items-center justify-between gap-2 border-b border-border -mx-1 px-1">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 min-w-0">
          {([
            { key: "all",     label: "All",         count: stats.total },
            { key: "inside",  label: "Inside now",  count: stats.insideNow },
            { key: "outside", label: "Checked out", count: stats.outside },
            { key: "never",   label: "Not arrived", count: stats.notArrived },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setAttTab(t.key)}
              className={`relative shrink-0 px-2.5 sm:px-3 py-1.5 text-[12px] font-medium transition-colors -mb-px border-b-2 ${
                attTab === t.key
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] px-1.5 rounded-full text-[10px] tabular-nums ${
                attTab === t.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Overall actions (apply to selection if any, else current view) */}
        <div className="flex items-center gap-0.5 shrink-0 pb-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Attendance history"
            aria-label="Attendance history"
            onClick={() => setEventHistoryOpen(true)}
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={selected.size > 0 ? `Print badges for ${selected.size} selected` : "Print badges for current view"}
            aria-label="Print badges"
            onClick={() => openPrintAll("badge")}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={selected.size > 0 ? `Print name tags for ${selected.size} selected` : "Print name tags for current view"}
            aria-label="Print name tags"
            onClick={() => openPrintAll("name")}
          >
            <Tag className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-[13px] font-medium text-primary">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" className="h-7 text-[11px] gap-1 bg-green-600 hover:bg-green-700" onClick={bulkCheckIn}>
              <CheckCircle className="h-3 w-3" /> Check In All
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={bulkCheckOut}>
              <XCircle className="h-3 w-3" /> Check Out
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => openPrintSelected("badge")}>
              <Printer className="h-3 w-3" /> Print…
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading registrations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No registrations found</p>
          <p className="text-[12px] text-muted-foreground">Registrations will appear here once attendees sign up.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="w-full">
            <table className="w-full table-fixed text-[12px] sm:text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-2 sm:p-3 w-8 sm:w-10 align-middle text-left">
                    <Checkbox
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <SortHeader label="Attendee" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="" />
                  <th className="text-left p-2 sm:p-3 font-medium text-muted-foreground hidden md:table-cell w-[110px]">Role</th>
                  <th className="text-left p-2 sm:p-3 font-medium text-muted-foreground hidden lg:table-cell w-[130px]">Reg. status</th>
                  <th className="p-2 sm:p-3 w-[44px]"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setQuickView({
                      id: r.id, kind: r.kind, refId: r.refId, name: r.name, email: r.email,
                      ticket_type: r.ticket_type, status: r.status,
                      checked_in: r.checked_in, checked_in_at: r.checked_in_at,
                    })}
                  >
                    <td className="p-2 sm:p-3 align-top pt-[14px] sm:pt-[18px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="p-2 sm:p-3 min-w-0">
                      <div className="flex items-start gap-2 sm:gap-2.5 min-w-0">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${r.checked_in ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"}`}>
                          {r.name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{r.email || (r.company ?? "")}</p>
                          <span className={`md:hidden inline-flex mt-1 px-1.5 py-0 rounded-full text-[10px] font-medium border capitalize ${kindColors[r.kind]}`}>
                            {r.kind}
                          </span>
                          <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                            <AttendanceControls
                              row={r}
                              pending={pendingIds.has(r.id)}
                              onCheckIn={() => toggleCheckIn(r)}
                              onCheckOut={() => toggleCheckIn(r)}
                              onUndo={(kind) => undoAttendance(r, kind)}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 hidden md:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${kindColors[r.kind]}`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                      {r.kind === "attendee" ? (
                        <Select value={r.status} onValueChange={(v) => updateStatus(r, v)}>
                          <SelectTrigger
                            className={`h-7 text-[11px] capitalize font-medium border rounded-full px-2 w-[110px] ${statusColors[r.status] || ""}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REGISTRATION_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${statusColors[r.status] || ""}`}>
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td className="p-2 sm:p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.registration && (
                            <DropdownMenuItem onClick={() => setHistoryFor({ id: r.registration!.id, name: r.name })}>
                              <History className="h-3.5 w-3.5 mr-2" /> Attendance history
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openPrintSingle(r, "badge")}>
                            <Printer className="h-3.5 w-3.5 mr-2" /> Print badge
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPrintSingle(r, "name")}>
                            <Tag className="h-3.5 w-3.5 mr-2" /> Print name tag
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        REQ-1.1–1.6, 2.1–2.5, 9.1–9.3, 10.1–10.3 — the dialog now owns
        RPC dispatch and exposes per-scan results via `onScanApplied`.
        `eventId` drives the wrong_event guard inside the dialog.
      */}
      <QRScannerDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        registrations={registrations}
        eventId={eventId}
        onScanApplied={handleScanApplied}
      />

      <BulkCheckInDialog open={bulkOpen} onOpenChange={setBulkOpen} eventId={eventId} />

      <SelfServiceCheckDialog
        open={selfKioskOpen}
        onOpenChange={setSelfKioskOpen}
        eventId={eventId}
        registrations={registrations}
      />

      <PrintBadgesDialog
        open={printState.open}
        onOpenChange={(o) => setPrintState((s) => ({ ...s, open: o }))}
        badges={printState.badges}
        eventId={eventId}
        eventTitle={eventInfo?.title}
        defaultMode={printState.mode}
      />

      <RegistrantQuickView
        open={!!quickView}
        onOpenChange={(o) => { if (!o) setQuickView(null); }}
        row={quickView}
        eventOwnerId={eventInfo?.user_id}
        currency={currency}
        onSaved={() => { reload(); reloadExtras(); }}
      />

      <AttendanceHistoryDialog
        open={!!historyFor}
        onOpenChange={(o) => { if (!o) setHistoryFor(null); }}
        registrationId={historyFor?.id ?? null}
        name={historyFor?.name ?? ""}
      />
      <EventAttendanceHistoryDialog
        open={eventHistoryOpen}
        onOpenChange={setEventHistoryOpen}
        eventId={eventId}
        eventTitle={eventInfo?.title}
      />
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.round((Date.now() - t) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function SortHeader({
  label, k, sortKey, sortDir, onSort, className = "",
}: {
  label: string;
  k: "name" | "state" | "last_in" | "last_out" | "minutes" | "ticket";
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: "name" | "state" | "last_in" | "last_out" | "minutes" | "ticket") => void;
  className?: string;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`text-left p-3 font-medium text-muted-foreground ${className}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function AttendanceStatusPill({ state }: { state: "never" | "inside" | "outside" }) {
  if (state === "inside") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border border-[hsl(var(--success))]/30">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" /> Inside now
    </span>;
  }
  if (state === "outside") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/30">
      Checked out
    </span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
    Not arrived
  </span>;
}

function AttendanceControls({
  row, pending, onCheckIn, onCheckOut, onUndo,
}: {
  row: Row;
  pending: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onUndo: (kind: "in" | "out") => void;
}) {
  const s = row.attendance_state;
  const canUndo = !!row.registration;

  // Base segmented pill styles
  const baseBtn = "h-7 px-2 text-[11px] font-medium gap-1 inline-flex items-center justify-center border transition-colors disabled:opacity-100 whitespace-nowrap";

  const inActive = s !== "never"; // already entered (inside or outside)
  const outActive = s === "outside"; // already left

  const inClasses = inActive
    ? "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))]"
    : "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))] hover:opacity-90";
  const outClasses = outActive
    ? "bg-destructive text-destructive-foreground border-destructive"
    : s === "inside"
      ? "bg-card text-destructive border-destructive hover:bg-destructive/10"
      : "bg-muted/40 text-muted-foreground border-border";

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="inline-flex rounded-md overflow-hidden border border-border w-fit max-w-full whitespace-nowrap">
        {/* Check in segment */}
        <button
          type="button"
          disabled={pending || s !== "never"}
          onClick={onCheckIn}
          className={`${baseBtn} rounded-none border-0 px-2 sm:px-2.5 ${inClasses} ${s !== "never" ? "cursor-default" : ""}`}
          title={s === "never" ? "Check in" : "Already checked in"}
        >
          <CheckCircle className="h-3 w-3 shrink-0" />
          <span>In</span>
        </button>
        {inActive && canUndo && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onUndo("in")}
            className={`${baseBtn} rounded-none border-0 border-l border-white/30 px-1.5 ${inClasses}`}
            title="Undo check-in"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}

        {/* Divider */}
        <span className="w-px bg-border" aria-hidden />

        {/* Check out segment */}
        <button
          type="button"
          disabled={pending || s !== "inside"}
          onClick={onCheckOut}
          className={`${baseBtn} rounded-none border-0 px-2 sm:px-2.5 ${outClasses} ${s === "inside" ? "" : "cursor-default"}`}
          title={
            s === "inside" ? "Check out" :
            s === "outside" ? "Already checked out" : "Check in first"
          }
        >
          <XCircle className="h-3 w-3 shrink-0" />
          <span>Out</span>
        </button>
        {outActive && canUndo && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onUndo("out")}
            className={`${baseBtn} rounded-none border-0 border-l border-white/30 px-1.5 ${outClasses}`}
            title="Undo check-out"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {s === "inside" && row.last_in_at && (
        <span className="text-[10px] text-muted-foreground">in {relativeTime(row.last_in_at)}</span>
      )}
      {s === "outside" && row.total_minutes > 0 && (
        <span className="text-[10px] text-muted-foreground">{fmtMinutes(row.total_minutes)} onsite</span>
      )}
    </div>
  );
}

