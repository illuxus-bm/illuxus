import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, MapPin, Radio, Sparkles } from "lucide-react";
import { buildIcsBlobUrl } from "@/lib/ics";

type Props = {
  eventId: string;
  visitorName: string | null;
  role: "speaker" | "attendee" | "guest" | "host";
  sessionStatus: string | null; // 'scheduled' | 'live' | 'ended' | null
  onJoin?: () => void;
  error?: string | null;
};

type EventInfo = {
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  timezone: string | null;
  image_url: string | null;
  banner_landscape_url: string | null;
  location: string | null;
  venue: string | null;
  event_format: string | null;
  org_id: string | null;
};

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return null;
  const diff = Math.max(0, target.getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s, done: diff === 0 };
}

function formatDate(iso: string, tz?: string | null) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
      timeZone: tz || undefined, timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function WaitingLobby({ eventId, visitorName, role, sessionStatus, onJoin, error }: Props) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("title, description, date, end_date, timezone, image_url, banner_landscape_url, location, venue, event_format, org_id")
        .eq("id", eventId).maybeSingle();
      if (data) {
        // Use the dedicated landscape banner only — never fall back to the
        // square cover (image_url) which is reserved for listing thumbnails.
        setEvent({ ...(data as EventInfo), image_url: null });
        if (data.org_id) {
          const { data: org } = await supabaseRpc("get_public_org_brief", { _org_id: data.org_id });
          const row = Array.isArray(org) ? org[0] : org;
          if (row) { setOrgName(row.name ?? null); setOrgLogo(row.logo_url ?? null); }
        }
      }
    })();
  }, [eventId]);

  const target = useMemo(() => (event?.date ? new Date(event.date) : null), [event?.date]);
  const cd = useCountdown(target);
  const isLive = sessionStatus === "live";
  const firstName = (visitorName || "").trim().split(/\s+/)[0] || null;
  const roleLabel = role === "speaker" ? "Speaker" : role === "host" ? "Host" : "Attendee";
  const banner = event?.banner_landscape_url || null;

  const addToCalendar = () => {
    if (!event) return;
    const url = buildIcsBlobUrl({
      uid: eventId,
      title: event.title,
      description: event.description ?? undefined,
      location: [event.venue, event.location].filter(Boolean).join(", ") || (event.event_format === "virtual" ? "Online" : undefined),
      start: event.date,
      end: event.end_date,
      url: window.location.origin + `/events/${eventId}`,
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Layered ambient backdrop — animated blobs + subtle grid + vignette */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,hsl(var(--foreground)/0.06),transparent_60%),radial-gradient(50%_50%_at_85%_15%,hsl(var(--foreground)/0.05),transparent_55%),radial-gradient(70%_60%_at_50%_110%,hsl(var(--foreground)/0.07),transparent_60%)]" />
        <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-foreground/[0.05] blur-3xl animate-[lobbyFloatA_18s_ease-in-out_infinite]" />
        <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-foreground/[0.05] blur-3xl animate-[lobbyFloatB_22s_ease-in-out_infinite]" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(var(--background))_100%)]" />
      </div>
      <style>{`
        @keyframes lobbyFloatA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,30px) scale(1.06)} }
        @keyframes lobbyFloatB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,-20px) scale(1.08)} }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-6 pb-16">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-12 animate-in fade-in duration-700">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground -ml-2">
            <Link to={`/events/${eventId}`}><ArrowLeft className="h-4 w-4 mr-1.5" />Event page</Link>
          </Button>
          <div className="flex items-center gap-2">
            {orgLogo ? (
              <img src={orgLogo} alt={orgName || ""} className="h-6 w-6 rounded-sm object-cover ring-1 ring-border" />
            ) : null}
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{orgName}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-start">
          {/* LEFT — copy + countdown + CTA */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
            {/* Status pills */}
            <div className="flex items-center gap-2 mb-7">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border ${
                isLive
                  ? "bg-destructive/10 text-destructive border-destructive/30 shadow-[0_0_24px_hsl(var(--destructive)/0.25)]"
                  : "bg-muted/60 text-muted-foreground border-border"
              }`}>
                {isLive
                  ? <><span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />Live now</>
                  : <><Clock className="h-3 w-3" />Lobby open</>}
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground">
                {roleLabel}
              </span>
            </div>

            <h1 className="text-[40px] sm:text-[56px] leading-[1.02] font-semibold tracking-tight">
              {firstName ? (
                <>Welcome,<br />
                  <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/40 bg-clip-text text-transparent">
                    {firstName}.
                  </span>
                </>
              ) : "Welcome."}
            </h1>
            <p className="mt-4 text-[15px] sm:text-[16px] text-muted-foreground max-w-xl leading-relaxed">
              {isLive
                ? "The session is live. Join when you're ready — we've saved your seat."
                : role === "speaker"
                  ? "You're on the speaker list. The studio doors open the moment the host goes live."
                  : "You're checked in. We'll let you in automatically the moment the session goes live."}
            </p>

            {/* Meta chips */}
            {event && (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 backdrop-blur-sm px-3 py-1.5 text-[12px]">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{formatDate(event.date, event.timezone)}</span>
                </span>
                {(event.venue || event.location || event.event_format === "virtual") && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 backdrop-blur-sm px-3 py-1.5 text-[12px]">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">
                      {event.event_format === "virtual"
                        ? "Online webinar"
                        : [event.venue, event.location].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* Countdown — ticket-stub cards */}
            {!isLive && cd && !cd.done && (
              <div className="mt-8">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Starts in</div>
                <div className="flex items-stretch gap-2 sm:gap-3">
                  {[
                    { v: cd.d, l: "Days" },
                    { v: cd.h, l: "Hours" },
                    { v: cd.m, l: "Min" },
                    { v: cd.s, l: "Sec", pulse: true },
                  ].map((u, i, arr) => (
                    <div key={u.l} className="flex items-center">
                      <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm px-4 sm:px-5 py-3.5 min-w-[68px] sm:min-w-[84px] text-center shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05)]">
                        <div className={`text-[30px] sm:text-[40px] font-mono font-semibold tabular-nums leading-none ${u.pulse ? "animate-pulse" : ""}`}>
                          {String(u.v).padStart(2, "0")}
                        </div>
                        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-2">{u.l}</div>
                      </div>
                      {i < arr.length - 1 && (
                        <span className="mx-0.5 sm:mx-1 text-muted-foreground/40 font-mono text-lg">·</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA row */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {(() => {
                // Once the host has created the webinar session row (any
                // non-null status that isn't 'ended'), let everyone enter —
                // speakers, attendees, and hosts. Pre-show / green room flow.
                const sessionAvailable = sessionStatus !== null && sessionStatus !== "ended";
                if (!sessionAvailable) {
                  return (
                    <Button size="lg" disabled className="gap-2">
                      <Sparkles className="h-4 w-4" />Waiting for host…
                    </Button>
                  );
                }
                return (
                  <div className="relative">
                    {isLive && (
                      <span className="absolute -inset-1 rounded-md bg-destructive/40 blur-md animate-pulse" />
                    )}
                    <Button size="lg" onClick={onJoin} className="relative gap-2 shadow-[0_0_30px_hsl(var(--foreground)/0.25)]">
                      <Radio className="h-4 w-4" />
                      {isLive
                        ? "Join the webinar"
                        : role === "host"
                          ? "Enter studio"
                          : role === "speaker"
                            ? "Enter green room"
                            : "Enter webinar"}
                    </Button>
                  </div>
                );
              })()}
              {event && (
                <Button variant="outline" size="lg" onClick={addToCalendar} className="gap-2">
                  <CalendarPlus className="h-4 w-4" />Add to calendar
                </Button>
              )}
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">
              {isLive
                ? "You'll be placed on stage as soon as you click join."
                : "Keep this tab open — it'll unlock automatically."}
            </p>
            {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}
          </div>

          {/* RIGHT — banner card */}
          <div className="animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
            <div className="group relative rounded-2xl border border-border bg-card/70 backdrop-blur-sm overflow-hidden shadow-[0_30px_80px_-30px_hsl(var(--foreground)/0.25)] transition-transform duration-500 hover:-translate-y-0.5">
              {/* Border-glow halo */}
              <div aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-foreground/15 via-transparent to-foreground/10 opacity-60" />
              <div className="relative">
                {banner ? (
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    <img
                      src={banner}
                      alt={event?.title || ""}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  </div>
                ) : (
                  <div className="relative aspect-[16/10] w-full overflow-hidden flex items-center justify-center px-6 bg-[radial-gradient(ellipse_at_center,hsl(var(--muted))_0%,transparent_70%)]">
                    <span className="text-center text-2xl sm:text-3xl font-semibold tracking-tight bg-gradient-to-br from-foreground to-foreground/40 bg-clip-text text-transparent line-clamp-3">
                      {event?.title || "Event"}
                    </span>
                  </div>
                )}
                <div className="p-6 sm:p-7 space-y-3 relative">
                  <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-tight leading-tight line-clamp-2">
                    {event?.title}
                  </h2>
                  {event?.description && (
                    <p className="text-[13.5px] text-muted-foreground leading-relaxed line-clamp-4">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-14 pt-6 border-t border-border/60 flex items-center justify-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">
            Powered by {orgName || "Illuxus"}
          </span>
        </div>
      </div>
    </div>
  );
}
