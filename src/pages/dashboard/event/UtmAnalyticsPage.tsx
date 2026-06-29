/**
 * UtmAnalyticsPage — comprehensive per-event UTM attribution dashboard.
 *
 * Sections:
 *  1. Filters bar  (date range, source, medium, campaign, clear)
 *  2. KPI strip    (total clicks, registrations, conv%, top source)
 *  3. Charts       (bar: regs by source; horizontal bar: top campaigns)
 *  4. Funnel       (CSS-only clicks → registrations)
 *  5. Table        (sortable, colour-coded conv%, export CSV)
 *  6. Source leaderboard (text-based with mini progress bars)
 *  7. Share link generator
 *
 * Data: event_utm_summary RPC via supabaseRpc.
 */
import { useQuery } from "@tanstack/react-query";
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
  Share2,
  Copy,
  Check,
  ExternalLink,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
} from "lucide-react";
import { supabaseRpc } from "@/lib/observability";
import { eventPublicUrl } from "@/lib/event-routes";
import { buildUtmUrl } from "@/lib/utm";
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
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface UtmRow {
  utm_source:      string;
  utm_medium:      string;
  utm_campaign:    string;
  clicks:          number;
  registrations:   number;
  conversion_rate: number;
}

type SortKey = "utm_source" | "utm_medium" | "utm_campaign" | "clicks" | "registrations" | "conversion_rate";
type SortDir = "asc" | "desc";

type DateRange = "7d" | "30d" | "90d" | "all";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const SOURCE_COLORS: Record<string, string> = {
  email:     "#6366f1",
  whatsapp:  "#22c55e",
  linkedin:  "#0ea5e9",
  twitter:   "#1d9bf0",
  facebook:  "#3b82f6",
  instagram: "#ec4899",
  sms:       "#f59e0b",
  qr:        "#8b5cf6",
  "(direct)":"#94a3b8",
  "(none)":  "#cbd5e1",
};

const ALL_SOURCES  = ["email","whatsapp","linkedin","twitter","facebook","instagram","sms","qr","(direct)"];
const ALL_MEDIUMS  = ["transactional","broadcast","organic","paid","referral"];
const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Last 7d",  value: "7d"  },
  { label: "Last 30d", value: "30d" },
  { label: "Last 90d", value: "90d" },
  { label: "All time", value: "all" },
];

function sourceColor(src: string): string {
  return SOURCE_COLORS[(src || "").toLowerCase()] ?? "#6366f1";
}

