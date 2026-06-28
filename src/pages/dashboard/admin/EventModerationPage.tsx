/**
 * EventModerationPage — platform-wide event view for super admins.
 *
 * KPI strip + search + status filter + table with per-row moderation
 * actions (force-unpublish / force-delete) backed by the admin RPCs.
 *
 * Mounted at `/dashboard/admin/events` behind `SuperAdminRoute`.
 */
import { useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Search, ArrowLeft, MoreHorizontal, ExternalLink, AlertCircle,
  Trash2, EyeOff, RefreshCw, DollarSign, CheckCircle2,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface AdminEventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  date: string;
  capacity: number | null;
  tickets_sold: number | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  created_at: string;
  org_id: string | null;
  user_id: string;
  org_name?: string | null;
}

type FilterChip = "all" | "draft" | "published" | "cancelled" | "completed";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-500/10 text-green-600",
  cancelled: "bg-destructive/10 text-destructive",
  completed: "bg-amber-500/10 text-amber-600",
};

/* ─── Skeleton / KPI ────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function KpiCard({
  icon: Icon, label, value, loading,
}: {
  icon: React.ElementType; label: string; value: number | string; loading?: boolean;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function EventModerationPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [unpublishTarget, setUnpublishTarget] = useState<AdminEventRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEventRow | null>(null);
  const [reason, setReason] = useState("");

  const eventsQ = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, slug, status, date, capacity, tickets_sold, price, currency, image_url, created_at, org_id, user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminEventRow[];
    },
    staleTime: 30_000,
  });

  const orgsQ = useQuery({
    queryKey: ["admin-events-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgsById = useMemo(() => {
    const map = new Map<string, { name: string; slug: string }>();
    for (const o of orgsQ.data ?? []) map.set(o.id, { name: o.name, slug: o.slug });
    return map;
  }, [orgsQ.data]);

  const unpublishMut = useMutation({
    mutationFn: async ({ eid, why }: { eid: string; why: string }) => {
      const { error } = await supabaseRpc("admin_event_force_unpublish", { _event_id: eid, _reason: why });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event force-unpublished");
      setUnpublishTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ eid, why }: { eid: string; why: string }) => {
      const { error } = await supabaseRpc("admin_event_force_delete", { _event_id: eid, _reason: why });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event soft-deleted");
      setDeleteTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    const list = eventsQ.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (!q) return true;
      const orgName = e.org_id ? orgsById.get(e.org_id)?.name ?? "" : "";
      return [e.title, e.slug, orgName].some((s) => String(s).toLowerCase().includes(q));
    });
  }, [eventsQ.data, search, filter, orgsById]);

  /* ── KPIs ── */
  const totalEvents = eventsQ.data?.length ?? 0;
  const publishedCount = (eventsQ.data ?? []).filter((e) => e.status === "published").length;
  const draftCount = (eventsQ.data ?? []).filter((e) => e.status === "draft").length;
  const thisWeekNew = useMemo(() => {
    const cutoff = subDays(new Date(), 7).toISOString();
    return (eventsQ.data ?? []).filter((e) => e.created_at >= cutoff).length;
  }, [eventsQ.data]);
  const totalSales = (eventsQ.data ?? []).reduce(
    (s, e) => s + (Number(e.price) || 0) * (Number(e.tickets_sold) || 0),
    0,
  );

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const isLoading = eventsQ.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-8 -ml-2">
              <Link to="/dashboard/admin"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to admin</Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Calendar className="h-4.5 w-4.5 text-violet-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Events Moderation</h1>
                <p className="text-xs text-muted-foreground">Platform-wide event review and emergency takedown</p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => eventsQ.refetch()} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard icon={Calendar}      label="Total events" value={totalEvents}    loading={isLoading} />
          <KpiCard icon={CheckCircle2}  label="Published"    value={publishedCount} loading={isLoading} />
          <KpiCard icon={EyeOff}        label="Draft"        value={draftCount}     loading={isLoading} />
          <KpiCard icon={Calendar}      label="This week"    value={thisWeekNew}    loading={isLoading} />
          <KpiCard icon={DollarSign}    label="Sales value"  value={`$${totalSales.toFixed(0)}`} loading={isLoading} />
        </div>

        {/* Search + filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search title, slug, org…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 w-72 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all","draft","published","cancelled","completed"] as FilterChip[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-2.5 py-1 rounded border text-[12px] capitalize transition-colors ${
                  filter === c ? "border-violet-500 text-violet-600 bg-violet-500/10" : "border-border hover:bg-muted"
                }`}
              >{c}</button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} of {totalEvents}</span>
        </div>

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Event</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Organisation</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Date</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Sold / Cap</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Revenue</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={7} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No events match</td></tr>
                ) : filtered.map((ev) => {
                  const org = ev.org_id ? orgsById.get(ev.org_id) : null;
                  const revenue = (Number(ev.price) || 0) * (Number(ev.tickets_sold) || 0);
                  return (
                    <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {ev.image_url ? (
                            <img src={ev.image_url} alt="" className="h-9 w-9 rounded object-cover bg-muted shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-muted shrink-0 flex items-center justify-center">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[260px]">{ev.title}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{ev.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{org?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`text-[10px] capitalize ${statusColor[ev.status] ?? ""}`}>{ev.status}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{format(parseISO(ev.date), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {ev.tickets_sold ?? 0}{ev.capacity ? <span className="text-muted-foreground"> / {ev.capacity}</span> : ""}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">${revenue.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-[12px]">
                            <DropdownMenuItem asChild>
                              <Link to={`/events/${ev.slug || ev.id}`} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5 mr-2" /> View public page
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/dashboard/events/${ev.id}/guests`}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> View attendees
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={ev.status !== "published"}
                              onClick={() => setUnpublishTarget(ev)}
                            >
                              <EyeOff className="h-3.5 w-3.5 mr-2" /> Force unpublish
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(ev)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Force delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Force unpublish */}
      <Dialog open={!!unpublishTarget} onOpenChange={(o) => { if (!o) { setUnpublishTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /> Force unpublish</DialogTitle>
            <DialogDescription>
              <strong>{unpublishTarget?.title}</strong> will be set to <code>cancelled</code> and hidden from public discovery. Existing registrants are not refunded automatically.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason (logged to audit log)…" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnpublishTarget(null); setReason(""); }} disabled={unpublishMut.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || unpublishMut.isPending}
              onClick={() => unpublishTarget && unpublishMut.mutate({ eid: unpublishTarget.id, why: reason.trim() })}
            >{unpublishMut.isPending ? "Working…" : "Force unpublish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" /> Force delete</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.title}</strong> will be soft-deleted (marked with <code>deleted_at</code>) and hidden everywhere. Reversible by clearing the column.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason (logged to audit log)…" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setReason(""); }} disabled={deleteMut.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate({ eid: deleteTarget.id, why: reason.trim() })}
            >{deleteMut.isPending ? "Deleting…" : "Force delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
