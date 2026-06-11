import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSpeakerEvents } from "@/hooks/useSpeakerEvents";
import { FullPageLoader } from "@/components/FullPageLoader";
import SiteHeader from "@/components/SiteHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Calendar, MapPin, Mic, Search, Building2, ArrowLeft, ShieldAlert } from "lucide-react";

type Filter = "all" | "upcoming" | "past";

export default function SpeakerEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: events = [], isLoading, error } = useSpeakerEvents();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [query, setQuery] = useState("");

  const now = useMemo(() => new Date(), []);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const eventDate = e.event_date ? new Date(e.event_date) : null;
      // Match filter
      let matchesFilter = true;
      if (filter === "upcoming") {
        matchesFilter = !eventDate || eventDate >= now;
      } else if (filter === "past") {
        matchesFilter = !!eventDate && eventDate < now;
      }
      // Match search query
      const q = query.trim().toLowerCase();
      const matchesQuery = !q ||
        e.event_title.toLowerCase().includes(q) ||
        (e.location || "").toLowerCase().includes(q) ||
        (e.organizer_name || "").toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [events, filter, query, now]);

  const stats = useMemo(() => {
    const upcoming = events.filter((e) => {
      const d = e.event_date ? new Date(e.event_date) : null;
      return !d || d >= now;
    }).length;
    const past = events.length - upcoming;
    const totalSessions = events.reduce((sum, e) => sum + Number(e.session_count || 0), 0);
    return { total: events.length, upcoming, past, totalSessions };
  }, [events, now]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login?redirect=/speaker" replace />;

  // Empty state — user has no speaker assignments
  const isEmpty = !isLoading && events.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Mic className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-base font-semibold leading-tight">Speaker portal</h1>
              <p className="text-[11px] text-muted-foreground">Events where you're speaking</p>
            </div>
          </div>
          <Link
            to="/u/me/events"
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to my tickets →
          </Link>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Events" value={stats.total} icon={Calendar} />
          <SummaryCard label="Upcoming" value={stats.upcoming} icon={Calendar} accent="text-emerald-600" />
          <SummaryCard label="Past" value={stats.past} icon={Calendar} accent="text-muted-foreground" />
          <SummaryCard label="Sessions" value={stats.totalSessions} icon={Mic} accent="text-blue-600" />
        </div>

        {/* Error state */}
        {error && (
          <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-destructive">Could not load your events</p>
              <p className="text-[12px] text-muted-foreground">{(error as Error).message}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="text-center py-20 border border-dashed border-border rounded-lg">
            <Mic className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">You are not assigned as a speaker for any events yet.</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              When an organizer adds you as a speaker, the event will appear here.
            </p>
            <Link to="/events" className="inline-block mt-4 text-[12px] text-primary hover:underline">
              Browse events →
            </Link>
          </div>
        )}

        {/* Filters + search */}
        {!isEmpty && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events, location, organizer…"
                  className="pl-8 h-8 text-[13px]"
                />
              </div>
              <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
                {(["all", "upcoming", "past"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 capitalize ${
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-lg" />
                ))}
              </div>
            )}

            {/* Events grid */}
            {!isLoading && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredEvents.length === 0 ? (
                  <div className="col-span-full text-center py-12 border border-dashed border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">No events match your filters.</p>
                  </div>
                ) : (
                  filteredEvents.map((e) => <SpeakingEventCard key={e.event_id} event={e} now={now} />)
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${accent ?? ""}`}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-xl font-semibold leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function SpeakingEventCard({
  event,
  now,
}: {
  event: import("@/types/portals").SpeakerPortalEvent;
  now: Date;
}) {
  const eventDate = event.event_date ? new Date(event.event_date) : null;
  const isUpcoming = !eventDate || eventDate >= now;

  return (
    <Link
      to={`/speaker/events/${event.event_id}`}
      className="border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors bg-card group"
    >
      {/* Banner */}
      {event.image_url ? (
        <div className="aspect-[16/9] overflow-hidden bg-muted relative">
          <img
            src={event.image_url}
            alt={event.event_title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <span
            className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${
              isUpcoming
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isUpcoming ? "Upcoming" : "Past"}
          </span>
        </div>
      ) : (
        <div className="aspect-[16/9] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center relative">
          <Mic className="h-10 w-10 text-muted-foreground/40" />
          <span
            className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${
              isUpcoming
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isUpcoming ? "Upcoming" : "Past"}
          </span>
        </div>
      )}

      <div className="p-4">
        <p className="font-semibold text-sm truncate">{event.event_title}</p>
        <div className="space-y-1 text-[12px] text-muted-foreground mt-2">
          {eventDate && (
            <p className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {eventDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {(event.venue || event.location) && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              {event.venue || event.location}
            </p>
          )}
          {event.organizer_name && (
            <p className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              {event.organizer_name}
            </p>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">
            {Number(event.session_count)} {Number(event.session_count) === 1 ? "session" : "sessions"}
          </span>
          <span className="text-[12px] text-primary group-hover:underline">View →</span>
        </div>
      </div>
    </Link>
  );
}
