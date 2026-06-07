import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { eventPublicPath } from "@/lib/event-routes";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { formatPriceOrFree } from "@/lib/currency";

interface Event {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  date: string;
  location: string | null;
  price: number | null;
  currency?: string | null;
  timezone?: string | null;
  image_url: string | null;
  // Joined organization handle so we can build /<orgSlug>/events/<slug>.
  organizations?: { slug: string | null; subdomain: string | null } | null;
}

const EventsShowcase = () => {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("events")
        .select(
          "id, slug, title, description, date, location, price, currency, timezone, image_url, organizations(slug, subdomain)",
        )
        .eq("status", "published")
        .order("date", { ascending: true })
        .limit(3);
      setEvents(data || []);
    };
    fetchEvents();
  }, []);

  if (events.length === 0) return null;

  return (
    <section id="events" className="py-20">
      <SiteContainer>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-end justify-between mb-8"
        >
          <div>
            <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
              Upcoming
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
              Featured Events
            </h2>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
            >
              <Link
                to={eventPublicPath(
                  event,
                  event.organizations?.subdomain || event.organizations?.slug || null,
                )}
                className="group block"
              >
                <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/15 transition-all duration-200 hover:shadow-lg hover:shadow-foreground/[0.02]">
                  <div className="relative aspect-video bg-secondary overflow-hidden">
                    {event.image_url ? (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <CalendarDays className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <div className="bg-background/90 backdrop-blur-sm rounded-lg px-2 py-1 text-center">
                        <div className="text-[10px] font-medium text-muted-foreground uppercase">
                          {format(new Date(event.date), "MMM")}
                        </div>
                        <div className="text-base font-bold leading-none">
                          {format(new Date(event.date), "dd")}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-[14px] font-semibold mb-1 group-hover:text-accent transition-colors line-clamp-1">
                      {event.title}
                    </h3>
                    <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {formatPriceOrFree(event.price, event.currency || undefined)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </SiteContainer>
    </section>
  );
};

export default EventsShowcase;
