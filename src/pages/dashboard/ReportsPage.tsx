import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Download, FileText, Users, DollarSign, Ticket, TrendingUp,
  CheckCircle2, Loader2, Calendar, BarChart3, Target,
  Percent, RefreshCw, ArrowUpRight, ArrowDownRight, CalendarClock,
  FileSpreadsheet, FileDown, Award, AlertTriangle, Trophy, Mic, LayoutGrid, Layers,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { downloadReportPdf } from "@/lib/reports/pdf";
import { fetchAllRows } from "@/lib/reports/fetch";
import {
  buildReport, pctChange, registrationState, REG_STATES, REG_STATE_LABEL,
  type RangeKey, type RegState, type TrendPoint,
} from "@/lib/reports/analytics";

// ─── Data ─────────────────────────────────────────────────────────────────────

const EVENT_COLS = "id, title, date, status, currency, capacity";
const REG_COLS = "id, event_id, name, email, ticket_type, status, approval_status, amount_paid, checked_in, checked_in_at, created_at";

type EventRow = Pick<Tables<"events">, "id" | "title" | "date" | "status" | "currency" | "capacity">;
type RegRow = Pick<
  Tables<"registrations">,
  "id" | "event_id" | "name" | "email" | "ticket_type" | "status" | "approval_status" | "amount_paid" | "checked_in" | "checked_in_at" | "created_at"
>;

interface SpeakerAttendee {
  event_id: string;
  name: string;
  email: string | null;
  company: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  event_title: string;
}

interface SponsorRow {
  event_id: string;
  name: string;
  email: string | null;
  tier: string | null;
  website: string | null;
  event_title: string;
}

interface ReportData {
  events: EventRow[];
  registrations: RegRow[];
  speakers: SpeakerAttendee[];
  sponsors: SponsorRow[];
  loadedAt: Date;
}

// A long `in (…)` list overflows the URL, so events are asked for in batches.
const ID_CHUNK = 80;

type PageQuery = (ids: string[], from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function fetchForEvents<T>(eventIds: string[], query: PageQuery): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < eventIds.length; i += ID_CHUNK) {
    const ids = eventIds.slice(i, i + ID_CHUNK);
    rows.push(...await fetchAllRows<T>((from, to) => query(ids, from, to)));
  }
  return rows;
}

async function loadReportData(orgId: string): Promise<ReportData> {
  const { data: evs, error } = await supabase
    .from("events").select(EVENT_COLS).eq("org_id", orgId).order("date", { ascending: false });
  if (error) throw new Error(error.message);
  const events = (evs ?? []) as EventRow[];
  const loadedAt = new Date();
  if (events.length === 0) return { events, registrations: [], speakers: [], sponsors: [], loadedAt };

  const eventIds = events.map((e) => e.id);
  const titleOf = new Map(events.map((e) => [e.id, e.title]));

  type ESRow = { event_id: string; speakers: { name: string; email: string | null; company: string | null } | null };
  type SpsRow = { event_id: string; sponsors: { name: string; email: string | null; tier: string | null; website: string | null } | null };

  const [registrations, speakerLinks, sponsorLinks] = await Promise.all([
    fetchForEvents<RegRow>(eventIds, (ids, from, to) =>
      supabase.from("registrations").select(REG_COLS).in("event_id", ids)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchForEvents<ESRow>(eventIds, (ids, from, to) =>
      supabase.from("event_speakers").select("event_id, speakers(name, email, company)").in("event_id", ids)
        .order("event_id").order("speaker_id").range(from, to)),
    fetchForEvents<SpsRow>(eventIds, (ids, from, to) =>
      supabase.from("event_sponsors").select("event_id, sponsors(name, email, tier, website)").in("event_id", ids)
        .order("event_id").order("sponsor_id").range(from, to)),
  ]);

  const regByEmail = new Map<string, RegRow>();
  for (const r of registrations) {
    if (r.email) regByEmail.set(`${r.event_id}:${r.email.toLowerCase()}`, r);
  }

  const speakers: SpeakerAttendee[] = speakerLinks.filter((r) => r.speakers).map((r) => {
    const sp = r.speakers!;
    const reg = sp.email ? regByEmail.get(`${r.event_id}:${sp.email.toLowerCase()}`) : undefined;
    return {
      event_id: r.event_id,
      name: sp.name,
      email: sp.email,
      company: sp.company,
      checked_in: !!reg?.checked_in,
      checked_in_at: reg?.checked_in_at ?? null,
      event_title: titleOf.get(r.event_id) ?? "Unknown",
    };
  });

  const sponsors: SponsorRow[] = sponsorLinks.filter((r) => r.sponsors).map((r) => ({
    event_id: r.event_id,
    name: r.sponsors!.name,
    email: r.sponsors!.email,
    tier: r.sponsors!.tier,
    website: r.sponsors!.website,
    event_title: titleOf.get(r.event_id) ?? "Unknown",
  }));

  return { events, registrations, speakers, sponsors, loadedAt };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days", "30d": "30 days", "90d": "90 days", ytd: "This year", all: "All time",
};

const EMPTY_DATA: ReportData = { events: [], registrations: [], speakers: [], sponsors: [], loadedAt: new Date(0) };

const fmtPct = (v: number) => `${Math.round(v * 10) / 10}%`;

function periodLabel(start: Date | null, now: Date): string {
  if (!start) return "All time";
  const f = (d: Date, year: boolean) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" as const } : {}) });
  return `${f(start, start.getFullYear() !== now.getFullYear())} – ${f(now, true)}`;
}

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Chart pieces ─────────────────────────────────────────────────────────────

// Every single-measure chart on the page wears this one colour; a state keeps its own whatever its share (index.css).
const SERIES = "hsl(var(--chart-1))";
const STATE_COLOR: Record<RegState, string> = {
  confirmed: SERIES, pending: "var(--viz-2)", waitlisted: "var(--viz-3)", declined: "var(--viz-4)", cancelled: "var(--viz-rest)",
};
const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const GRID = "hsl(var(--border))";
const CHART_H = "h-[240px]";
const CHART_MIN_H = "lg:min-h-[240px]";
const EMPTY_H = "min-h-[120px] lg:min-h-[240px]";

function DeltaChip({ value, versus }: { value: number | null; versus: string | null }) {
  if (value === null || !Number.isFinite(value) || !versus) return null;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      <span className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
        up ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
      )}>
        <Icon className="h-3 w-3" />
        {up ? "+" : "−"}{fmtPct(Math.abs(value))}
      </span>
      <span>vs {versus}</span>
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-9" />;
  const max = Math.max(...values, 0);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${max > 0 ? 28 - (v / max) * 26 : 28}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke={SERIES} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatTile({
  icon: Icon, label, value, hint, delta, versus, spark,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  versus?: string | null;
  spark?: number[];
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="truncate text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1 flex min-h-[1.375rem] min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined && <DeltaChip value={delta} versus={versus ?? null} />}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {spark && <div className="mt-auto pt-2"><Sparkline values={spark} /></div>}
    </div>
  );
}

