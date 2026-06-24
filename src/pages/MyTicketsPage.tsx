import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Ticket, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import { formatEventDateTime } from "@/lib/datetime";

interface RegistrationRow {
  id: string;
  event_id: string;
  ticket_type: string;
  status: string;
  amount_paid: number | null;
  checked_in: boolean;
  created_at: string;
  events: {
    id: string;
    title: string;
    slug: string;
    date: string;
    location: string | null;
    venue: string | null;
    image_url: string | null;
    banner_landscape_url?: string | null;
    timezone: string | null;
    org_id: string | null;
  } | null;
}

const MyTicketsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, event_id, ticket_type, status, amount_paid, checked_in, created_at, events:events(id,title,slug,date,location,venue,image_url,banner_landscape_url,timezone,org_id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setRows((data ?? []) as unknown as RegistrationRow[]);
      }
      setLoading(false);
    })();
  }, [user, toast]);

  const displayName = user?.email?.split("@")[0] || "Attendee";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Hi {displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Your tickets and event registrations.</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="h-12 w-12 mx-auto rounded-xl bg-muted flex items-center justify-center mb-3">
              <Ticket className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">No tickets yet</h3>
            <p className="text-[13px] text-muted-foreground mt-1 mb-4">
              When you register for an event, your tickets will appear here.
            </p>
            <Button asChild size="sm" className="h-8 text-[13px]">
              <Link to="/events">Browse events</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const ev = r.events;
              const dateLabel = ev?.date ? formatEventDateTime(ev.date, ev?.timezone) : null;
              return (
                <div key={r.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col sm:flex-row">
                  {(ev?.banner_landscape_url || ev?.image_url) && (
                    <img
                      src={ev.banner_landscape_url || ev.image_url!}
                      alt={ev.title}
                      className="sm:w-40 h-32 sm:h-auto object-cover aspect-video"
                    />
                  )}
                  <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold truncate">{ev?.title ?? "Event"}</h3>
                        {r.checked_in && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> Checked in
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        {dateLabel && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {dateLabel}
                          </span>
                        )}
                        {(ev?.venue || ev?.location) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {ev?.venue || ev?.location}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Ticket className="h-3 w-3" />
                          {r.ticket_type}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        r.status === "confirmed" ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                      }`}>
                        {r.status}
                      </span>
                      {ev?.slug && (
                        <Button asChild variant="outline" size="sm" className="h-7 text-[12px]">
                          <Link to={`/events/${ev.slug}`}>View event</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyTicketsPage;