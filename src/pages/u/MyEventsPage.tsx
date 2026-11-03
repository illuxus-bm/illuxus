import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEventDate, formatEventDateTime } from "@/lib/datetime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { PullToRefresh } from "@/components/native/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Ticket, CheckCircle2, Hourglass, Clock3, ChevronRight, XCircle } from "lucide-react";
import { hapticSelection } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  approval_status: string;
  status: string;
  checked_in: boolean;
  events: {
    id: string;
    title: string;
    slug: string | null;
    date: string;
    end_date: string | null;
    venue: string | null;
    location: string | null;
    image_url: string | null;
    banner_landscape_url?: string | null;
    description: string | null;
    timezone: string | null;
    organizations?: { slug?: string | null; subdomain?: string | null } | null;
  } | null;
}

type Tab = "upcoming" | "pending" | "past";
const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "pending", label: "Pending" },
  { key: "past", label: "Past" },
];

function inTab(r: Row, tab: Tab, now: Date): boolean {
  if (!r.events) return false;
  // Use the event's END date so a multi-day event stays in Upcoming
  // until it's actually finished, then flips into Past.
  const endOrStart = new Date(r.events.end_date || r.events.date);
  if (tab === "pending") return r.approval_status === "pending" || r.approval_status === "waitlisted";
  if (tab === "past") return endOrStart < now;
  return endOrStart >= now && r.approval_status === "approved";
}

export default function MyEventsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("registrations")
      .select("id, approval_status, status, checked_in, events:events(id, title, slug, date, end_date, venue, location, image_url, banner_landscape_url, description, timezone, organizations(slug, subdomain))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const { filtered, counts } = useMemo(() => {
    const now = new Date();
    const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => inTab(r, t.key, now)).length])) as Record<Tab, number>;
    const filtered = rows.filter((r) => inTab(r, tab, now));
    // Upcoming soonest first; past most recent first.
    filtered.sort((a, b) => {
      const da = new Date(a.events!.date).getTime();
      const db = new Date(b.events!.date).getTime();
      return tab === "past" ? db - da : da - db;
    });
    return { filtered, counts };
  }, [rows, tab]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <PullToRefresh onRefresh={load} />
      <main className="max-w-3xl mx-auto px-4 pb-8 pt-3 sm:py-8">
        <h1 className="text-[28px] sm:text-2xl font-semibold tracking-tight mb-1">My tickets</h1>
        <p className="text-[13px] text-muted-foreground mb-5 sm:mb-6">RSVPs, requests, and past events you've attended.</p>

        {/* A segmented control: the full width on phones. */}
        <div role="tablist" aria-label="Which tickets" className="app-chrome flex sm:inline-flex items-center gap-1 p-1 bg-secondary rounded-full mb-5 sm:mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => { if (tab !== t.key) hapticSelection(); setTab(t.key); }}
              className={cn(
                "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 h-9 sm:h-7 rounded-full text-[13px] sm:text-[12px] font-medium transition-colors",
                tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!loading && counts[t.key] > 0 && (
                <span className={cn("min-w-[1.25rem] rounded-full px-1.5 text-[11px] leading-5 tabular-nums", tab === t.key ? "bg-primary/10 text-primary" : "bg-background/70")}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl px-6 py-12 text-center">
            <div className="h-12 w-12 mx-auto rounded-xl bg-secondary flex items-center justify-center mb-3">
              <Ticket className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">
              {tab === "pending" ? "No requests waiting" : tab === "past" ? "No past events yet" : "Nothing coming up"}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-1 mb-4">Find an event and RSVP — it'll show up here.</p>
            <Button asChild size="sm" className="h-9 rounded-full px-4 text-[13px]"><Link to="/discover">Browse events</Link></Button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((r) => (
              <RowCard key={r.id} row={r} past={tab === "past"} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

/** One registration: the date as a calendar tile, the event, its status. Opens the ticket. */
function RowCard({ row, past }: { row: Row; past: boolean }) {
  const ev = row.events!;
  const venue = [ev.venue, ev.location].filter(Boolean).join(" · ");
  const image = ev.banner_landscape_url || ev.image_url;
  const month = formatEventDate(ev.date, ev.timezone, { month: "short" });
  const day = formatEventDate(ev.date, ev.timezone, { day: "numeric" });

  return (
    <li>
      <Link
        to={`/t/${row.id}`}
        className={cn(
          "group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-foreground/20 active:scale-[0.99] active:bg-muted/40",
          past && "opacity-80",
        )}
      >
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-secondary">
          {image ? (
            <img loading="lazy" decoding="async" src={image} alt="" className={cn("h-full w-full object-cover", past && "grayscale")} />
          ) : null}
          {/* The date, over the picture when there is one. */}
          <div className={cn("absolute inset-0 flex flex-col items-center justify-center leading-none", image ? "bg-black/35 text-white" : "text-foreground")}>
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-90">{month}</span>
            <span className="mt-1 text-[24px] font-semibold tracking-tight">{day}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <StatusBadge row={row} />
          <h3 className="mt-1 text-[15px] font-semibold leading-snug line-clamp-2">{ev.title}</h3>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {formatEventDateTime(ev.date, ev.timezone)}
          </p>
          {venue && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{venue}</span>
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function StatusBadge({ row }: { row: Row }) {
  if (row.checked_in) return <Badge tone="success" icon={CheckCircle2}>Checked in</Badge>;
  if (row.approval_status === "approved") return <Badge tone="success" icon={CheckCircle2}>Going</Badge>;
  if (row.approval_status === "pending") return <Badge tone="warn" icon={Hourglass}>Pending</Badge>;
  if (row.approval_status === "waitlisted") return <Badge tone="muted" icon={Clock3}>Waitlisted</Badge>;
  if (row.approval_status === "declined") return <Badge tone="danger" icon={XCircle}>Declined</Badge>;
  return null;
}

function Badge({ tone, icon: Icon, children }: { tone: "success" | "warn" | "muted" | "danger"; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const map = {
    success: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
    muted: "bg-secondary text-muted-foreground",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${map[tone]}`}>
      <Icon className="h-3 w-3" /> {children}
    </span>
  );
}