function daysSince(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/* ─── CSV Export ─────────────────────────────────────────────────────────── */

function exportCsv(rows: UtmRow[]): void {
  const header = "Source,Medium,Campaign,Content,Clicks,Registrations,Conversion%";
  const body = rows.map((r) =>
    [
      r.utm_source,
      r.utm_medium,
      r.utm_campaign,
      "—",
      r.clicks,
      r.registrations,
      Number(r.conversion_rate).toFixed(1),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "utm-analytics.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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

/* ─── Funnel ──────────────────────────────────────────────────────────────── */

function FunnelViz({ clicks, registrations }: { clicks: number; registrations: number }) {
  const convPct = clicks > 0 ? ((registrations / clicks) * 100).toFixed(1) : "0";
  const dropPct = clicks > 0 ? (((clicks - registrations) / clicks) * 100).toFixed(1) : "0";
  const regWidth = clicks > 0 ? Math.max(10, Math.round((registrations / clicks) * 100)) : 0;

  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">Conversion funnel</h3>
      <div className="space-y-3">
        {/* Clicks bar */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span className="font-medium text-foreground">Clicks</span>
            <span>{clicks.toLocaleString()}</span>
          </div>
          <div className="h-8 rounded-md bg-indigo-500/20 w-full flex items-center px-3">
            <span className="text-[11px] text-indigo-600 font-semibold">{clicks.toLocaleString()}</span>
          </div>
        </div>

        {/* Arrow + drop rate */}
        <div className="flex items-center gap-2 pl-2">
          <div className="h-6 w-px bg-border" />
          <span className="text-[11px] text-muted-foreground">
            ↓ {dropPct}% drop-off
          </span>
        </div>

        {/* Registrations bar */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span className="font-medium text-foreground">Registrations</span>
            <span>{registrations.toLocaleString()}</span>
          </div>
          <div className="h-8 rounded-md bg-muted w-full relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/30 rounded-md transition-all"
              style={{ width: `${regWidth}%` }}
            />
            <span className="absolute inset-0 flex items-center px-3 text-[11px] text-emerald-700 font-semibold">
              {registrations.toLocaleString()} ({convPct}%)
            </span>
          </div>
        </div>
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

/* ─── Multi-select pill input ────────────────────────────────────────────── */

function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const allSelected = selected.length === 0;

  function toggle(opt: string) {
    if (selected.includes(opt)) {
      const next = selected.filter((s) => s !== opt);
      onChange(next);
    } else {
      onChange([...selected, opt]);
    }
  }

  return (
    <div className="space-y-1.5 min-w-[140px]">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${allSelected ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          All
        </button>
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${active ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-foreground"}`}
              style={active ? { backgroundColor: sourceColor(opt), borderColor: sourceColor(opt) } : {}}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Share-link generator ───────────────────────────────────────────────── */

function ShareLinkGenerator({
  eventId, eventSlug, orgSlug,
}: {
  eventId: string;
  eventSlug?: string | null;
  orgSlug?: string | null;
}) {
  const [source,   setSource]   = useState("email");
  const [medium,   setMedium]   = useState("transactional");
  const [campaign, setCampaign] = useState(eventSlug || eventId.slice(0, 8));
  const [content,  setContent]  = useState("");
  const [term,     setTerm]     = useState("");
  const [copied,   setCopied]   = useState(false);

  const baseUrl = eventPublicUrl(
    { id: eventId, slug: eventSlug ?? undefined },
    orgSlug ?? undefined,
  );

  const trackedUrl = useMemo(() => {
    if (!source || !medium || !campaign) return baseUrl;
    return buildUtmUrl(baseUrl, {
      utm_source:   source,
      utm_medium:   medium,
      utm_campaign: campaign,
      utm_content:  content || undefined,
      utm_term:     term || undefined,
    });
  }, [baseUrl, source, medium, campaign, content, term]);

  const copy = () => {
    navigator.clipboard.writeText(trackedUrl)
      .then(() => {
        setCopied(true);
        toast.success("Link copied");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Could not copy"));
  };

  return (
    <div className="border border-border rounded-xl bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">Generate tracked link</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px]">Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["email","whatsapp","linkedin","twitter","instagram","facebook","sms","qr","manual"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Medium</Label>
          <Select value={medium} onValueChange={setMedium}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["transactional","broadcast","organic","paid","referral","copy"].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Campaign</Label>
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="h-8 text-[12px]"
            placeholder="e.g. launch-email-1"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Content (optional)</Label>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-8 text-[12px]"
            placeholder="e.g. cta-button"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Term (optional)</Label>
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="h-8 text-[12px]"
            placeholder="e.g. react-conference"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono bg-muted rounded-md px-3 py-2 truncate border border-border">
          {trackedUrl}
        </code>
        <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" onClick={copy}>
          {copied
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 shrink-0" asChild>
          <a href={trackedUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
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
  /* ── Data ── */
  const { data: rawRows = [], isLoading } = useQuery<UtmRow[]>({
    queryKey: ["utm-summary", eventId],
    queryFn: async () => {
      const { data, error } = await supabaseRpc("event_utm_summary" as never, {
        _event_id: eventId,
      } as never);
      if (error) throw error;
      return (data as UtmRow[]) ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  /* ── Filter state ── */
  const [dateRange,      setDateRange]      = useState<DateRange>("all");
  const [filterSources,  setFilterSources]  = useState<string[]>([]);
  const [filterMediums,  setFilterMediums]  = useState<string[]>([]);
  const [filterCampaign, setFilterCampaign] = useState("");

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

  /* ── Date cutoff ── */
  const dateCutoff = useMemo<Date | null>(() => {
    if (dateRange === "all") return null;
    return daysSince(dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90);
  }, [dateRange]);

  /* ── Client-side filtering ── */
  const rows = useMemo<UtmRow[]>(() => {
    let r = rawRows;
    // Date filter — the RPC doesn't expose a created_at column, so we can only
    // note that "All time" is the only fully reliable option. When a date filter
    // is active we keep it in state but can't filter without a timestamp.
    // We leave dateCutoff in state for future RPC improvements.
    void dateCutoff; // intentionally unused until RPC exposes created_at
    if (filterSources.length > 0) {
      r = r.filter((row) => filterSources.includes(row.utm_source?.toLowerCase() ?? ""));
    }
    if (filterMediums.length > 0) {
      r = r.filter((row) => filterMediums.includes(row.utm_medium?.toLowerCase() ?? ""));
    }
    if (filterCampaign.trim()) {
      const q = filterCampaign.trim().toLowerCase();
      r = r.filter((row) => row.utm_campaign?.toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rawRows, dateCutoff, filterSources, filterMediums, filterCampaign, sortKey, sortDir]);

  const hasFilters = filterSources.length > 0 || filterMediums.length > 0 || filterCampaign.trim().length > 0 || dateRange !== "all";

  function clearFilters() {
    setDateRange("all");
    setFilterSources([]);
    setFilterMediums([]);
    setFilterCampaign("");
  }

  /* ── KPI aggregates ── */
  const totalClicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
  const totalRegs   = rows.reduce((s, r) => s + Number(r.registrations), 0);
  const overallConv = totalClicks > 0 ? ((totalRegs / totalClicks) * 100).toFixed(1) : "0";

  const topSourceRow = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.utm_source] = (map[r.utm_source] ?? 0) + Number(r.registrations);
    }
    const best = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : "—";
  }, [rows]);

  /* ── Chart data ── */

  // Bar chart: aggregate by source
  const bySource = useMemo(() => {
    const map: Record<string, { clicks: number; registrations: number }> = {};
    for (const r of rows) {
      const s = r.utm_source || "(none)";
      if (!map[s]) map[s] = { clicks: 0, registrations: 0 };
      map[s].clicks        += Number(r.clicks);
      map[s].registrations += Number(r.registrations);
    }
    return Object.entries(map)
      .map(([source, v]) => ({
        source,
        ...v,
        conv: v.clicks > 0 ? ((v.registrations / v.clicks) * 100).toFixed(1) : "0",
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
      map[key].registrations += Number(r.registrations);
    }
    return Object.entries(map)
      .map(([campaign, v]) => ({ campaign, ...v }))
      .sort((a, b) => b.registrations - a.registrations)
      .slice(0, 10);
  }, [rows]);

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

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">UTM Attribution</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Track which channels and campaigns drive registrations for this event.
          </p>
        </div>
        {rows.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[12px]"
            onClick={() => exportCsv(rows)}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>

      {/* ── Filters bar ── */}
      <div className="border border-border rounded-xl bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Filters</span>
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

        {/* Date range */}
        <div className="space-y-1.5">
          <Label className="text-[11px]">Date range</Label>
          <div className="flex gap-1.5 flex-wrap">
            {DATE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDateRange(value)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${dateRange === value ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {dateRange !== "all" && (
            <p className="text-[10px] text-amber-600">
              Date filtering requires timestamp data — showing all rows. Select "All time" to dismiss.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MultiSelect
            label="Source"
            options={ALL_SOURCES}
            selected={filterSources}
            onChange={setFilterSources}
          />
          <MultiSelect
            label="Medium"
            options={ALL_MEDIUMS}
            selected={filterMediums}
            onChange={setFilterMediums}
          />
          <div className="space-y-1.5">
            <Label className="text-[11px]">Campaign search</Label>
            <div className="relative">
              <Input
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                className="h-7 text-[11px] pr-7"
                placeholder="Filter campaigns…"
              />
              {filterCampaign && (
                <button
                  type="button"
                  onClick={() => setFilterCampaign("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
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
          label="Total clicks"
          value={totalClicks.toLocaleString()}
          color="text-indigo-500"
        />
        <KpiCard
          icon={Users}
          label="Registrations"
          value={totalRegs.toLocaleString()}
          color="text-emerald-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversion rate"
          value={`${overallConv}%`}
          sub={`${totalRegs} of ${totalClicks} clicks`}
          color="text-amber-500"
        />
        <KpiCard
          icon={Share2}
          label="Top source"
          value={topSourceRow}
          color="text-cyan-500"
        />
      </div>

      {/* ── Charts section ── */}
      {bySource.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Chart A: Registrations by source (grouped bar) */}
          <div className="border border-border rounded-xl bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Registrations by source</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bySource} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(val: number, name: string, props) => {
                    if (name === "Registrations") {
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
            <div className="border border-border rounded-xl bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Top campaigns</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={topCampaigns}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
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
          <FunnelViz clicks={totalClicks} registrations={totalRegs} />
          <SourceLeaderboard rows={rows} />
        </div>
      )}

      {/* ── Full breakdown table ── */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-16 text-center text-[13px] text-muted-foreground">
          {rawRows.length > 0
            ? "No rows match the current filters. Try adjusting or clearing them."
            : "No UTM data yet. Share a tracked link below to start collecting attribution data."}
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Full attribution breakdown</h3>
            <span className="text-[11px] text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <SortableHeader col="utm_source"      label="Source"        sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader col="utm_medium"      label="Medium"        sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHeader col="utm_campaign"    label="Campaign"      sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Content</th>
                  <SortableHeader col="clicks"          label="Clicks"        sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader col="registrations"   label="Registrations" sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader col="conversion_rate" label="Conv %"        sort={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost/reg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => {
                  const conv = Number(r.conversion_rate);
                  const convClass = conv >= 10
                    ? "text-emerald-500"
                    : conv >= 5
                    ? "text-amber-500"
                    : "text-muted-foreground";
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: sourceColor(r.utm_source) }}
                          />
                          <span className="font-medium">
                            {r.utm_source || <span className="text-muted-foreground">(none)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.utm_medium || <span className="italic">(none)</span>}
                      </td>
                      <td className="px-4 py-2.5 max-w-[160px]">
                        <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded truncate block">
                          {r.utm_campaign || <span className="text-muted-foreground not-italic">(none)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground italic text-[11px]">—</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.clicks).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">
                        {Number(r.registrations).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={`font-medium ${convClass}`}>
                          {conv.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Share link generator ── */}
      <ShareLinkGenerator eventId={eventId} eventSlug={eventSlug} orgSlug={orgSlug} />

    </div>
  );
}
