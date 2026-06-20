import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOrg } from "@/contexts/OrgContext";
import { formatMoney, DEFAULT_EVENT_CURRENCY } from "@/lib/currency";
import { convert, useFxRates } from "@/lib/fx";
import { CurrencySwitcher, getStoredDisplayCurrency } from "@/components/CurrencySwitcher";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area, Legend,
} from "recharts";
import {
  Download, FileText, Users, DollarSign, Ticket, TrendingUp,
  CheckCircle2, Loader2, Calendar, BarChart3, Target,
  Percent, RefreshCw, ArrowUpRight, ArrowDownRight, CalendarClock,
  FileSpreadsheet, FileDown, Award,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { downloadReportPdf } from "@/lib/reports/pdf";

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

interface SponsorRow {
  name: string;
  email: string | null;
  company: string | null;
  tier: string | null;
  website: string | null;
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

// ─── CSV helper ───────────────────────────────────────────────────────────────

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────

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

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  spark?: { i: number; v: number }[];
  color?: string;
  index?: number;
}

function KpiCard({ icon: Icon, label, value, sub, delta, spark, color = "text-foreground", index = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-card border border-border rounded-xl p-4 select-none"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className={`text-xl font-semibold font-mono tabular-nums ${color}`}>{value}</p>
        {delta !== undefined && <DeltaChip value={delta ?? null} />}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {spark && spark.some((p) => p.v > 0) && (
        <div className="h-7 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}

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
  const [sponsors,      setSponsors]      = useState<SponsorRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [exporting,     setExporting]     = useState<"none" | "xlsx" | "pdf">("none");

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [range, setRange] = useState<RangeKey>("30d");

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
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

    const { data: regs } = await supabase
      .from("registrations")
      .select("*")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    setRegistrations((regs ?? []) as RegRow[]);

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

    // Sponsors — join event_sponsors → sponsors
    const { data: spRows } = await supabase
      .from("event_sponsors")
      .select("sponsor_id, event_id, sponsors(name, email, tier, website)")
      .in("event_id", eventIds);

    type SpsRow = {
      sponsor_id: string;
      event_id: string;
      sponsors: {
        name: string;
        email: string | null;
        tier: string | null;
        website: string | null;
      } | null;
    };

    const sponsorRows: SponsorRow[] = ((spRows ?? []) as SpsRow[])
      .filter((r) => r.sponsors)
      .map((r) => {
        const sp = r.sponsors!;
        return {
          name:        sp.name,
          email:       sp.email,
          company:     sp.name, // sponsor name = company name
          tier:        sp.tier,
          website:     sp.website,
          event_title: eventTitleMap.get(r.event_id) ?? "Unknown",
        };
      });
    setSponsors(sponsorRows);

    setLoading(false);
  }, [org?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const uniqueCurrencies = useMemo(
    () => Array.from(new Set(events.map((e) => (e.currency || DEFAULT_EVENT_CURRENCY).toUpperCase()))),
    [events],
  );

  // Reports filters narrow down both pools. The time range narrows the
  // _registrations_ pool but never the events list (which is for selection
  // dropdown + speaker join).
  const eventScopedRegs = useMemo(
    () => (eventFilter === "all" ? registrations : registrations.filter((r) => r.event_id === eventFilter)),
    [registrations, eventFilter],
  );

  const filteredRegs = useMemo(() => {
    let r = eventScopedRegs;
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    const start = rangeStart(range);
    if (start) r = r.filter((x) => new Date(x.created_at) >= start);
    return r;
  }, [eventScopedRegs, statusFilter, range]);

  const filteredEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.id === eventFilter)),
    [events, eventFilter],
  );

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // ── KPIs (current period) + period-over-period deltas ────────────────────

  const analytics = useMemo(() => {
    const toDisplay = (amount: number, ccy: string) =>
      convert(amount, ccy, displayCcy, rates) ?? amount;

    const start = rangeStart(range);
    const now = new Date();
    const periodMs = start ? now.getTime() - start.getTime() : 0;
    const prevStart = start ? new Date(start.getTime() - periodMs) : null;

    let currRevenue = 0, currTickets = 0;
    let prevRevenue = 0, prevTickets = 0;
    let totalRegs = 0, activeRegs = 0, checkedIn = 0;

    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    const dailyMap = new Map<string, { revenue: number; tickets: number; date: Date; label: string }>();
    const statusCounts = new Map<string, number>();
    const perEvent = new Map<string, {
      title: string;
      tickets: number;
      revenue: number;
      checkedIn: number;
      capacity: number | null;
    }>();

    for (const r of eventScopedRegs) {
      const d = new Date(r.created_at);
      const inCurr = !start || d >= start;
      const inPrev = prevStart && d >= prevStart && start && d < start;
      const ev = eventById.get(r.event_id);
      const ccy = (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
      const display = toDisplay(Number(r.amount_paid || 0), ccy);

      // Status filter (narrows to user-picked status; KPIs respect it)
      if (statusFilter !== "all" && r.status !== statusFilter) continue;

      statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);

      if (inCurr) {
        totalRegs++;
        if (ACTIVE_STATUSES.has(r.status)) {
          activeRegs++;
          currRevenue += display;
          currTickets++;
          dayOfWeek[d.getDay()]++;
          const key = d.toISOString().slice(0, 10);
          const existing = dailyMap.get(key);
          const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          if (existing) {
            existing.revenue += display;
            existing.tickets++;
          } else {
            dailyMap.set(key, { revenue: display, tickets: 1, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), label });
          }
          if (r.checked_in) checkedIn++;
        }
      }
      if (inPrev && ACTIVE_STATUSES.has(r.status)) {
        prevRevenue += display;
        prevTickets++;
      }

      if (ACTIVE_STATUSES.has(r.status) && ev) {
        const agg = perEvent.get(ev.id) || {
          title: ev.title,
          tickets: 0,
          revenue: 0,
          checkedIn: 0,
          capacity: ev.capacity ?? null,
        };
        agg.tickets++;
        agg.revenue += display;
        if (r.checked_in) agg.checkedIn++;
        perEvent.set(ev.id, agg);
      }
    }

    const totalEvents = filteredEvents.length;
    const publishedCount = filteredEvents.filter((e) => e.status === "published").length;
    const upcomingCount = filteredEvents.filter((e) => new Date(e.date) > now && e.status !== "cancelled").length;
    const checkInRate = activeRegs > 0 ? (checkedIn / activeRegs) * 100 : 0;
    const conversionRate = totalRegs > 0 ? (activeRegs / totalRegs) * 100 : 0;
    const avgTicket = currTickets > 0 ? currRevenue / currTickets : 0;

    // Daily trend (sorted)
    const dailyData = Array.from(dailyMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({ label: d.label, date: d.date.getTime(), revenue: d.revenue, tickets: d.tickets }));

    let cum = 0;
    const cumulativeData = dailyData.map((d) => {
      cum += d.revenue;
      return { label: d.label, cumulative: cum };
    });

    // Day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowData = dayOfWeek.map((v, i) => ({ name: dayNames[i], tickets: v }));

    // Sparklines per KPI (12 buckets across the visible range)
    const sparkBuckets = 12;
    const sparkStart = start ?? (dailyData[0] ? new Date(dailyData[0].date) : new Date(now.getTime() - 30 * 86400000));
    const bucketSize = Math.max(1, (now.getTime() - sparkStart.getTime()) / sparkBuckets);
    const revSpark = Array.from({ length: sparkBuckets }, (_, i) => ({ i, v: 0 }));
    const ticketSpark = Array.from({ length: sparkBuckets }, (_, i) => ({ i, v: 0 }));
    dailyData.forEach((d) => {
      const idx = Math.min(sparkBuckets - 1, Math.max(0, Math.floor((d.date - sparkStart.getTime()) / bucketSize)));
      revSpark[idx].v += d.revenue;
      ticketSpark[idx].v += d.tickets;
    });

    // Status pie (within selection)
    const statusPie = Array.from(statusCounts.entries())
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value);

    // Revenue by event
    const revenueByEvent = Array.from(perEvent.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((d) => ({
        ...d,
        name: d.title.length > 18 ? d.title.slice(0, 18) + "…" : d.title,
        fillRate: d.capacity && d.capacity > 0 ? Math.min(100, (d.tickets / d.capacity) * 100) : null,
        checkInRate: d.tickets > 0 ? (d.checkedIn / d.tickets) * 100 : 0,
      }));

    const checkInByEvent = revenueByEvent
      .filter((d) => d.tickets > 0)
      .map((d) => ({ name: d.name, rate: Math.round(d.checkInRate), checkedIn: d.checkedIn, total: d.tickets }));

    const topEvents = revenueByEvent.slice(0, 5);

    return {
      totalRegs, activeRegs, checkedIn, currRevenue, currTickets,
      prevRevenue, prevTickets, avgTicket, conversionRate, checkInRate,
      totalEvents, publishedCount, upcomingCount,
      dailyData, cumulativeData, dowData,
      revSpark, ticketSpark,
      statusPie, revenueByEvent, checkInByEvent, topEvents,
    };
  }, [eventScopedRegs, statusFilter, range, eventById, filteredEvents, displayCcy, rates]);

  // ── Export handlers ───────────────────────────────────────────────────────

  const exportRegistrations = () => {
    downloadCsv(
      `registrations-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Email", "Event", "Ticket Type", "Status", "Approval", "Amount Paid", "Checked In", "Checked In At", "Registered At"],
      filteredRegs.map((r) => {
        const ev = eventById.get(r.event_id);
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
          const ev = eventById.get(eventFilter);
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
      ["Event", "Tickets Sold", `Revenue (${displayCcy})`, "Avg Ticket", "Fill Rate", "Check-in Rate"],
      analytics.revenueByEvent.map((row) => [
        row.title,
        row.tickets,
        formatMoney(row.revenue, displayCcy),
        formatMoney(row.tickets ? row.revenue / row.tickets : 0, displayCcy),
        row.fillRate !== null ? `${Math.round(row.fillRate)}%` : "—",
        `${Math.round(row.checkInRate)}%`,
      ]),
    );
  };

  const exportSponsors = () => {
    const rows = eventFilter === "all"
      ? sponsors
      : sponsors.filter((s) => {
          const ev = eventById.get(eventFilter);
          return ev ? s.event_title === ev.title : true;
        });
    downloadCsv(
      `sponsors-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Tier", "Email", "Website", "Event"],
      rows.map((s) => [s.name, s.tier ?? "", s.email ?? "", s.website ?? "", s.event_title]),
    );
  };

  // ── Workbook (XLSX) export ───────────────────────────────────────────────
  // Loads exceljs lazily so the main bundle stays light.
  const exportWorkbook = async () => {
    if (events.length === 0) return;
    setExporting("xlsx");
    try {
      const { downloadWorkbook } = await import("@/lib/reports/excel");

      const now = new Date().toISOString().slice(0, 10);
      const filterContext = `${eventFilter === "all" ? "All events" : eventById.get(eventFilter)?.title ?? "Event"} · ${RANGE_LABELS[range]} · ${statusFilter === "all" ? "All statuses" : statusFilter}`;

      const sponsorRowsForCurrentScope = eventFilter === "all"
        ? sponsors
        : sponsors.filter((s) => {
            const ev = eventById.get(eventFilter);
            return ev ? s.event_title === ev.title : true;
          });
      const speakerRowsForCurrentScope = eventFilter === "all"
        ? speakers
        : speakers.filter((s) => {
            const ev = eventById.get(eventFilter);
            return ev ? s.event_title === ev.title : true;
          });

      await downloadWorkbook(`illuxus-report-${now}.xlsx`, [
        {
          name: "Summary",
          columns: [
            { header: "Metric", key: "metric", width: 30 },
            { header: "Value", key: "value", width: 30 },
          ],
          rows: [
            { metric: "Organization", value: org?.name ?? "—" },
            { metric: "Generated", value: new Date().toLocaleString() },
            { metric: "Display currency", value: displayCcy },
            { metric: "Filters", value: filterContext },
            { metric: "Total registrations", value: analytics.totalRegs },
            { metric: "Active registrations", value: analytics.activeRegs },
            { metric: "Total revenue", value: formatMoney(analytics.currRevenue, displayCcy) },
            { metric: "Avg. ticket", value: formatMoney(analytics.avgTicket, displayCcy) },
            { metric: "Conversion rate", value: `${analytics.conversionRate.toFixed(1)}%` },
            { metric: "Check-in rate", value: `${analytics.checkInRate.toFixed(1)}%` },
            { metric: "Total events", value: analytics.totalEvents },
            { metric: "Published events", value: analytics.publishedCount },
            { metric: "Upcoming events", value: analytics.upcomingCount },
          ],
        },
        {
          name: "Registrations",
          columns: [
            { header: "Name", key: "name", width: 28 },
            { header: "Email", key: "email", width: 30 },
            { header: "Event", key: "event", width: 28 },
            { header: "Ticket type", key: "ticket_type", width: 16 },
            { header: "Status", key: "status", width: 14 },
            { header: "Approval", key: "approval", width: 14 },
            { header: "Amount paid", key: "amount", width: 16 },
            { header: "Currency", key: "currency", width: 10 },
            { header: "Checked in", key: "checked_in", width: 12 },
            { header: "Checked in at", key: "checked_in_at", width: 22 },
            { header: "Registered at", key: "created_at", width: 22 },
          ],
          rows: filteredRegs.map((r) => {
            const ev = eventById.get(r.event_id);
            return {
              name: r.name,
              email: r.email,
              event: ev?.title ?? r.event_id,
              ticket_type: r.ticket_type,
              status: r.status,
              approval: r.approval_status,
              amount: Number(r.amount_paid || 0),
              currency: (ev?.currency || DEFAULT_EVENT_CURRENCY).toUpperCase(),
              checked_in: r.checked_in ? "Yes" : "No",
              checked_in_at: r.checked_in_at ?? "",
              created_at: new Date(r.created_at).toLocaleString(),
            };
          }),
        },
        {
          name: "Speakers",
          columns: [
            { header: "Name", key: "name", width: 28 },
            { header: "Email", key: "email", width: 30 },
            { header: "Company", key: "company", width: 24 },
            { header: "Event", key: "event_title", width: 28 },
            { header: "Attended", key: "attended", width: 12 },
            { header: "Checked in at", key: "checked_in_at", width: 22 },
          ],
          rows: speakerRowsForCurrentScope.map((s) => ({
            name: s.name,
            email: s.email ?? "",
            company: s.company ?? "",
            event_title: s.event_title,
            attended: s.checked_in ? "Yes" : "No",
            checked_in_at: s.checked_in_at ?? "",
          })),
        },
        {
          name: "Sponsors",
          columns: [
            { header: "Name", key: "name", width: 28 },
            { header: "Tier", key: "tier", width: 14 },
            { header: "Email", key: "email", width: 30 },
            { header: "Website", key: "website", width: 32 },
            { header: "Event", key: "event_title", width: 28 },
          ],
          rows: sponsorRowsForCurrentScope.map((s) => ({
            name: s.name,
            tier: s.tier ?? "",
            email: s.email ?? "",
            website: s.website ?? "",
            event_title: s.event_title,
          })),
        },
        {
          name: "Financial summary",
          columns: [
            { header: "Event", key: "title", width: 28 },
            { header: "Tickets sold", key: "tickets", width: 14 },
            { header: `Revenue (${displayCcy})`, key: "revenue", width: 20 },
            { header: "Avg ticket", key: "avg", width: 14 },
            { header: "Fill rate", key: "fill", width: 12 },
            { header: "Check-in rate", key: "checkin", width: 14 },
          ],
          rows: analytics.revenueByEvent.map((row) => ({
            title: row.title,
            tickets: row.tickets,
            revenue: formatMoney(row.revenue, displayCcy),
            avg: formatMoney(row.tickets ? row.revenue / row.tickets : 0, displayCcy),
            fill: row.fillRate !== null ? `${Math.round(row.fillRate)}%` : "—",
            checkin: `${Math.round(row.checkInRate)}%`,
          })),
        },
      ]);
    } finally {
      setExporting("none");
    }
  };

  // ── PDF report ───────────────────────────────────────────────────────────
  const exportPdf = () => {
    if (events.length === 0) return;
    setExporting("pdf");
    try {
      const filterContext = `${eventFilter === "all" ? "All events" : eventById.get(eventFilter)?.title ?? "Event"} · ${RANGE_LABELS[range]} · ${statusFilter === "all" ? "All statuses" : statusFilter}`;

      const sponsorRowsForCurrentScope = eventFilter === "all"
        ? sponsors
        : sponsors.filter((s) => {
            const ev = eventById.get(eventFilter);
            return ev ? s.event_title === ev.title : true;
          });
      const speakerRowsForCurrentScope = eventFilter === "all"
        ? speakers
        : speakers.filter((s) => {
            const ev = eventById.get(eventFilter);
            return ev ? s.event_title === ev.title : true;
          });

      downloadReportPdf({
        title: "illuxus — Event report",
        subtitle: org?.name ?? undefined,
        meta: [
          `Generated: ${new Date().toLocaleString()}`,
          `Filters: ${filterContext}`,
          `Display currency: ${displayCcy}`,
        ],
        kpis: [
          { label: "Total registrations", value: analytics.totalRegs.toLocaleString() },
          { label: "Active (confirmed)", value: analytics.activeRegs.toLocaleString() },
          { label: "Total revenue", value: formatMoney(analytics.currRevenue, displayCcy) },
          { label: "Avg. ticket", value: formatMoney(analytics.avgTicket, displayCcy) },
          { label: "Conversion rate", value: `${analytics.conversionRate.toFixed(1)}%` },
          { label: "Check-in rate", value: `${analytics.checkInRate.toFixed(1)}%` },
          { label: "Total events", value: analytics.totalEvents.toLocaleString() },
          { label: "Upcoming events", value: analytics.upcomingCount.toLocaleString() },
        ],
        tables: [
          {
            title: "Revenue by event",
            head: ["Event", "Tickets", `Revenue (${displayCcy})`, "Avg ticket", "Fill rate", "Check-in"],
            body: analytics.revenueByEvent.map((row) => [
              row.title,
              row.tickets,
              formatMoney(row.revenue, displayCcy),
              formatMoney(row.tickets ? row.revenue / row.tickets : 0, displayCcy),
              row.fillRate !== null ? `${Math.round(row.fillRate)}%` : "—",
              `${Math.round(row.checkInRate)}%`,
            ]),
          },
          {
            title: "Registration status",
            head: ["Status", "Count"],
            body: analytics.statusPie.map((s) => [s.name, s.value]),
          },
          {
            title: "Speakers",
            head: ["Name", "Company", "Event", "Attended"],
            body: speakerRowsForCurrentScope.map((s) => [
              s.name,
              s.company ?? "—",
              s.event_title,
              s.checked_in ? "Yes" : "No",
            ]),
          },
          {
            title: "Sponsors",
            head: ["Name", "Tier", "Email", "Event"],
            body: sponsorRowsForCurrentScope.map((s) => [
              s.name,
              s.tier ?? "—",
              s.email ?? "—",
              s.event_title,
            ]),
          },
        ],
        filename: `illuxus-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } finally {
      setExporting("none");
    }
  };

  const allStatuses = useMemo(
    () => Array.from(new Set(registrations.map((r) => r.status))).sort(),
    [registrations],
  );

  // ── KPI list ──────────────────────────────────────────────────────────────

  const kpis: KpiCardProps[] = [
    {
      icon: DollarSign, label: "Revenue",
      value: formatMoney(analytics.currRevenue, displayCcy),
      delta: pctChange(analytics.currRevenue, analytics.prevRevenue),
      spark: analytics.revSpark,
      color: "text-primary",
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
      delta: null,
    },
    {
      icon: Users, label: "Total Regs",
      value: analytics.totalRegs.toLocaleString(),
      delta: null,
    },
    {
      icon: Percent, label: "Conversion",
      value: `${analytics.conversionRate.toFixed(1)}%`,
      delta: null,
      color: analytics.conversionRate >= 70 ? "text-emerald-600" : analytics.conversionRate >= 40 ? "text-amber-600" : "text-red-500",
    },
    {
      icon: CheckCircle2, label: "Check-in Rate",
      value: `${analytics.checkInRate.toFixed(1)}%`,
      sub: `${analytics.checkedIn} checked in`,
      delta: null,
      color: analytics.checkInRate >= 70 ? "text-emerald-600" : "text-foreground",
    },
    {
      icon: Calendar, label: "Total Events",
      value: analytics.totalEvents.toLocaleString(),
      delta: null,
    },
    {
      icon: CalendarClock, label: "Upcoming",
      value: analytics.upcomingCount.toLocaleString(),
      sub: `${analytics.publishedCount} published`,
      delta: null,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-5 w-full">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
            <p className="text-[13px] text-muted-foreground">
              Performance, attendance, and exportable data for your organization
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
              variant="outline"
              className="h-8 text-[13px] gap-1.5"
              onClick={exportWorkbook}
              disabled={events.length === 0 || exporting !== "none"}
              title="Workbook covering registrations, speakers, sponsors, and financial summary"
            >
              {exporting === "xlsx"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileSpreadsheet className="h-3.5 w-3.5" />}
              Workbook (.xlsx)
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px] gap-1.5"
              onClick={exportPdf}
              disabled={events.length === 0 || exporting !== "none"}
            >
              {exporting === "pdf"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileDown className="h-3.5 w-3.5" />}
              Full Report (.pdf)
            </Button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
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

          {(eventFilter !== "all" || statusFilter !== "all" || range !== "30d") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[13px] text-muted-foreground"
              onClick={() => { setEventFilter("all"); setStatusFilter("all"); setRange("30d"); }}
            >
              Clear filters
            </Button>
          )}
        </div>

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
            {/* ── KPI grid ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
              {kpis.map((k, i) => <KpiCard key={k.label} {...k} index={i} />)}
            </div>

            {/* ── Charts grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 select-none">

              <Section title="Revenue & Tickets Trend" icon={TrendingUp} full
                action={
                  <span className="text-[11px] text-muted-foreground font-mono">{RANGE_LABELS[range]}</span>
                }
              >
                {analytics.dailyData.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No data in the selected range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={analytics.dailyData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="rev" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions)} />
                      <YAxis yAxisId="tix" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: any, name: any) => {
                          if (name === "revenue") return [formatMoney(Number(v), displayCcy), "Revenue"];
                          if (name === "tickets") return [v, "Tickets"];
                          return [v, name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revFill)" name="revenue" />
                      <Line yAxisId="tix" type="monotone" dataKey="tickets" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="tickets" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Section>

              <Section title="Revenue by Event" icon={DollarSign}
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportFinancial} disabled={analytics.revenueByEvent.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {analytics.revenueByEvent.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No revenue yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.revenueByEvent.slice(0, 10)} layout="vertical">
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

              <Section title="Registration Status" icon={BarChart3}>
                {analytics.statusPie.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No data.</p>
                ) : (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={analytics.statusPie} cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70}
                          dataKey="value" paddingAngle={2}
                          style={{ outline: "none" }}
                        >
                          {analytics.statusPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} style={{ outline: "none" }} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {analytics.statusPie.map((d, i) => (
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

              <Section title="Registrations by Day of Week" icon={Calendar}>
                {analytics.dowData.every((d) => d.tickets === 0) ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No data in the selected range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.dowData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="tickets" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Section>

              <Section title="Cumulative Revenue" icon={TrendingUp}>
                {analytics.cumulativeData.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No revenue in the selected range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={analytics.cumulativeData}>
                      <defs>
                        <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: unknown) => [formatMoney(Number(v), displayCcy), "Total"]}
                      />
                      <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cumFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Section>

              <Section title="Check-in Rate by Event" icon={CheckCircle2}>
                {analytics.checkInByEvent.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-10">No check-in data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.checkInByEvent}>
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

              <Section title="Top Events" icon={Users} full>
                {analytics.topEvents.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">No paid registrations in scope.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                          <th className="py-2 font-medium">Event</th>
                          <th className="py-2 font-medium text-right">Tickets</th>
                          <th className="py-2 font-medium text-right">Revenue</th>
                          <th className="py-2 font-medium text-right">Avg ticket</th>
                          <th className="py-2 font-medium text-right">Fill rate</th>
                          <th className="py-2 font-medium text-right">Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topEvents.map((e) => (
                          <tr key={e.title} className="border-b border-border last:border-0">
                            <td className="py-2.5 font-medium">{e.title}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums">{e.tickets}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(e.revenue, displayCcy)}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                              {e.tickets > 0 ? formatMoney(e.revenue / e.tickets, displayCcy) : "—"}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                              {e.fillRate !== null ? `${Math.round(e.fillRate)}%` : "—"}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                              {Math.round(e.checkInRate)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

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
                              const ev = eventById.get(eventFilter);
                              return ev ? s.event_title === ev.title : true;
                            })
                        ).map((s, i) => (
                          <tr key={`${s.email ?? s.name}-${i}`}>
                            <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{s.company ?? "—"}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{s.event_title}</td>
                            <td className="py-2.5">
                              {s.checked_in ? (
                                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" /> Checked in
                                </span>
                              ) : (
                                <span className="text-[12px] text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title="Sponsors" icon={Award} full
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportSponsors} disabled={sponsors.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {sponsors.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    No sponsors attached to any event yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border text-left">
                          <th className="py-2 pr-4 font-medium">Sponsor</th>
                          <th className="py-2 pr-4 font-medium">Tier</th>
                          <th className="py-2 pr-4 font-medium">Email</th>
                          <th className="py-2 pr-4 font-medium">Website</th>
                          <th className="py-2 font-medium">Event</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(eventFilter === "all"
                          ? sponsors
                          : sponsors.filter((s) => {
                              const ev = eventById.get(eventFilter);
                              return ev ? s.event_title === ev.title : true;
                            })
                        ).map((s, i) => (
                          <tr key={`${s.email ?? s.name}-${i}`}>
                            <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                            <td className="py-2.5 pr-4">
                              {s.tier ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium capitalize">
                                  {s.tier}
                                </span>
                              ) : (
                                <span className="text-[12px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{s.email ?? "—"}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[200px]">
                              {s.website ? (
                                <a href={s.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                  {s.website.replace(/^https?:\/\//, "")}
                                </a>
                              ) : "—"}
                            </td>
                            <td className="py-2.5 text-muted-foreground">{s.event_title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title="Registrations" icon={FileText} full
                action={
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={exportRegistrations} disabled={filteredRegs.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                <p className="text-[13px] text-muted-foreground">
                  {filteredRegs.length.toLocaleString()} registration{filteredRegs.length === 1 ? "" : "s"} match the current filters.
                </p>
              </Section>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ReportsPage;
