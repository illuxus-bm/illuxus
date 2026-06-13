import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isFuture, isToday, isTomorrow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import { LumaEvent } from "@/components/EventCardLuma";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CalendarDays, Cpu, Utensils, Sparkles, Palette, Leaf, Dumbbell, Flower2, Bitcoin, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { eventPublicPath } from "@/lib/event-routes";
import { logger } from "@/lib/observability";

/**
 * Lu.ma-style /discover page.
 * Layout: large title → "Popular Events" two-column compact list → "Browse by Category" grid.
 */
export default function DiscoverFeed() {
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      // Fetch published events. We don't filter by date in SQL — instead
      // we filter client-side using end_date when available, or date otherwise.
      // This is more reliable than complex .or() filters and lets us show
      // ongoing/today's events too.
      const { data, error } = await supabase
        .from("events")
        .select("id, slug, title, description, date, end_date, venue, location, image_url, price, organizations(name, slug, subdomain, logo_url)")
        .eq("status", "published")
        .order("date", { ascending: true })
        .limit(100);
      if (cancel) return;
      if (error) {
        logger.error("discover events query failed", { error_message: error?.message ?? String(error) });
      }
      // Filter out events that have already ended.
      const now = Date.now();
      const upcoming = (data || []).filter((e: { date: string; end_date: string | null }) => {
        const endTs = e.end_date ? new Date(e.end_date).getTime() : null;
        const startTs = e.date ? new Date(e.date).getTime() : 0;
        return endTs ? endTs >= now : startTs >= now;
      });
      setEvents(upcoming as unknown as LumaEvent[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  // Filter by event title, host (organization) name, venue, or location.
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

  // Show top 6 normally, but reveal all matches while searching.
  const popular = useMemo(
    () => (query.trim() ? filtered : filtered.slice(0, 6)),
    [filtered, query],
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
                ? `No events match "${query.trim()}". Try a different keyword.`
                : "No upcoming events yet."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {popular.map((ev) => <PopularRow key={ev.id} event={ev} />)}
            </div>
          )}
        </section>

        {/* Browse by Category */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight mb-5">Browse by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CATEGORIES.map((c) => <CategoryTile key={c.label} {...c} />)}
          </div>
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
      className="group flex gap-4 p-4 rounded-xl border border-border bg-card hover:border-foreground/15 hover:shadow-sm transition-all"
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
      <div className="shrink-0 w-40 sm:w-56 aspect-video rounded-lg overflow-hidden bg-secondary">
        {event.image_url ? (
          <img src={event.image_url} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
          </div>
        )}
      </div>
    </Link>
  );
}

/** Static category list — links to the public events listing filtered by tag (front-end only stub). */
const CATEGORIES = [
  { label: "Tech", icon: Cpu, color: "text-amber-500" },
  { label: "Food & Drink", icon: Utensils, color: "text-orange-500" },
  { label: "AI", icon: Sparkles, color: "text-pink-500" },
  { label: "Arts & Culture", icon: Palette, color: "text-rose-500" },
  { label: "Climate", icon: Leaf, color: "text-emerald-500" },
  { label: "Fitness", icon: Dumbbell, color: "text-red-500" },
  { label: "Wellness", icon: Flower2, color: "text-teal-500" },
  { label: "Crypto", icon: Bitcoin, color: "text-yellow-500" },
] as const;

function CategoryTile({ label, icon: Icon, color }: { label: string; icon: typeof Cpu; color: string }) {
  return (
    <Link
      to={`/events?category=${encodeURIComponent(label.toLowerCase())}`}
      className="group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card hover:border-foreground/20 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground">Explore →</div>
      </div>
    </Link>
  );
}

// Keep one date-fns reference so tree-shake guards behave even if isFuture goes unused.
void isFuture;