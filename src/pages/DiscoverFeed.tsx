import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isFuture, isToday, isTomorrow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import { LumaEvent } from "@/components/EventCardLuma";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CalendarDays, MapPin, Search, X, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { eventPublicPath } from "@/lib/event-routes";
import { logger } from "@/lib/observability";
import { usePublicCommunities } from "@/hooks/community/useCommunity";

/**
 * Lu.ma-style /discover page.
 * Layout: large title → "Popular Events" two-column compact list → "Browse by Category" grid.
 */
export default function DiscoverFeed() {
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<LumaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const explore = usePublicCommunities();

  useEffect(() => {
    let cancel = false;
    (async () => {
      // Fetch published events. We don't filter by date in SQL — instead
      // we filter client-side using end_date when available, or date otherwise.
      // This is more reliable than complex .or() filters and lets us show
      // ongoing/today's events too.
      const { data, error } = await supabase
        .from("events")
        .select("id, slug, title, description, date, end_date, venue, location, image_url, banner_landscape_url, price, organizations(name, slug, subdomain, logo_url)")
        .eq("status", "published")
        .order("date", { ascending: true })
        .limit(100);
      if (cancel) return;
      if (error) {
        logger.error("discover events query failed", { error_message: error?.message ?? String(error) });
      }
      // Split into upcoming/ongoing vs past based on end_date (fallback to date).
      // Past = ended; Upcoming = not yet ended OR still ongoing.
      const now = Date.now();
      const rows = (data || []) as unknown as LumaEvent[];
      const upcoming: LumaEvent[] = [];
      const past: LumaEvent[] = [];
      for (const e of rows) {
        const endTs = e.end_date ? new Date(e.end_date).getTime() : null;
        const startTs = e.date ? new Date(e.date).getTime() : 0;
        const ended = endTs ? endTs < now : startTs < now;
        if (ended) past.push(e); else upcoming.push(e);
      }
      // Past events most-recent-first.
      past.sort((a, b) => {
        const aTs = new Date(a.end_date || a.date).getTime();
        const bTs = new Date(b.end_date || b.date).getTime();
        return bTs - aTs;
      });
      setEvents(upcoming);
      setPastEvents(past);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  // Filter by event title, host (organization) name, venue, or location.
  // Searching applies to BOTH upcoming and past so visitors can find an event
  // by name regardless of whether it has already happened.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return events;
    return events.filter((e) => {
      const host = e.organizations?.name || "";
      return (
        e.title.toLowerCase().includes(term) ||
        host.toLowerCase().includes(term) ||
        (e.venue || "").toLowerCase().includes(term) ||
        (e.location || "").toLowerCase().includes(term)
      );
    });
  }, [events, query]);

  const filteredPast = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pastEvents;
    return pastEvents.filter((e) => {
      const host = e.organizations?.name || "";
      return (
        e.title.toLowerCase().includes(term) ||
        host.toLowerCase().includes(term) ||
        (e.venue || "").toLowerCase().includes(term) ||
        (e.location || "").toLowerCase().includes(term)
      );
    });
  }, [pastEvents, query]);

  // Show top 6 normally, but reveal all matches while searching.
  const popular = useMemo(
    () => (query.trim() ? filtered : filtered.slice(0, 6)),
    [filtered, query],
  );
  const pastDisplay = useMemo(
    () => (query.trim() ? filteredPast : filteredPast.slice(0, 6)),
    [filteredPast, query],
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
        {/* Header */}
        <header className="mb-10 sm:mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Discover Events</h1>
          <p className="text-[14px] text-muted-foreground mt-2 max-w-xl">
            Explore popular events near you, browse by category, or check out some of the great community calendars.
          </p>
        </header>

        {/* Popular Events */}
        <section className="mb-14">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {query.trim() ? "Search Results" : "Popular Events"}
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {query.trim()
                  ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} for "${query.trim()}"`
                  : "Trending across hosts"}
              </p>
            </div>
            <Link
              to="/events"
              className="inline-flex items-center gap-1 px-3 h-8 rounded-full bg-secondary text-[12px] font-medium text-foreground hover:bg-secondary/70 transition-colors"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Search bar — filters Popular Events list live by event, host or location. */}
          <div className="relative mb-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, hosts or locations…"
              aria-label="Search events"
              className="pl-10 pr-10 h-11 rounded-xl text-[14px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : popular.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl py-16 text-center text-[13px] text-muted-foreground">
              {query.trim()
                ? `No upcoming events match "${query.trim()}". Try a different keyword or scroll to Past Events.`
                : "No upcoming events yet."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {popular.map((ev) => <PopularRow key={ev.id} event={ev} />)}
            </div>
          )}
        </section>

        {/* Past Events — events whose end_date (or start date if no end_date) is in the past. */}
        <section className="mb-14">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Past Events</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {query.trim()
                  ? `${filteredPast.length} past match${filteredPast.length === 1 ? "" : "es"}`
                  : "Recently wrapped — replay highlights and follow hosts you like"}
              </p>
            </div>
            <Link
              to="/events?filter=past"
              className="inline-flex items-center gap-1 px-3 h-8 rounded-full bg-secondary text-[12px] font-medium text-foreground hover:bg-secondary/70 transition-colors"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={`past-${i}`} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : pastDisplay.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl py-12 text-center text-[13px] text-muted-foreground">
              {query.trim()
                ? `No past events match "${query.trim()}".`
                : "No past events to show yet."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pastDisplay.map((ev) => <PastRow key={ev.id} event={ev} />)}
            </div>
          )}
        </section>

        {/* Discover Communities */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight mb-5">Discover Communities</h2>
          {explore.isLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
            </div>
          ) : !explore.data?.length ? (
            <div className="border border-dashed border-border rounded-2xl py-16 text-center text-[13px] text-muted-foreground">
              No public communities available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {explore.data.map((c) => <DiscoverCommunityTile key={c.id} community={c} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/** Compact two-line row: time, title, host. Thumbnail right. */
function PopularRow({ event }: { event: LumaEvent }) {
  const orgSlug = event.organizations?.subdomain || event.organizations?.slug || null;
  const href = eventPublicPath(event, orgSlug);
  const d = new Date(event.date);
  const dayLabel = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE, MMM d");
  const timeLabel = format(d, "h:mm a");
  const venue = event.venue || event.location;

  return (
    <Link
      to={href}
      className="group flex flex-col-reverse sm:flex-row gap-4 p-4 rounded-xl border border-border bg-card hover:border-foreground/15 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-muted-foreground mb-1.5">
          {dayLabel}, {timeLabel}
        </div>
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {event.title}
        </h3>
        <div className="text-[12px] text-muted-foreground mt-1.5 flex items-center gap-1 truncate">
          {venue && <MapPin className="h-3 w-3 shrink-0" />}
          <span className="truncate">{venue || event.organizations?.name || "Online"}</span>
        </div>
      </div>
      <div className="shrink-0 w-full sm:w-40 md:w-56 aspect-video rounded-lg overflow-hidden bg-secondary">
        {(event.banner_landscape_url || event.image_url) ? (
          <img src={event.banner_landscape_url || event.image_url!} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * Past-event row variant. Same layout as PopularRow but de-emphasised:
 * grayscale thumbnail, "Ended" pill, muted text. Clicking still goes to the
 * full event page where past attendees can see recaps / replays.
 */
function PastRow({ event }: { event: LumaEvent }) {
  const orgSlug = event.organizations?.subdomain || event.organizations?.slug || null;
  const href = eventPublicPath(event, orgSlug);
  const endDate = new Date(event.end_date || event.date);
  const dayLabel = format(endDate, "EEE, MMM d, yyyy");
  const venue = event.venue || event.location;

  return (
    <Link
      to={href}
      className="group flex flex-col-reverse sm:flex-row gap-4 p-4 rounded-xl border border-border bg-card/50 hover:border-foreground/15 hover:bg-card transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-muted text-muted-foreground">
            Ended
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">{dayLabel}</span>
        </div>
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 text-muted-foreground group-hover:text-foreground transition-colors">
          {event.title}
        </h3>
        <div className="text-[12px] text-muted-foreground/80 mt-1.5 flex items-center gap-1 truncate">
          {venue && <MapPin className="h-3 w-3 shrink-0" />}
          <span className="truncate">{venue || event.organizations?.name || "Online"}</span>
        </div>
      </div>
      <div className="shrink-0 w-full sm:w-40 md:w-56 aspect-video rounded-lg overflow-hidden bg-secondary">
        {(event.banner_landscape_url || event.image_url) ? (
          <img
            src={event.banner_landscape_url || event.image_url!}
            alt={event.title}
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
          </div>
        )}
      </div>
    </Link>
  );
}

function DiscoverCommunityTile({
  community,
}: {
  community: { id: string; slug: string; name: string; description: string | null; member_count: number; kind: string };
}) {
  return (
    <Link
      to={`/community/${community.slug}/feed`}
      className="border border-border rounded-xl bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col gap-2 group"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[14px] font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {community.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium truncate group-hover:text-primary transition-colors">{community.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">Event Community</p>
        </div>
      </div>
      {community.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{community.description}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto pt-3 border-t border-border/50">
        <span className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {community.member_count} member{community.member_count !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}

// Keep one date-fns reference so tree-shake guards behave even if isFuture goes unused.
void isFuture;