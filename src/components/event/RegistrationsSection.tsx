import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger, supabaseRpc } from "@/lib/observability";
import { Search, Users, Download, Filter, UserCheck, CheckCircle, XCircle, ScanLine, Printer, Tag, History, ListChecks, Undo2, ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal, UserX, Copy, ExternalLink, Link2, Upload, Trash2 } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";
import QRScannerDialog, { type ScanResult, type ScannerTab } from "./registrations/QRScannerDialog";
import SelfServiceCheckDialog from "./registrations/SelfServiceCheckDialog";
import { useEventCheckinCounters } from "@/hooks/useEventCheckinCounters";
import AddParticipantDialog from "./AddParticipantDialog";
import PrintBadgesDialog from "./registrations/PrintBadgesDialog";
import BulkCheckInDialog from "./registrations/BulkCheckInDialog";
import RegistrantQuickView, { type QuickViewRow } from "./registrations/RegistrantQuickView";
import ImportRegistrationsDialog from "./registrations/ImportRegistrationsDialog";
import AttendanceHistoryDialog from "./attendance/AttendanceHistoryDialog";
import EventAttendanceHistoryDialog from "./attendance/EventAttendanceHistoryDialog";
import type { BadgeData, PrintMode } from "@/lib/print-badges";
import { formatMoney } from "@/lib/currency";
import { formatEventDateTime } from "@/lib/datetime";
import { REGISTRATION_STATUSES } from "@/lib/ticket-categories";
import { buildAttendeeJoinUrl, attendeeLinksToCsv, type AttendeeLinkUtm } from "@/lib/attendee-link";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Registration = Tables<"registrations">;

