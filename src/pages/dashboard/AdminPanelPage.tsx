/**
 * AdminPanelPage — super-admin control tower home.
 *
 * Rebuilt as a navigation grid for the full admin suite. Surfaces:
 *   • 4 headline KPIs (users, orgs, events, MRR) from admin_health_snapshot
 *     + admin_revenue_summary.
 *   • Recent activity widget (last 10 audit log entries).
 *   • 10 card grid linking out to every admin surface in the platform.
 *
 * Mounted at `/dashboard/admin` behind `SuperAdminRoute`.
 */
import { Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Building2, Calendar, DollarSign, Activity, ScrollText,
  Mail, Heart, Edit, BarChart3, ArrowRight,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";

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

interface RevenueSummary {
  gross_revenue: number;
  platform_fees: number;
  refunds_issued: number;
  net_revenue: number;
  mrr: number;
  ticket_count_paid: number;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/* ─── UI helpers ────────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function KpiCard({
  icon: Icon, label, value, loading,
}: {
  icon: React.ElementType; label: string; value: string | number; loading?: boolean;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
    </div>
  );
}

interface NavCard {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
  tone: string;
}

function NavCard({ to, icon: Icon, title, description, badge, tone }: NavCard) {
  return (
    <Link
      to={to}
      className="group border border-border rounded-xl p-4 bg-card hover:bg-muted/30 hover:border-foreground/20 transition-all flex items-start gap-3"
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
        <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{description}</p>
        {badge && (
          <Badge variant="secondary" className="text-[10px] mt-2">{badge}</Badge>
        )}
      </div>
    </Link>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function AdminPanelPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  const healthQ = useQuery({
    queryKey: ["admin-panel-health"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<HealthSnapshot[]>("admin_health_snapshot");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const revenueQ = useQuery({
    queryKey: ["admin-panel-revenue"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<RevenueSummary[]>("admin_revenue_summary");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const recentQ = useQuery({
    queryKey: ["admin-panel-recent"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<AuditEntry[]>("admin_recent_activity", { _limit: 10 });
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const h = healthQ.data;
  const r = revenueQ.data;
  const isLoading = healthQ.isLoading || revenueQ.isLoading;

  const navCards: NavCard[] = [
    { to: "/dashboard/admin/analytics",     icon: BarChart3,    title: "Analytics",         description: "Growth, organisers, event performance",                tone: "bg-indigo-500/10 text-indigo-500" },
    { to: "/dashboard/admin/users",         icon: Users,        title: "User Management",   description: "Search, ban, promote, reset, delete users",            badge: h ? `${h.total_users.toLocaleString()} users` : undefined, tone: "bg-blue-500/10 text-blue-500" },
    { to: "/dashboard/admin/organizations", icon: Building2,    title: "Organizations",     description: "Plans, owners, members, revenue per org",              badge: h ? `${h.total_orgs.toLocaleString()} orgs` : undefined,  tone: "bg-amber-500/10 text-amber-500" },
    { to: "/dashboard/admin/events",        icon: Calendar,     title: "Events Moderation", description: "Force unpublish or soft-delete any event",             badge: h ? `${h.total_events.toLocaleString()} events` : undefined, tone: "bg-violet-500/10 text-violet-500" },
    { to: "/dashboard/admin/revenue",       icon: DollarSign,   title: "Revenue",           description: "Gross, fees, refunds, MRR, top earners",               badge: r ? `$${Math.round(r.mrr).toLocaleString()} MRR` : undefined, tone: "bg-green-500/10 text-green-500" },
    { to: "/dashboard/admin/activity",      icon: Activity,     title: "Activity Feed",     description: "Live audit stream across every table",                 tone: "bg-cyan-500/10 text-cyan-500" },
    { to: "/dashboard/admin/audit",         icon: ScrollText,   title: "Audit Log",         description: "Searchable history of privileged actions",             tone: "bg-foreground/10 text-foreground" },
    { to: "/dashboard/admin/tickets",       icon: Mail,         title: "Support Tickets",   description: "Contact-form queue, replies, status",                  tone: "bg-rose-500/10 text-rose-500" },
    { to: "/dashboard/admin/system",        icon: Heart,        title: "System Health",     description: "DB size, signups, edge functions, email failures",     tone: "bg-pink-500/10 text-pink-500" },
    { to: "/dashboard/admin/site",          icon: Edit,         title: "Site Editor",       description: "Edit the marketing landing page content",              tone: "bg-orange-500/10 text-orange-500" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Super Admin · Control Tower</h1>
            <p className="text-xs text-muted-foreground">Full visibility and override over the platform</p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Users}      label="Users"  value={(h?.total_users ?? 0).toLocaleString()}  loading={isLoading} />
          <KpiCard icon={Building2}  label="Orgs"   value={(h?.total_orgs ?? 0).toLocaleString()}   loading={isLoading} />
          <KpiCard icon={Calendar}   label="Events" value={(h?.total_events ?? 0).toLocaleString()} loading={isLoading} />
          <KpiCard icon={DollarSign} label="MRR"    value={`$${Math.round(r?.mrr ?? 0).toLocaleString()}`} loading={revenueQ.isLoading} />
        </div>

        {/* Recent activity widget */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-cyan-500" />
              <h2 className="text-sm font-semibold">Recent activity</h2>
            </div>
            <Link to="/dashboard/admin/activity" className="text-[11px] text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {recentQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="p-3"><Skeleton className="h-6 w-full" /></li>
              ))
            ) : (recentQ.data ?? []).length === 0 ? (
              <li className="p-6 text-center text-muted-foreground text-sm">No recent activity</li>
            ) : (
              (recentQ.data ?? []).map((e) => (
                <li key={e.id} className="p-3 flex items-center gap-3 hover:bg-muted/20">
                  <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{e.action}</Badge>
                  <span className="text-[12px] truncate flex-1">{e.actor_email || "system"}</span>
                  {e.target_type && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 hidden md:inline">
                      {e.target_type}:{(e.target_id || "").slice(0, 8)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Navigation grid */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Surfaces</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {navCards.map((c) => <NavCard key={c.to} {...c} />)}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
