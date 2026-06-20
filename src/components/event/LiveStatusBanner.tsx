import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Radio } from "lucide-react";
import { format } from "date-fns";

export default function LiveStatusBanner({ eventId, eventDate, eventFormat, eventSlug }: {
  eventId: string; eventDate: string; eventFormat?: string | null; eventSlug?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  // Show the banner for virtual and hybrid events (and events where
  // event_format is null — they default to virtual). Only physical-only
  // events are excluded since they have no webinar capability.
  const isWebinarCapable = eventFormat !== "physical";

  useEffect(() => {
    if (!isWebinarCapable) return;
    const load = () => supabase.from("webinar_sessions").select("status")
      .eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setStatus(data?.status ?? null));
    load();
    const ch = supabase.channel(`bnr-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_sessions", filter: `event_id=eq.${eventId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, isWebinarCapable]);

  // Don't render anything for physical events or when there's no active session
  if (!isWebinarCapable) return null;

  // Use slug if available, fall back to UUID — both are valid route params
  const href = `/e/${eventSlug || eventId}/live`;
  if (status === "live") {
    return (
      <Link to={href} className="block bg-destructive text-destructive-foreground text-sm font-medium px-4 py-2.5 text-center hover:opacity-90">
        <span className="inline-flex items-center gap-2"><Radio className="h-4 w-4 animate-pulse" /> Live now — Join the webinar →</span>
      </Link>
    );
  }
  if (status === "ended") {
    return <div className="bg-muted text-muted-foreground text-sm px-4 py-2 text-center">Webinar has ended. Recording will appear shortly.</div>;
  }
  if (status === "scheduled") {
    return (
      <Link to={href} className="block bg-foreground text-background text-sm px-4 py-2 text-center hover:opacity-90">
        <span className="inline-flex items-center gap-2"><Radio className="h-4 w-4" /> Online webinar — starts {format(new Date(eventDate), "MMM d, h:mm a")} · Join waiting room →</span>
      </Link>
    );
  }
  // No session created yet — don't show a banner
  return null;
}