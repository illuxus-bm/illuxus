/**
 * Sponsor dashboard — /sponsor
 *
 * The events this account has been added to as a sponsor, laid out like the
 * Partner dashboard: search, Upcoming / Past, and a card per event.
 *
 * Who counts as a sponsor of an event:
 *   - an accepted team member of a sponsor attached to the event, or
 *   - the sponsor itself (an approved sponsor application makes the
 *     applicant the sponsor's owner).
 * `sponsor_portal_events` also returns sponsors an organiser merely created
 * for their own events (`sponsors.user_id` is the creator), so rows for
 * events this account or its organisations run are dropped unless the
 * account is an accepted member of that sponsor.
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Award, Building2, Calendar, Clock, MapPin, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stripRichText } from "@/lib/markdown";

type PortalRow = {
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

type EventInfo = {
  id: string;
  user_id: string | null;
  org_id: string | null;
  status: string | null;
  description: string | null;
  venue: string | null;
  image_url: string | null;
  banner_landscape_url: string | null;
};

type SponsorCard = PortalRow & { event: EventInfo | null };

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const isPast = (c: SponsorCard) => {
  const end = c.end_date ?? c.event_date;
  return !!end && new Date(end).getTime() < Date.now();
};

export default function SponsorEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const { memberships } = useOrg();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const myOrgIds = useMemo(() => new Set(memberships.map((m) => m.org_id)), [memberships]);

  const { data: cards = [], isLoading } = useQuery<SponsorCard[]>({
    queryKey: ["sponsor-events", user?.id, [...myOrgIds].sort().join(",")],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: portal }, { data: memberRows }] = await Promise.all([
        supabaseRpc("sponsor_portal_events" as never),
        supabase.from("sponsor_members").select("sponsor_id").eq("user_id", user!.id).not("accepted_at", "is", null),
      ]);
      const rows = (portal || []) as unknown as PortalRow[];
      const memberOf = new Set(((memberRows || []) as { sponsor_id: string }[]).map((r) => r.sponsor_id));
      const ids = [...new Set(rows.map((r) => r.event_id))];
      const { data: events } = ids.length
        ? await supabase
            .from("events")
            .select("id, user_id, org_id, status, description, venue, image_url, banner_landscape_url")
            .in("id", ids)
        : { data: [] };
      const byId = new Map(((events || []) as EventInfo[]).map((e) => [e.id, e]));
      const runByMe = (e: EventInfo | null) => !!e && (e.user_id === user!.id || (!!e.org_id && myOrgIds.has(e.org_id)));
      // One card per event and sponsor, only where this account is the sponsor.
      const seen = new Set<string>();
      return rows
        .map((r) => ({ ...r, event: byId.get(r.event_id) ?? null }))
        .filter((c) => memberOf.has(c.sponsor_id) || !runByMe(c.event))
        .filter((c) => {
          const k = `${c.event_id}:${c.sponsor_id}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    },
  });

  const counts = useMemo(() => ({
    upcoming: cards.filter((c) => !isPast(c)).length,
    past: cards.filter(isPast).length,
  }), [cards]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => (tab === "past" ? isPast(c) : !isPast(c)))
      .filter((c) => !q || [c.event_title, c.sponsor_name, c.location, c.event?.venue, c.tier]
        .some((v) => (v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const ta = new Date(a.event_date ?? 0).getTime(), tb = new Date(b.event_date ?? 0).getTime();
        return tab === "past" ? tb - ta : ta - tb; // soonest first; most recent first for past
      });
  }, [cards, search, tab]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/sponsor")}`} replace />;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <header className="border-b border-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Building2 className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">Sponsor dashboard</span>
        </div>
      </header>
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Sponsored events</h1>
          <p className="text-muted-foreground text-sm">Events where you've been added as a sponsor</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading events...</div>
        ) : cards.length === 0 ? (
          <div className="bg-card border border-border rounded-xl card-shadow p-8 text-center max-w-lg mx-auto space-y-2">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">You're not sponsoring any events yet</h2>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                When an organiser adds you to an event as a sponsor (or approves your sponsor application) with{" "}
                <span className="text-foreground font-medium break-all">{user.email}</span>, the event appears here.
              </p>
              <p>If you were invited at a different email address, sign in with that address instead.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search events..." aria-label="Search events" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>

            <div className="flex bg-muted/40 p-1 rounded-full w-full sm:w-fit max-w-full border border-border/50 shadow-sm" role="tablist" aria-label="Events">
              {(["upcoming", "past"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 sm:flex-none px-3 sm:px-5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
                >
                  {t === "upcoming" ? "Upcoming" : "Past"} <span className="text-muted-foreground">({counts[t]})</span>
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-xl card-shadow">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {search ? "Try a different search." : tab === "upcoming" ? "You have no upcoming sponsored events. Check the Past tab." : "No past sponsored events yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {shown.map((c) => {
                  const path = `/sponsor/events/${c.event_id}`;
                  const image = c.event?.banner_landscape_url || c.event?.image_url;
                  const description = c.event?.description ? stripRichText(c.event.description) : "";
                  const status = c.event?.status;
                  return (
                    <article
                      key={`${c.event_id}-${c.sponsor_id}`}
                      onClick={() => navigate(path)}
                      className="bg-card border border-border rounded-xl overflow-hidden card-shadow hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
                    >
                      <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative overflow-hidden">
                        {image ? (
                          <img loading="lazy" decoding="async" src={image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <Calendar className="h-10 w-10 text-muted-foreground/50" />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="bg-white/90 text-black text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                            <ArrowRight className="h-3.5 w-3.5" /> View event
                          </span>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">{c.event_title}</h3>
                          {status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColor[status] || ""}`}>{status}</span>}
                        </div>

                        {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}

                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {c.event_date ? new Date(c.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date to be announced"}
                          </div>
                          {(c.event?.venue || c.location) && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{[c.event?.venue, c.location].filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Award className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate capitalize">{c.sponsor_name} · {c.tier}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                          <span className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5 min-w-0">
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {Number(c.registrations_count).toLocaleString()} registered · {Number(c.checked_in_count).toLocaleString()} checked in
                            </span>
                          </span>
                          <Button
                            size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1 shrink-0"
                            onClick={(e) => { e.stopPropagation(); navigate(path); }}
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
