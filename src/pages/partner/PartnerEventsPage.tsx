/**
 * Partner dashboard — /partner
 *
 * The events an organiser has shared a tracked link for, laid out like the
 * organiser's own Events page: search, Upcoming / Past, and a card per
 * shared link. Opening a card shows that link's analytics and participants.
 *
 * Opened from the profile menu with a normal account — no separate login.
 */
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, Clock, Link2, MapPin, Search, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stripRichText } from "@/lib/markdown";
import {
  fetchPartnerGrants, isPartnerFeatureMissing, linkLabel, partnerErrorMessage, type PartnerGrant,
} from "@/lib/utm/partner-access";
import { PartnerNotice, PartnerShell } from "./PartnerShell";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const isPast = (g: PartnerGrant) => {
  const end = g.event.end_date ?? g.event.date;
  return !!end && new Date(end).getTime() < Date.now();
};

export default function PartnerEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const { data: grants = [], isLoading, error, refetch } = useQuery<PartnerGrant[]>({
    queryKey: ["partner-grants", user?.id],
    queryFn: fetchPartnerGrants,
    enabled: !!user,
    refetchInterval: 60_000,
    retry: false,
  });

  const counts = useMemo(() => ({
    upcoming: grants.filter((g) => !isPast(g)).length,
    past: grants.filter(isPast).length,
  }), [grants]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grants
      .filter((g) => (tab === "past" ? isPast(g) : !isPast(g)))
      .filter((g) => !q || [g.event.title, g.event.organizer_name, g.event.location, g.event.venue, g.label, g.utm_source, g.utm_campaign]
        .some((v) => (v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const ta = new Date(a.event.date ?? 0).getTime(), tb = new Date(b.event.date ?? 0).getTime();
        return tab === "past" ? tb - ta : ta - tb; // soonest first; most recent first for past
      });
  }, [grants, search, tab]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/partner")}`} replace />;

  const err = error as { code?: string; message?: string } | null;

  return (
    <PartnerShell>
      <div>
        <h1 className="text-2xl font-bold">Shared events</h1>
        <p className="text-muted-foreground text-sm">Events where an organiser has shared a registration link with you</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading events...</div>
      ) : err ? (
        <PartnerNotice title={isPartnerFeatureMissing(err) ? "Partner dashboards aren't switched on yet" : "Couldn't load your shared events"}>
          <p>{isPartnerFeatureMissing(err) ? "Please check back shortly, or contact the organiser who invited you." : partnerErrorMessage(err)}</p>
          {!isPartnerFeatureMissing(err) && <Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button>}
        </PartnerNotice>
      ) : grants.length === 0 ? (
        <PartnerNotice title="Nothing has been shared with you yet">
          <p>
            When an event organiser shares a registration link with <span className="text-foreground font-medium break-all">{user.email}</span>,
            the event appears here with its analytics, participants, approvals and check-ins.
          </p>
          <p>If you were invited at a different email address, sign in with that address instead.</p>
        </PartnerNotice>
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
                {search ? "Try a different search." : tab === "upcoming" ? "You have no upcoming shared events. Check the Past tab." : "No past shared events yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {shown.map((g) => {
                const path = `/partner/${g.id}`;
                const description = g.event.description ? stripRichText(g.event.description) : "";
                return (
                  <article
                    key={g.id}
                    onClick={() => navigate(path)}
                    className="bg-card border border-border rounded-xl overflow-hidden card-shadow hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
                  >
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative overflow-hidden">
                      {g.event.image_url ? (
                        <img src={g.event.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Calendar className="h-10 w-10 text-muted-foreground/50" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-white/90 text-black text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                          <ArrowRight className="h-3.5 w-3.5" /> View analytics
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">{g.event.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColor[g.event.status] || ""}`}>{g.event.status}</span>
                      </div>

                      {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {g.event.date ? new Date(g.event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date to be announced"}
                        </div>
                        {(g.event.venue || g.event.location) && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{[g.event.venue, g.event.location].filter(Boolean).join(", ")}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Your link: {g.label || linkLabel(g)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                        <span className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5 min-w-0">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {g.stats.total.toLocaleString()} registered
                            {g.stats.checked_in !== null ? ` · ${g.stats.checked_in.toLocaleString()} checked in` : ""}
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
    </PartnerShell>
  );
}
