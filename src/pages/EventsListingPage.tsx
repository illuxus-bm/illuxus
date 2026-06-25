import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Search, MapPin, CalendarDays, X, Clock, Users } from "lucide-react";
import { format, isToday, isTomorrow, isSameDay } from "date-fns";
import { formatPriceOrFree } from "@/lib/currency";
import { formatEventTime, formatEventRange } from "@/lib/datetime";
import { eventPublicPath } from "@/lib/event-routes";

interface EventRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  location: string | null;
  venue: string | null;
  capacity: number | null;
  tickets_sold: number | null;
  price: number | null;
  currency?: string | null;
  timezone?: string | null;
  status: string;
  image_url: string | null;
  banner_landscape_url?: string | null;
  organizations?: { name: string | null; slug: string | null; subdomain: string | null; logo_url: string | null } | null;
}

const FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "today" as const, label: "Today" },
  { key: "week" as const, label: "This Week" },
  { key: "free" as const, label: "Free" },
];

export default function EventsListingPage() {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") || "");
  const [filter, setFilter] = useState<typeof FILTERS[number]["key"]>(
    (params.get("filter") as typeof FILTERS[number]["key"]) || "all",
  );
  const category = params.get("category") || "";
  // Quick-view modal: opened when a user taps an event row in the list.
  const [quickView, setQuickView] = useState<EventRow | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("events")
        .select("id, slug, title, description, date, end_date, location, venue, capacity, tickets_sold, price, currency, timezone, status, image_url, banner_landscape_url, organizations(name, slug, subdomain, logo_url)")
        .eq("status", "published")
        .or(`end_date.gte.${now},and(end_date.is.null,date.gte.${now})`)
        .order("date", { ascending: true })
        .limit(200);
      if (cancel) return;
      setEvents((data || []) as unknown as EventRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  // Sync `q` to URL so links are shareable.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (search) next.set("q", search); else next.delete("q");
    if (filter !== "all") next.set("filter", filter); else next.delete("filter");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    return events.filter((e) => {
      const matchesSearch =
        !term ||
        e.title.toLowerCase().includes(term) ||
        (e.location || "").toLowerCase().includes(term) ||
        (e.venue || "").toLowerCase().includes(term) ||
        (e.organizations?.name || "").toLowerCase().includes(term);
      const d = new Date(e.date);
      const matchesFilter =
        filter === "all" ||
        (filter === "today" && isToday(d)) ||
        (filter === "week" && d >= now && d <= weekFromNow) ||
        (filter === "free" && (!e.price || e.price === 0));
      const matchesCategory =
        !category ||
        (e.title + " " + (e.description || "")).toLowerCase().includes(category.toLowerCase());
      return matchesSearch && matchesFilter && matchesCategory;
    });
  }, [events, search, filter, category]);

  // Group by date.
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: EventRow[] }>();
    for (const ev of filtered) {
      const d = new Date(ev.date);
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, { date: d, items: [] });
      map.get(key)!.items.push(ev);
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filtered]);

  const headerTitle = category
    ? `${category.charAt(0).toUpperCase() + category.slice(1)} Events`
    : "Browse Events";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 pt-10 pb-20">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{headerTitle}</h1>
          <p className="text-[14px] text-muted-foreground mt-2">
            {category
              ? `Upcoming ${category} events from hosts on the platform.`
              : "Discover what's happening across the community."}
          </p>
        </header>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, hosts or locations…"
            aria-label="Search events"
            className="pl-10 pr-10 h-11 rounded-xl text-[14px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                filter === f.key
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          {category && (
            <button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("category");
                setParams(next, { replace: true });
              }}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-accent/10 text-accent hover:bg-accent/15 transition-colors inline-flex items-center gap-1"
            >
              {category} <X className="h-3 w-3" />
            </button>
          )}
          <span className="text-[12px] text-muted-foreground ml-auto">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl py-20 text-center text-[13px] text-muted-foreground">
            No events found{search ? ` for "${search}"` : ""}.
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <DateGroup
                key={g.date.toISOString()}
                date={g.date}
                items={g.items}
                onSelect={setQuickView}
              />
            ))}
          </div>
        )}
      </main>

      <EventQuickView event={quickView} onClose={() => setQuickView(null)} />
    </div>
  );
}

