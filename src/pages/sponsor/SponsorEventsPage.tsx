import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Calendar, MapPin, Users, CheckCircle, Building2 } from "lucide-react";

type EventRow = {
  event_id: string;
  event_title: string;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  sponsor_id: string;
  sponsor_name: string;
  tier: string;
  registrations_count: number;
  checked_in_count: number;
};

export default function SponsorEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("sponsor_portal_events" as never).then(({ data }) => {
      setRows((data || []) as unknown as EventRow[]);
      setLoading(false);
    });
  }, [user]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Sponsor portal</h1>
        </div>
      </header>
      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Your events</h2>
          <p className="text-[12px] text-muted-foreground">Events your organization is sponsoring.</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <p className="text-sm font-medium">No events yet</p>
            <p className="text-[12px] text-muted-foreground">When an organizer attaches your sponsor to an event, it will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <Link key={`${r.event_id}-${r.sponsor_id}`} to={`/sponsor/events/${r.event_id}`} className="border border-border rounded-lg p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-sm truncate">{r.event_title}</p>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground">{r.tier}</span>
                </div>
                <div className="space-y-1 text-[12px] text-muted-foreground">
                  {r.event_date && <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{new Date(r.event_date).toLocaleDateString()}</p>}
                  {r.location && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{r.location}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="border border-border rounded p-2">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Registered</p>
                    <p className="text-sm font-semibold">{Number(r.registrations_count)}</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" />Checked in</p>
                    <p className="text-sm font-semibold">{Number(r.checked_in_count)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}