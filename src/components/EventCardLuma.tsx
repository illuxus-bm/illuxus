import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { eventPublicPath } from "@/lib/event-routes";
import { formatPriceOrFree } from "@/lib/currency";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { mapsUrlFor } from "@/lib/utils";

export interface LumaEvent {
  id: string;
  slug: string | null;
  title: string;
  description?: string | null;
  date: string;
  end_date?: string | null;
  venue?: string | null;
  location?: string | null;
  image_url?: string | null;
  price?: number | null;
  currency?: string | null;
  timezone?: string | null;
  organizations?: { name?: string | null; slug?: string | null; subdomain?: string | null; logo_url?: string | null } | null;
}

/**
 * Lu.ma-style event card: large image left, time-first metadata right.
 * Use inside a vertical timeline list (see DiscoverFeed).
 */
export default function EventCardLuma({ event, compact = false }: { event: LumaEvent; compact?: boolean }) {
  const orgSlug = event.organizations?.subdomain || event.organizations?.slug || null;
  const href = eventPublicPath(event, orgSlug);
  const venue = [event.venue, event.location].filter(Boolean).join(" · ");
  const tz = event.timezone;
  const mapsUrl = mapsUrlFor(event.venue, event.location);

  return (
    <Link
      to={href}
      className="group flex gap-4 p-4 rounded-xl border border-border bg-card hover:border-foreground/15 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-muted-foreground mb-1.5">
          {formatEventDate(event.date, tz)} · {formatEventTime(event.date, tz)}
        </div>
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {event.title}
        </h3>
        {event.organizations?.name && (
          <p className="text-[12px] text-muted-foreground mt-1.5 truncate">
            By {event.organizations.name}
          </p>
        )}
        {venue && (
          <button
            type="button"
            onClick={(e) => {
              if (!mapsUrl) return;
              e.preventDefault();
              e.stopPropagation();
              window.open(mapsUrl, "_blank", "noopener,noreferrer");
            }}
            title={mapsUrl ? "Open in Maps" : undefined}
            className={`text-[12px] text-muted-foreground mt-1 flex items-center gap-1 truncate text-left ${
              mapsUrl ? "hover:text-foreground hover:underline cursor-pointer" : "cursor-default"
            }`}
          >
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{venue}</span>
          </button>
        )}
        <div className="mt-2.5 inline-flex items-center gap-2 text-[11px]">
          {(() => {
            const isPaid = event.price && Number(event.price) > 0;
            return (
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  isPaid ? "bg-foreground text-background" : "bg-secondary text-foreground"
                }`}
              >
                {formatPriceOrFree(event.price, event.currency || undefined)}
              </span>
            );
          })()}
        </div>
      </div>
      <div className={`shrink-0 aspect-video rounded-lg overflow-hidden bg-secondary ${compact ? "w-40" : "w-40 sm:w-56"}`}>
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