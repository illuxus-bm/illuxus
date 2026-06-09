import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOrg } from "@/contexts/OrgContext";
import { formatMoney, DEFAULT_EVENT_CURRENCY } from "@/lib/currency";
import { convert, useFxRates } from "@/lib/fx";
import { CurrencySwitcher, getStoredDisplayCurrency } from "@/components/CurrencySwitcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  Download, FileText, Users, DollarSign, Ticket, TrendingUp,
  CheckCircle2, XCircle, Loader2, Calendar, BarChart3, Target,
  ArrowUpRight, Percent, RefreshCw,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = Tables<"events">;
type RegRow   = Tables<"registrations">;

interface SpeakerAttendee {
  name: string;
  email: string | null;
  company: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  event_title: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

// Statuses that represent a completed/paying registration
const ACTIVE_STATUSES = new Set(["confirmed", "approved", "registered", "paid", "checked_in"]);

// ─── CSV helper ───────────────────────────────────────────────────────────────

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv, ""], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = "text-foreground",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className={`text-xl font-semibold font-mono tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, action, children, full,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", full && "lg:col-span-2")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReportsPage = () => {
  const { org } = useOrg();
  const { rates } = useFxRates();
  const [displayCcy, setDisplayCcy] = useState<string>(() =>
    getStoredDisplayCurrency(DEFAULT_EVENT_CURRENCY),
  );

  // Data
  const [events,        setEvents]        = useState<EventRow[]>([]);
  const [registrations, setRegistrations] = useState<RegRow[]>([]);
  const [speakers,      setSpeakers]      = useState<SpeakerAttendee[]>([]);
  const [loading,       setLoading]       = useState(true);

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    if (!org?.id) return;
    setLoading(true);

    const { data: evs } = await supabase
      .from("events")
      .select("*")
      .eq("org_id", org.id)
      .order("date", { ascending: false });

    const eventList = (evs ?? []) as EventRow[];
    setEvents(eventList);

    if (eventList.length === 0) { setLoading(false); return; }

    const eventIds = eventList.map((e) => e.id);

    // Registrations scoped to org events
    const { data: regs } = await supabase
      .from("registrations")
      .select("*")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    setRegistrations((regs ?? []) as RegRow[]);

    // Speaker attendance — join event_speakers → speakers → registrations by email
    const { data: esRows } = await supabase
      .from("event_speakers")
      .select("speaker_id, event_id, speakers(name, email, company)")
      .in("event_id", eventIds);

    const regByEmail = new Map<string, RegRow>();
    for (const r of (regs ?? []) as RegRow[]) {
      if (r.email) regByEmail.set(`${r.event_id}:${r.email.toLowerCase()}`, r);
    }
    const eventTitleMap = new Map(eventList.map((e) => [e.id, e.title]));

    type ESRow = {
      speaker_id: string;
      event_id: string;
      speakers: { name: string; email: string | null; company: string | null } | null;
    };

    const spkRows: SpeakerAttendee[] = ((esRows ?? []) as ESRow[])
      .filter((r) => r.speakers)
      .map((r) => {
        const sp  = r.speakers!;
        const reg = sp.email
          ? regByEmail.get(`${r.event_id}:${sp.email.toLowerCase()}`)
          : undefined;
        return {
          name:          sp.name,
          email:         sp.email,
          company:       sp.company,
          checked_in:    !!reg?.checked_in,
          checked_in_at: reg?.checked_in_at ?? null,
          event_title:   eventTitleMap.get(r.event_id) ?? "Unknown",
        };
      });

    setSpeakers(spkRows);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [org?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ─────────────────────────────────────────────────────────

  const uniqueCurrencies = useMemo(
    () => Array.from(new Set(events.map((e) => (e.currency || DEFAULT_EVENT_CURRENCY).toUpperCase()))),
    [events],
  );

  const toDisplay = (amount: number, ccy: string) =>
    convert(amount, ccy, displayCcy, rates) ?? amount;

  const filteredRegs = useMemo(() => {
    let r = registrations;
    if (eventFilter  !== "all") r = r.filter((x) => x.event_id === eventFilter);
    if (statusFilter !== "all") r = r.filter((x) => x.status   === statusFilter);
    return r;
  }, [registrations, eventFilter, statusFilter]);

  const filteredEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.id === eventFilter)),
    [events, eventFilter],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const activeRegs   = filteredRegs.filter((r) => ACTIVE_STATUSES.has(r.status));
    const checkedIn    = filteredRegs.filter((r) => r.checked_in).length;
    const totalRevDisp = activeRegs.reduce((s, r) => {
      const ev  = events.find((e) => e.id === r.event_id);
      const ccy = (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
      return s + toDisplay(Number(r.amount_paid || 0), ccy);
    }, 0);
    const avgTicket = activeRegs.length ? totalRevDisp / activeRegs.length : 0;
    const convRate  = filteredRegs.length
      ? (activeRegs.length / filteredRegs.length) * 100
      : 0;
    const checkRate = activeRegs.length ? (checkedIn / activeRegs.length) * 100 : 0;

    return { totalRegs: filteredRegs.length, activeRegs: activeRegs.length, totalRevDisp, avgTicket, convRate, checkRate, checkedIn };
  }, [filteredRegs, events, displayCcy, rates]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart data ────────────────────────────────────────────────────────────

  const dailyTrend = useMemo(() => {
    const map = new Map<string, { tickets: number; revenue: number }>();
    for (const r of filteredRegs) {
      if (!ACTIVE_STATUSES.has(r.status)) continue;
      const day = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const ev  = events.find((e) => e.id === r.event_id);
      const ccy = (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
      const rev = toDisplay(Number(r.amount_paid || 0), ccy);
      const cur = map.get(day) ?? { tickets: 0, revenue: 0 };
      map.set(day, { tickets: cur.tickets + 1, revenue: cur.revenue + rev });
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }, [filteredRegs, events, displayCcy, rates]);   // eslint-disable-line react-hooks/exhaustive-deps

  const statusPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRegs) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRegs]);

  const revenueByEvent = useMemo(() => {
    const map = new Map<string, { title: string; revenue: number; tickets: number }>();
    for (const r of filteredRegs) {
      if (!ACTIVE_STATUSES.has(r.status)) continue;
      const ev  = events.find((e) => e.id === r.event_id);
      if (!ev)  continue;
      const ccy = (ev.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
      const rev = toDisplay(Number(r.amount_paid || 0), ccy);
      const cur = map.get(ev.id) ?? { title: ev.title, revenue: 0, tickets: 0 };
      map.set(ev.id, { ...cur, revenue: cur.revenue + rev, tickets: cur.tickets + 1 });
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((d) => ({ ...d, name: d.title.length > 18 ? d.title.slice(0, 18) + "…" : d.title }));
  }, [filteredRegs, events, displayCcy, rates]);   // eslint-disable-line react-hooks/exhaustive-deps

  const checkInByEvent = useMemo(() =>
    filteredEvents.map((ev) => {
      const evRegs     = filteredRegs.filter((r) => r.event_id === ev.id && ACTIVE_STATUSES.has(r.status));
      const checkedIn  = evRegs.filter((r) => r.checked_in).length;
      const rate       = evRegs.length ? Math.round((checkedIn / evRegs.length) * 100) : 0;
      return { name: ev.title.length > 18 ? ev.title.slice(0, 18) + "…" : ev.title, rate, checkedIn, total: evRegs.length };
    }).filter((d) => d.total > 0),
  [filteredEvents, filteredRegs]);

  // ── Export handlers ───────────────────────────────────────────────────────

  const exportRegistrations = () => {
    downloadCsv(
      `registrations-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Email", "Event", "Ticket Type", "Status", "Approval", "Amount Paid", "Checked In", "Checked In At", "Registered At"],
      filteredRegs.map((r) => {
        const ev = events.find((e) => e.id === r.event_id);
        return [
          r.name, r.email, ev?.title ?? r.event_id, r.ticket_type,
          r.status, r.approval_status,
          formatMoney(Number(r.amount_paid || 0), ev?.currency || DEFAULT_EVENT_CURRENCY),
          r.checked_in ? "Yes" : "No", r.checked_in_at ?? "",
          new Date(r.created_at).toLocaleString(),
        ];
      }),
    );
  };

  const exportSpeakers = () => {
    const rows = eventFilter === "all"
      ? speakers
      : speakers.filter((s) => {
          const ev = events.find((e) => e.id === eventFilter);
          return ev ? s.event_title === ev.title : true;
        });
    downloadCsv(
      `speakers-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Email", "Company", "Event", "Attended", "Checked In At"],
      rows.map((s) => [s.name, s.email ?? "", s.company ?? "", s.event_title, s.checked_in ? "Yes" : "No", s.checked_in_at ?? ""]),
    );
  };

  const exportFinancial = () => {
    downloadCsv(
      `financial-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Event", "Tickets Sold", `Revenue (${displayCcy})`, "Avg Ticket", "Fill Rate"],
      revenueByEvent.map((row) => {
        const ev  = events.find((e) => e.title === row.title || e.title.startsWith(row.name.replace("…", "")));
        const cap = ev?.capacity ?? null;
        return [
          row.title,
          row.tickets,
          formatMoney(row.revenue, displayCcy),
          formatMoney(row.tickets ? row.revenue / row.tickets : 0, displayCcy),
          cap ? `${Math.round((row.tickets / cap) * 100)}%` : "—",
        ];
      }),
    );
  };

  const exportFullReport = () => {
    const lines = [
      "=== ILLUXUS FULL REPORT ===",
      `Generated: ${new Date().toLocaleString()}`,
      `Organization: ${org?.name ?? "—"}`,
      `Currency: ${displayCcy}`,
      "",
      "── SUMMARY ──",
      `Total Registrations : ${kpis.totalRegs}`,
      `Active (confirmed)  : ${kpis.activeRegs}`,
      `Total Revenue       : ${formatMoney(kpis.totalRevDisp, displayCcy)}`,
      `Avg. Ticket Price   : ${formatMoney(kpis.avgTicket, displayCcy)}`,
      `Conversion Rate     : ${kpis.convRate.toFixed(1)}%`,
      `Check-in Rate       : ${kpis.checkRate.toFixed(1)}%`,
      "",
      "── REVENUE BY EVENT ──",
      ...revenueByEvent.map((r) => `  ${r.title}: ${formatMoney(r.revenue, displayCcy)} (${r.tickets} tickets)`),
      "",
      "── CHECK-IN BY EVENT ──",
      ...checkInByEvent.map((r) => `  ${r.name}: ${r.checkedIn}/${r.total} (${r.rate}%)`),
      "",
      "── REGISTRATION STATUS ──",
      ...statusPie.map((s) => `  ${s.name}: ${s.value}`),
      "",
      "── SPEAKERS ──",
      ...speakers.map((s) => `  [${s.checked_in ? "✓" : " "}] ${s.name}${s.company ? ` (${s.company})` : ""} — ${s.event_title}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `full-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Unique statuses for filter dropdown ───────────────────────────────────

  const allStatuses = useMemo(
    () => Array.from(new Set(registrations.map((r) => r.status))).sort(),
    [registrations],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1200px]">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
            <p className="text-[13px] text-muted-foreground">
              Organisation-wide data, exports, and attendance summaries
              {uniqueCurrencies.length > 1 && (
                <span className="ml-2 font-mono text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  mixed: {uniqueCurrencies.join(" · ")}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[13px] gap-1.5"
              onClick={fetchAll}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px] gap-1.5"
              onClick={exportFullReport}
              disabled={events.length === 0}
            >
              <Download className="h-3.5 w-3.5" /> Full Report (.txt)
            </Button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="h-8 w-[200px] text-[13px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-[13px]">
                  <span className="truncate">{e.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-[13px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {allStatuses.map((s) => (
                <SelectItem key={s} value={s} className="text-[13px] capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <CurrencySwitcher value={displayCcy} onChange={setDisplayCcy} extra={uniqueCurrencies} />

          {(eventFilter !== "all" || statusFilter !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[13px] text-muted-foreground"
              onClick={() => { setEventFilter("all"); setStatusFilter("all"); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* ── Loading / empty state ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading report data…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm font-semibold mb-1">No events yet</p>
            <p className="text-[13px] text-muted-foreground">
              Create your first event to start seeing reports here.
            </p>
          </div>
        ) : (
          <>
            {/* ── KPI cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={Users}       label="Total Regs"   value={kpis.totalRegs.toLocaleString()} />
              <StatCard icon={Ticket}      label="Confirmed"    value={kpis.activeRegs.toLocaleString()}  color="text-green-600" />
              <StatCard icon={DollarSign}  label="Revenue"      value={formatMoney(kpis.totalRevDisp, displayCcy)} color="text-primary" />
              <StatCard icon={TrendingUp}  label="Avg. Ticket"  value={formatMoney(kpis.avgTicket, displayCcy)} />
              <StatCard
                icon={Percent}
                label="Conversion"
                value={`${kpis.convRate.toFixed(1)}%`}
                color={kpis.convRate >= 70 ? "text-green-600" : kpis.convRate >= 40 ? "text-amber-600" : "text-red-500"}
              />
              <StatCard
                icon={CheckCircle2}
                label="Check-in"
                value={`${kpis.checkRate.toFixed(1)}%`}
                sub={`${kpis.checkedIn} checked in`}
                color={kpis.checkRate >= 70 ? "text-green-600" : "text-muted-foreground"}
              />
            </div>

            {/* ── Charts grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Registration trend — full width */}
              <Section title="Registration Trend" icon={Calendar} full
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportRegistrations}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {dailyTrend.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No registration data in the selected filters.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="tickFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date"    tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="t"       tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: unknown, name: unknown) =>
                          name === "revenue"
                            ? [formatMoney(Number(v), displayCcy), "Revenue"]
                            : [v, "Tickets"]
                        }
                      />
                      <Area yAxisId="t" type="monotone" dataKey="tickets" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#tickFill)" name="tickets" />
                      <Line  yAxisId="r" type="monotone" dataKey="revenue" stroke="hsl(var(--accent))"  strokeWidth={2} dot={false} name="revenue" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Section>

              {/* Revenue by event */}
              <Section title="Revenue by Event" icon={DollarSign}
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportFinancial}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {revenueByEvent.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No revenue data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenueByEvent} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 0 } as Intl.NumberFormatOptions)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={90} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: unknown) => [formatMoney(Number(v), displayCcy), "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Section>

              {/* Registration status breakdown */}
              <Section title="Registration Status Breakdown" icon={BarChart3}>
                {statusPie.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No data.</p>
                ) : (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={statusPie} cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70}
                          dataKey="value" paddingAngle={2}
                          style={{ outline: "none" }}
                        >
                          {statusPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} style={{ outline: "none" }} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {statusPie.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 text-[13px]">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-muted-foreground capitalize">{d.name}</span>
                          <span className="font-semibold font-mono ml-auto">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* Check-in rate by event */}
              <Section title="Check-in Rate by Event" icon={CheckCircle2}>
                {checkInByEvent.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No check-in data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={checkInByEvent}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name"  tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: unknown, _: unknown, item: Record<string, unknown>) => {
                          const p = item.payload as { checkedIn: number; total: number } | undefined;
                          return [`${v}% (${p?.checkedIn ?? 0}/${p?.total ?? 0})`, "Check-in Rate"];
                        }}
                      />
                      <Bar dataKey="rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Section>

              {/* Speaker attendance — full width */}
              <Section title="Speaker Attendance" icon={Target} full
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportSpeakers} disabled={speakers.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {speakers.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    No speakers assigned to any event yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border text-left">
                          <th className="py-2 pr-4 font-medium">Speaker</th>
                          <th className="py-2 pr-4 font-medium">Company</th>
                          <th className="py-2 pr-4 font-medium">Event</th>
                          <th className="py-2 font-medium">Attendance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(eventFilter === "all"
                          ? speakers
                          : speakers.filter((s) => {
                              const ev = events.find((e) => e.id === eventFilter);
                              return ev ? s.event_title === ev.title : true;
                            })
                        ).map((s, i) => (
                          <tr key={i} className="hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 pr-4">
                              <p className="font-medium">{s.name}</p>
                              {s.email && <p className="text-[11px] text-muted-foreground">{s.email}</p>}
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground text-[13px]">{s.company ?? "—"}</td>
                            <td className="py-2.5 pr-4 text-[13px]">
                              <Badge variant="outline" className="text-[11px] font-normal">{s.event_title}</Badge>
                            </td>
                            <td className="py-2.5">
                              {s.checked_in ? (
                                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Attended
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                                  <XCircle className="h-3.5 w-3.5" /> Not attended
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* All registrations table — full width */}
              <Section title="All Registrations" icon={Users} full
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{filteredRegs.length} records</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportRegistrations}>
                      <Download className="h-3 w-3" /> Export CSV
                    </Button>
                  </div>
                }
              >
                {filteredRegs.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    No registrations match the current filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border text-left">
                          <th className="py-2 pr-3 font-medium">Name</th>
                          <th className="py-2 pr-3 font-medium">Email</th>
                          <th className="py-2 pr-3 font-medium">Event</th>
                          <th className="py-2 pr-3 font-medium">Ticket</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 pr-3 font-medium">Amount</th>
                          <th className="py-2 font-medium">Checked In</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredRegs.slice(0, 200).map((r) => {
                          const ev  = events.find((e) => e.id === r.event_id);
                          const ccy = (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
                          const amt = Number(r.amount_paid || 0);
                          return (
                            <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                              <td className="py-2 pr-3 font-medium whitespace-nowrap">{r.name}</td>
                              <td className="py-2 pr-3 text-[12px] text-muted-foreground whitespace-nowrap">{r.email}</td>
                              <td className="py-2 pr-3 text-[12px] max-w-[140px] truncate">{ev?.title ?? "—"}</td>
                              <td className="py-2 pr-3 text-[12px] capitalize">{r.ticket_type}</td>
                              <td className="py-2 pr-3">
                                <span className={cn(
                                  "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize",
                                  ACTIVE_STATUSES.has(r.status) ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
                                )}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="py-2 pr-3 font-mono text-[12px] tabular-nums whitespace-nowrap">
                                {amt > 0 ? formatMoney(toDisplay(amt, ccy), displayCcy) : "—"}
                              </td>
                              <td className="py-2 text-[12px]">
                                {r.checked_in ? (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-3 w-3" /> Yes
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredRegs.length > 200 && (
                      <div className="flex items-center justify-between px-2 py-2 border-t border-border mt-1">
                        <p className="text-[12px] text-muted-foreground">
                          Showing first 200 of {filteredRegs.length} records.
                        </p>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportRegistrations}>
                          <Download className="h-3 w-3" /> Export all as CSV
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Section>

            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ReportsPage;