function DateGroup({
  date,
  items,
  onSelect,
}: {
  date: Date;
  items: EventRow[];
  onSelect: (e: EventRow) => void;
}) {
  const dayLabel = isToday(date)
    ? "Today"
    : isTomorrow(date)
      ? "Tomorrow"
      : format(date, "EEEE");
  const sub = format(date, "MMMM d");
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{dayLabel}</h2>
        <span className="text-[12px] text-muted-foreground">{sub}</span>
      </div>
      <div className="space-y-3">
        {items.map((ev, i) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <EventRow event={ev} onSelect={onSelect} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function EventRow({
  event,
  onSelect,
}: {
  event: EventRow;
  onSelect: (e: EventRow) => void;
}) {
  const time = formatEventTime(event.date, event.timezone);
  const venue = event.venue || event.location;

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="group flex gap-4 p-4 w-full text-left rounded-xl border border-border bg-card hover:border-foreground/15 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-muted-foreground mb-1.5">{time}</div>
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {event.title}
        </h3>
        <div className="text-[12px] text-muted-foreground mt-1.5 flex items-center gap-1 truncate">
          {venue && <MapPin className="h-3 w-3 shrink-0" />}
          <span className="truncate">{venue || event.organizations?.name || "Online"}</span>
        </div>
      </div>
      <div className="shrink-0 w-24 sm:w-40 md:w-56 aspect-video rounded-lg overflow-hidden bg-secondary">
        {(event.banner_landscape_url || event.image_url) ? (
          <img
            src={event.banner_landscape_url || event.image_url!}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Lu.ma-inspired quick-view modal — large square cover, host row with avatar,
 * date/time + location blocks, and a prominent registration CTA. Clicking the
 * cover or title opens the full public event page.
 */
function EventQuickView({
  event,
  onClose,
}: {
  event: EventRow | null;
  onClose: () => void;
}) {
  if (!event) return null;
  const orgSlug = event.organizations?.subdomain || event.organizations?.slug || null;
  const href = eventPublicPath(event, orgSlug);
  const start = new Date(event.date);
  const end = event.end_date ? new Date(event.end_date) : null;
  const dayLabel = isToday(start)
    ? `Today, ${format(start, "MMM d")}`
    : isTomorrow(start)
      ? `Tomorrow, ${format(start, "MMM d")}`
      : format(start, "EEEE, MMMM d");
  const timeLabel = formatEventRange(start, end, event.timezone);
  const venue = event.venue || event.location;
  const isPaid = event.price && Number(event.price) > 0;
  const seatsLeft =
    event.capacity && event.capacity > 0
      ? Math.max(0, event.capacity - (event.tickets_sold || 0))
      : null;

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="p-0 gap-0 rounded-2xl border-border overflow-hidden flex flex-col w-[calc(100vw-2rem)] sm:max-w-[420px] max-h-[calc(100vh-2rem)] sm:max-h-[90vh]"
      >
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Cover — Lu.ma style. Clickable to open the full page. */}
          <Link
            to={href}
            onClick={onClose}
            className="block relative aspect-video w-full overflow-hidden bg-secondary group"
          >
            {event.image_url ? (
              <img
                src={event.banner_landscape_url || event.image_url}
                alt={event.title}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                <CalendarDays className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
          </Link>

          <div className="p-5 space-y-4">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-[20px] leading-tight font-semibold tracking-tight">
              <Link to={href} onClick={onClose} className="hover:text-accent transition-colors">
                {event.title}
              </Link>
            </DialogTitle>
            {event.organizations?.name && (
              <DialogDescription asChild>
                <div className="flex items-center gap-2 text-[13px]">
                  {event.organizations.logo_url ? (
                    <img
                      src={event.organizations.logo_url}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                      {event.organizations.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-muted-foreground">
                    By <span className="font-medium text-foreground">{event.organizations.name}</span>
                  </span>
                </div>
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Info rows — Lu.ma uses icon tiles for date and location */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="shrink-0 h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium leading-tight">{dayLabel}</div>
                <div className="text-[12px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {timeLabel}
                </div>
              </div>
            </div>
            {venue && (
              <div className="flex items-center gap-3">
                <div className="shrink-0 h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-tight truncate">{venue}</div>
                  {event.venue && event.location && event.venue !== event.location && (
                    <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                      {event.location}
                    </div>
                  )}
                </div>
              </div>
            )}
            {seatsLeft !== null && (
              <div className="flex items-center gap-3">
                <div className="shrink-0 h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center">
                  <Users className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-tight">
                    {seatsLeft > 0
                      ? `${seatsLeft} ${seatsLeft === 1 ? "spot" : "spots"} left`
                      : "Sold out"}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {formatPriceOrFree(event.price, event.currency || undefined)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {event.description && (
            <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
          </div>
        </div>

        {/* Sticky footer CTA — always visible, content scrolls behind it */}
        <div className="shrink-0 border-t border-border bg-background p-4">
          <Button asChild size="lg" className="w-full rounded-xl font-semibold">
            <Link to={href} onClick={onClose}>
              {isPaid ? "Get Ticket" : "Register"}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Keep one date-fns reference so tree-shake guards behave.
void isSameDay;
