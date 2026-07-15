/**
 * SupportTicketsPage — super admin management UI for the contact-form
 * ticket queue introduced in migration 005_support_tickets.sql.
 *
 * Surface map:
 *   • Top stats row — calls `admin_ticket_stats` RPC, renders 6 cards.
 *   • Filters bar  — status / priority / category / search + CSV export.
 *   • Tickets table — sortable, paginated 25 / page.
 *   • Detail sheet — full ticket + thread + reply form + status changers.
 *
 * All mutations go through:
 *   - `supabaseRpc(...)`            for admin_ticket_stats, admin_list_super_admins
 *   - `supabase.from('support_tickets').*` (RLS-gated to admins)
 *   - `supabase.functions.invoke('send-ticket-reply')` for staff replies
 *
 * The admin's super-admin role is enforced by the SuperAdminRoute wrapper in
 * App.tsx — the single source of truth for admin gating.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc, logger } from "@/lib/observability";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

import {
  ArrowLeft, RefreshCcw, Download, Search, Filter,
  Inbox, Mail, Hourglass, PauseCircle, CheckCircle2, AlertCircle,
  Clock, MessageSquare, User, ChevronLeft, ChevronRight,
  Send, Lock,
} from "lucide-react";

// ── Types mirror the SQL schema (no direct Database typing yet) ──────────────

type TicketStatus   = "open" | "pending" | "awaiting_user" | "resolved" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketCategory =
  | "general" | "sales" | "support" | "billing" | "privacy"
  | "grievance" | "press" | "legal" | "feature_request" | "bug_report" | "other";

interface TicketRow {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  user_id: string | null;
  subject: string;
  category: TicketCategory;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  source: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  page_url: string | null;
  internal_notes: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  author_type: "user" | "staff" | "system";
  author_id: string | null;
  author_name: string;
  author_email: string;
  body: string;
  is_internal: boolean;
  email_sent_at: string | null;
  email_status: string | null;
  created_at: string;
}

interface TicketStats {
  total: number;
  open_count: number;
  pending_count: number;
  awaiting_user_count: number;
  resolved_count: number;
  closed_count: number;
  urgent_count: number;
  high_count: number;
  last_24h_count: number;
  avg_resolution_hours: number;
}

interface AdminProfile {
  user_id: string;
  display_name: string;
  email: string;
}

// ── Display metadata ─────────────────────────────────────────────────────────

const STATUSES: Array<{ value: TicketStatus | "all"; label: string; cls: string; icon: typeof Mail }> = [
  { value: "all",            label: "All statuses", cls: "", icon: Inbox },
  { value: "open",           label: "Open",         cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30", icon: Mail },
  { value: "pending",        label: "In progress",  cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: Hourglass },
  { value: "awaiting_user",  label: "Awaiting user",cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30", icon: PauseCircle },
  { value: "resolved",       label: "Resolved",     cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  { value: "closed",         label: "Closed",       cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
];

const PRIORITIES: Array<{ value: TicketPriority | "all"; label: string; cls: string }> = [
  { value: "all",    label: "All priorities", cls: "" },
  { value: "urgent", label: "Urgent", cls: "bg-destructive/10 text-destructive" },
  { value: "high",   label: "High",   cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  { value: "normal", label: "Normal", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { value: "low",    label: "Low",    cls: "bg-muted text-muted-foreground" },
];

const CATEGORIES: Array<{ value: TicketCategory | "all"; label: string }> = [
  { value: "all",             label: "All categories" },
  { value: "general",         label: "General" },
  { value: "sales",           label: "Sales" },
  { value: "support",         label: "Support" },
  { value: "billing",         label: "Billing" },
  { value: "privacy",         label: "Privacy & DPO" },
  { value: "grievance",       label: "Grievance" },
  { value: "press",           label: "Press" },
  { value: "legal",           label: "Legal" },
  { value: "feature_request", label: "Feature request" },
  { value: "bug_report",      label: "Bug report" },
  { value: "other",           label: "Other" },
];

const PAGE_SIZE = 25;

function statusMeta(s: TicketStatus) {
  return STATUSES.find((x) => x.value === s) ?? STATUSES[1];
}
function priorityMeta(p: TicketPriority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[3];
}
function categoryLabel(c: TicketCategory): string {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

function fmtDate(value: string | null | undefined, fmt = "MMM d, HH:mm"): string {
  if (!value) return "—";
  try {
    return format(new Date(value), fmt);
  } catch {
    return value;
  }
}
function fmtRelative(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SupportTicketsPage() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // Pagination + sort
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<"created_at" | "updated_at" | "priority" | "status">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Drawer
  const [activeTicketId, setActiveTicketId] = useState<string | null>(searchParams.get("ticket"));

  // Bring the deep-link ticket id back from the URL into state if it changes
  // (e.g. when the staff member follows a link from their email).
  useEffect(() => {
    const id = searchParams.get("ticket");
    if (id && id !== activeTicketId) setActiveTicketId(id);
  }, [searchParams, activeTicketId]);

  // ── Data loading ──
  const loadStats = useCallback(async () => {
    const { data, error } = await supabaseRpc<TicketStats[]>("admin_ticket_stats");
    if (error) {
      logger.warn("admin_ticket_stats_failed", { error_message: error.message });
      return;
    }
    const row = Array.isArray(data) ? data[0] : (data as unknown as TicketStats | null);
    if (row) setStats(row);
  }, []);

  const loadAdmins = useCallback(async () => {
    const { data } = await supabaseRpc<AdminProfile[]>("admin_list_super_admins");
    if (Array.isArray(data)) setAdmins(data);
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      // RLS-gated: only super admins can SELECT. We pull the full result set
      // (capped at 500) and filter client-side so the UI stays snappy when
      // toggling between status tabs. A 500-row ceiling is well under the
      // expected support volume for this stage of the product.
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setTickets((data ?? []) as TicketRow[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("ticket_list_load_failed", { error_message: msg });
      toast.error("Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadTickets();
    loadStats();
    loadAdmins();
  }, [isAdmin, loadTickets, loadStats, loadAdmins]);

  // ── Filtering + sorting + pagination ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    // dateTo is inclusive of the selected day, so push to end-of-day.
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      const created = new Date(t.created_at).getTime();
      if (fromTs !== null && created < fromTs) return false;
      if (toTs !== null && created > toTs) return false;
      if (q) {
        const blob = `${t.ticket_number} ${t.subject} ${t.name} ${t.email}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, categoryFilter, dateFrom, dateTo, search]);

  // Priority sort order — urgent first when descending, low first when asc.
  const priorityRank: Record<TicketPriority, number> = useMemo(
    () => ({ urgent: 3, high: 2, normal: 1, low: 0 }), []
  );
  const statusRank: Record<TicketStatus, number> = useMemo(
    () => ({ open: 4, pending: 3, awaiting_user: 2, resolved: 1, closed: 0 }), []
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "priority":
          cmp = priorityRank[a.priority] - priorityRank[b.priority];
          break;
        case "status":
          cmp = statusRank[a.status] - statusRank[b.status];
          break;
        case "updated_at":
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "created_at":
        default:
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir, priorityRank, statusRank]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  // Reset to page 0 whenever filters change so we don't strand the user on a
  // now-empty page.
  useEffect(() => {
    setPage(0);
  }, [statusFilter, priorityFilter, categoryFilter, dateFrom, dateTo, search]);

  // ── Detail drawer ──
  const activeTicket = useMemo(
    () => (activeTicketId ? tickets.find((t) => t.id === activeTicketId) ?? null : null),
    [activeTicketId, tickets],
  );

  const closeDrawer = () => {
    setActiveTicketId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("ticket");
    setSearchParams(next, { replace: true });
  };

  const openTicket = (id: string) => {
    setActiveTicketId(id);
    const next = new URLSearchParams(searchParams);
    next.set("ticket", id);
    setSearchParams(next, { replace: true });
  };

  // ── CSV export ──
  const handleExportCsv = () => {
    if (sorted.length === 0) {
      toast.info("No tickets match the current filters.");
      return;
    }
    const headers = [
      "ticket_number", "subject", "category", "status", "priority",
      "name", "email", "created_at", "updated_at", "first_response_at", "resolved_at",
    ];
    const rows = sorted.map((t) => headers.map((h) => {
      const v = (t as unknown as Record<string, unknown>)[h];
      if (v === null || v === undefined) return "";
      return String(v).replace(/"/g, '""');
    }));
    const csv = [headers, ...rows].map((row) =>
      row.map((cell) => `"${cell}"`).join(","),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sorted.length} ticket${sorted.length === 1 ? "" : "s"}`);
  };

  // Admin gating is handled by SuperAdminRoute in App.tsx — see
  // .kiro/specs/admin-nav-history-fix/ for why no page-level check is needed.

  // ── Render ──
  const statCards = [
    { label: "Total",          value: stats?.total ?? 0,               icon: Inbox },
    { label: "Open",           value: stats?.open_count ?? 0,          icon: Mail },
    { label: "In progress",    value: stats?.pending_count ?? 0,       icon: Hourglass },
    { label: "Awaiting user",  value: stats?.awaiting_user_count ?? 0, icon: PauseCircle },
    { label: "Resolved",       value: (stats?.resolved_count ?? 0) + (stats?.closed_count ?? 0), icon: CheckCircle2 },
    { label: "Last 24h",       value: stats?.last_24h_count ?? 0,      icon: Clock },
  ];
  const avgHours = stats?.avg_resolution_hours ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" asChild className="h-8 -ml-2">
            <Link to="/dashboard/admin">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to admin
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Support tickets</h1>
              <p className="text-[11px] text-muted-foreground">
                Every contact-form submission with status, replies, and audit history
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { loadTickets(); loadStats(); }} disabled={loading} className="h-8 text-[12px]">
              <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8 text-[12px]">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="border border-border rounded-xl p-3 bg-card">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {s.label}
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight">{loading && !stats ? "—" : s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-border rounded-xl p-3 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[10px] text-destructive font-medium uppercase tracking-wider">Needs attention</span>
            </div>
            <p className="text-base font-medium">
              <span className="font-mono">{stats?.urgent_count ?? 0}</span> urgent &nbsp;·&nbsp;
              <span className="font-mono">{stats?.high_count ?? 0}</span> high
            </p>
          </div>
          <div className="border border-border rounded-xl p-3 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Avg resolution time
              </span>
            </div>
            <p className="text-base font-medium">
              {avgHours > 0 ? `${avgHours.toFixed(1)} hours` : "Not enough data yet"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="border border-border rounded-xl bg-card p-3">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value} className="text-[12px]">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as typeof priorityFilter)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value} className="text-[12px]">{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-[12px]" placeholder="From" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-[12px]" placeholder="To" />
          </div>
          <div className="mt-2 relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket #, subject, name, or email"
              className="h-8 text-[12px] pl-8"
            />
          </div>
        </div>

        {/* Sort + count */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-[12px] text-muted-foreground">
          <span>
            Showing{" "}
            <strong className="text-foreground font-medium">{paginated.length}</strong> of{" "}
            <strong className="text-foreground font-medium">{sorted.length}</strong> ticket
            {sorted.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <span>Sort:</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-7 w-[140px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at" className="text-[11px]">Created</SelectItem>
                <SelectItem value="updated_at" className="text-[11px]">Last activity</SelectItem>
                <SelectItem value="priority"   className="text-[11px]">Priority</SelectItem>
                <SelectItem value="status"     className="text-[11px]">Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(v) => setSortDir(v as typeof sortDir)}>
              <SelectTrigger className="h-7 w-[90px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc" className="text-[11px]">Newest first</SelectItem>
                <SelectItem value="asc"  className="text-[11px]">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Ticket #</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Subject</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden md:table-cell">Submitter</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden lg:table-cell">Category</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Priority</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden xl:table-cell">Created</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden xl:table-cell">Activity</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Loading tickets…</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">
                    {tickets.length === 0
                      ? "No tickets yet. New contact-form submissions will appear here."
                      : "No tickets match the current filters."}
                  </td></tr>
                ) : (
                  paginated.map((t) => {
                    const s = statusMeta(t.status);
                    const p = priorityMeta(t.priority);
                    const StatusIcon = s.icon;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => openTicket(t.id)}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {t.ticket_number}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          <p className="font-medium truncate">{t.subject}</p>
                          <p className="text-[11px] text-muted-foreground truncate md:hidden">
                            {t.name} · {t.email}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-[12px]">
                          <p className="truncate">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{t.email}</p>
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell text-[12px] text-muted-foreground">
                          {categoryLabel(t.category)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="secondary" className={`text-[10px] font-semibold uppercase ${p.cls}`}>
                            {p.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={`gap-1 text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}>
                            <StatusIcon className="h-2.5 w-2.5" /> {s.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 hidden xl:table-cell text-[11px] text-muted-foreground whitespace-nowrap">
                          {fmtDate(t.created_at)}
                        </td>
                        <td className="px-3 py-2.5 hidden xl:table-cell text-[11px] text-muted-foreground whitespace-nowrap">
                          {fmtRelative(t.updated_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                Page {pageClamped + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pageClamped === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pageClamped >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TicketDetailDrawer
        ticket={activeTicket}
        admins={admins}
        onClose={closeDrawer}
        onMutated={() => {
          loadTickets();
          loadStats();
        }}
      />
    </DashboardLayout>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function TicketDetailDrawer({
  ticket,
  admins,
  onClose,
  onMutated,
}: {
  ticket: TicketRow | null;
  admins: AdminProfile[];
  onClose: () => void;
  onMutated: () => void;
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Re-seed local form state whenever a new ticket is selected.
  useEffect(() => {
    if (ticket) {
      setInternalNotes(ticket.internal_notes ?? "");
      setReply("");
      setReplyInternal(false);
    } else {
      setMessages([]);
      setInternalNotes("");
    }
  }, [ticket]);

  const loadMessages = useCallback(async (ticketId: string) => {
    setLoadingThread(true);
    try {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages((data ?? []) as TicketMessage[]);
    } catch (err) {
      logger.warn("ticket_messages_admin_load_failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (ticket?.id) loadMessages(ticket.id);
  }, [ticket?.id, loadMessages]);

  if (!ticket) {
    return (
      <Sheet open={false} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

  const handleStatusChange = async (status: TicketStatus) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status })
      .eq("id", ticket.id);
    if (error) {
      toast.error("Could not update status.");
      return;
    }
    // Record a system audit message so the history is preserved.
    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_type: "system",
      author_name: "System",
      author_email: "system@illuxus.com",
      body: `Status changed from ${ticket.status} to ${status}`,
      is_internal: true,
    });
    toast.success(`Status → ${statusMeta(status).label}`);
    onMutated();
    loadMessages(ticket.id);
  };

  const handlePriorityChange = async (priority: TicketPriority) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ priority })
      .eq("id", ticket.id);
    if (error) {
      toast.error("Could not update priority.");
      return;
    }
    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_type: "system",
      author_name: "System",
      author_email: "system@illuxus.com",
      body: `Priority changed from ${ticket.priority} to ${priority}`,
      is_internal: true,
    });
    toast.success(`Priority → ${priorityMeta(priority).label}`);
    onMutated();
    loadMessages(ticket.id);
  };

  const handleAssignChange = async (assignee: string) => {
    const next = assignee === "none" ? null : assignee;
    const { error } = await supabase
      .from("support_tickets")
      .update({ assigned_to: next })
      .eq("id", ticket.id);
    if (error) {
      toast.error("Could not update assignee.");
      return;
    }
    const assigneeName = next
      ? admins.find((a) => a.user_id === next)?.display_name || admins.find((a) => a.user_id === next)?.email || "an admin"
      : "no one";
    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_type: "system",
      author_name: "System",
      author_email: "system@illuxus.com",
      body: `Assigned to ${assigneeName}`,
      is_internal: true,
    });
    toast.success(next ? "Assignee updated" : "Unassigned");
    onMutated();
    loadMessages(ticket.id);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from("support_tickets")
      .update({ internal_notes: internalNotes })
      .eq("id", ticket.id);
    setSavingNotes(false);
    if (error) {
      toast.error("Could not save internal notes.");
      return;
    }
    toast.success("Internal notes saved");
    onMutated();
  };

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-ticket-reply", {
        body: {
          ticket_id: ticket.id,
          body: reply.trim(),
          is_internal: replyInternal,
        },
      });
      if (error || !data?.success) {
        throw new Error((data && data.error) || error?.message || "Failed to send reply");
      }
      toast.success(
        replyInternal
          ? "Internal note saved"
          : data.email_delivered
            ? "Reply sent and email delivered"
            : "Reply saved (email pending)",
      );
      setReply("");
      setReplyInternal(false);
      loadMessages(ticket.id);
      onMutated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("ticket_reply_send_failed", { error_message: msg });
      toast.error(msg);
    } finally {
      setSendingReply(false);
    }
  };

  const s = statusMeta(ticket.status);
  const p = priorityMeta(ticket.priority);
  const StatusIcon = s.icon;

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`gap-1 text-[10px] font-semibold uppercase ${s.cls}`}>
              <StatusIcon className="h-2.5 w-2.5" /> {s.label}
            </Badge>
            <Badge variant="secondary" className={`text-[10px] font-semibold uppercase ${p.cls}`}>
              {p.label}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {categoryLabel(ticket.category)}
            </Badge>
            <span className="text-[11px] font-mono text-muted-foreground ml-auto">
              {ticket.ticket_number}
            </span>
          </div>
          <SheetTitle className="text-base font-semibold leading-tight">{ticket.subject}</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5 pb-8">
          {/* Submitter */}
          <section className="rounded-xl border border-border p-3 text-[12px] space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium">{ticket.name}</p>
              <a className="text-primary hover:underline ml-auto text-[11px]" href={`mailto:${ticket.email}`}>{ticket.email}</a>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
              <span>Submitted</span><span className="text-foreground">{fmtDate(ticket.created_at, "MMM d, yyyy HH:mm")}</span>
              <span>Last update</span><span className="text-foreground">{fmtRelative(ticket.updated_at)}</span>
              {ticket.first_response_at && (<><span>First response</span><span className="text-foreground">{fmtDate(ticket.first_response_at)}</span></>)}
              {ticket.resolved_at && (<><span>Resolved</span><span className="text-foreground">{fmtDate(ticket.resolved_at)}</span></>)}
              {ticket.page_url && (<><span>Page URL</span><span className="text-foreground truncate" title={ticket.page_url}>{ticket.page_url}</span></>)}
            </div>
          </section>

          {/* Original message */}
          <section className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Original message</p>
            <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
          </section>

          {/* Conversation */}
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Conversation &amp; history</p>
            {loadingThread ? (
              <p className="text-[12px] text-muted-foreground">Loading thread…</p>
            ) : messages.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No replies or activity yet.</p>
            ) : (
              <ol className="space-y-2">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl border p-3 text-[12px] ${
                      m.author_type === "system"
                        ? "border-dashed border-border bg-muted/10 text-muted-foreground"
                        : m.author_type === "staff"
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-medium text-[11px] flex items-center gap-1.5">
                        {m.is_internal && <Lock className="h-3 w-3" />}
                        {m.author_type === "system" ? "System" : m.author_name}
                        {m.is_internal && (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">internal</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(m.created_at, "MMM d, HH:mm")}</p>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Reply form */}
          <section className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Reply</p>
            <Textarea
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={replyInternal
                ? "Internal note — only visible to admins"
                : "Type your reply… (will be emailed to the submitter)"}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={replyInternal}
                  onChange={(e) => setReplyInternal(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <Lock className="h-3 w-3" /> Internal only (no email)
              </label>
              <Button size="sm" onClick={handleSendReply} disabled={sendingReply || !reply.trim()} className="h-8 text-[12px] gap-1.5">
                <Send className="h-3 w-3" />
                {sendingReply ? "Sending…" : replyInternal ? "Save internal note" : "Send reply"}
              </Button>
            </div>
          </section>

          {/* Status / priority / assignee */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Status</Label>
              <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v as TicketStatus)}>
                <SelectTrigger className="h-8 text-[12px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.filter((x) => x.value !== "all").map((x) => (
                    <SelectItem key={x.value} value={x.value} className="text-[12px]">{x.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Priority</Label>
              <Select value={ticket.priority} onValueChange={(v) => handlePriorityChange(v as TicketPriority)}>
                <SelectTrigger className="h-8 text-[12px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.filter((x) => x.value !== "all").map((x) => (
                    <SelectItem key={x.value} value={x.value} className="text-[12px]">{x.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Assigned to</Label>
              <Select value={ticket.assigned_to ?? "none"} onValueChange={handleAssignChange}>
                <SelectTrigger className="h-8 text-[12px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[12px]">Unassigned</SelectItem>
                  {admins.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id} className="text-[12px]">
                      {a.display_name || a.email || a.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Internal notes */}
          <section className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Internal notes</p>
            </div>
            <Textarea
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Notes for the support team — never visible to the user."
              className="text-[12px]"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={savingNotes} className="h-7 text-[11px]">
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </section>

          {/* Diagnostic provenance */}
          {(ticket.user_agent || ticket.ip_hash) && (
            <section className="rounded-xl border border-border/50 bg-muted/10 p-3 text-[11px] text-muted-foreground space-y-1">
              <p className="uppercase tracking-widest text-[10px] mb-1">Provenance</p>
              {ticket.source && <p><span className="font-mono">source</span> · {ticket.source}</p>}
              {ticket.ip_hash && <p><span className="font-mono">ip</span> · {ticket.ip_hash}</p>}
              {ticket.user_agent && <p className="break-all"><span className="font-mono">ua</span> · {ticket.user_agent}</p>}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
