import { useState, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Users, Building2, Calendar, Ticket, TrendingUp, TrendingDown,
  ArrowLeft, BarChart3, Info,
} from "lucide-react";
import { format, subMonths, startOfMonth, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/observability";

/* ------------------------------------------------------------------ */
/* Helpers                                                               */
/* ------------------------------------------------------------------ */

function monthKey(dateStr: string) {
  return format(startOfMonth(parseISO(dateStr)), "yyyy-MM");
}

function buildMonthBuckets(createdAts: string[], label: string) {
  const counts: Record<string, number> = {};
  for (const d of createdAts) {
    const k = monthKey(d);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function last12MonthKeys() {
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    keys.push(format(startOfMonth(subMonths(new Date(), i)), "yyyy-MM"));
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                              */
/* ------------------------------------------------------------------ */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

/* ------------------------------------------------------------------ */
/* KPI card                                                              */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  delta?: number | null;
  loading?: boolean;
}

function KpiCard({ icon: Icon, label, value, delta, loading }: KpiCardProps) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p className="text-2xl font-bold tracking-tight">{value}</p>
      )}
      {delta != null && !loading && (
        <div className={`flex items-center gap-1 text-[11px] font-medium ${delta >= 0 ? "text-green-600" : "text-destructive"}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? "+" : ""}{delta}% vs last month
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data fetching hooks                                                   */
/* ------------------------------------------------------------------ */

function useProfiles() {
  return useQuery({
    queryKey: ["admin-analytics-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, account_type, created_at, display_name, first_name, last_name, onboarding_completed")
        .order("created_at", { ascending: true });
      if (error) {
        logger.error("admin-analytics: profiles fetch failed", { error_message: error.message });
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function useEvents() {
  return useQuery({
    queryKey: ["admin-analytics-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, status, tickets_sold, capacity, price, currency, date, created_at, org_id, user_id")
        .order("created_at", { ascending: false });
      if (error) {
        logger.error("admin-analytics: events fetch failed", { error_message: error.message });
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function useRegistrations() {
  return useQuery({
    queryKey: ["admin-analytics-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, user_id, event_id, name, email, created_at, status, amount_paid")
        .order("created_at", { ascending: false });
      if (error) {
        logger.error("admin-analytics: registrations fetch failed", { error_message: error.message });
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function useOrganizations() {
  return useQuery({
    queryKey: ["admin-analytics-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, owner_id, created_at");
      if (error) {
        logger.error("admin-analytics: orgs fetch failed", { error_message: error.message });
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Main page                                                             */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

export default function PlatformAnalyticsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [orgSearch, setOrgSearch] = useState("");
  const [orgPage, setOrgPage] = useState(0);
  const [eventSort, setEventSort] = useState<"date" | "tickets">("date");

  const profilesQ = useProfiles();
  const eventsQ = useEvents();
  const regsQ = useRegistrations();
  const orgsQ = useOrganizations();

  const profiles = profilesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const registrations = regsQ.data ?? [];
  const orgs = orgsQ.data ?? [];

  /* --- KPI deltas --------------------------------------------------- */
  const now = new Date();
  const thisMonthStart = startOfMonth(now).toISOString();
  const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString();

  const totalUsers = profiles.length;
  const totalOrganisers = profiles.filter((p) => p.account_type === "organizer").length;
  const totalEvents = events.length;
  const totalTickets = events.reduce((s, e) => s + (e.tickets_sold ?? 0), 0);

  const usersThisMonth = profiles.filter((p) => p.created_at >= thisMonthStart).length;
  const usersLastMonth = profiles.filter(
    (p) => p.created_at >= lastMonthStart && p.created_at < thisMonthStart,
  ).length;
  const usersDelta = usersLastMonth === 0 ? null : Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100);

  /* --- Growth chart data -------------------------------------------- */
  const growthData = useMemo(() => {
    const allBuckets = buildMonthBuckets(profiles.map((p) => p.created_at), "all");
    const orgBuckets = buildMonthBuckets(
      profiles.filter((p) => p.account_type === "organizer").map((p) => p.created_at),
      "organizers",
    );
    return last12MonthKeys().map((k) => ({
      month: format(parseISO(`${k}-01`), "MMM yy"),
      "All users": allBuckets[k] ?? 0,
      Organisers: orgBuckets[k] ?? 0,
    }));
  }, [profiles]);

  /* --- Organiser table ---------------------------------------------- */
  const organiserRows = useMemo(() => {
    return profiles
      .filter((p) => p.account_type === "organizer")
      .map((p) => {
        const org = orgs.find((o) => o.owner_id === p.user_id);
        const ownedEvents = events.filter((e) => e.user_id === p.user_id);
        const ticketsSold = ownedEvents.reduce((s, e) => s + (e.tickets_sold ?? 0), 0);
        return {
          userId: p.user_id,
          name: p.display_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ") ?? "—",
          org: org?.name ?? "—",
          eventCount: ownedEvents.length,
          ticketsSold,
          joined: p.created_at,
          active: p.onboarding_completed,
        };
      });
  }, [profiles, orgs, events]);

  const filteredOrganisers = useMemo(() => {
    if (!orgSearch) return organiserRows;
    const q = orgSearch.toLowerCase();
    return organiserRows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.org.toLowerCase().includes(q),
    );
  }, [organiserRows, orgSearch]);

  const pagedOrganisers = filteredOrganisers.slice(orgPage * PAGE_SIZE, (orgPage + 1) * PAGE_SIZE);
  const totalOrgPages = Math.ceil(filteredOrganisers.length / PAGE_SIZE);

  /* --- Top attendees ------------------------------------------------- */
  const topAttendees = useMemo(() => {
    const map: Record<string, { count: number; lastDate: string; name: string; email: string; events: Set<string> }> = {};
    for (const r of registrations) {
      const key = r.user_id ?? r.email;
      if (!map[key]) {
        map[key] = { count: 0, lastDate: r.created_at, name: r.name, email: r.email, events: new Set() };
      }
      map[key].count++;
      map[key].events.add(r.event_id);
      if (r.created_at > map[key].lastDate) map[key].lastDate = r.created_at;
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((v) => ({ ...v, eventCount: v.events.size }));
  }, [registrations]);

  /* --- Event performance -------------------------------------------- */
  const sortedEvents = useMemo(() => {
    const copy = [...events];
    if (eventSort === "tickets") copy.sort((a, b) => (b.tickets_sold ?? 0) - (a.tickets_sold ?? 0));
    else copy.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return copy;
  }, [events, eventSort]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const isLoading = profilesQ.isLoading || eventsQ.isLoading || regsQ.isLoading || orgsQ.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            to="/dashboard/admin"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
          </Link>
          <div className="flex items-center gap-2 ml-1">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <BarChart3 className="h-4.5 w-4.5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Platform Analytics</h1>
              <p className="text-xs text-muted-foreground">Real-time data across all organisations</p>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Users} label="Total Users" value={totalUsers} delta={usersDelta} loading={isLoading} />
          <KpiCard icon={Building2} label="Organisers" value={totalOrganisers} loading={isLoading} />
          <KpiCard icon={Calendar} label="Total Events" value={totalEvents} loading={isLoading} />
          <KpiCard icon={Ticket} label="Tickets Sold" value={totalTickets} loading={isLoading} />
        </div>

        {/* User growth chart */}
        <div className="border border-border rounded-xl bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4">User Growth — Last 12 Months</h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={growthData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="colorAll" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOrg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="All users" stroke="#6366f1" fill="url(#colorAll)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Organisers" stroke="#22c55e" fill="url(#colorOrg)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Organisers table */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold">Organisers</h2>
            <Input
              placeholder="Search by name or org…"
              value={orgSearch}
              onChange={(e) => { setOrgSearch(e.target.value); setOrgPage(0); }}
              className="h-8 w-56 text-xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Organisation</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Events</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Tickets</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Joined</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : pagedOrganisers.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No results</td></tr>
                ) : pagedOrganisers.map((r) => (
                  <tr key={r.userId} className="border-b border-border/50 hover:bg-muted/20 cursor-default transition-colors">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{r.org}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{r.eventCount}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{r.ticketsSold}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {format(parseISO(r.joined), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`text-[10px] ${r.active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalOrgPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <span>{filteredOrganisers.length} total</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOrgPage((p) => Math.max(0, p - 1))}
                  disabled={orgPage === 0}
                  className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >Prev</button>
                <span>{orgPage + 1} / {totalOrgPages}</span>
                <button
                  onClick={() => setOrgPage((p) => Math.min(totalOrgPages - 1, p + 1))}
                  disabled={orgPage >= totalOrgPages - 1}
                  className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Top attendees */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Top Delegates / Attendees</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">By total tickets purchased</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Email</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Events</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Tickets</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Last active</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : topAttendees.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No registrations yet</td></tr>
                ) : topAttendees.map((a, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{a.email}</td>
                    <td className="px-4 py-3">{a.eventCount}</td>
                    <td className="px-4 py-3 font-semibold">{a.count}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {format(parseISO(a.lastDate), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Event performance */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold">Event Performance</h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Sort:
              {(["date", "tickets"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setEventSort(s)}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    eventSort === s
                      ? "border-indigo-500 text-indigo-600 bg-indigo-500/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s === "date" ? "Date" : "Tickets sold"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Title</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Tickets / Cap</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={4} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : sortedEvents.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No events yet</td></tr>
                ) : sortedEvents.map((ev) => {
                  const statusColor: Record<string, string> = {
                    published: "bg-green-500/10 text-green-600",
                    draft: "bg-muted text-muted-foreground",
                    cancelled: "bg-destructive/10 text-destructive",
                    ended: "bg-amber-500/10 text-amber-600",
                  };
                  return (
                    <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">{ev.title}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`text-[10px] ${statusColor[ev.status] ?? "bg-muted text-muted-foreground"}`}>
                          {ev.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {ev.tickets_sold ?? 0}
                        {ev.capacity ? <span className="text-muted-foreground"> / {ev.capacity}</span> : ""}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {format(parseISO(ev.date), "MMM d, yyyy")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cookie consent stats note */}
        <div className="border border-border rounded-xl bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold mb-1">Cookie Consent Tracking</h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Cookie consent is stored client-side in <code className="text-[11px] bg-muted rounded px-1 py-0.5">localStorage</code> under{" "}
                <code className="text-[11px] bg-muted rounded px-1 py-0.5">illuxus:cookie-consent</code>.
                Server-side aggregate tracking (accepted / declined / pending counts) requires a{" "}
                <code className="text-[11px] bg-muted rounded px-1 py-0.5">consent_logs</code> table and an Edge Function to receive beacons.
              </p>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
