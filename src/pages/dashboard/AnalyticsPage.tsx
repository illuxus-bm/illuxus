import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import {
  BarChart3, Calendar, DollarSign, TrendingUp, Ticket, PieChart,
  Users, CheckCircle2, Percent, CalendarClock, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import { useOrg } from "@/contexts/OrgContext";
import { formatMoney, DEFAULT_EVENT_CURRENCY } from "@/lib/currency";
import { convert, useFxRates } from "@/lib/fx";
import { CurrencySwitcher, getStoredDisplayCurrency } from "@/components/CurrencySwitcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Event = Tables<"events">;
type RegRow = Pick<Tables<"registrations">, "event_id" | "status" | "amount_paid" | "created_at">;

// Statuses that represent a real, paying/attending ticket
const PAID_STATUSES = new Set(["confirmed", "approved", "registered", "paid", "checked_in"]);
const CHECKED_IN_STATUSES = new Set(["checked_in"]);

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444"];

type RangeKey = "7d" | "30d" | "90d" | "ytd" | "all";
const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7d", "30d": "30d", "90d": "90d", ytd: "YTD", all: "All",
};

function rangeStart(range: RangeKey): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

function DeltaChip({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-[10px] text-muted-foreground font-mono">—</span>;
  }
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md",
      positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
    )}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

