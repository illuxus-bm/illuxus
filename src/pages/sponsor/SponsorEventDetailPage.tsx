import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import SiteHeader from "@/components/SiteHeader";
import { ArrowLeft, Mic, Users, CheckCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type Person = {
  kind: "speaker" | "attendee";
  id: string;
  name: string;
  company: string | null;
  ticket_type: string;
  checked_in: boolean;
  checked_in_at: string | null;
};

export default function SponsorEventDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "speaker" | "attendee">("all");
  const [q, setQ] = useState("");

  const load = async () => {
    if (!eventId) return;
    const { data } = await supabase.rpc("sponsor_portal_people" as never, { _eid: eventId } as never);
    setPeople(((data || []) as unknown as Person[]));
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !eventId) return;
    load();
    const channel = supabase
      .channel(`sponsor-portal-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${eventId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, eventId]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  const filtered = people.filter((p) => {
    const matchKind = tab === "all" || p.kind === tab;
    const matchQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.company || "").toLowerCase().includes(q.toLowerCase());
    return matchKind && matchQ;
  });

  const stats = {
    speakers: people.filter((p) => p.kind === "speaker").length,
    attendees: people.filter((p) => p.kind === "attendee").length,
    checkedIn: people.filter((p) => p.checked_in).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <header className="border-b border-border">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/sponsor" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Events
          </Link>
        </div>
      </header>
      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Mic, label: "Speakers", value: stats.speakers },
            { icon: Users, label: "Registered", value: stats.attendees },
            { icon: CheckCircle, label: "Checked in", value: stats.checkedIn },
          ].map((s) => (
            <div key={s.label} className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><s.icon className="h-3 w-3" />{s.label}</div>
              <p className="text-lg font-semibold leading-tight">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or company…" className="pl-8 h-8 text-[13px]" />
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
            {(["all", "speaker", "attendee"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                {t === "all" ? "All" : t === "speaker" ? "Speakers" : "Attendees"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No one to show.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={`${p.kind}:${p.id}`} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.company || "—"}</td>
                    <td className="p-3 capitalize">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${p.kind === "speaker" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                        {p.kind}
                      </span>
                    </td>
                    <td className="p-3">
                      {p.checked_in ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-[12px]"><CheckCircle className="h-3 w-3" /> {p.checked_in_at ? new Date(p.checked_in_at).toLocaleString() : "Checked in"}</span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">Not yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}