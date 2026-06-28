/**
 * OrganizationManagementPage — super-admin org management surface.
 *
 * KPI strip + search + plan filter chips + sortable org table with per-row
 * actions (change plan / suspend / delete) backed by the existing admin RPCs.
 *
 * Row click opens a drawer with org settings, plan/subscription info, members,
 * recent events, revenue rollup and per-org activity log.
 *
 * Mounted at `/dashboard/admin/organizations` behind `SuperAdminRoute`.
 */
import { useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Search, ArrowLeft, MoreHorizontal, Trash2, Pencil, RefreshCw,
  Crown, DollarSign, Eye, Globe, Users, Calendar,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
  billing_email: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  created_at: string;
  member_count: number;
  event_count: number;
}

interface RevenueSummary {
  gross_revenue: number;
  platform_fees: number;
  refunds_issued: number;
  net_revenue: number;
  mrr: number;
  ticket_count_paid: number;
}

const PLANS = ["free", "starter", "pro", "business"] as const;
type FilterChip = "all" | typeof PLANS[number];

const planColor: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/10 text-blue-600",
  pro: "bg-violet-500/10 text-violet-600",
  business: "bg-amber-500/10 text-amber-600",
};

const PLAN_MRR: Record<string, number> = { free: 0, starter: 29, pro: 99, business: 299 };

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

/* ─── Drawer body — org detail ──────────────────────────────────────────── */

