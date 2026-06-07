import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isFuture, isPast, isToday } from "date-fns";
import { formatEventDateTime } from "@/lib/datetime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, MapPin, Ticket, CheckCircle2, Hourglass, Clock3 } from "lucide-react";
import { eventPublicPath } from "@/lib/event-routes";

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
    description: string | null;
    timezone: string | null;
    organizations?: { slug?: string | null; subdomain?: string | null } | null;
  } | null;
}

export default function MyEventsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "pending">("upcoming");

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("id, approval_status, status, checked_in, events:events(id, title, slug, date, end_date, venue, location, image_url, description, timezone, organizations(slug, subdomain))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancel) return;
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!r.events) return false;
      const d = new Date(r.events.date);
      if (tab === "pending") return r.approval_status === "pending" || r.approval_status === "waitlisted";
      if (tab === "past") return isPast(d) && !isToday(d);
      return (isFuture(d) || isToday(d)) && r.approval_status === "approved";
    });
  }, [rows, tab]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">My tickets</h1>
        <p className="text-[13px] text-muted-foreground mb-6">RSVPs, requests, and past events you've attended.</p>

        <div className="inline-flex items-center gap-1 p-1 bg-secondary rounded-full mb-6">
          {(["upcoming", "pending", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 h-7 rounded-full text-[12px] font-medium transition-colors capitalize ${
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl p-12 text-center">
            <div className="h-12 w-12 mx-auto rounded-xl bg-secondary flex items-center justify-center mb-3">
              <Ticket className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">Nothing here yet</h3>
            <p className="text-[13px] text-muted-foreground mt-1 mb-4">Find an event and RSVP — it'll show up here.</p>
            <Button asChild size="sm" className="h-8 text-[13px]"><Link to="/events">Browse events</Link></Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <RowCard key={r.id} row={r} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function RowCard({ row }: { row: Row }) {
  const ev = row.events!;
  const orgSlug = ev.organizations?.subdomain || ev.organizations?.slug || null;
  const venue = [ev.venue, ev.location].filter(Boolean).join(" · ");

  const StatusBadge = () => {
    if (row.checked_in) return <Badge tone="success" icon={CheckCircle2}>Checked in</Badge>;
    if (row.approval_status === "approved") return <Badge tone="success" icon={CheckCircle2}>Going</Badge>;
    if (row.approval_status === "pending") return <Badge tone="warn" icon={Hourglass}>Pending</Badge>;
    if (row.approval_status === "waitlisted") return <Badge tone="muted" icon={Clock3}>Waitlisted</Badge>;
    if (row.approval_status === "declined") return <Badge tone="danger" icon={Hourglass}>Declined</Badge>;
    return null;
  };

  return (
    <li className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col sm:flex-row sm:items-stretch">
      {ev.image_url && <img src={ev.image_url} alt={ev.title} className="w-full aspect-video sm:w-72 sm:h-full object-cover shrink-0" />}
      <div className="flex-1 p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[14px] font-semibold truncate">{ev.title}</h3>
            <StatusBadge />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatEventDateTime(ev.date, ev.timezone)}</span>
            {venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{venue}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button asChild size="sm" variant="outline" className="h-8 text-[12px]"><Link to={`/t/${row.id}`}>Ticket</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-8 text-[12px]"><Link to={eventPublicPath(ev, orgSlug)}>Event</Link></Button>
        </div>
      </div>
    </li>
  );
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