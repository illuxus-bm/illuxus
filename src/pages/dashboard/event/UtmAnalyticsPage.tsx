/**
 * UtmAnalyticsPage — per-event UTM attribution dashboard.
 *
 * Sections:
 *  1. Header       (create tracked link, exports)
 *  2. Filters      (date range, source, medium, campaign)
 *  3. KPI strip    (clicks, registrations, conversion, checked in)
 *  4. Charts       (registrations by source; top campaigns)
 *  5. Funnel + source breakdown
 *  6. Table        (sortable; registration counts open the leads pop-up;
 *                   copy / edit per link)
 *  7. Saved links  (copy / edit / delete)
 *
 * Data:
 *  • All time  — the `event_utm_summary` RPC.
 *  • Date range — the same grouping computed here from raw clicks and
 *    registrations in the range (`aggregateRows`), since the RPC has no date
 *    parameter.
 *  • Registrations are loaded once (`fetchEventLeads`) and drive the
 *    checked-in counts, the leads pop-up and the lead export, so those always
 *    agree with each other and with the active filters.
 *
 * Source / medium options come from `utm-options` — the same lists the link
 * dialog offers — plus any other value present in the data.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  MousePointerClick,
  Users,
  UserCheck,
  Copy,
  ExternalLink,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  Link2,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { supabaseRpc } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UtmLinkDialog } from "@/components/event/utm/UtmLinkDialog";
import { utmLinkUrl, type UtmLinkDraft } from "@/components/event/utm/utm-link-url";
import { UtmRegistrationsDialog, type UtmBreakdownKey } from "@/components/event/utm/UtmRegistrationsDialog";
import {
  DIRECT_SOURCE, UTM_MEDIUMS, UTM_SOURCES, sourceColor, withExtras,
} from "@/components/event/utm/utm-options";
import {
  aggregateRows, attributionKey, fetchEventClicksSince, fetchEventLeads, hasAttended, rowKey,
  type UtmLead, type UtmRow,
} from "@/lib/utm/utm-data";
import {
  exportLeadsCsv, exportSummaryCsv, leadsFilename, summaryFilename,
} from "@/lib/utm/utm-export";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface UtmLink {
  id:           string;
  event_id:     string;
  utm_source:   string;
  utm_medium:   string;
  utm_campaign: string;
  utm_content:  string | null;
  utm_term:     string | null;
  label:        string | null;
  url:          string;
  created_at:   string;
  updated_at:   string;
  /* joined client-side: */
  has_data?:    boolean;
  clicks?:      number;
  registrations?: number;
}

/** A summary row plus what the leads and saved links add to it. */
interface BreakdownRow extends UtmRow {
  checked_in: number;
  revenue: number;
  saved: UtmLink | null;
}

/** The link a delete confirmation is open for — a breakdown row, with its saved link when one exists. */
interface DeleteTarget {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  label: string | null;
  saved: UtmLink | null;
}

type SortKey = "utm_source" | "utm_medium" | "utm_campaign" | "clicks" | "registrations" | "checked_in" | "conversion_rate";
type SortDir = "asc" | "desc";

type DateRange = "7d" | "30d" | "90d" | "all";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const DATE_OPTIONS: { label: string; value: DateRange; days: number | null }[] = [
  { label: "Last 7 days",  value: "7d",  days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "Last 90 days", value: "90d", days: 90 },
  { label: "All time",     value: "all", days: null },
];

/** Shown when the database function behind link deletion (migration 039) is not installed. */
const NEEDS_DB_UPDATE =
  "Removing a link's click history needs a one-time database update: run supabase/migrations/039_utm_delete_tracking.sql in the Supabase SQL Editor, then delete again.";

/** PostgREST / Postgres "no such function" — the RPC hasn't been deployed. */
const isMissingFunction = (e: { code?: string; message?: string }) =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message ?? "");

/** Conversion can exceed 100% when clicks were under-recorded; cap what we show. */
const capPct = (n: number) => Math.min(100, Math.max(0, n));

/* ─── KPI Card ───────────────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon, label, value, sub, color = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Funnel ─────────────────────────────────────────────────────────────── */

/**
 * Link clicks → registrations that came from a tracked link → of those, who
 * checked in. Direct registrations have no click, so they are left out —
 * counting them against clicks produced rates like "700%" and a negative
 * drop-off.
 */
