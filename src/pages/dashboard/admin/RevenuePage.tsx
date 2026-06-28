/**
 * RevenuePage — super-admin financial dashboard.
 *
 * Pulls `admin_revenue_summary` for headline numbers, registrations + events
 * joined for the 12-month series and the top-events/top-orgs tables, and the
 * subscriptions table for the plan-distribution donut.
 *
 * Mounted at `/dashboard/admin/revenue` behind `SuperAdminRoute`.
 */
import { useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, TrendingUp, ArrowLeft, RefreshCw, ReceiptText, Wallet, Building2, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RevenueSummary {
  gross_revenue: number;
  platform_fees: number;
  refunds_issued: number;
  net_revenue: number;
  mrr: number;
  ticket_count_paid: number;
}

const PLAN_COLOR: Record<string, string> = {
  free: "#94a3b8",
  starter: "#3b82f6",
  pro: "#8b5cf6",
  business: "#f59e0b",
};

/* ─── UI helpers ────────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function StatCard({
  icon: Icon, label, value, sub, loading,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; loading?: boolean;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
      {sub && !loading && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function last12MonthKeys() {
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) keys.push(format(startOfMonth(subMonths(new Date(), i)), "yyyy-MM"));
  return keys;
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function RevenuePage() {
  const { isAdmin, loading: authLoading } = useAuth();

  const summaryQ = useQuery({
    queryKey: ["admin-revenue-summary"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<RevenueSummary[]>("admin_revenue_summary");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    staleTime: 60_000,
  });

  const regsQ = useQuery({
    queryKey: ["admin-revenue-regs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, event_id, amount_paid, status, created_at, name, email")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: ["admin-revenue-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, org_id, price, tickets_sold, currency");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const orgsQ = useQuery({
    queryKey: ["admin-revenue-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, plan");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-revenue-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan, status");
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Monthly series ── */
  const monthly = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of regsQ.data ?? []) {
      if (r.status !== "confirmed" && r.status !== "paid") continue;
      const k = format(startOfMonth(parseISO(r.created_at)), "yyyy-MM");
      buckets[k] = (buckets[k] ?? 0) + (Number(r.amount_paid) || 0);
    }
    return last12MonthKeys().map((k) => ({
      month: format(parseISO(`${k}-01`), "MMM yy"),
      Revenue: Number((buckets[k] ?? 0).toFixed(2)),
    }));
  }, [regsQ.data]);

  /* ── Top orgs ── */
  const topOrgs = useMemo(() => {
    const orgById = new Map((orgsQ.data ?? []).map((o: any) => [o.id, o]));
    const totals: Record<string, { name: string; revenue: number; events: number }> = {};
    for (const ev of eventsQ.data ?? []) {
      if (!ev.org_id) continue;
      const org = orgById.get(ev.org_id);
      if (!org) continue;
      const rev = (Number(ev.price) || 0) * (Number(ev.tickets_sold) || 0);
      totals[ev.org_id] ??= { name: (org as any).name, revenue: 0, events: 0 };
      totals[ev.org_id]!.revenue += rev;
      totals[ev.org_id]!.events += 1;
    }
    return Object.values(totals).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [eventsQ.data, orgsQ.data]);

  /* ── Top events ── */
  const topEvents = useMemo(() => {
    return [...(eventsQ.data ?? [])]
      .map((e) => ({
        id: e.id, title: e.title,
        revenue: (Number(e.price) || 0) * (Number(e.tickets_sold) || 0),
        tickets: Number(e.tickets_sold) || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [eventsQ.data]);

  /* ── Plan distribution ── */
  const planDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orgsQ.data ?? []) counts[(o as any).plan] = (counts[(o as any).plan] ?? 0) + 1;
    return Object.entries(counts).map(([plan, count]) => ({ plan, count, color: PLAN_COLOR[plan] || "#888" }));
  }, [orgsQ.data]);

  /* ── Refunds list ── */
  const refunds = useMemo(() => {
    return (regsQ.data ?? [])
      .filter((r) => r.status === "refunded")
      .slice(0, 50);
  }, [regsQ.data]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const s = summaryQ.data;
  const isLoading = summaryQ.isLoading;

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
              <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="h-4.5 w-4.5 text-green-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Revenue</h1>
                <p className="text-xs text-muted-foreground">Cross-platform financial snapshot — refresh for live numbers</p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { summaryQ.refetch(); regsQ.refetch(); }} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={DollarSign} label="Gross revenue"    value={`$${(s?.gross_revenue ?? 0).toLocaleString()}`} loading={isLoading} />
          <StatCard icon={ReceiptText} label="Platform fees"   value={`$${(s?.platform_fees ?? 0).toLocaleString()}`} sub="2% of gross" loading={isLoading} />
          <StatCard icon={Wallet} label="Refunds issued"       value={`$${(s?.refunds_issued ?? 0).toLocaleString()}`} loading={isLoading} />
          <StatCard icon={TrendingUp} label="Net revenue"      value={`$${(s?.net_revenue ?? 0).toLocaleString()}`} loading={isLoading} />
          <StatCard icon={DollarSign} label="MRR"              value={`$${(s?.mrr ?? 0).toLocaleString()}`} loading={isLoading} />
        </div>

        {/* Monthly chart */}
        <div className="border border-border rounded-xl bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4">Revenue — Last 12 Months</h2>
          {regsQ.isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top orgs */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Top organisations by revenue</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Organisation</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Events</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50"><td colSpan={3} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  ) : topOrgs.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">No revenue yet</td></tr>
                  ) : topOrgs.map((o, idx) => (
                    <tr key={idx} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 truncate max-w-[200px]">{o.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{o.events}</td>
                      <td className="px-4 py-2 text-right font-semibold">${o.revenue.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top events */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Top events by revenue</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Event</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Tickets</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50"><td colSpan={3} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  ) : topEvents.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">No revenue yet</td></tr>
                  ) : topEvents.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 truncate max-w-[200px]">{e.title}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.tickets}</td>
                      <td className="px-4 py-2 text-right font-semibold">${e.revenue.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Plan distribution donut */}
          <div className="border border-border rounded-xl bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold mb-3">Plan distribution</h2>
            {orgsQ.isLoading ? <Skeleton className="h-56 w-full" /> : planDist.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orgs yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={planDist} dataKey="count" nameKey="plan" outerRadius={90} innerRadius={48} paddingAngle={2}>
                    {planDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Refunds */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold">Recent refunds</h2>
            </div>
            <div className="overflow-x-auto max-h-[260px]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Attendee</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">When</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {regsQ.isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50"><td colSpan={3} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  ) : refunds.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">No refunds</td></tr>
                  ) : refunds.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-1.5 truncate max-w-[180px]">{r.name || r.email}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{format(parseISO(r.created_at), "MMM d")}</td>
                      <td className="px-4 py-1.5 text-right">
                        <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">${Number(r.amount_paid || 0).toFixed(0)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
