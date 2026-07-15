/**
 * SystemHealthPage — at-a-glance platform health for super admins.
 *
 * Pulls `admin_health_snapshot` for the live counters, plus a 7-day email
 * delivery aggregate from `communication_recipients`. Edge-function status is
 * rendered as a static checklist (the actual liveness probe needs an edge
 * function of its own; the checklist is the placeholder until that ships).
 *
 * Mounted at `/dashboard/admin/system` behind `SuperAdminRoute`.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Heart, ArrowLeft, RefreshCw, Database, Users, Calendar, Building2,
  MailX, Mail, ServerCog, AlertTriangle, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { format, parseISO, subDays, startOfDay } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface HealthSnapshot {
  db_size_mb: number;
  total_users: number;
  total_events: number;
  total_orgs: number;
  total_tickets: number;
  total_communications_sent: number;
  last_24h_signups: number;
  last_24h_events_created: number;
  last_24h_failed_email_count: number;
  last_24h_errors_logged: number;
}

const EDGE_FUNCTIONS = [
  "send-email",
  "livekit-token",
  "agora-token",
  "send-whatsapp",
  "submit-support-ticket",
  "fx-cache",
  "recordings-list",
];

/* ─── UI helpers ────────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function StatCard({
  icon: Icon, label, value, tone = "default", loading,
}: {
  icon: React.ElementType; label: string; value: string | number;
  tone?: "default" | "warning" | "danger"; loading?: boolean;
}) {
  const ring = tone === "warning" ? "ring-amber-500/30" : tone === "danger" ? "ring-destructive/30" : "ring-transparent";
  const iconColor = tone === "warning" ? "text-amber-500" : tone === "danger" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className={`border border-border rounded-xl p-4 bg-card space-y-1.5 ring-1 ${ring}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function SystemHealthPage() {


  const healthQ = useQuery({
    queryKey: ["admin-health"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<HealthSnapshot[]>("admin_health_snapshot");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const emailDeliveryQ = useQuery({
    queryKey: ["admin-email-delivery"],
    queryFn: async () => {
      // 7-day window. Sent + failed buckets by day.
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("communication_recipients")
        .select("email_status, created_at")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const recentActivityQ = useQuery({
    queryKey: ["admin-health-activity"],
    queryFn: async () => {
      const since = subDays(new Date(), 1).toISOString();
      const { data, error } = await supabase
        .from("audit_logs")
        .select("actor_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Email delivery series ── */
  const emailSeries = useMemo(() => {
    const days: { day: string; Sent: number; Failed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ day: format(d, "MMM d"), Sent: 0, Failed: 0 });
    }
    for (const r of emailDeliveryQ.data ?? []) {
      const d = format(startOfDay(parseISO((r as any).created_at)), "MMM d");
      const slot = days.find((x) => x.day === d);
      if (!slot) continue;
      const st = (r as any).email_status as string | null;
      if (st === "sent" || st === "delivered" || st === "opened" || st === "clicked") slot.Sent++;
      else if (st === "failed" || st === "bounced") slot.Failed++;
    }
    return days;
  }, [emailDeliveryQ.data]);

  /* ── Active sessions (rough) — distinct actors in audit log last 24h ── */
  const activeSessions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of recentActivityQ.data ?? []) if ((r as any).actor_id) ids.add((r as any).actor_id);
    return ids.size;
  }, [recentActivityQ.data]);

  // Admin gating is handled by SuperAdminRoute in App.tsx — see
  // .kiro/specs/admin-nav-history-fix/ for why no page-level check is needed.

  const h = healthQ.data;
  const isLoading = healthQ.isLoading;

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
              <div className="h-9 w-9 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Heart className="h-4.5 w-4.5 text-pink-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">System Health</h1>
                <p className="text-xs text-muted-foreground">Live counters refresh every 30 seconds</p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { healthQ.refetch(); emailDeliveryQ.refetch(); recentActivityQ.refetch(); }} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Core stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={Database}  label="DB size"        value={`${(h?.db_size_mb ?? 0).toFixed(1)} MB`} loading={isLoading} />
          <StatCard icon={Users}     label="Total users"    value={h?.total_users ?? 0}    loading={isLoading} />
          <StatCard icon={Calendar}  label="Total events"   value={h?.total_events ?? 0}   loading={isLoading} />
          <StatCard icon={Building2} label="Total orgs"     value={h?.total_orgs ?? 0}     loading={isLoading} />
          <StatCard icon={Users}     label="24h signups"    value={h?.last_24h_signups ?? 0} loading={isLoading} />
          <StatCard
            icon={MailX} label="24h email failures"
            value={h?.last_24h_failed_email_count ?? 0}
            tone={(h?.last_24h_failed_email_count ?? 0) > 0 ? "warning" : "default"}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Email delivery chart */}
          <div className="border border-border rounded-xl bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold mb-3">Email delivery — last 7 days</h2>
            {emailDeliveryQ.isLoading ? <Skeleton className="h-56 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={emailSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Sent" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Failed" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Active sessions + errors */}
          <div className="grid grid-cols-1 gap-3">
            <StatCard icon={Activity} label="Active sessions (24h actors)" value={activeSessions} loading={recentActivityQ.isLoading} />
            <StatCard
              icon={AlertTriangle} label="24h errors logged"
              value={h?.last_24h_errors_logged ?? 0}
              tone={(h?.last_24h_errors_logged ?? 0) > 0 ? "danger" : "default"}
              loading={isLoading}
            />
            <div className="border border-border rounded-xl p-4 bg-card">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Errors backend</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Granular error timelines stream to Sentry. Once <code>VITE_OBSERVABILITY_SENTRY_DSN</code> is set, real-time alerts arrive in the configured Sentry project.
              </p>
            </div>
          </div>
        </div>

        {/* Edge function checklist */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <ServerCog className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Edge functions</h2>
            <span className="text-[11px] text-muted-foreground ml-auto">Static checklist — wire `/health` probes to flip these to live</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3">
            {EDGE_FUNCTIONS.map((fn) => (
              <div key={fn} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/10 text-[12px]">
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                <code className="font-mono">{fn}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Communications summary */}
        <div className="border border-border rounded-xl bg-card p-4 sm:p-5 flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">
            Total successful deliveries (all time): <strong className="text-foreground">{h?.total_communications_sent ?? 0}</strong>
            {" · "}
            Outbound failures last 24h: <strong className="text-foreground">{h?.last_24h_failed_email_count ?? 0}</strong>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
