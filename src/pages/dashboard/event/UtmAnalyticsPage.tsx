/**
 * UtmAnalyticsPage — per-event UTM attribution dashboard.
 *
 * Shows which campaigns / channels drove registrations for this event.
 * Data comes from the `event_utm_summary` RPC which joins utm_clicks
 * (page views) with registrations (conversions) and computes conversion %.
 *
 * Mounted at `/dashboard/events/:id?tab=utm` inside EventDetailPage.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, MousePointerClick, Users, Share2, Copy, Check,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseRpc } from "@/lib/observability";
import { eventPublicUrl } from "@/lib/event-routes";
import { buildUtmUrl } from "@/lib/utm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, sub, color = "text-foreground" }: {
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
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  email:    "#6366f1",
  whatsapp: "#22c55e",
  linkedin: "#0ea5e9",
  twitter:  "#1d9bf0",
  facebook: "#3b82f6",
  instagram:"#ec4899",
  sms:      "#f59e0b",
  qr:       "#8b5cf6",
  "(direct)":"#94a3b8",
  "(none)": "#cbd5e1",
};
function sourceColor(src: string) {
  return SOURCE_COLORS[src.toLowerCase()] ?? "#6366f1";
}

/* ─── Share-link generator ───────────────────────────────────────────────── */

function ShareLinkGenerator({
  eventId, eventSlug, orgSlug,
}: { eventId: string; eventSlug?: string | null; orgSlug?: string | null }) {
  const [source,   setSource]   = useState("email");
  const [medium,   setMedium]   = useState("transactional");
  const [campaign, setCampaign] = useState(eventSlug || eventId.slice(0, 8));
  const [content,  setContent]  = useState("");
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
    });
  }, [baseUrl, source, medium, campaign, content]);

  const copy = () => {
    navigator.clipboard.writeText(trackedUrl).then(() => {
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error("Could not copy"));
  };

  return (
    <div className="border border-border rounded-xl bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">Generate tracked link</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px]">Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["email", "whatsapp", "linkedin", "twitter", "instagram", "facebook", "sms", "qr", "manual"].map(s => (
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
              {["transactional", "broadcast", "organic", "paid", "referral", "copy"].map(m => (
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
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono bg-muted rounded-md px-3 py-2 truncate border border-border">
          {trackedUrl}
        </code>
        <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
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
  const { isAdmin } = useAuth();

  const { data: rows = [], isLoading } = useQuery<UtmRow[]>({
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

  const totalClicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
  const totalRegs   = rows.reduce((s, r) => s + Number(r.registrations), 0);
  const avgConv     = totalClicks > 0 ? ((totalRegs / totalClicks) * 100).toFixed(1) : "0";
  const topSource   = rows[0]?.utm_source ?? "—";

  // Chart data: aggregate by source for the bar chart.
  const bySource = useMemo(() => {
    const map: Record<string, { clicks: number; registrations: number }> = {};
    for (const r of rows) {
      const s = r.utm_source;
      if (!map[s]) map[s] = { clicks: 0, registrations: 0 };
      map[s].clicks        += Number(r.clicks);
      map[s].registrations += Number(r.registrations);
    }
    return Object.entries(map)
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.registrations - a.registrations);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">UTM Attribution</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Track which channels and campaigns drive registrations for this event.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MousePointerClick} label="Total clicks"    value={totalClicks.toLocaleString()} color="text-indigo-500" />
        <KpiCard icon={Users}             label="Registrations"   value={totalRegs.toLocaleString()}   color="text-emerald-500" />
        <KpiCard icon={TrendingUp}        label="Conversion rate" value={`${avgConv}%`}                color="text-amber-500" />
        <KpiCard icon={Share2}            label="Top source"      value={topSource}                    color="text-cyan-500" />
      </div>

      {/* Bar chart — registrations by source */}
      {bySource.length > 0 && (
        <div className="border border-border rounded-xl bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Registrations by source</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bySource} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="source" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="clicks" name="Clicks" fill="hsl(var(--muted-foreground))" radius={[4,4,0,0]} opacity={0.5} />
              <Bar dataKey="registrations" name="Registrations" radius={[4,4,0,0]}>
                {bySource.map((entry) => (
                  <Cell key={entry.source} fill={sourceColor(entry.source)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Full breakdown table */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-16 text-center text-[13px] text-muted-foreground">
          No UTM data yet. Share a tracked link below to start collecting attribution data.
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">Full attribution breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium">Medium</th>
                  <th className="text-left px-4 py-2.5 font-medium">Campaign</th>
                  <th className="text-right px-4 py-2.5 font-medium">Clicks</th>
                  <th className="text-right px-4 py-2.5 font-medium">Registrations</th>
                  <th className="text-right px-4 py-2.5 font-medium">Conv %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
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
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {r.utm_campaign}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.clicks).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">
                      {Number(r.registrations).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={`font-medium ${Number(r.conversion_rate) >= 10 ? "text-emerald-500" : Number(r.conversion_rate) >= 5 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {Number(r.conversion_rate).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Share link generator */}
      <ShareLinkGenerator eventId={eventId} eventSlug={eventSlug} orgSlug={orgSlug} />
    </div>
  );
}