function FunnelViz({ clicks, registrations, checkedIn }: { clicks: number; registrations: number; checkedIn: number }) {
  const pct = (part: number, whole: number) => (whole > 0 ? capPct((part / whole) * 100) : 0);
  const regPct = pct(registrations, clicks);
  const inPct = pct(checkedIn, registrations);
  const steps: { label: string; value: number; share: number; note: string | null; bar: string; text: string }[] = [
    { label: "Link clicks", value: clicks, share: clicks > 0 ? 100 : 0, note: null, bar: "bg-indigo-500/25", text: "text-indigo-700 dark:text-indigo-300" },
    {
      label: "Registrations from links", value: registrations, share: regPct,
      note: clicks > 0 ? `${regPct.toFixed(1)}% of clicks` : null,
      bar: "bg-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Checked in", value: checkedIn, share: pct(checkedIn, clicks > 0 ? clicks : registrations),
      note: registrations > 0 ? `${inPct.toFixed(1)}% of registrations` : null,
      bar: "bg-amber-500/30", text: "text-amber-700 dark:text-amber-300",
    },
  ];

  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <h3 className="text-sm font-semibold mb-1">Conversion funnel</h3>
      <p className="text-[11px] text-muted-foreground mb-4">Tracked links only — direct registrations aren't counted against clicks.</p>
      <div className="space-y-3">
        {steps.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between gap-2 text-[11px] text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{s.label}</span>
              <span>{s.note}</span>
            </div>
            <div className="h-8 rounded-md bg-muted w-full relative overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-md transition-all ${s.bar}`}
                style={{ width: `${s.value > 0 ? Math.max(6, Math.round(s.share)) : 0}%` }}
              />
              <span className={`absolute inset-0 flex items-center px-3 text-[11px] font-semibold ${s.text}`}>
                {s.value.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Source Leaderboard ──────────────────────────────────────────────────── */

function SourceLeaderboard({ rows }: { rows: UtmRow[] }) {
  const bySource = useMemo(() => {
    const map: Record<string, { clicks: number; registrations: number }> = {};
    for (const r of rows) {
      const s = r.utm_source || "(none)";
      if (!map[s]) map[s] = { clicks: 0, registrations: 0 };
      map[s].clicks        += Number(r.clicks);
      map[s].registrations += Number(r.registrations);
    }
    return Object.entries(map)
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.registrations - a.registrations);
  }, [rows]);

  const totalRegs = bySource.reduce((s, r) => s + r.registrations, 0);
  if (bySource.length === 0) return null;

  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">Source breakdown</h3>
      <div className="space-y-3">
        {bySource.map(({ source, registrations }) => {
          const pct = totalRegs > 0 ? Math.round((registrations / totalRegs) * 100) : 0;
          return (
            <div key={source} className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: sourceColor(source) }}
                  />
                  <span className="font-medium">{source}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{pct}%</span>
                  <span className="font-semibold w-8 text-right">{registrations}</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: sourceColor(source) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Sortable Table Header ──────────────────────────────────────────────── */

function SortableHeader({
  col, label, sort, dir, onSort, align = "left",
}: {
  col: SortKey;
  label: string;
  sort: SortKey;
  dir: SortDir;
  onSort: (col: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === col;
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={`px-4 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
      </span>
    </th>
  );
}

/* ─── Saved Links section ────────────────────────────────────────────────── */

function SavedLinksSection({
  savedRows,
  analyticsRows,
  onEdit,
  onDelete,
}: {
  savedRows: UtmLink[];
  analyticsRows: UtmRow[];
  onEdit: (link: UtmLink) => void;
  /** Ask to delete the link (the page shows the confirmation). */
  onDelete: (link: UtmLink) => void;
}) {

  // Enrich saved links with click+reg data from analytics rows
  const enriched = savedRows.map((link) => {
    const row = analyticsRows.find(
      (r) =>
        r.utm_source   === link.utm_source &&
        r.utm_medium   === link.utm_medium &&
        r.utm_campaign === link.utm_campaign
    );
    const hasData = !!(row && (Number(row.clicks) > 0 || Number(row.registrations) > 0));
    return {
      ...link,
      has_data:      hasData,
      clicks:        Number(row?.clicks ?? 0),
      registrations: Number(row?.registrations ?? 0),
    };
  });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy"));
  };

  if (enriched.length === 0) return null;

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-sm font-semibold">Saved UTM links</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{enriched.length} link{enriched.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="divide-y divide-border">
        {enriched.map((link) => (
          <div key={link.id} className="p-4 space-y-2">
            {/* Label row */}
            <div className="flex items-start gap-2 justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate">
                  {link.label || (
                    <span className="text-muted-foreground font-normal italic">No label</span>
                  )}
                </p>
                {/* UTM params pill row */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[
                    { k: "source",   v: link.utm_source },
                    { k: "medium",   v: link.utm_medium },
                    { k: "campaign", v: link.utm_campaign },
                    ...(link.utm_content ? [{ k: "content", v: link.utm_content }] : []),
                    ...(link.utm_term    ? [{ k: "term",    v: link.utm_term }]    : []),
                  ].map(({ k, v }) => (
                    <span key={k} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border font-mono">
                      <span className="text-muted-foreground">{k}:</span>{v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="shrink-0 flex items-center gap-3 text-[11px] text-muted-foreground">
                {link.has_data ? (
                  <>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" />{link.clicks}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <Users className="h-3 w-3" />{link.registrations}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">No data yet</span>
                )}
              </div>
            </div>

            {/* URL row */}
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[10px] font-mono bg-muted rounded px-2 py-1.5 truncate border border-border text-muted-foreground">
                {link.url}
              </code>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyUrl(link.url)} title="Copy">
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" asChild title="Open">
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-0.5">
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1" onClick={() => onEdit(link)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 ml-auto"
                onClick={() => onDelete(link)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function UtmAnalyticsPage({
  eventId,
  eventSlug,
  orgSlug,
}: {
  eventId: string;
  eventSlug?: string | null;
  orgSlug?: string | null;
}) {
  const qc = useQueryClient();

  /* ── Filter state ── */
  const [dateRange,      setDateRange]      = useState<DateRange>("all");
  const [filterSource,   setFilterSource]   = useState("all");
  const [filterMedium,   setFilterMedium]   = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("");

  // Start of the day N days ago — stable for the whole day so the query key
  // doesn't change on every render.
  const cutoffIso = useMemo<string | null>(() => {
    const days = DATE_OPTIONS.find((o) => o.value === dateRange)?.days ?? null;
    if (days === null) return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [dateRange]);
  const rangeLabel = cutoffIso ? DATE_OPTIONS.find((o) => o.value === dateRange)!.label : null;

  /* ── Data ── */
  const { data: summaryRows = [], isLoading } = useQuery<UtmRow[]>({
    queryKey: ["utm-summary", eventId],
    queryFn: async () => {
      const { data, error } = await supabaseRpc("event_utm_summary" as never, {
        _event_id: eventId,
      } as never);
      if (error) throw error;
      return ((data as UtmRow[]) ?? []).map((r) => ({
        ...r,
        clicks: Number(r.clicks),
        registrations: Number(r.registrations),
        conversion_rate: Number(r.conversion_rate),
      }));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const leadsQuery = useQuery<UtmLead[]>({
    queryKey: ["utm-leads", eventId],
    queryFn: () => fetchEventLeads(eventId),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const allLeads = leadsQuery.data;

  const clicksQuery = useQuery({
    queryKey: ["utm-clicks-since", eventId, cutoffIso],
    queryFn: () => fetchEventClicksSince(eventId, cutoffIso!),
    enabled: cutoffIso !== null,
    staleTime: 60_000,
  });

  const { data: savedLinks = [], refetch: refetchLinks } = useQuery<UtmLink[]>({
    queryKey: ["utm-links", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("utm_links" as never)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as UtmLink[]) ?? [];
    },
    staleTime: 30_000,
  });

  const handleLinkSaved = () => {
    void refetchLinks();
    void qc.invalidateQueries({ queryKey: ["utm-summary", eventId] });
  };

  /* ── Leads in the selected period, grouped by link ── */
  const leads = useMemo<UtmLead[]>(() => {
    const list = allLeads ?? [];
    return cutoffIso ? list.filter((l) => l.created_at >= cutoffIso) : list;
  }, [allLeads, cutoffIso]);

  const leadsByKey = useMemo(() => {
    const map = new Map<string, UtmLead[]>();
    for (const l of leads) {
      const key = attributionKey(l);
      const bucket = map.get(key);
      if (bucket) bucket.push(l);
      else map.set(key, [l]);
    }
    return map;
  }, [leads]);

  /* ── Rows for the selected period (before source/medium/campaign filters) ── */
  const periodRows = useMemo<BreakdownRow[]>(() => {
    const base = cutoffIso ? aggregateRows(clicksQuery.data ?? [], leads) : summaryRows;
    return base.map((r) => {
      const rowLeads = leadsByKey.get(rowKey(r)) ?? [];
      return {
        ...r,
        checked_in: rowLeads.filter(hasAttended).length,
        revenue: rowLeads.reduce((sum, l) => sum + Number(l.amount_paid ?? 0), 0),
        saved: savedLinks.find((l) => l.utm_source === r.utm_source && l.utm_medium === r.utm_medium && l.utm_campaign === r.utm_campaign) ?? null,
      };
    });
  }, [cutoffIso, clicksQuery.data, leads, summaryRows, leadsByKey, savedLinks]);

  // Filter options: everything the link dialog can generate, plus whatever
  // else actually appears in this event's data (custom values, "(direct)").
  const sourceOptions = useMemo(
    () => withExtras(UTM_SOURCES, [...summaryRows.map((r) => r.utm_source), ...savedLinks.map((l) => l.utm_source)]),
    [summaryRows, savedLinks],
  );
  const mediumOptions = useMemo(
    () => withExtras(UTM_MEDIUMS, [...summaryRows.map((r) => r.utm_medium), ...savedLinks.map((l) => l.utm_medium)]),
    [summaryRows, savedLinks],
  );

  /* ── Sort state ── */
  const [sortKey, setSortKey] = useState<SortKey>("registrations");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  /* ── Filtered + sorted rows ── */
  const rows = useMemo<BreakdownRow[]>(() => {
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    let r = periodRows;
    if (filterSource !== "all") r = r.filter((row) => same(row.utm_source ?? "", filterSource));
    if (filterMedium !== "all") r = r.filter((row) => same(row.utm_medium ?? "", filterMedium));
    const q = filterCampaign.trim().toLowerCase();
    if (q) r = r.filter((row) => (row.utm_campaign ?? "").toLowerCase().includes(q));
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [periodRows, filterSource, filterMedium, filterCampaign, sortKey, sortDir]);

  const hasFilters = filterSource !== "all" || filterMedium !== "all" || filterCampaign.trim().length > 0 || dateRange !== "all";
  const periodLoading = cutoffIso !== null && (clicksQuery.isLoading || leadsQuery.isLoading);

  function clearFilters() {
    setDateRange("all");
    setFilterSource("all");
    setFilterMedium("all");
    setFilterCampaign("");
  }

  /* ── KPI aggregates ── */
  const totalClicks   = rows.reduce((s, r) => s + r.clicks, 0);
  const totalRegs     = rows.reduce((s, r) => s + r.registrations, 0);
  const totalCheckedIn = rows.reduce((s, r) => s + r.checked_in, 0);
  // Conversion only makes sense for registrations that came through a link.
  const tracked       = rows.filter((r) => r.utm_source !== DIRECT_SOURCE);
  const trackedRegs   = tracked.reduce((s, r) => s + r.registrations, 0);
  const trackedCheckedIn = tracked.reduce((s, r) => s + r.checked_in, 0);
  const directRegs    = totalRegs - trackedRegs;
  const overallConv   = totalClicks > 0 ? capPct((trackedRegs / totalClicks) * 100).toFixed(1) : "0.0";
  const checkInRate   = totalRegs > 0 ? capPct((totalCheckedIn / totalRegs) * 100).toFixed(0) : "0";

  /* ── Chart data ── */

  // Bar chart: aggregate by source
  const bySource = useMemo(() => {
    const map: Record<string, { clicks: number; registrations: number }> = {};
    for (const r of rows) {
      const s = r.utm_source || "(none)";
      if (!map[s]) map[s] = { clicks: 0, registrations: 0 };
      map[s].clicks        += r.clicks;
      map[s].registrations += r.registrations;
    }
    return Object.entries(map)
      .map(([source, v]) => ({
        source,
        ...v,
        conv: v.clicks > 0 ? capPct((v.registrations / v.clicks) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.registrations - a.registrations);
  }, [rows]);

  // Horizontal bar: top 10 campaigns by registrations
  const topCampaigns = useMemo(() => {
    const map: Record<string, { source: string; medium: string; registrations: number }> = {};
    for (const r of rows) {
      const key = r.utm_campaign || "(none)";
      if (!map[key]) {
        map[key] = { source: r.utm_source, medium: r.utm_medium, registrations: 0 };
      }
      map[key].registrations += r.registrations;
    }
    return Object.entries(map)
      .map(([campaign, v]) => ({ campaign, ...v }))
      .sort((a, b) => b.registrations - a.registrations)
      .slice(0, 10);
  }, [rows]);

  /* ── Dialogs ── */
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; initial: UtmLinkDraft | null }>({ open: false, initial: null });
  const [regsFor, setRegsFor] = useState<UtmBreakdownKey | null>(null);
  const eventRef = { eventId, eventSlug, orgSlug };

  /** A breakdown row as link-dialog values (saved link details when available). */
  const draftFor = (r: BreakdownRow): UtmLinkDraft =>
    r.saved
      ? { utm_source: r.saved.utm_source, utm_medium: r.saved.utm_medium, utm_campaign: r.saved.utm_campaign, utm_content: r.saved.utm_content, utm_term: r.saved.utm_term, label: r.saved.label }
      : { utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign };

  /** The tracked URL behind a row; direct traffic has none. */
  const linkFor = (r: BreakdownRow): string | null =>
    r.utm_source === DIRECT_SOURCE ? null : r.saved?.url ?? utmLinkUrl(eventRef, draftFor(r));

  const copyRowLink = (r: BreakdownRow) => {
    const url = linkFor(r);
    if (!url) return;
    navigator.clipboard.writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy"));
  };

  /* ── Delete a tracked link (after confirmation) ── */
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Activity recorded for the link being deleted (all time).
  const deleteTargetStats = useMemo(() => {
    if (!deleteTarget) return { clicks: 0, registrations: 0 };
    const row = summaryRows.find((r) => r.utm_source === deleteTarget.utm_source && r.utm_medium === deleteTarget.utm_medium && r.utm_campaign === deleteTarget.utm_campaign);
    return { clicks: row?.clicks ?? 0, registrations: row?.registrations ?? 0 };
  }, [deleteTarget, summaryRows]);

  const targetForRow = (r: BreakdownRow): DeleteTarget => ({
    utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
    label: r.saved?.label ?? null, saved: r.saved,
  });
  const targetForLink = (link: UtmLink): DeleteTarget => ({
    utm_source: link.utm_source, utm_medium: link.utm_medium, utm_campaign: link.utm_campaign,
    label: link.label, saved: link,
  });

  const afterDelete = () => {
    setDeleteTarget(null);
    handleLinkSaved();
    void qc.invalidateQueries({ queryKey: ["utm-clicks-since", eventId] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    const stats = deleteTargetStats;
    setDeleting(true);
    try {
      // Removes the saved link AND its recorded clicks (clients cannot delete
      // utm_clicks directly). Registrations are never touched.
      const { data, error } = await supabase.rpc("delete_utm_tracking" as never, {
        _event_id: eventId,
        _utm_source: target.utm_source,
        _utm_medium: target.utm_medium,
        _utm_campaign: target.utm_campaign,
      } as never);

      if (!error) {
        const result = (data ?? {}) as { clicks_deleted?: number; registrations_kept?: number };
        const kept = Number(result.registrations_kept ?? 0);
        const clicks = Number(result.clicks_deleted ?? 0);
        toast.success("Tracked link deleted", {
          description: kept > 0
            ? `${kept} registration${kept === 1 ? "" : "s"} from it ${kept === 1 ? "is" : "are"} kept, so it still appears in the breakdown.`
            : clicks > 0 ? `${clicks} recorded click${clicks === 1 ? "" : "s"} removed.` : undefined,
        });
        afterDelete();
        return;
      }

      if (!isMissingFunction(error)) {
        toast.error("Couldn't delete the link", { description: error.message });
        return;
      }

      // The database function isn't installed yet. A saved link can still be
      // removed directly; its click history cannot.
      if (!target.saved) {
        toast.error("This link can't be deleted yet", { description: NEEDS_DB_UPDATE, duration: 15_000 });
        return;
      }
      // `.select()` so we see what was actually removed: when RLS refuses a
      // delete, PostgREST reports success with zero rows.
      const { data: removed, error: delErr } = await supabase
        .from("utm_links" as never)
        .delete()
        .eq("id", target.saved.id)
        .select("id");
      if (delErr) { toast.error("Couldn't delete the link", { description: delErr.message }); return; }
      if (!(removed as unknown[] | null)?.length) {
        toast.error("Couldn't delete the link", { description: "You don't have permission to delete this link." });
        return;
      }
      if (stats.clicks > 0) toast.warning("Saved link deleted — its click history is still there", { description: NEEDS_DB_UPDATE, duration: 15_000 });
      else toast.success("Tracked link deleted");
      afterDelete();
    } finally {
      setDeleting(false);
    }
  };

  const openRegs = (r: BreakdownRow) =>
    setRegsFor({ utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign });

  /* ── Exports (what's on screen: current period + filters) ── */
  const exportScope = eventSlug || "event";

  const exportSummary = () => {
    exportSummaryCsv(
      rows.map((r) => ({
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        label: r.saved?.label ?? null,
        utm_content: r.saved?.utm_content ?? null,
        utm_term: r.saved?.utm_term ?? null,
        clicks: r.clicks,
        registrations: r.registrations,
        checked_in: r.checked_in,
        conversion_rate: capPct(r.conversion_rate),
        revenue: r.revenue,
        url: linkFor(r),
      })),
      summaryFilename(exportScope),
    );
    toast.success(`Exported ${rows.length} link${rows.length === 1 ? "" : "s"}`);
  };

  const exportLeads = () => {
    const keys = new Set(rows.map(rowKey));
    const selected = leads.filter((l) => keys.has(attributionKey(l)));
    if (selected.length === 0) { toast.info("No registrations match the current filters"); return; }
    exportLeadsCsv(selected, leadsFilename(exportScope));
    toast.success(`Exported ${selected.length} lead${selected.length === 1 ? "" : "s"} with full details`);
  };

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-12 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  const convClassOf = (conv: number) =>
    conv >= 10 ? "text-emerald-500" : conv >= 5 ? "text-amber-500" : "text-muted-foreground";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">UTM Attribution</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Track which channels and campaigns drive registrations for this event.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <Button size="sm" className="h-9 sm:h-8 gap-1.5 text-[12px]" onClick={() => setLinkDialog({ open: true, initial: null })}>
            <Link2 className="h-3.5 w-3.5" />
            Create tracked link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 sm:h-8 gap-1.5 text-[12px]" disabled={periodRows.length === 0}>
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={exportLeads} disabled={leadsQuery.isLoading}>
                <Users className="h-3.5 w-3.5 mr-2 shrink-0" />
                <div className="flex flex-col">
                  <span>Leads — full details</span>
                  <span className="text-xs text-muted-foreground">One row per registration: contact, company, ticket, attendance, UTM</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSummary}>
                <Download className="h-3.5 w-3.5 mr-2 shrink-0" />
                <div className="flex flex-col">
                  <span>Link performance</span>
                  <span className="text-xs text-muted-foreground">One row per link: clicks, registrations, checked in, conversion</span>
                </div>
              </DropdownMenuItem>
              {hasFilters && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground border-t border-border mt-1">
                  Exports include only what matches the current filters.
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="border border-border rounded-xl bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Filters</span>
          {periodLoading && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" aria-label="Updating" />}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5 min-w-0">
            <Label className="text-[11px]">Date range</Label>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label className="text-[11px]">Source</Label>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label className="text-[11px]">Medium</Label>
            <Select value={filterMedium} onValueChange={setFilterMedium}>
              <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="All mediums" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mediums</SelectItem>
                {mediumOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label className="text-[11px]">Campaign</Label>
            <div className="relative">
              <Input
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                className="h-9 text-[12px] max-sm:text-base pr-8"
                placeholder="Search campaigns…"
              />
              {filterCampaign && (
                <button
                  type="button"
                  onClick={() => setFilterCampaign("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear campaign search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={MousePointerClick}
          label="Link clicks"
          value={totalClicks.toLocaleString()}
          color="text-indigo-500"
        />
        <KpiCard
          icon={Users}
          label="Registrations"
          value={totalRegs.toLocaleString()}
          sub={`${trackedRegs.toLocaleString()} from links · ${directRegs.toLocaleString()} direct`}
          color="text-emerald-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Link conversion"
          value={`${overallConv}%`}
          sub={`${trackedRegs.toLocaleString()} registrations from ${totalClicks.toLocaleString()} clicks`}
          color="text-amber-500"
        />
        <KpiCard
          icon={UserCheck}
          label="Checked in"
          value={totalCheckedIn.toLocaleString()}
          sub={`${checkInRate}% of registrations`}
          color="text-cyan-500"
        />
      </div>

      {/* ── Charts section ── */}
      {bySource.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Chart A: Registrations by source (grouped bar) */}
          <div className="border border-border rounded-xl bg-card p-5 min-w-0">
            <h3 className="text-sm font-semibold mb-4">Registrations by source</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bySource} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(val: number, name: string, props) => {
                    if (name === "Registrations" && props.payload?.source !== DIRECT_SOURCE) {
                      const conv = props.payload?.conv ?? "0";
                      return [`${val} (${conv}% conv)`, name];
                    }
                    return [val, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="clicks"
                  name="Clicks"
                  fill="hsl(var(--muted-foreground))"
                  radius={[4, 4, 0, 0]}
                  opacity={0.45}
                />
                <Bar dataKey="registrations" name="Registrations" radius={[4, 4, 0, 0]}>
                  {bySource.map((entry) => (
                    <Cell key={entry.source} fill={sourceColor(entry.source)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart B: Top campaigns (horizontal bar) */}
          {topCampaigns.length > 0 && (
            <div className="border border-border rounded-xl bg-card p-5 min-w-0">
              <h3 className="text-sm font-semibold mb-4">Top campaigns</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={topCampaigns}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="campaign"
                    tick={{ fontSize: 10 }}
                    width={90}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "…" : v}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(val: number, _name: string, props) => {
                      const { source, medium } = props.payload ?? {};
                      return [`${val} regs — ${source} / ${medium}`, "Registrations"];
                    }}
                  />
                  <Bar dataKey="registrations" name="Registrations" radius={[0, 4, 4, 0]}>
                    {topCampaigns.map((entry) => (
                      <Cell key={entry.campaign} fill={sourceColor(entry.source)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Funnel + Source leaderboard ── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FunnelViz clicks={totalClicks} registrations={trackedRegs} checkedIn={trackedCheckedIn} />
          <SourceLeaderboard rows={rows} />
        </div>
      )}

      {/* ── Full breakdown ── */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-16 px-4 text-center text-[13px] text-muted-foreground">
          {periodLoading
            ? "Loading this period…"
            : periodRows.length > 0 || summaryRows.length > 0
              ? "Nothing matches the current filters. Try adjusting or clearing them."
              : "No UTM data yet. Create a tracked link above and share it to start collecting attribution data."}
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Full attribution breakdown</h3>
            <span className="text-[11px] text-muted-foreground">
              {rows.length} link{rows.length !== 1 ? "s" : ""}{rangeLabel ? ` · ${rangeLabel}` : ""}
            </span>
          </div>

          {/* Phones: one card per link */}
          <ul className="sm:hidden divide-y divide-border">
            {rows.map((r) => {
              const conv = capPct(r.conversion_rate);
              const isDirect = r.utm_source === DIRECT_SOURCE;
              return (
                <li key={rowKey(r)} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: sourceColor(r.utm_source) }} />
                        <span className="text-[14px] font-semibold truncate">{r.utm_source}</span>
                        <span className="text-[12px] text-muted-foreground truncate">/ {r.utm_medium}</span>
                      </div>
                      <p className="mt-1 font-mono text-[11.5px] text-muted-foreground break-all">{r.utm_campaign}</p>
                      {r.saved?.label && <p className="mt-0.5 text-[12px] text-foreground/80 truncate">{r.saved.label}</p>}
                    </div>
                    {!isDirect && (
                      <div className="flex items-center shrink-0 -mr-1.5">
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => copyRowLink(r)} aria-label="Copy link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setLinkDialog({ open: true, initial: draftFor(r) })} aria-label="Edit link">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(targetForRow(r))} aria-label="Delete link">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 py-2">
                      <p className="text-[15px] font-semibold tabular-nums">{r.clicks.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Clicks</p>
                    </div>
                    <button
                      type="button"
                      disabled={r.registrations === 0}
                      onClick={() => openRegs(r)}
                      className="rounded-lg bg-emerald-500/10 py-2 disabled:bg-muted/50 enabled:active:bg-emerald-500/20"
                      aria-label={`View ${r.registrations} registrations`}
                    >
                      <p className={`text-[15px] font-semibold tabular-nums ${r.registrations > 0 ? "text-emerald-700 dark:text-emerald-400 underline decoration-dotted underline-offset-4" : ""}`}>
                        {r.registrations.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Registered</p>
                    </button>
                    <div className="rounded-lg bg-muted/50 py-2">
                      <p className="text-[15px] font-semibold tabular-nums">{r.checked_in.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Checked in</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 py-2">
                      <p className={`text-[15px] font-semibold tabular-nums ${isDirect ? "text-muted-foreground" : convClassOf(conv)}`}>
                        {isDirect ? "—" : `${conv.toFixed(1)}%`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Conv.</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Larger screens: sortable table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <SortableHeader col="utm_source"      label="Source"        sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader col="utm_medium"      label="Medium"        sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader col="utm_campaign"    label="Campaign"      sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Content</th>
                  <SortableHeader col="clicks"          label="Clicks"        sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader col="registrations"   label="Registrations" sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader col="checked_in"      label="Checked in"    sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader col="conversion_rate" label="Conv %"        sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const conv = capPct(r.conversion_rate);
                  const isDirect = r.utm_source === DIRECT_SOURCE;
                  return (
                    <tr key={rowKey(r)} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: sourceColor(r.utm_source) }}
                          />
                          <span className="font-medium">{r.utm_source}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.utm_medium}</td>
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded truncate block" title={r.utm_campaign}>
                          {r.utm_campaign}
                        </span>
                        {r.saved?.label && <span className="block text-[11px] text-muted-foreground truncate mt-0.5">{r.saved.label}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[11px] max-w-[120px] truncate">
                        {r.saved?.utm_content || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {r.registrations > 0 ? (
                          <button
                            type="button"
                            onClick={() => openRegs(r)}
                            className="text-emerald-600 underline decoration-dotted underline-offset-4 hover:decoration-solid hover:text-emerald-700"
                            title="View these registrations"
                          >
                            {r.registrations.toLocaleString()}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.checked_in.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {isDirect ? (
                          <span className="text-muted-foreground" title="Direct registrations have no link clicks">—</span>
                        ) : (
                          <span className={`font-medium ${convClassOf(conv)}`}>{conv.toFixed(1)}%</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {/* Direct traffic has no tracked link to copy or edit. */}
                        {!isDirect && (
                          <div className="inline-flex items-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyRowLink(r)} title="Copy link" aria-label="Copy link">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLinkDialog({ open: true, initial: draftFor(r) })} title="Edit link" aria-label="Edit link">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(targetForRow(r))} title="Delete link" aria-label="Delete link">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Saved links ── */}
      <SavedLinksSection
        savedRows={savedLinks}
        analyticsRows={summaryRows}
        onDelete={(link) => setDeleteTarget(targetForLink(link))}
        onEdit={(link) => setLinkDialog({
          open: true,
          initial: { utm_source: link.utm_source, utm_medium: link.utm_medium, utm_campaign: link.utm_campaign, utm_content: link.utm_content, utm_term: link.utm_term, label: link.label },
        })}
      />

      <UtmLinkDialog
        open={linkDialog.open}
        onOpenChange={(open) => setLinkDialog((d) => ({ ...d, open }))}
        eventId={eventId}
        eventSlug={eventSlug}
        orgSlug={orgSlug}
        initial={linkDialog.initial}
        onSaved={handleLinkSaved}
      />
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tracked link?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                {deleteTarget && (
                  <div className="flex flex-wrap gap-1.5">
                    {deleteTarget.label && <span className="text-[13px] font-medium text-foreground w-full">{deleteTarget.label}</span>}
                    {([["source", deleteTarget.utm_source], ["medium", deleteTarget.utm_medium], ["campaign", deleteTarget.utm_campaign]] as const).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border font-mono max-w-full">
                        <span className="text-muted-foreground">{k}:</span><span className="truncate">{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[13px]">
                  This removes the link{deleteTarget?.saved ? " from your saved links" : ""}
                  {deleteTargetStats.clicks > 0 && (
                    <> and permanently deletes its{" "}
                      <span className="font-medium text-foreground">
                        {deleteTargetStats.clicks.toLocaleString()} recorded click{deleteTargetStats.clicks === 1 ? "" : "s"}
                      </span>
                    </>
                  )}.
                </p>
                {deleteTargetStats.registrations > 0 ? (
                  <p className="text-[13px]">
                    Its{" "}
                    <span className="font-medium text-foreground">
                      {deleteTargetStats.registrations.toLocaleString()} registration{deleteTargetStats.registrations === 1 ? "" : "s"}
                    </span>{" "}
                    {deleteTargetStats.registrations === 1 ? "is a lead and is" : "are leads and are"} kept, still credited to this
                    link — so it will keep appearing in the breakdown.
                  </p>
                ) : (
                  <p className="text-[13px]">It has no registrations, so it will disappear from this page.</p>
                )}
                <p className="text-[12px] text-muted-foreground">This can't be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={deleting} className="mt-0 h-10 sm:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="h-10 sm:h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UtmRegistrationsDialog
        row={regsFor}
        leads={regsFor ? leadsByKey.get(rowKey(regsFor)) ?? [] : []}
        loading={leadsQuery.isLoading}
        error={leadsQuery.isError}
        rangeLabel={rangeLabel}
        onOpenChange={(open) => { if (!open) setRegsFor(null); }}
      />

    </div>
  );
}