function OrgDetailDrawer({ org, onClose }: { org: OrgRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", subdomain: "", billing_email: "" });

  // Reset form when org changes.
  useMemo(() => {
    if (org) setForm({
      name: org.name,
      subdomain: org.subdomain || "",
      billing_email: org.billing_email || "",
    });
  }, [org]);

  const membersQ = useQuery({
    queryKey: ["admin-org-members", org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("user_id, role, joined_at")
        .eq("org_id", org!.id)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["admin-org-events", org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, status, date, tickets_sold, price, currency")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const subQ = useQuery({
    queryKey: ["admin-org-sub", org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("org_id", org!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!org) return;
      const { error } = await supabaseRpc("admin_update_org", {
        _oid: org.id,
        _name: form.name,
        _subdomain: form.subdomain || null,
        _billing_email: form.billing_email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization updated");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!org) return null;
  const ownEvents = eventsQ.data ?? [];
  const orgRevenue = ownEvents.reduce(
    (s: number, e: any) => s + (Number(e.price) || 0) * (Number(e.tickets_sold) || 0),
    0,
  );

  return (
    <Sheet open={!!org} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle className="text-base font-semibold leading-tight">{org.name}</SheetTitle>
          <p className="text-[11px] text-muted-foreground font-mono">{org.slug}</p>
        </SheetHeader>

        <div className="mt-5 space-y-5 pb-8">
          {/* Settings */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Settings</p>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-8 mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace handle</Label>
              <Input value={form.subdomain} onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value.toLowerCase() }))} className="h-8 mt-1 text-sm font-mono" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Billing email</Label>
              <Input value={form.billing_email} onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))} className="h-8 mt-1 text-sm" />
            </div>
            <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>

          {/* Plan / subscription */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Subscription</p>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span>Plan</span>
              <Badge variant="secondary" className={`uppercase text-[10px] font-semibold ${planColor[org.plan] || ""}`}>{org.plan}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span>Status</span>
              <span className="text-muted-foreground">{(subQ.data as any)?.status || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span>Period ends</span>
              <span className="text-muted-foreground">
                {(subQ.data as any)?.current_period_end ? format(parseISO((subQ.data as any).current_period_end), "MMM d, yyyy") : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span>MRR (estimated)</span>
              <span className="font-semibold">${PLAN_MRR[org.plan] ?? 0}</span>
            </div>
          </div>

          {/* Members */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Members ({membersQ.data?.length ?? 0})</p>
            </div>
            <div className="p-2 max-h-48 overflow-y-auto">
              {membersQ.isLoading ? <Skeleton className="h-16 w-full" /> :
                (membersQ.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-3">No members yet</p>
                ) : (membersQ.data ?? []).map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12px] hover:bg-muted/30 rounded">
                    <span className="font-mono text-[10px] truncate">{m.user_id.slice(0, 12)}…</span>
                    <Badge variant="secondary" className="text-[10px]">{m.role}</Badge>
                  </div>
                ))}
            </div>
          </div>

          {/* Events */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Events ({eventsQ.data?.length ?? 0})</p>
            </div>
            <div className="p-2 max-h-48 overflow-y-auto">
              {eventsQ.isLoading ? <Skeleton className="h-16 w-full" /> :
                (eventsQ.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-3">No events</p>
                ) : (eventsQ.data ?? []).map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12px] hover:bg-muted/30 rounded">
                    <span className="truncate">{ev.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{ev.tickets_sold} sold</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Revenue rollup */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5" /> Revenue (events)
            </p>
            <div className="flex items-center justify-between text-[12px]">
              <span>Gross from ticket sales</span>
              <span className="font-semibold">${orgRevenue.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Approximate — equals Σ(price × tickets_sold) across this org's events.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function OrganizationManagementPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [drawerOrg, setDrawerOrg] = useState<OrgRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);

  const orgsQ = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<OrgRow[]>("admin_list_orgs");
      if (error) throw error;
      return (data ?? []) as OrgRow[];
    },
    staleTime: 30_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-orgs-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("org_id, status, plan, current_period_start");
      if (error) throw error;
      return data ?? [];
    },
  });

  const revenueQ = useQuery({
    queryKey: ["admin-revenue-summary"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<RevenueSummary[]>("admin_revenue_summary");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    staleTime: 60_000,
  });

  const planMut = useMutation({
    mutationFn: async ({ oid, plan }: { oid: string; plan: string }) => {
      const { error } = await supabaseRpc("admin_update_org_plan", { _oid: oid, _plan: plan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan updated");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (oid: string) => {
      const { error } = await supabaseRpc("admin_delete_org", { _oid: oid });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    const list = orgsQ.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((o) => {
      if (filter !== "all" && o.plan !== filter) return false;
      if (!q) return true;
      return [o.name, o.slug, o.subdomain, o.custom_domain].filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [orgsQ.data, search, filter]);

  /* ── KPIs ── */
  const totalOrgs = orgsQ.data?.length ?? 0;
  const paidOrgs = (orgsQ.data ?? []).filter((o) => o.plan !== "free").length;
  const freeOrgs = (orgsQ.data ?? []).filter((o) => o.plan === "free").length;
  const mrr = revenueQ.data?.mrr ?? 0;

  // Churn = subscriptions cancelled in the last 30 days / total active subs at start of period.
  const churnRate = useMemo(() => {
    const subs = (subsQ.data ?? []) as any[];
    if (subs.length === 0) return 0;
    const cutoff = subDays(new Date(), 30).toISOString();
    const cancelled = subs.filter((s) => s.status === "cancelled" && s.current_period_start && s.current_period_start >= cutoff).length;
    return Math.round((cancelled / Math.max(1, subs.length)) * 100);
  }, [subsQ.data]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const isLoading = orgsQ.isLoading;

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
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Building2 className="h-4.5 w-4.5 text-amber-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Organizations</h1>
                <p className="text-xs text-muted-foreground">Every workspace on the platform — plan, ownership, revenue</p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => orgsQ.refetch()} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard icon={Building2} label="Total orgs" value={totalOrgs} loading={isLoading} />
          <KpiCard icon={Crown}     label="Paid plans" value={paidOrgs} loading={isLoading} />
          <KpiCard icon={Building2} label="Free plans" value={freeOrgs} loading={isLoading} />
          <KpiCard icon={DollarSign} label="MRR"        value={`$${mrr.toLocaleString()}`} loading={revenueQ.isLoading} />
          <KpiCard icon={DollarSign} label="Churn 30d" value={`${churnRate}%`} loading={subsQ.isLoading} />
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, slug, domain…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 w-72 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all", ...PLANS] as FilterChip[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-2.5 py-1 rounded border text-[12px] capitalize transition-colors ${
                  filter === c ? "border-amber-500 text-amber-600 bg-amber-500/10" : "border-border hover:bg-muted"
                }`}
              >{c}</button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} of {totalOrgs}</span>
        </div>

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Organization</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Plan</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Members</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Events</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">MRR</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Created</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No organisations match</td></tr>
                ) : filtered.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => setDrawerOrg(o)}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="opacity-60">{o.slug}</span>
                        {o.subdomain && <span className="inline-flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" /> {o.subdomain}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Select value={o.plan} onValueChange={(val) => planMut.mutate({ oid: o.id, plan: val })}>
                        <SelectTrigger className="h-7 w-[110px] text-[11px] font-semibold uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((p) => (
                            <SelectItem key={p} value={p} className="text-[12px] uppercase">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">{o.member_count}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{o.event_count}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">${PLAN_MRR[o.plan] ?? 0}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{format(parseISO(o.created_at), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-[12px]">
                          <DropdownMenuItem onClick={() => setDrawerOrg(o)}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> View detail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDrawerOrg(o)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit settings
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(o)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete organisation
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
      </div>

      <OrgDetailDrawer org={drawerOrg} onClose={() => setDrawerOrg(null)} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete organization</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> along with members, events, and subscription. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >{deleteMut.isPending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