type RowKind = "attendee" | "speaker" | "sponsor";
type RowSource = "registration" | "speaker" | "sponsor";
type AttState = "never" | "inside" | "outside";
type Row = {
  id: string;            // row id (registration id, or synthetic speaker:X / sponsor_contact:X)
  kind: RowKind;         // presentational role (what badge shows)
  source: RowSource;     // which table refId belongs to — drives QuickView edits
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
  registration?: Registration; // only present when source === 'registration'
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
  const [importOpen, setImportOpen] = useState(false);
  // `deleteFor` holds the list of rows pending confirmation. Single-row
  // delete used to live here as `Row | null`; now the trash action is
  // exclusively driven by row selection, so we always work with an array.
  const [deleteFor, setDeleteFor] = useState<Row[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printState, setPrintState] = useState<{ open: boolean; rowIds: string[] | null; mode: PrintMode }>({ open: false, rowIds: null, mode: "badge" });
  const [eventInfo, setEventInfo] = useState<{
    event_format: string | null;
    slug: string;
    title: string;
    user_id: string;
    banner_landscape_url: string | null;
    date: string | null;
    timezone: string | null;
    venue: string | null;
    location: string | null;
    org_name: string | null;
  } | null>(null);
  const [quickView, setQuickView] = useState<QuickViewRow | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [attTab, setAttTab] = useState<"all" | "inside" | "outside" | "never">("all");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [eventHistoryOpen, setEventHistoryOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "state" | "last_in" | "last_out" | "minutes" | "ticket">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ─── UTM dialog for bulk join-link export ──────────────────────────────
  // Persisted under `lovable.attendee-link-utm.v1` so the organiser
  // doesn't re-type for every export. Defaults to the export-only
  // shape (source=export / medium=csv / campaign=<event.slug>).
  const [utmDialogOpen, setUtmDialogOpen] = useState(false);
  const [utm, setUtm] = useState<AttendeeLinkUtm>(() => loadStoredUtm());
  // True when the event has a live or scheduled webinar session. Join links
  // are only useful when a webinar session actually exists.
  const [hasWebinarSession, setHasWebinarSession] = useState(false);

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
        source: "speaker",
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
      source: "sponsor",
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
    supabase
      .from("events")
      .select("event_format, slug, title, user_id, currency, banner_landscape_url, date, timezone, venue, location, organizations(name)")
      .eq("id", eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const ev = data as {
            event_format: string | null; slug: string; title: string; user_id: string;
            currency?: string | null; banner_landscape_url: string | null;
            date: string | null; timezone: string | null;
            venue: string | null; location: string | null;
            organizations?: { name?: string | null } | null;
          };
          setEventInfo({
            event_format: ev.event_format,
            slug: ev.slug,
            title: ev.title,
            user_id: ev.user_id,
            banner_landscape_url: ev.banner_landscape_url,
            date: ev.date,
            timezone: ev.timezone,
            venue: ev.venue,
            location: ev.location,
            org_name: ev.organizations?.name ?? null,
          });
          setCurrency(ev.currency || "INR");
          // Only show join links when the event can have a webinar (not purely physical)
          if (ev.event_format !== "physical") {
            supabase
              .from("webinar_sessions")
              .select("id", { count: "exact", head: true })
              .eq("event_id", eventId)
              .in("status", ["live", "scheduled"])
              .then(({ count }) => { setHasWebinarSession((count ?? 0) > 0); });
          }
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

  // Merge attendees + virtual rows (speakers/sponsors), one row per unique email.
  // Rules:
  //   1. A registration row is always preferred over a virtual speaker/sponsor
  //      entry — extras for the same email are hidden.
  //   2. The kind shown on the row is the most specific role across all sources
  //      using precedence speaker > sponsor > attendee. So a person who is in
  //      `registrations` with ticket_type=general AND in event_speakers is
  //      shown as a Speaker, not duplicated.
  //   3. Virtual extras themselves are deduped by email — a speaker who is also
  //      listed under event_sponsors appears once, with kind=speaker.
  const allRows: Row[] = useMemo(() => {
    // Lookup tables built from extras.
    const speakerEmails = new Set<string>();
    const sponsorEmails = new Set<string>();
    for (const e of extras) {
      const k = (e.email || "").toLowerCase();
      if (!k) continue;
      if (e.kind === "speaker") speakerEmails.add(k);
      if (e.kind === "sponsor") sponsorEmails.add(k);
    }

    const elevatedKind = (rTicketType: string | null | undefined, emailKey: string): RowKind => {
      const direct = ticketKind(rTicketType);
      if (direct !== "attendee") return direct;
      if (speakerEmails.has(emailKey)) return "speaker";
      if (sponsorEmails.has(emailKey)) return "sponsor";
      return "attendee";
    };

    // 1. Registration rows take priority. Track the email so duplicate
    //    extras can be hidden later.
    const seenEmails = new Set<string>();
    const attendeeRows: Row[] = registrations.map((r) => {
      const emailKey = (r.email || "").toLowerCase();
      if (emailKey) seenEmails.add(emailKey);
      return {
        id: r.id,
        kind: elevatedKind(r.ticket_type, emailKey),
        source: "registration",
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
      };
    });

    // 2. Extras that DON'T match an existing registration email. Dedupe them
    //    so the same email can't appear twice across speaker + sponsor sources.
    //    Synthetic empty-email rows (e.g. speakers with no email yet) are kept
    //    individually since we can't reliably correlate them.
    const seenExtraEmails = new Set<string>();
    const visibleExtras: Row[] = [];
    // Stable precedence: speaker before sponsor so a person in both groups
    // surfaces as a speaker.
    const sortedExtras = [...extras].sort((a, b) => {
      const order: RowKind[] = ["speaker", "sponsor", "attendee"];
      return order.indexOf(a.kind) - order.indexOf(b.kind);
    });
    for (const e of sortedExtras) {
      const k = (e.email || "").toLowerCase();
      if (k) {
        if (seenEmails.has(k)) continue;        // already in registrations
        if (seenExtraEmails.has(k)) continue;   // duplicate extra
        seenExtraEmails.add(k);
      }
      visibleExtras.push(e);
    }

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

  /**
   * Remove one or more participants from this event. Behaviour depends on
   * each row's source so we never accidentally wipe a shared people record:
   *
   *   - registration  → DELETE from `registrations`. Cascade rules also clean
   *                     up `attendance_events` rows tied to the registration.
   *   - speaker       → DELETE from `event_speakers` for *this event only*.
   *                     The underlying `speakers` row is untouched.
   *   - sponsor       → DELETE from `sponsor_members` (the per-event contact).
   *                     The underlying `sponsors` row is untouched.
   *
   * Reachable only via the selection toolbar — the per-row Trash icon was
   * removed so destructive actions can't be triggered without an explicit
   * tick first.
   */
  const deleteParticipants = async (rows: Row[]) => {
    if (rows.length === 0) return;
    setDeleting(true);
    try {
      const regIds = rows.filter((r) => r.source === "registration").map((r) => r.refId);
      const speakerIds = rows.filter((r) => r.source === "speaker").map((r) => r.refId);
      const sponsorMemberIds = rows.filter((r) => r.source === "sponsor").map((r) => r.refId);

      const results = await Promise.all([
        regIds.length === 0
          ? Promise.resolve({ error: null })
          : supabase.from("registrations").delete().in("id", regIds),
        speakerIds.length === 0
          ? Promise.resolve({ error: null })
          : supabase
              .from("event_speakers")
              .delete()
              .eq("event_id", eventId)
              .in("speaker_id", speakerIds),
        sponsorMemberIds.length === 0
          ? Promise.resolve({ error: null })
          : supabase.from("sponsor_members").delete().in("id", sponsorMemberIds),
      ]);

      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        toast.error("Some deletions failed", { description: firstError.message });
      } else {
        toast.success(
          rows.length === 1
            ? `${rows[0].name} removed`
            : `Removed ${rows.length} participants`,
        );
      }

      // Refresh both data sources only when needed.
      const reloadJobs: Array<Promise<unknown>> = [];
      if (regIds.length > 0) reloadJobs.push(reload());
      if (speakerIds.length > 0 || sponsorMemberIds.length > 0) reloadJobs.push(reloadExtras());
      await Promise.all(reloadJobs);

      // Clear the selection of any deleted rows.
      const deletedIds = new Set(rows.map((r) => r.id));
      setSelected((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => { if (!deletedIds.has(id)) next.add(id); });
        return next;
      });
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
      setDeleteFor(null);
    }
  };

  // ─── Per-attendee tracked join links ───────────────────────────────────
  // Builds the live webinar URL for one row using the canonical helper
  // in `src/lib/attendee-link.ts`. Only `attendee` kind rows carry a
  // `join_token` we can shareable — speakers/sponsors join via their own
  // speaker_token / sponsor_contact form and are skipped.
  const joinUrlFor = (
    row: Row,
    utmOverride: AttendeeLinkUtm,
  ): string | null => {
    if (!row.registration?.join_token) return null;
    return buildAttendeeJoinUrl({
      registration: { join_token: row.registration.join_token, event_id: eventId },
      event: { id: eventId, slug: eventInfo?.slug ?? null },
      utm: utmOverride,
    });
  };

  const copyJoinLink = async (row: Row) => {
    const url = joinUrlFor(row, {
      source: "manual",
      medium: "copy",
      campaign: eventInfo?.slug ?? undefined,
    });
    if (!url) {
      toast.info("No join link for this row", {
        description: "Speakers and sponsor contacts use a separate invite token.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (err) {
      logger.warn("clipboard write failed", { row_id: row.id });
      toast.error("Could not copy link", {
        description: err instanceof Error ? err.message : "Clipboard unavailable",
      });
    }
  };

  const openJoinLink = (row: Row) => {
    const url = joinUrlFor(row, {
      source: "manual",
      medium: "open",
      campaign: eventInfo?.slug ?? undefined,
    });
    if (!url) {
      toast.info("No join link for this row");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /**
   * Bulk export of per-attendee join links for the currently
   * filtered registrations. Honours the UTM config the organiser
   * customised in the popover (persisted under
   * `lovable.attendee-link-utm.v1`). Rows without a join_token —
   * speakers / sponsor contacts that haven't registered yet — are
   * skipped silently.
   */
  const exportJoinLinks = (utmConfig: AttendeeLinkUtm) => {
    const effectiveUtm: AttendeeLinkUtm = {
      source:   utmConfig.source   || "export",
      medium:   utmConfig.medium   || "csv",
      campaign: utmConfig.campaign || eventInfo?.slug || undefined,
      content:  utmConfig.content  || undefined,
      term:     utmConfig.term     || undefined,
    };
    const rows = filtered
      .map((r) => {
        const url = joinUrlFor(r, effectiveUtm);
        return url ? { name: r.name, email: r.email, joinUrl: url } : null;
      })
      .filter((r): r is { name: string; email: string; joinUrl: string } => r !== null);
    if (rows.length === 0) {
      toast.info("No join links to export", {
        description: "Filtered view has no attendee registrations with a join token.",
      });
      return;
    }
    const csv = attendeeLinksToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `join-links-${eventInfo?.slug || eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // Persist the effective UTM so the next export pre-fills the
    // same values. Storing the *effective* (post-default) config
    // means defaults stick once the organiser opts in.
    saveStoredUtm(effectiveUtm);
    setUtm(effectiveUtm);
    toast.success(`Exported ${rows.length} join link${rows.length === 1 ? "" : "s"}`);
  };

  const toBadges = (rows: Row[]) => {
    const dateText = eventInfo?.date
      ? formatEventDateTime(eventInfo.date, eventInfo.timezone || undefined)
      : "";
    const locText = [eventInfo?.venue, eventInfo?.location].filter(Boolean).join(" · ");
    return rows.map((r) => ({
      name: r.name,
      email: r.email,
      company: r.company,
      // Job title pulled from the underlying registration's `designation`
      // field when the row is an attendee; speakers/sponsors don't surface
      // a designation on the registrations join, so it stays null.
      title: r.registration?.designation ?? null,
      ticket_type: r.ticket_type,
      qr_payload: r.qr_payload,
      banner_url: eventInfo?.banner_landscape_url ?? null,
      event_title: eventInfo?.title,
      org_name: eventInfo?.org_name ?? null,
      event_date_text: dateText || null,
      event_location_text: locText || null,
    }));
  };

  const openPrintSelected = (mode: PrintMode) => {
    const rows = filtered.filter((r) => selected.has(r.id));
    if (rows.length === 0) return toast.info("Select attendees to print");
    setPrintState({ open: true, rowIds: rows.map((r) => r.id), mode });
  };

  const openPrintSingle = (r: Row, mode: PrintMode) => {
    setPrintState({ open: true, rowIds: [r.id], mode });
  };

  // "Overall" print: prints what the user is currently looking at. If any rows
  // are selected we honor the selection, otherwise fall back to the current
  // filtered view (search + role + reg status + attendance tab applied).
  const openPrintAll = (mode: PrintMode) => {
    const rows = selected.size > 0
      ? filtered.filter((r) => selected.has(r.id))
      : filtered;
    if (rows.length === 0) return toast.info("No attendees in the current view");
    setPrintState({ open: true, rowIds: rows.map((r) => r.id), mode });
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
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-2" /> Import CSV…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCSV}>
                <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
              </DropdownMenuItem>
              {hasWebinarSession && (
                <DropdownMenuItem onClick={() => setUtmDialogOpen(true)}>
                  <Link2 className="h-3.5 w-3.5 mr-2" /> Export join links (CSV)…
                </DropdownMenuItem>
              )}
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
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 border-b border-primary/20 text-[12px]">
              <span className="font-medium text-foreground">
                {selected.size} selected
              </span>
              <span className="text-muted-foreground hidden sm:inline">·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px] gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    const rows = filtered.filter((r) => selected.has(r.id));
                    if (rows.length > 0) setDeleteFor(rows);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete selected
                </Button>
              </div>
            </div>
          )}
          {/* overflow-x-auto ensures the table scrolls horizontally on narrow
              (≤375 px) screens instead of overflowing the viewport. */}
          <div className="w-full overflow-x-auto">
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
                  <th className="text-center px-3 sm:px-4 py-2 sm:py-3 font-medium text-muted-foreground hidden md:table-cell w-[150px]">Role</th>
                  <th className="text-center px-3 sm:px-4 py-2 sm:py-3 font-medium text-muted-foreground hidden lg:table-cell w-[160px]">Reg. status</th>
                  <th className="p-2 sm:p-3 w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setQuickView({
                      id: r.id, kind: r.kind, source: r.source, refId: r.refId, name: r.name, email: r.email,
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
                    <td className="px-3 sm:px-4 py-2 sm:py-3 hidden md:table-cell text-center">
                      {/* Role is read-only — the organiser sees what the
                          person registered as. To re-assign roles, use the
                          Speakers / Sponsors management tabs. */}
                      <span
                        className={`inline-flex items-center justify-center h-7 text-[11px] capitalize font-medium border rounded-full px-3 w-[120px] ${kindColors[r.kind]}`}
                        aria-label={`Role: ${r.kind}`}
                        title={`Role: ${r.kind}`}
                      >
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 hidden lg:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                      {r.kind === "attendee" ? (
                        <Select value={r.status} onValueChange={(v) => updateStatus(r, v)}>
                          <SelectTrigger
                            className={`h-7 text-[11px] capitalize font-medium border rounded-full px-3 w-[130px] mx-auto justify-center ${statusColors[r.status] || ""}`}
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
                        <span className={`inline-flex items-center justify-center h-7 px-3 w-[130px] rounded-full text-[11px] font-medium border capitalize ${statusColors[r.status] || ""}`}>
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td className="p-2 sm:p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {r.registration && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Attendance history"
                            aria-label="Attendance history"
                            onClick={() => setHistoryFor({ id: r.registration!.id, name: r.name })}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Print badge"
                          aria-label="Print badge"
                          onClick={() => openPrintSingle(r, "badge")}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Print name tag"
                          aria-label="Print name tag"
                          onClick={() => openPrintSingle(r, "name")}
                        >
                          <Tag className="h-3.5 w-3.5" />
                        </Button>
                        {r.registration?.join_token && hasWebinarSession && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="More actions"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => copyJoinLink(r)}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copy join link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openJoinLink(r)}>
                                <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open join link
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
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

      <ImportRegistrationsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        eventId={eventId}
        existingEmails={new Set(registrations.map((r) => (r.email || "").toLowerCase()).filter(Boolean))}
        onImported={() => { reload(); reloadExtras(); }}
      />

      <AlertDialog open={!!deleteFor && deleteFor.length > 0} onOpenChange={(o) => { if (!o && !deleting) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteFor && deleteFor.length === 1 ? "Remove participant?" : `Remove ${deleteFor?.length ?? 0} participants?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!deleteFor || deleteFor.length === 0) return null;
                if (deleteFor.length === 1) {
                  const row = deleteFor[0];
                  if (row.source === "registration") {
                    return <>Permanently delete <strong>{row.name}</strong>'s registration for this event. Attendance records tied to this registration will also be removed. This cannot be undone.</>;
                  }
                  if (row.source === "speaker") {
                    return <>Unlink <strong>{row.name}</strong> from this event. The speaker profile itself is preserved and can be re-added to this or other events later.</>;
                  }
                  return <>Remove <strong>{row.name}</strong> from this sponsor's contacts.</>;
                }
                const regs     = deleteFor.filter((r) => r.source === "registration").length;
                const speakers = deleteFor.filter((r) => r.source === "speaker").length;
                const sponsors = deleteFor.filter((r) => r.source === "sponsor").length;
                const parts: string[] = [];
                if (regs > 0)     parts.push(`${regs} registration${regs === 1 ? "" : "s"}`);
                if (speakers > 0) parts.push(`${speakers} speaker link${speakers === 1 ? "" : "s"}`);
                if (sponsors > 0) parts.push(`${sponsors} sponsor contact${sponsors === 1 ? "" : "s"}`);
                return (
                  <>
                    This will remove {parts.join(", ")} from this event. Speaker and sponsor profiles themselves stay intact; registrations are permanently deleted along with their attendance history. This cannot be undone.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (deleteFor) void deleteParticipants(deleteFor); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing…" : `Remove${deleteFor && deleteFor.length > 1 ? ` ${deleteFor.length}` : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SelfServiceCheckDialog
        open={selfKioskOpen}
        onOpenChange={setSelfKioskOpen}
        eventId={eventId}
        registrations={registrations}
      />

      <PrintBadgesDialog
        open={printState.open}
        onOpenChange={(o) => setPrintState((s) => ({ ...s, open: o }))}
        badges={
          // Compute badge data live from current allRows so edits made in
          // RegistrantQuickView are immediately reflected without re-opening.
          // null rowIds means "print all filtered rows" (e.g. print all).
          toBadges(
            printState.rowIds
              ? allRows.filter((r) => printState.rowIds!.includes(r.id))
              : filtered,
          )
        }
        eventId={eventId}
        eventTitle={eventInfo?.title}
        defaultMode={printState.mode}
      />

      <RegistrantQuickView
        open={!!quickView}
        onOpenChange={(o) => { if (!o) setQuickView(null); }}
        row={quickView}
        eventOwnerId={eventInfo?.user_id}
        eventId={eventId}
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

      <AttendeeLinkUtmDialog
        open={utmDialogOpen}
        onOpenChange={setUtmDialogOpen}
        initial={utm}
        defaultCampaign={eventInfo?.slug || ""}
        onExport={(next) => {
          setUtmDialogOpen(false);
          exportJoinLinks(next);
        }}
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


// ─── UTM persistence for the bulk-export popover ───────────────────────────
// Stored under `lovable.attendee-link-utm.v1` so the organiser doesn't
// re-type the source/medium/campaign for every export. Bumping the
// version suffix is the migration path if the shape ever changes.

const UTM_STORAGE_KEY = "lovable.attendee-link-utm.v1";

function loadStoredUtm(): AttendeeLinkUtm {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AttendeeLinkUtm> | null;
    if (!parsed || typeof parsed !== "object") return {};
    // Defensive shape check — silently drop anything that isn't a string
    // so a corrupt entry can't crash the dialog open path.
    const out: AttendeeLinkUtm = {};
    if (typeof parsed.source === "string")   out.source = parsed.source;
    if (typeof parsed.medium === "string")   out.medium = parsed.medium;
    if (typeof parsed.campaign === "string") out.campaign = parsed.campaign;
    if (typeof parsed.content === "string")  out.content = parsed.content;
    if (typeof parsed.term === "string")     out.term = parsed.term;
    return out;
  } catch {
    return {};
  }
}

function saveStoredUtm(u: AttendeeLinkUtm): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(u));
  } catch {
    // Storage may be full or disabled; the export already succeeded
    // so we just lose the convenience of pre-fill. Don't toast.
  }
}

// ─── Dialog: customise UTM tags for bulk join-link export ───────────────────
// Pre-fills with the organiser's last-used config (loaded from
// localStorage on mount) and the event slug as the default campaign.
// "Source" is a select (the common channels) so values stay normalised;
// "Custom" frees the field for any string.

const UTM_SOURCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "email",    label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms",      label: "SMS" },
  { value: "social",   label: "Social" },
  { value: "qr",       label: "QR" },
  { value: "manual",   label: "Manual" },
  { value: "export",   label: "Export" },
  { value: "custom",   label: "Custom…" },
];

function AttendeeLinkUtmDialog({
  open, onOpenChange, initial, defaultCampaign, onExport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AttendeeLinkUtm;
  defaultCampaign: string;
  onExport: (utm: AttendeeLinkUtm) => void;
}) {
  // Local copy so the user can cancel without committing changes.
  const [source, setSource]     = useState<string>(initial.source || "export");
  const [medium, setMedium]     = useState<string>(initial.medium || "csv");
  const [campaign, setCampaign] = useState<string>(initial.campaign ?? defaultCampaign);
  const [content, setContent]   = useState<string>(initial.content || "");
  const [term, setTerm]         = useState<string>(initial.term || "");
  // When source is "custom", we toggle to a free-text input so the
  // organiser can type any value. The dropdown's literal "custom"
  // string is never used as the actual `utm_source`.
  const [customSource, setCustomSource] = useState<string>(
    UTM_SOURCE_OPTIONS.find((o) => o.value === initial.source)
      ? ""
      : (initial.source ?? ""),
  );
  const isCustom = source === "custom" || (!!customSource && !UTM_SOURCE_OPTIONS.find((o) => o.value === source));

  useEffect(() => {
    if (!open) return;
    // Reset whenever the dialog opens so localStorage / event slug
    // changes outside the dialog are picked up.
    setSource(initial.source || "export");
    setMedium(initial.medium || "csv");
    setCampaign(initial.campaign ?? defaultCampaign);
    setContent(initial.content || "");
    setTerm(initial.term || "");
    setCustomSource(
      UTM_SOURCE_OPTIONS.find((o) => o.value === initial.source)
        ? ""
        : (initial.source ?? ""),
    );
  }, [open, initial, defaultCampaign]);

  const submit = () => {
    const effectiveSource = isCustom ? customSource.trim() : source;
    onExport({
      source: effectiveSource || undefined,
      medium: medium.trim() || undefined,
      campaign: campaign.trim() || undefined,
      content: content.trim() || undefined,
      term: term.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export join links</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Tag each link with UTM params so you can measure which channel drove
            sign-ins. Defaults persist for next time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Source (utm_source)</Label>
            <Select
              value={isCustom ? "custom" : source}
              onValueChange={(v) => {
                setSource(v);
                if (v !== "custom") setCustomSource("");
              }}
            >
              <SelectTrigger className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UTM_SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustom && (
              <Input
                placeholder="custom source"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                className="h-8 text-[13px]"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Medium (utm_medium)</Label>
            <Input
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              placeholder="csv"
              className="h-8 text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Campaign (utm_campaign)</Label>
            <Input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder={defaultCampaign || "campaign-id"}
              className="h-8 text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Content (utm_content) — optional</Label>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="email-template-name"
              className="h-8 text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Term (utm_term) — optional</Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="keyword"
              className="h-8 text-[13px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