function Card({
  title, subtitle, icon: Icon, action, stackAction = false, className, children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  /** Put the action under the title on phones, for one too wide to sit beside it. */
  stackAction?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className={cn("mb-4 flex justify-between gap-3", stackAction ? "flex-col items-start sm:flex-row" : "items-start")}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{title}</span>
          </h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center px-4 text-center text-[13px] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-pop">
      <p className="mb-1 text-[11px] text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-[12px] leading-5">
          {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
          <span className="font-semibold tabular-nums">{r.value}</span>
          <span className="text-muted-foreground">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

/** Ranked horizontal bars. With `track`, each bar is a share of 100% rather than of the longest bar. */
function BarList({
  rows, track = false,
}: {
  rows: { id: string; name: string; value: string; detail?: string; fraction: number }[];
  track?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row) => (
        <li key={row.id} title={`${row.name}: ${row.value}${row.detail ? ` (${row.detail})` : ""}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="shrink-0 tabular-nums">
              {row.detail && <span className="mr-2 text-[12px] text-muted-foreground">{row.detail}</span>}
              <span className="font-semibold">{row.value}</span>
            </span>
          </div>
          <div className="h-2 rounded-r-full" style={track ? { background: "hsl(var(--chart-1) / 0.14)" } : undefined}>
            <div
              className="h-full rounded-r-full"
              style={{ width: `${Math.max(0, Math.min(1, row.fraction)) * 100}%`, minWidth: row.fraction > 0 ? 2 : 0, background: SERIES }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

type ReportView = "overview" | "speakers" | "sponsors";

/** Counts rows per key, largest first. */
function countBy<T>(rows: T[], key: (row: T) => [id: string, name: string]) {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const row of rows) {
    const [id, name] = key(row);
    const entry = counts.get(id) ?? { id, name, count: 0 };
    entry.count++;
    counts.set(id, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

const GRANULARITY_WORD = { day: "day", week: "week", month: "month" } as const;
const BAR_ROWS = 6;
const TABLE_ROWS = 10;

// ─── Speaker & sponsor views ──────────────────────────────────────────────────

interface SpeakerEventRow { id: string; title: string; total: number; attended: number; held: boolean }

interface SpeakerReport {
  people: number;
  slots: number;
  perEvent: SpeakerEventRow[];
  held: (SpeakerEventRow & { rate: number })[];
  heldSlots: number;
  attended: number;
  rate: number | null;
}

interface SponsorReport {
  companies: number;
  placements: number;
  byTier: { id: string; name: string; count: number }[];
  tiers: number;
  byEvent: { id: string; name: string; count: number }[];
}

const scopeWord = (eventFilter: string) => (eventFilter === "all" ? "to any event" : "to this event");

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={onClick} disabled={disabled}>
      <Download className="h-3 w-3" /> Export CSV
    </Button>
  );
}

function SpeakerView({
  report, speakers, eventFilter, onExport,
}: {
  report: SpeakerReport;
  speakers: SpeakerAttendee[];
  eventFilter: string;
  onExport: () => void;
}) {
  const maxPerEvent = Math.max(1, ...report.perEvent.map((e) => e.total));
  return (
    <>
      <p className="text-[12px] text-muted-foreground">
        Follows the event filter · check-ins count once an event has started
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={Mic} label="Speakers" value={report.people.toLocaleString()} hint="Unique people" />
        <StatTile
          icon={CalendarClock} label="Assignments"
          value={report.slots.toLocaleString()}
          hint={`Across ${report.perEvent.length} ${report.perEvent.length === 1 ? "event" : "events"}`}
        />
        <StatTile
          icon={CheckCircle2} label="Checked in"
          value={report.attended.toLocaleString()}
          hint={report.heldSlots > 0 ? `of ${report.heldSlots.toLocaleString()} at events held` : "No event has started"}
        />
        <StatTile
          icon={Percent} label="Attendance rate"
          value={report.rate === null ? "—" : fmtPct(report.rate)}
          hint={`${report.held.length} ${report.held.length === 1 ? "event" : "events"} held`}
        />
      </div>

      <div className="grid select-none grid-cols-1 gap-4 lg:grid-cols-6">
        <Card
          className="lg:col-span-3" icon={Target} title="Speaker attendance by event"
          subtitle={report.held.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${report.held.length} events held` : "Events that have started"}
        >
          {report.held.length === 0 ? (
            <Empty className={EMPTY_H}>No event with speakers has started yet.</Empty>
          ) : (
            <div className={cn("flex flex-col", CHART_MIN_H)}>
              <BarList track rows={report.held.slice(0, BAR_ROWS).map((e) => ({
                id: e.id,
                name: e.title,
                value: `${Math.round(e.rate)}%`,
                detail: `${e.attended} of ${e.total}`,
                fraction: e.rate / 100,
              }))} />
            </div>
          )}
        </Card>

        <Card
          className="lg:col-span-3" icon={BarChart3} title="Speakers by event"
          subtitle={report.perEvent.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${report.perEvent.length}` : "Speakers assigned to each event"}
        >
          {report.perEvent.length === 0 ? (
            <Empty className={EMPTY_H}>No speakers assigned {scopeWord(eventFilter)} yet.</Empty>
          ) : (
            <div className={cn("flex flex-col", CHART_MIN_H)}>
              <BarList rows={report.perEvent.slice(0, BAR_ROWS).map((e) => ({
                id: e.id,
                name: e.title,
                value: e.total.toLocaleString(),
                fraction: e.total / maxPerEvent,
              }))} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-6" icon={Mic} title="Speaker attendance"
          subtitle={`${speakers.length.toLocaleString()} ${speakers.length === 1 ? "assignment" : "assignments"}`}
          action={<ExportButton onClick={onExport} disabled={speakers.length === 0} />}
        >
          {speakers.length === 0 ? (
            <Empty className="py-8">No speakers assigned {scopeWord(eventFilter)} yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Speaker</th>
                    <th className="py-2 pr-4 font-medium">Company</th>
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 font-medium">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {speakers.map((s, i) => (
                    <tr key={`${s.event_id}-${s.email ?? s.name}-${i}`}>
                      <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{s.company ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{s.event_title}</td>
                      <td className="py-2.5">
                        {s.checked_in ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
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
        </Card>
      </div>
    </>
  );
}

function SponsorView({
  report, sponsors, eventFilter, onExport,
}: {
  report: SponsorReport;
  sponsors: SponsorRow[];
  eventFilter: string;
  onExport: () => void;
}) {
  const maxTier = Math.max(1, ...report.byTier.map((t) => t.count));
  const maxEvent = Math.max(1, ...report.byEvent.map((e) => e.count));
  return (
    <>
      <p className="text-[12px] text-muted-foreground">Follows the event filter</p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={Award} label="Sponsors" value={report.companies.toLocaleString()} hint="Unique companies" />
        <StatTile
          icon={Ticket} label="Placements"
          value={report.placements.toLocaleString()}
          hint="Sponsor × event pairings"
        />
        <StatTile
          icon={CalendarClock} label="Events sponsored"
          value={report.byEvent.length.toLocaleString()}
          hint={report.byEvent.length > 0 ? `${Math.round((report.placements / report.byEvent.length) * 10) / 10} per event on average` : undefined}
        />
        <StatTile
          icon={Layers} label="Tiers"
          value={report.tiers.toLocaleString()}
          hint={report.byTier[0] ? `Most: ${report.byTier[0].name}` : undefined}
        />
      </div>

      <div className="grid select-none grid-cols-1 gap-4 lg:grid-cols-6">
        <Card
          className="lg:col-span-3" icon={Layers} title="Sponsors by tier"
          subtitle={report.byTier.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${report.byTier.length}` : "Placements in each tier"}
        >
          {report.byTier.length === 0 ? (
            <Empty className={EMPTY_H}>No sponsors attached {scopeWord(eventFilter)} yet.</Empty>
          ) : (
            <div className={cn("flex flex-col", CHART_MIN_H)}>
              <BarList rows={report.byTier.slice(0, BAR_ROWS).map((t) => ({
                id: t.id || "none",
                name: t.name,
                value: t.count.toLocaleString(),
                detail: fmtPct((t.count / report.placements) * 100),
                fraction: t.count / maxTier,
              }))} />
            </div>
          )}
        </Card>

        <Card
          className="lg:col-span-3" icon={BarChart3} title="Sponsors by event"
          subtitle={report.byEvent.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${report.byEvent.length}` : "Sponsors attached to each event"}
        >
          {report.byEvent.length === 0 ? (
            <Empty className={EMPTY_H}>No sponsors attached {scopeWord(eventFilter)} yet.</Empty>
          ) : (
            <div className={cn("flex flex-col", CHART_MIN_H)}>
              <BarList rows={report.byEvent.slice(0, BAR_ROWS).map((e) => ({
                id: e.id,
                name: e.name,
                value: e.count.toLocaleString(),
                fraction: e.count / maxEvent,
              }))} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-6" icon={Award} title="Sponsors"
          subtitle={`${sponsors.length.toLocaleString()} ${sponsors.length === 1 ? "placement" : "placements"}`}
          action={<ExportButton onClick={onExport} disabled={sponsors.length === 0} />}
        >
          {sponsors.length === 0 ? (
            <Empty className="py-8">No sponsors attached {scopeWord(eventFilter)} yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Sponsor</th>
                    <th className="py-2 pr-4 font-medium">Tier</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Website</th>
                    <th className="py-2 font-medium">Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sponsors.map((s, i) => (
                    <tr key={`${s.event_id}-${s.email ?? s.name}-${i}`}>
                      <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                      <td className="py-2.5 pr-4">
                        {s.tier ? (
                          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize">
                            {s.tier}
                          </span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{s.email ?? "—"}</td>
                      <td className="max-w-[200px] truncate py-2.5 pr-4 text-muted-foreground">
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
        </Card>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReportsPage = () => {
  const { org } = useOrg();
  const { rates } = useFxRates();
  const [displayCcy, setDisplayCcy] = useState<string>(() =>
    getStoredDisplayCurrency(DEFAULT_EVENT_CURRENCY),
  );

  const [data,      setData]      = useState<ReportData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState<"none" | "xlsx" | "pdf">("none");

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<RegState | "all">("all");
  const [range, setRange] = useState<RangeKey>("30d");
  const [trendMetric, setTrendMetric] = useState<"registrations" | "revenue">("registrations");
  const [view, setView] = useState<ReportView>("overview");

  // ── Fetch ────────────────────────────────────────────────────────────────

  const requestId = useRef(0);
  const fetchAll = useCallback(async () => {
    if (!org?.id) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await loadReportData(org.id);
      if (id !== requestId.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [org?.id]);

  useEffect(() => {
    setData(null);
    fetchAll();
  }, [fetchAll]);

  const { events, registrations, speakers, sponsors, loadedAt } = data ?? EMPTY_DATA;

  // ── Derived data ─────────────────────────────────────────────────────────

  const uniqueCurrencies = useMemo(
    () => Array.from(new Set(events.map((e) => (e.currency || DEFAULT_EVENT_CURRENCY).toUpperCase()))),
    [events],
  );
  // Without a rate an amount cannot be converted, and adding it up as if it could would be wrong silently.
  const unconverted = useMemo(
    () => uniqueCurrencies.filter((c) => c !== displayCcy.toUpperCase() && convert(1, c, displayCcy, rates) === null),
    [uniqueCurrencies, displayCcy, rates],
  );

  const scopedEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.id === eventFilter)),
    [events, eventFilter],
  );
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const report = useMemo(() => buildReport({
    events: scopedEvents,
    registrations,
    range,
    state: stateFilter,
    now: loadedAt,
    toDisplay: (amount, ccy) => {
      const from = (ccy || DEFAULT_EVENT_CURRENCY).toUpperCase();
      return convert(amount, from, displayCcy, rates) ?? amount;
    },
  }), [scopedEvents, registrations, range, stateFilter, loadedAt, displayCcy, rates]);

  // The rows behind the headline count, for the exports.
  const filteredRegs = useMemo(() => {
    const ids = new Set(scopedEvents.map((e) => e.id));
    const start = report.window.start ? report.window.start.getTime() : -Infinity;
    return registrations.filter((r) =>
      ids.has(r.event_id)
      && (stateFilter === "all" || registrationState(r) === stateFilter)
      && new Date(r.created_at).getTime() >= start);
  }, [registrations, scopedEvents, stateFilter, report.window.start]);

  const statesPresent = useMemo(() => {
    const ids = new Set(scopedEvents.map((e) => e.id));
    const seen = new Set<RegState>();
    for (const r of registrations) if (ids.has(r.event_id)) seen.add(registrationState(r));
    return REG_STATES.filter((s) => seen.has(s));
  }, [registrations, scopedEvents]);

  const scopedSpeakers = useMemo(
    () => (eventFilter === "all" ? speakers : speakers.filter((s) => s.event_id === eventFilter)),
    [speakers, eventFilter],
  );
  const scopedSponsors = useMemo(
    () => (eventFilter === "all" ? sponsors : sponsors.filter((s) => s.event_id === eventFilter)),
    [sponsors, eventFilter],
  );

  // Attendance only counts once an event has started, the same rule as the registration check-in rate.
  const speakerReport = useMemo(() => {
    const nowMs = loadedAt.getTime();
    const started = (id: string) => {
      const ev = eventById.get(id);
      return !!ev && new Date(ev.date).getTime() <= nowMs;
    };
    const byEvent = new Map<string, { id: string; title: string; total: number; attended: number; held: boolean }>();
    for (const s of scopedSpeakers) {
      const row = byEvent.get(s.event_id) ?? { id: s.event_id, title: s.event_title, total: 0, attended: 0, held: started(s.event_id) };
      row.total++;
      if (s.checked_in) row.attended++;
      byEvent.set(s.event_id, row);
    }
    const perEvent = [...byEvent.values()].sort((a, b) => b.total - a.total);
    const held = perEvent
      .filter((e) => e.held)
      .map((e) => ({ ...e, rate: (e.attended / e.total) * 100 }))
      .sort((a, b) => b.rate - a.rate);
    const heldSlots = held.reduce((n, e) => n + e.total, 0);
    const attended = held.reduce((n, e) => n + e.attended, 0);
    return {
      people: new Set(scopedSpeakers.map((s) => (s.email ?? s.name).toLowerCase())).size,
      slots: scopedSpeakers.length,
      perEvent,
      held,
      heldSlots,
      attended,
      rate: heldSlots > 0 ? (attended / heldSlots) * 100 : null,
    };
  }, [scopedSpeakers, eventById, loadedAt]);

  const sponsorReport = useMemo(() => {
    const byTier = countBy(scopedSponsors, (s) => {
      const tier = s.tier?.trim();
      return tier ? [tier.toLowerCase(), tier.charAt(0).toUpperCase() + tier.slice(1)] : ["", "No tier"];
    });
    return {
      companies: new Set(scopedSponsors.map((s) => s.name.trim().toLowerCase())).size,
      placements: scopedSponsors.length,
      byTier,
      tiers: byTier.filter((t) => t.id !== "").length,
      byEvent: countBy(scopedSponsors, (s) => [s.event_id, s.event_title]),
    };
  }, [scopedSponsors]);

  const { totals, previous, checkIn, window: period } = report;
  const periodText = periodLabel(period.start, loadedAt);
  const money = (v: number) => formatMoney(v, displayCcy);
  const compactMoney = (v: number) =>
    formatMoney(v, displayCcy, { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions);
  const per = GRANULARITY_WORD[report.granularity];
  const hasRevenue = totals.revenue > 0;
  const checkInRows = report.byEvent.filter((e) => e.checkInRate !== null);
  const filterContext = `${eventFilter === "all" ? "All events" : eventById.get(eventFilter)?.title ?? "Event"} · ${periodText} · ${stateFilter === "all" ? "All states" : REG_STATE_LABEL[stateFilter]}`;
  const checkInText = checkIn.rate === null ? "—" : fmtPct(checkIn.rate);
  const fillText = (e: { fillRate: number | null }) => (e.fillRate !== null ? `${Math.round(e.fillRate)}%` : "—");
  const rateText = (v: number | null) => (v !== null ? `${Math.round(v)}%` : "—");

  // ── Export handlers ───────────────────────────────────────────────────────

  const today = () => new Date().toISOString().slice(0, 10);

  const exportRegistrations = () => {
    downloadCsv(
      `registrations-${today()}.csv`,
      ["Name", "Email", "Event", "Ticket Type", "State", "Status", "Approval", "Amount Paid", "Checked In", "Checked In At", "Registered At"],
      filteredRegs.map((r) => {
        const ev = eventById.get(r.event_id);
        return [
          r.name, r.email, ev?.title ?? r.event_id, r.ticket_type,
          REG_STATE_LABEL[registrationState(r)], r.status, r.approval_status,
          formatMoney(Number(r.amount_paid || 0), ev?.currency || DEFAULT_EVENT_CURRENCY),
          r.checked_in ? "Yes" : "No", r.checked_in_at ?? "",
          new Date(r.created_at).toLocaleString(),
        ];
      }),
    );
  };

  const exportSpeakers = () => {
    downloadCsv(
      `speakers-${today()}.csv`,
      ["Name", "Email", "Company", "Event", "Attended", "Checked In At"],
      scopedSpeakers.map((s) => [s.name, s.email ?? "", s.company ?? "", s.event_title, s.checked_in ? "Yes" : "No", s.checked_in_at ?? ""]),
    );
  };

  const performanceHead = ["Event", "Registrations", "Tickets sold", `Revenue (${displayCcy})`, "Avg per ticket", "Capacity filled", "Check-in rate"];
  const performanceRows = () => report.byEvent.map((row) => [
    row.title,
    row.registrations,
    row.tickets,
    money(row.revenue),
    money(row.tickets ? row.revenue / row.tickets : 0),
    fillText(row),
    rateText(row.checkInRate),
  ]);

  const exportFinancial = () => {
    downloadCsv(`event-performance-${today()}.csv`, performanceHead, performanceRows());
  };

  const exportSponsors = () => {
    downloadCsv(
      `sponsors-${today()}.csv`,
      ["Name", "Tier", "Email", "Website", "Event"],
      scopedSponsors.map((s) => [s.name, s.tier ?? "", s.email ?? "", s.website ?? "", s.event_title]),
    );
  };

  const summaryRows = (): [string, string | number][] => [
    ["Registrations", totals.registrations],
    ["Tickets sold", totals.tickets],
    ["Awaiting approval", totals.pending],
    ["Revenue", money(totals.revenue)],
    ["Avg per ticket", money(totals.avgTicket)],
    ["Confirmation rate", totals.confirmationRate === null ? "—" : fmtPct(totals.confirmationRate)],
    ["Check-in rate", checkIn.rate === null ? "—" : `${fmtPct(checkIn.rate)} (${checkIn.checkedIn} of ${checkIn.of})`],
    ["Events", report.events.total],
    ["Published events", report.events.published],
    ["Upcoming events", report.events.upcoming],
  ];

  // Loads exceljs lazily so the main bundle stays light.
  const exportWorkbook = async () => {
    if (events.length === 0) return;
    setExporting("xlsx");
    try {
      const { downloadWorkbook } = await import("@/lib/reports/excel");
      await downloadWorkbook(`illuxus-report-${today()}.xlsx`, [
        {
          name: "Summary",
          columns: [
            { header: "Metric", key: "metric", width: 30 },
            { header: "Value", key: "value", width: 40 },
          ],
          rows: [
            { metric: "Organization", value: org?.name ?? "—" },
            { metric: "Generated", value: new Date().toLocaleString() },
            { metric: "Display currency", value: displayCcy },
            { metric: "Filters", value: filterContext },
            ...summaryRows().map(([metric, value]) => ({ metric, value })),
          ],
        },
        {
          name: "Registrations",
          columns: [
            { header: "Name", key: "name", width: 28 },
            { header: "Email", key: "email", width: 30 },
            { header: "Event", key: "event", width: 28 },
            { header: "Ticket type", key: "ticket_type", width: 16 },
            { header: "State", key: "state", width: 18 },
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
              state: REG_STATE_LABEL[registrationState(r)],
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
          rows: scopedSpeakers.map((s) => ({
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
          rows: scopedSponsors.map((s) => ({
            name: s.name,
            tier: s.tier ?? "",
            email: s.email ?? "",
            website: s.website ?? "",
            event_title: s.event_title,
          })),
        },
        {
          name: "Event performance",
          columns: [
            { header: "Event", key: "title", width: 28 },
            { header: "Registrations", key: "registrations", width: 14 },
            { header: "Tickets sold", key: "tickets", width: 14 },
            { header: `Revenue (${displayCcy})`, key: "revenue", width: 20 },
            { header: "Avg per ticket", key: "avg", width: 16 },
            { header: "Capacity filled", key: "fill", width: 16 },
            { header: "Check-in rate", key: "checkin", width: 14 },
          ],
          rows: report.byEvent.map((row) => ({
            title: row.title,
            registrations: row.registrations,
            tickets: row.tickets,
            revenue: money(row.revenue),
            avg: money(row.tickets ? row.revenue / row.tickets : 0),
            fill: fillText(row),
            checkin: rateText(row.checkInRate),
          })),
        },
      ]);
    } finally {
      setExporting("none");
    }
  };

  const exportPdf = () => {
    if (events.length === 0) return;
    setExporting("pdf");
    try {
      downloadReportPdf({
        title: "illuxus — Event report",
        subtitle: org?.name ?? undefined,
        meta: [
          `Generated: ${new Date().toLocaleString()}`,
          `Filters: ${filterContext}`,
          `Display currency: ${displayCcy}`,
        ],
        kpis: summaryRows().map(([label, value]) => ({ label, value: String(value) })),
        tables: [
          { title: "Event performance", head: performanceHead, body: performanceRows() },
          {
            title: "Registration status",
            head: ["State", "Count", "Share"],
            body: report.states.map((s) => [s.label, s.count, fmtPct(s.share)]),
          },
          {
            title: "Speakers",
            head: ["Name", "Company", "Event", "Attended"],
            body: scopedSpeakers.map((s) => [s.name, s.company ?? "—", s.event_title, s.checked_in ? "Yes" : "No"]),
          },
          {
            title: "Sponsors",
            head: ["Name", "Tier", "Email", "Event"],
            body: scopedSponsors.map((s) => [s.name, s.tier ?? "—", s.email ?? "—", s.event_title]),
          },
        ],
        filename: `illuxus-report-${today()}.pdf`,
      });
    } finally {
      setExporting("none");
    }
  };

  // ── Chart data ────────────────────────────────────────────────────────────

  const trendRows = (p: TrendPoint) => [
    { label: p.registrations === 1 ? "registration" : "registrations", value: p.registrations.toLocaleString(), color: trendMetric === "registrations" ? SERIES : undefined },
    { label: p.tickets === 1 ? "ticket sold" : "tickets sold", value: p.tickets.toLocaleString() },
    { label: "revenue", value: money(p.revenue), color: trendMetric === "revenue" ? SERIES : undefined },
  ];

  const revenueBars = report.byEvent.filter((e) => e.revenue > 0);
  const eventBars = hasRevenue ? revenueBars : report.byEvent.filter((e) => e.tickets > 0);
  const eventBarMax = Math.max(1, ...eventBars.map((e) => (hasRevenue ? e.revenue : e.tickets)));

  // ── Render ────────────────────────────────────────────────────────────────

  const firstLoad = loading && !data;

  return (
    <DashboardLayout>
      <div className="report-viz w-full space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
            <p className="text-[13px] text-muted-foreground">
              Performance, attendance, and exportable data for your organization
              {uniqueCurrencies.length > 1 && (
                <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  mixed: {uniqueCurrencies.join(" · ")}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && !loading && (
              <span className="text-[12px] text-muted-foreground">
                Updated {loadedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[13px]" onClick={fetchAll} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-[13px]"
              onClick={exportWorkbook}
              disabled={events.length === 0 || exporting !== "none"}
              title="Workbook covering registrations, speakers, sponsors, and event performance"
            >
              {exporting === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              Workbook (.xlsx)
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-[13px]" onClick={exportPdf} disabled={events.length === 0 || exporting !== "none"}>
              {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Full Report (.pdf)
            </Button>
          </div>
        </div>

        {/* ── Filters: one row, and everything below answers to it ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-full max-w-full overflow-x-auto rounded-xl bg-muted p-1 sm:w-auto" role="group" aria-label="Period">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={range === k}
                onClick={() => setRange(k)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-lg px-1.5 py-1 text-[12px] font-medium transition-colors sm:flex-none sm:px-2.5",
                  range === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>

          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="h-8 w-full text-[13px] sm:w-[200px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-[13px]">
                  <span className="truncate">{e.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as RegState | "all")}>
            <SelectTrigger className="h-8 w-full text-[13px] sm:w-[170px]">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {statesPresent.map((s) => (
                <SelectItem key={s} value={s} className="text-[13px]">{REG_STATE_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <CurrencySwitcher value={displayCcy} onChange={setDisplayCcy} extra={uniqueCurrencies} />

          {(eventFilter !== "all" || stateFilter !== "all" || range !== "30d") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[13px] text-muted-foreground"
              onClick={() => { setEventFilter("all"); setStateFilter("all"); setRange("30d"); }}
            >
              Clear filters
            </Button>
          )}

        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-[13px]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">
              {data ? "Couldn't refresh the report; the figures below are from the last successful load." : "Couldn't load the report."}
              <span className="ml-1 text-muted-foreground">{error}</span>
            </span>
            <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={fetchAll} disabled={loading}>Try again</Button>
          </div>
        )}

        {firstLoad ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading report data…</span>
          </div>
        ) : !data ? null : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
            <p className="mb-1 text-sm font-semibold">No events yet</p>
            <p className="text-[13px] text-muted-foreground">
              Create your first event to start seeing reports here.
            </p>
          </div>
        ) : (
          <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
            <div className="flex w-full max-w-full overflow-x-auto rounded-xl bg-muted p-1 sm:w-fit" role="group" aria-label="Report">
              {([
                { key: "overview", label: "Overview", icon: LayoutGrid, count: null },
                { key: "speakers", label: "Speaker report", icon: Mic, count: speakerReport.people },
                { key: "sponsors", label: "Sponsor report", icon: Award, count: sponsorReport.companies },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={view === v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors sm:flex-none",
                    view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <v.icon className="h-3.5 w-3.5 shrink-0" />
                  {v.label}
                  {v.count !== null && (
                    <span className="rounded bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">{v.count}</span>
                  )}
                </button>
              ))}
            </div>

            {view === "speakers" ? (
              <SpeakerView
                report={speakerReport}
                speakers={scopedSpeakers}
                eventFilter={eventFilter}
                onExport={exportSpeakers}
              />
            ) : view === "sponsors" ? (
              <SponsorView
                report={sponsorReport}
                sponsors={scopedSponsors}
                eventFilter={eventFilter}
                onExport={exportSponsors}
              />
            ) : (
            <>
            <p className="text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">{periodText}</span>
              {" · "}counted by the day each person registered, in your local time
            </p>
            {unconverted.length > 0 && hasRevenue && (
              <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Exchange rates are unavailable, so amounts in {unconverted.join(", ")} are added without converting to {displayCcy}.
              </p>
            )}

            {/* ── Headline figures ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <StatTile
                icon={Users} label="Registrations"
                value={totals.registrations.toLocaleString()}
                delta={previous ? pctChange(totals.registrations, previous.registrations) : null}
                versus={period.compareLabel}
                spark={report.trend.map((p) => p.registrations)}
              />
              <StatTile
                icon={Ticket} label="Tickets sold"
                value={totals.tickets.toLocaleString()}
                delta={previous ? pctChange(totals.tickets, previous.tickets) : null}
                versus={period.compareLabel}
                hint={totals.pending > 0 ? `${totals.pending.toLocaleString()} awaiting approval` : undefined}
                spark={report.trend.map((p) => p.tickets)}
              />
              <div className="col-span-2 grid sm:col-span-1">
                <StatTile
                  icon={DollarSign} label="Revenue"
                  value={money(totals.revenue)}
                  delta={previous ? pctChange(totals.revenue, previous.revenue) : null}
                  versus={period.compareLabel}
                  hint={totals.paidTickets > 0 ? `${totals.paidTickets.toLocaleString()} paid` : undefined}
                  spark={report.trend.map((p) => p.revenue)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatTile
                icon={TrendingUp} label="Avg. per ticket"
                value={money(totals.avgTicket)}
                hint="Revenue ÷ tickets sold"
              />
              <StatTile
                icon={Percent} label="Confirmation rate"
                value={totals.confirmationRate === null ? "—" : fmtPct(totals.confirmationRate)}
                hint={`${totals.confirmed.toLocaleString()} of ${totals.registrations.toLocaleString()} confirmed`}
              />
              <StatTile
                icon={CheckCircle2} label="Check-in rate"
                value={checkInText}
                hint={checkIn.rate === null
                  ? "No event in this view has started"
                  : `${checkIn.checkedIn.toLocaleString()} of ${checkIn.of.toLocaleString()} · ${checkIn.eventsHeld} ${checkIn.eventsHeld === 1 ? "event" : "events"} held`}
              />
              <StatTile
                icon={CalendarClock} label="Events"
                value={report.events.total.toLocaleString()}
                hint={`${report.events.upcoming} upcoming · ${report.events.published} published`}
              />
            </div>

            {/* ── Charts ── */}
            <div className="grid select-none grid-cols-1 gap-4 lg:grid-cols-6">

              <Card
                className="lg:col-span-4"
                stackAction
                icon={TrendingUp}
                title={trendMetric === "registrations" ? `Registrations by ${per}` : `Revenue by ${per}`}
                subtitle={periodText}
                action={
                  <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="group" aria-label="Measure">
                    {(["registrations", "revenue"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={trendMetric === m}
                        onClick={() => setTrendMetric(m)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition-colors",
                          trendMetric === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                }
              >
                {totals.registrations === 0 ? (
                  <Empty className="min-h-[120px] lg:min-h-[260px]">No registrations in this period.</Empty>
                ) : (
                  <div
                    className="relative min-h-[260px] flex-1"
                    role="img"
                    aria-label={trendMetric === "registrations"
                      ? `${totals.registrations} registrations, ${periodText}, by ${per}`
                      : `${money(totals.revenue)} revenue, ${periodText}, by ${per}`}
                  >
                    {/* Out of flow, so the chart takes the card's height instead of setting it. */}
                    <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis
                          tick={AXIS_TICK} tickLine={false} axisLine={false}
                          width={trendMetric === "revenue" ? 56 : 32}
                          allowDecimals={trendMetric === "revenue"}
                          tickFormatter={(v) => (trendMetric === "revenue" ? compactMoney(Number(v)) : Number(v).toLocaleString())}
                        />
                        <Tooltip
                          cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4 }}
                          content={({ active, payload }) => {
                            const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
                            return p ? <TooltipCard title={p.longLabel} rows={trendRows(p)} /> : null;
                          }}
                        />
                        <Area
                          type="monotone" dataKey={trendMetric}
                          stroke={SERIES} strokeWidth={2} fill={SERIES} fillOpacity={0.1}
                          dot={report.trend.length === 1 ? { r: 4, fill: SERIES, strokeWidth: 0 } : false}
                          activeDot={{ r: 4, fill: SERIES, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-2" icon={BarChart3} title="Registration status" subtitle="Share of registrations in this period">
                {report.states.length === 0 ? (
                  <Empty className="min-h-[120px] lg:min-h-[260px]">No registrations in this period.</Empty>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row lg:flex-col">
                    <div className="relative h-[156px] w-[156px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={report.states} dataKey="count" nameKey="label"
                            cx="50%" cy="50%" innerRadius={52} outerRadius={76}
                            startAngle={90} endAngle={-270}
                            stroke="hsl(var(--card))" strokeWidth={report.states.length > 1 ? 2 : 0}
                            isAnimationActive={false}
                          >
                            {report.states.map((s) => (
                              <Cell key={s.state} fill={STATE_COLOR[s.state]} style={{ outline: "none" }} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              const s = active ? (payload?.[0]?.payload as (typeof report.states)[number] | undefined) : undefined;
                              return s ? <TooltipCard title={s.label} rows={[{ label: `registrations · ${fmtPct(s.share)}`, value: s.count.toLocaleString(), color: STATE_COLOR[s.state] }]} /> : null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-semibold tracking-tight">{totals.registrations.toLocaleString()}</span>
                        <span className="text-[11px] text-muted-foreground">total</span>
                      </div>
                    </div>
                    <ul className="w-full min-w-0 flex-1 space-y-2">
                      {report.states.map((s) => (
                        <li key={s.state} className="flex items-center gap-2 text-[13px]">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATE_COLOR[s.state] }} />
                          <span className="min-w-0 truncate text-muted-foreground">{s.label}</span>
                          <span className="ml-auto shrink-0 font-semibold tabular-nums">{s.count.toLocaleString()}</span>
                          <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">{fmtPct(s.share)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {hasRevenue && (
                <Card className="lg:col-span-3" icon={DollarSign} title="Cumulative revenue" subtitle={`Running total, ${periodText}`}>
                  <div className={CHART_H} role="img" aria-label={`Revenue adding up to ${money(totals.revenue)}, ${periodText}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => compactMoney(Number(v))} />
                        <Tooltip
                          cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4 }}
                          content={({ active, payload }) => {
                            const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
                            return p ? (
                              <TooltipCard title={p.longLabel} rows={[
                                { label: "so far", value: money(p.cumulativeRevenue), color: SERIES },
                                { label: `this ${per}`, value: money(p.revenue) },
                              ]} />
                            ) : null;
                          }}
                        />
                        <Area
                          type="monotone" dataKey="cumulativeRevenue"
                          stroke={SERIES} strokeWidth={2} fill={SERIES} fillOpacity={0.1}
                          dot={report.trend.length === 1 ? { r: 4, fill: SERIES, strokeWidth: 0 } : false}
                          activeDot={{ r: 4, fill: SERIES, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              <Card
                className={hasRevenue ? "lg:col-span-3" : "lg:col-span-2"}
                icon={hasRevenue ? DollarSign : Ticket}
                title={hasRevenue ? "Revenue by event" : "Tickets sold by event"}
                subtitle={eventBars.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${eventBars.length}` : "In this period"}
              >
                {eventBars.length === 0 ? (
                  <Empty className={EMPTY_H}>No tickets sold in this period.</Empty>
                ) : (
                  <div className={cn("flex flex-col", CHART_MIN_H)}>
                    <BarList rows={eventBars.slice(0, BAR_ROWS).map((e) => ({
                      id: e.id,
                      name: e.title,
                      value: hasRevenue ? money(e.revenue) : e.tickets.toLocaleString(),
                      detail: hasRevenue ? `${e.tickets.toLocaleString()} ${e.tickets === 1 ? "ticket" : "tickets"}` : undefined,
                      fraction: (hasRevenue ? e.revenue : e.tickets) / eventBarMax,
                    }))} />
                  </div>
                )}
              </Card>

              <Card
                className={hasRevenue ? "lg:col-span-3" : "lg:col-span-2"}
                icon={CheckCircle2}
                title="Check-in rate by event"
                subtitle={checkInRows.length > BAR_ROWS ? `Top ${BAR_ROWS} of ${checkInRows.length} events held` : "Events that have started"}
              >
                {checkInRows.length === 0 ? (
                  <Empty className={EMPTY_H}>No event in this view has started yet.</Empty>
                ) : (
                  <div className={cn("flex flex-col", CHART_MIN_H)}>
                    <BarList track rows={checkInRows.slice(0, BAR_ROWS).map((e) => ({
                      id: e.id,
                      name: e.title,
                      value: rateText(e.checkInRate),
                      detail: `${e.checkedIn.toLocaleString()} of ${e.checkInOf.toLocaleString()}`,
                      fraction: (e.checkInRate ?? 0) / 100,
                    }))} />
                  </div>
                )}
              </Card>

              <Card
                className={hasRevenue ? "lg:col-span-3" : "lg:col-span-2"}
                icon={Calendar}
                title="Registrations by day of week"
                subtitle="When people sign up"
              >
                {totals.registrations === 0 ? (
                  <Empty className={EMPTY_H}>No registrations in this period.</Empty>
                ) : (
                  <div className={CHART_H} role="img" aria-label="Registrations by day of week">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.weekdays} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.6 }}
                          content={({ active, payload }) => {
                            const d = active ? (payload?.[0]?.payload as (typeof report.weekdays)[number] | undefined) : undefined;
                            return d ? <TooltipCard title={d.name} rows={[{ label: d.registrations === 1 ? "registration" : "registrations", value: d.registrations.toLocaleString(), color: SERIES }]} /> : null;
                          }}
                        />
                        <Bar dataKey="registrations" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card
                className="lg:col-span-6"
                icon={Trophy}
                title="Event performance"
                subtitle={report.byEvent.length > TABLE_ROWS
                  ? `Top ${TABLE_ROWS} of ${report.byEvent.length} events with registrations in this period; the CSV has them all`
                  : "Events with registrations in this period"}
                action={
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={exportFinancial} disabled={report.byEvent.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                {report.byEvent.length === 0 ? (
                  <Empty className="py-8">No registrations in this period.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Event</th>
                          <th className="py-2 pl-4 text-right font-medium">Registrations</th>
                          <th className="py-2 pl-4 text-right font-medium">Tickets</th>
                          <th className="py-2 pl-4 text-right font-medium">Revenue</th>
                          <th className="py-2 pl-4 text-right font-medium">Avg per ticket</th>
                          <th className="py-2 pl-4 text-right font-medium" title="Seats taken to date ÷ capacity, whatever the period">Capacity filled</th>
                          <th className="py-2 pl-4 text-right font-medium" title="Checked in ÷ tickets, once the event has started">Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byEvent.slice(0, TABLE_ROWS).map((e) => (
                          <tr key={e.id} className="border-b border-border last:border-0">
                            <td className="max-w-[18rem] truncate py-2.5 pr-4 font-medium" title={e.title}>{e.title}</td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{e.registrations.toLocaleString()}</td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{e.tickets.toLocaleString()}</td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{money(e.revenue)}</td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums text-muted-foreground">
                              {e.tickets > 0 ? money(e.revenue / e.tickets) : "—"}
                            </td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums text-muted-foreground">
                              {e.fillRate !== null ? `${Math.round(e.fillRate)}% (${e.seatsTaken.toLocaleString()}/${e.capacity?.toLocaleString()})` : "—"}
                            </td>
                            <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums text-muted-foreground">
                              {e.checkInRate !== null ? `${Math.round(e.checkInRate)}%` : <span title="The event has not started">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-3" icon={Mic} title="Speakers"
                action={
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={() => setView("speakers")}>
                    View report <ArrowUpRight className="h-3 w-3" />
                  </Button>
                }
              >
                <p className="text-2xl font-semibold tracking-tight">{speakerReport.people.toLocaleString()}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {speakerReport.slots.toLocaleString()} {speakerReport.slots === 1 ? "assignment" : "assignments"} across {speakerReport.perEvent.length} {speakerReport.perEvent.length === 1 ? "event" : "events"}
                  {speakerReport.rate !== null && ` · ${fmtPct(speakerReport.rate)} checked in`}
                </p>
              </Card>

              <Card className="lg:col-span-3" icon={Award} title="Sponsors"
                action={
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={() => setView("sponsors")}>
                    View report <ArrowUpRight className="h-3 w-3" />
                  </Button>
                }
              >
                <p className="text-2xl font-semibold tracking-tight">{sponsorReport.companies.toLocaleString()}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {sponsorReport.placements.toLocaleString()} {sponsorReport.placements === 1 ? "placement" : "placements"} across {sponsorReport.byEvent.length} {sponsorReport.byEvent.length === 1 ? "event" : "events"}
                  {sponsorReport.tiers > 0 && ` · ${sponsorReport.tiers} ${sponsorReport.tiers === 1 ? "tier" : "tiers"}`}
                </p>
              </Card>

              <Card className="lg:col-span-6" icon={FileText} title="Registrations"
                action={
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={exportRegistrations} disabled={filteredRegs.length === 0}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                }
              >
                <p className="text-[13px] text-muted-foreground">
                  {filteredRegs.length.toLocaleString()} registration{filteredRegs.length === 1 ? "" : "s"} match the current filters.
                </p>
              </Card>
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ReportsPage;
