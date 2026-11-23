import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/data/db";
import { supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, MapPin, Radio } from "lucide-react";
import { buildIcsBlobUrl } from "@/lib/ics";
import { publicOrigin } from "@/lib/publicUrl";
import { cn } from "@/lib/utils";
import { resolveRoomAccent, roomThemeStyle, ROOM_SHELL, ROOM_PANEL, ROOM_CTA, ROOM_BTN, ROOM_ENTER, type RoomAccent } from "./roomTheme";

type Props = {
  eventId: string;
  visitorName: string | null;
  role: "speaker" | "attendee" | "guest" | "host";
  sessionStatus: string | null; // 'scheduled' | 'live' | 'ended' | null
  onJoin?: () => void;
  error?: string | null;
  /** Organizer accent (falls back to the room default). */
  accent?: RoomAccent;
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

export function WaitingLobby({ eventId, visitorName, role, sessionStatus, onJoin, error, accent }: Props) {
  const roomStyle = useMemo(() => roomThemeStyle(accent ?? resolveRoomAccent()), [accent]);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await db
        .from("events")
        .select("title, description, date, end_date, timezone, image_url, banner_landscape_url, location, venue, event_format, org_id")
        .eq("id", eventId).maybeSingle();
      if (data) {
        // Use the dedicated landscape banner only — never fall back to the
        // square cover (image_url) which is reserved for listing thumbnails.
        setEvent({ ...(data as EventInfo), image_url: null });
        if (data.org_id) {
          const { data: org } = await supabaseRpc("get_public_org_brief", { _oid: data.org_id });
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
      url: publicOrigin() + `/events/${eventId}`,
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sessionAvailable = sessionStatus !== null && sessionStatus !== "ended";
  const joinLabel = isLive
    ? "Join the webinar"
    : role === "host" ? "Enter studio" : role === "speaker" ? "Enter green room" : "Enter webinar";
  const where = event
    ? event.event_format === "virtual" ? "Online" : [event.venue, event.location].filter(Boolean).join(" · ")
    : "";

  return (
    <div style={roomStyle} className={cn(ROOM_SHELL, "min-h-screen")}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-8 sm:py-6">
        <header className="flex h-9 items-center justify-between">
          <Link
            to={`/events/${eventId}`}
            className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[14px] text-white/50 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />Event page
          </Link>
          {orgName && (
            <span className="flex items-center gap-2 text-[13px] text-white/50">
              {orgLogo && <img loading="lazy" decoding="async" src={orgLogo} alt="" className="h-6 w-6 rounded-full object-cover" />}
              {orgName}
            </span>
          )}
        </header>

        <main className={cn("grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_1fr] lg:gap-16", ROOM_ENTER)}>
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-[13px] text-white/50">
              <span className="inline-flex items-center gap-2 text-white/80">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-[#E5484D]" : "bg-white/40")} />
                {isLive ? "Live now" : "Lobby open"}
              </span>
              <span aria-hidden className="h-3 w-px bg-white/15" />
              <span>{firstName ? `${firstName} · ${roleLabel}` : roleLabel}</span>
            </div>

            <h1 className="mt-5 text-[32px] sm:text-[44px] font-medium leading-[1.08] tracking-[-0.02em] text-white">
              {event?.title ?? "Webinar"}
            </h1>

            {event && (
              <dl className="mt-6 space-y-2 text-[14px]">
                <div className="flex items-center gap-2.5 text-white/70">
                  <dt className="sr-only">When</dt>
                  <CalendarDays className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.5} />
                  <dd>{formatDate(event.date, event.timezone)}</dd>
                </div>
                {where && (
                  <div className="flex items-center gap-2.5 text-white/70">
                    <dt className="sr-only">Where</dt>
                    <MapPin className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.5} />
                    <dd>{where}</dd>
                  </div>
                )}
              </dl>
            )}

            {!isLive && cd && !cd.done && (
              <div className="mt-8" aria-label="Starts in">
                <p className="mb-2 text-[13px] text-white/40">Starts in</p>
                <div className="flex items-baseline gap-5 font-mono tabular-nums">
                  {[
                    { v: cd.d, l: "d" },
                    { v: cd.h, l: "h" },
                    { v: cd.m, l: "m" },
                    { v: cd.s, l: "s" },
                  ].map((u) => (
                    <span key={u.l} className="text-[32px] sm:text-[40px] font-medium leading-none text-white">
                      {String(u.v).padStart(2, "0")}
                      <span className="ml-1 text-[14px] text-white/35">{u.l}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2">
              {sessionAvailable ? (
                <Button onClick={onJoin} className={cn("h-11 gap-2 px-5 text-[14px]", ROOM_CTA)}>
                  <Radio className="h-4 w-4" strokeWidth={1.5} />{joinLabel}
                </Button>
              ) : (
                <Button disabled className={cn("h-11 gap-2 px-5 text-[14px] disabled:opacity-100", ROOM_BTN, "text-white/50")}>
                  <Clock className="h-4 w-4" strokeWidth={1.5} />Waiting for the host
                </Button>
              )}
              {event && (
                <Button onClick={addToCalendar} className={cn("h-11 gap-2 px-4 text-[14px]", ROOM_BTN)}>
                  <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />Add to calendar
                </Button>
              )}
            </div>
            <p className="mt-3 text-[13px] text-white/40">
              {isLive
                ? "You join as a viewer, with chat, Q&A and raised hands"
                : role === "speaker"
                  ? "The green room opens as soon as the host creates the session"
                  : "Keep this tab open — the button unlocks when the session starts"}
            </p>
            {error && <p className="mt-3 text-[13px] text-[#FF7A72]">{error}</p>}
          </div>

          <figure className={cn("rounded-[20px] p-2", ROOM_PANEL)}>
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[12px] bg-[#0B0B0C]">
              {banner ? (
                <img loading="lazy" decoding="async" src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                  {orgLogo ? (
                    <img src={orgLogo} alt="" className="h-14 w-14 rounded-[14px] object-cover" />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-white/[0.06] text-[22px] font-medium text-white/70">
                      {(orgName || event?.title || "I").charAt(0).toUpperCase()}
                    </span>
                  )}
                  {orgName && <span className="text-[13px] text-white/45">{orgName}</span>}
                </div>
              )}
              <span className="absolute left-3 top-3 inline-flex h-7 items-center gap-2 rounded-[8px] bg-black/60 px-2.5 text-[12px] font-medium text-white">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-[#E5484D]" : "bg-white/40")} />
                {isLive ? "Live" : "Starting soon"}
              </span>
            </div>
            {event?.description && (
              <figcaption className="px-3 pb-2 pt-4 text-[14px] leading-relaxed text-white/55 line-clamp-4">
                {event.description}
              </figcaption>
            )}
          </figure>
        </main>

        <footer className="pt-6 text-center text-[12px] text-white/30">
          Hosted by {orgName || "Illuxus"}
        </footer>
      </div>
    </div>
  );
}