const AnalyticsPage = () => {
  const { org } = useOrg();
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<RegRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { rates } = useFxRates();
  const [displayCcy, setDisplayCcy] = useState<string>(() => getStoredDisplayCurrency(DEFAULT_EVENT_CURRENCY));
  const [range, setRange] = useState<RangeKey>("30d");
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    if (!org?.id) return;
    const fetchAll = async () => {
      setLoading(true);
      const { data: evs } = await supabase
        .from("events")
        .select("*")
        .eq("org_id", org.id)
        .order("date", { ascending: true });
      const eventList = evs ?? [];
      setEvents(eventList);

      if (eventList.length > 0) {
        const { data: regs } = await supabase
          .from("registrations")
          .select("event_id,status,amount_paid,created_at")
          .in("event_id", eventList.map(e => e.id));
        setRegistrations(regs ?? []);
      } else {
        setRegistrations([]);
      }
      setLoading(false);
    };
    fetchAll();
  }, [org?.id]);

  const eventCurrencies = useMemo(
    () => Array.from(new Set(events.map(e => (e.currency || DEFAULT_EVENT_CURRENCY).toUpperCase()))),
    [events]
  );

  const analytics = useMemo(() => {
    const eventById = new Map(events.map(e => [e.id, e]));
    const start = rangeStart(range);
    const now = new Date();
    const filteredEvents = eventFilter === "all" ? events : events.filter(e => e.id === eventFilter);
    const allowedEventIds = new Set(filteredEvents.map(e => e.id));

    const toDisplay = (amt: number, ccy: string) => convert(amt, ccy, displayCcy, rates) ?? amt;

    // Current vs previous period registrations
    const periodMs = start ? now.getTime() - start.getTime() : 0;
    const prevStart = start ? new Date(start.getTime() - periodMs) : null;

    let currRevenue = 0, currTickets = 0;
    let prevRevenue = 0, prevTickets = 0;
    let totalRegistrations = 0, paidRegistrations = 0, checkedIn = 0;

    const perEvent = new Map<string, { tickets: number; revenueNative: number; currency: string; revenueDisplay: number; checkedIn: number }>();
    const statusCounts = new Map<string, number>();
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const dailyMap = new Map<string, { revenue: number; tickets: number; date: Date }>();

    for (const r of registrations) {
      if (!allowedEventIds.has(r.event_id)) continue;
      const ev = eventById.get(r.event_id);
      const ccy = (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
      const amt = Number(r.amount_paid || 0);
      const display = toDisplay(amt, ccy);
      const d = new Date(r.created_at);
      const inCurr = !start || d >= start;
      const inPrev = prevStart && d >= prevStart && start && d < start;

      statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
      if (inCurr) totalRegistrations++;

      if (PAID_STATUSES.has(r.status)) {
        if (inCurr) {
          paidRegistrations++;
          currRevenue += display;
          currTickets++;
          dayOfWeek[d.getDay()]++;
          const key = d.toISOString().slice(0, 10);
          const cur = dailyMap.get(key) || { revenue: 0, tickets: 0, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
          cur.revenue += display; cur.tickets++;
          dailyMap.set(key, cur);
        }
        if (inPrev) {
          prevRevenue += display;
          prevTickets++;
        }

        const agg = perEvent.get(r.event_id) || { tickets: 0, revenueNative: 0, currency: ccy, revenueDisplay: 0, checkedIn: 0 };
        agg.tickets++; agg.revenueNative += amt; agg.revenueDisplay += display;
        if (CHECKED_IN_STATUSES.has(r.status)) agg.checkedIn++;
        perEvent.set(r.event_id, agg);
      }
      if (CHECKED_IN_STATUSES.has(r.status) && inCurr) checkedIn++;
    }

    const totalEvents = filteredEvents.length;
    const publishedCount = filteredEvents.filter(e => e.status === "published").length;
    const upcomingCount = filteredEvents.filter(e => new Date(e.date) > now && e.status !== "cancelled").length;
    const checkInRate = paidRegistrations > 0 ? (checkedIn / paidRegistrations) * 100 : 0;
    const conversionRate = totalRegistrations > 0 ? (paidRegistrations / totalRegistrations) * 100 : 0;
    const avgTicket = currTickets > 0 ? currRevenue / currTickets : 0;

    // Status distribution (events)
    const eventStatusData = ["draft", "published", "cancelled", "completed"].map(status => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: filteredEvents.filter(e => e.status === status).length,
    })).filter(d => d.value > 0);

    // Registration status pie
    const regStatusData = Array.from(statusCounts.entries())
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value);

    // Revenue by event
    const revenueData = filteredEvents
      .map(e => {
        const agg = perEvent.get(e.id);
        return {
          name: e.title.length > 15 ? e.title.slice(0, 15) + "…" : e.title,
          fullName: e.title,
          revenue: agg?.revenueDisplay ?? 0,
          revenueNative: agg?.revenueNative ?? 0,
          nativeCurrency: agg?.currency ?? (e.currency || DEFAULT_EVENT_CURRENCY).toUpperCase(),
          tickets: agg?.tickets ?? 0,
          capacity: e.capacity ?? null,
          fillRate: e.capacity && e.capacity > 0 ? Math.min(100, ((agg?.tickets ?? 0) / e.capacity) * 100) : null,
          checkInRate: agg && agg.tickets > 0 ? (agg.checkedIn / agg.tickets) * 100 : 0,
        };
      })
      .filter(d => d.revenue > 0 || d.tickets > 0)
      .sort((a, b) => b.revenue - a.revenue);

    const topEvents = revenueData.slice(0, 5);

    // Daily trend within selected range, with cumulative
    const dailyData = Array.from(dailyMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(d => ({
        label: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        date: d.date.getTime(),
        revenue: d.revenue,
        tickets: d.tickets,
      }));
    let cum = 0;
    const cumulativeData = dailyData.map(d => {
      cum += d.revenue;
      return { label: d.label, cumulative: cum };
    });

    // Day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowData = dayOfWeek.map((v, i) => ({ name: dayNames[i], tickets: v }));

    // Sparkline data for KPI cards: split current period into ~12 buckets
    const sparkBuckets = 12;
    const sparkStart = start ?? (dailyData[0] ? new Date(dailyData[0].date) : new Date(now.getTime() - 30 * 86400000));
    const bucketSize = Math.max(1, (now.getTime() - sparkStart.getTime()) / sparkBuckets);
    const revSpark = Array.from({ length: sparkBuckets }, (_, i) => ({ i, v: 0 }));
    const ticketSpark = Array.from({ length: sparkBuckets }, (_, i) => ({ i, v: 0 }));
    dailyData.forEach(d => {
      const idx = Math.min(sparkBuckets - 1, Math.max(0, Math.floor((d.date - sparkStart.getTime()) / bucketSize)));
      revSpark[idx].v += d.revenue;
      ticketSpark[idx].v += d.tickets;
    });

    return {
      totalEvents, publishedCount, upcomingCount,
      currRevenue, currTickets, prevRevenue, prevTickets,
      avgTicket, conversionRate, checkInRate, checkedIn,
      eventStatusData, regStatusData, revenueData, topEvents,
      dailyData, cumulativeData, dowData,
      revSpark, ticketSpark,
    };
  }, [events, registrations, range, eventFilter, displayCcy, rates]);

  const kpis = [
    {
      icon: DollarSign, label: "Revenue",
      value: formatMoney(analytics.currRevenue, displayCcy),
      delta: pctChange(analytics.currRevenue, analytics.prevRevenue),
      spark: analytics.revSpark,
    },
    {
      icon: Ticket, label: "Tickets Sold",
      value: analytics.currTickets.toLocaleString(),
      delta: pctChange(analytics.currTickets, analytics.prevTickets),
      spark: analytics.ticketSpark,
    },
    {
      icon: TrendingUp, label: "Avg. Ticket",
      value: formatMoney(analytics.avgTicket, displayCcy),
      delta: null as number | null,
      spark: analytics.revSpark,
    },
    {
      icon: Percent, label: "Conversion",
      value: `${analytics.conversionRate.toFixed(1)}%`,
      delta: null,
      spark: analytics.ticketSpark,
    },
    {
      icon: Calendar, label: "Total Events",
      value: analytics.totalEvents.toLocaleString(),
      delta: null,
    },
    {
      icon: BarChart3, label: "Published",
      value: analytics.publishedCount.toLocaleString(),
      delta: null,
    },
    {
      icon: CalendarClock, label: "Upcoming",
      value: analytics.upcomingCount.toLocaleString(),
      delta: null,
    },
    {
      icon: CheckCircle2, label: "Check-in Rate",
      value: `${analytics.checkInRate.toFixed(1)}%`,
      delta: null,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1280px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
            <p className="text-[13px] text-muted-foreground">
              Insights and performance metrics
              {eventCurrencies.length > 1 && (
                <span className="ml-2 text-[11px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  mixed: {eventCurrencies.join(" · ")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setRange(k)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-mono rounded transition-colors",
                    range === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {RANGE_LABELS[k]}
                </button>
              ))}
            </div>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CurrencySwitcher value={displayCcy} onChange={setDisplayCcy} extra={eventCurrencies} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-xl p-4 card-shadow select-none"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xl font-semibold font-mono tabular-nums">{stat.value}</div>
                <DeltaChip value={stat.delta ?? null} />
              </div>
              {stat.spark && stat.spark.some(p => p.v > 0) && (
                <div className="h-7 mt-2 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stat.spark}>
                      <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No data yet</h3>
            <p className="text-muted-foreground">Create events to see analytics.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 select-none">
            {/* Revenue & Tickets trend */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" /> Revenue & Tickets
                </h3>
                <span className="text-[11px] text-muted-foreground font-mono">{RANGE_LABELS[range]}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={analytics.dailyData}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="rev" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as any)} />
                  <YAxis yAxisId="tix" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: any, name: any) => {
                      if (name === "revenue") return [formatMoney(Number(value), displayCcy), "Revenue"];
                      if (name === "tickets") return [value, "Tickets"];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revFill)" />
                  <Line yAxisId="tix" type="monotone" dataKey="tickets" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Event */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" /> Revenue by Event
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.revenueData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as any)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: any, name: any, item: any) => {
                      if (name === "revenue") {
                        const native = item?.payload?.revenueNative ?? 0;
                        const ccy = item?.payload?.nativeCurrency ?? displayCcy;
                        const main = formatMoney(Number(value), displayCcy);
                        const sub = ccy !== displayCcy ? ` (${formatMoney(native, ccy)})` : "";
                        return [main + sub, "Revenue"];
                      }
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Registration Status */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-muted-foreground" /> Registration Status
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <RPieChart>
                  <Pie
                    data={analytics.regStatusData}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    dataKey="value" paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                    style={{ outline: "none" }}
                  >
                    {analytics.regStatusData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} style={{ outline: "none" }} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                </RPieChart>
              </ResponsiveContainer>
            </div>

            {/* Day-of-week */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" /> Registrations by Day of Week
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.dowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="tickets" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cumulative revenue */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" /> Cumulative Revenue
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={analytics.cumulativeData}>
                  <defs>
                    <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as any)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: any) => [formatMoney(Number(value), displayCcy), "Total"]}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cumFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top events table */}
            <div className="bg-card border border-border rounded-xl p-5 card-shadow lg:col-span-2">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" /> Top Events
              </h3>
              {analytics.topEvents.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No paid registrations yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="py-2 font-medium">Event</th>
                        <th className="py-2 font-medium text-right">Tickets</th>
                        <th className="py-2 font-medium text-right">Revenue</th>
                        <th className="py-2 font-medium text-right">Fill rate</th>
                        <th className="py-2 font-medium text-right">Check-in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topEvents.map((e, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-2.5 font-medium">{e.fullName}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{e.tickets}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(e.revenue, displayCcy)}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                            {e.fillRate !== null ? `${e.fillRate.toFixed(0)}%` : "—"}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                            {e.checkInRate.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
