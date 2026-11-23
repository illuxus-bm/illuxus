import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/data/db";
import { useAuth } from "@/contexts/AuthContext";
import { FeatureGate } from "@/components/plans/FeatureGate";
import { useHasFeature } from "@/hooks/usePlanFeatures";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Radio, Square, Plus, Copy, Megaphone, MessageSquare, CircleDot, StopCircle, PhoneOff, MapPinned,
  ExternalLink, Link2, Users, Eye, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eventThemeColor, resolveRoomAccent, roomThemeStyle } from "@/components/webinar/roomTheme";
import { LiveRoomShell, OnAirChip, RoomHeaderButton } from "@/components/webinar/LiveRoomShell";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useSessionBranding } from "@/components/webinar/StageOverlays";
import { publicUrl } from "@/lib/publicUrl";
import { getWebinarProvider, type WebinarProvider } from "@/lib/webinar/provider";
import type { Tables } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/friendly-error";
import { safeUrl } from "@/lib/safe-url";
import { toStageLayout } from "@/lib/webinar/stage-layout";

// Local interim row aliases so this page doesn't lean on `any`. `EventRow`
// extends the generated row with `video_provider` because the column was
// added in a recent migration but `types.ts` hasn't been regenerated yet.
type SessionRow = Tables<"webinar_sessions">;
type WebinarSpeakerRow = Tables<"webinar_speakers">;
type EventRow = Tables<"events"> & { video_provider?: "livekit" | "agora" | null };
// Realtime INSERT events for the floating reactions / announcement banner.
// We only read `p.new`, so a tight local shape is enough — avoids importing
// the full `RealtimePostgresChangesPayload` generic and its index-signature
// constraints which the generated row types don't satisfy.
type ReactionInsertPayload = { new: Tables<"webinar_reactions"> };
type AnnouncementInsertPayload = { new: Tables<"webinar_announcements"> };

// Lazy-load heavy webinar UI so the dashboard bundle stays small and the
// LiveKit client / styles only download when a host actually opens a session.
const WebinarStage = lazy(() =>
  import("@/components/webinar/WebinarStage").then((m) => ({ default: m.WebinarStage })),
);
const AnalyticsPanel = lazy(() =>
  import("@/components/webinar/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })),
);
const PreJoinCheck = lazy(() =>
  import("@/components/webinar/PreJoinCheck").then((m) => ({ default: m.PreJoinCheck })),
);

export default function BroadcastPage() {
  const { id: routeId } = useParams();
  const { user, isAdmin } = useAuth();
  // The route param can be either a UUID or a slug (other dashboard pages
  // already accept both). DB queries expect UUIDs, so resolve once up-front
  // and gate every DB call on the resolved id. URLs / nav links keep using
  // the original `routeId` so the address bar stays stable for slug routes.
  const [eventId, setEventId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [speakers, setSpeakers] = useState<WebinarSpeakerRow[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [showPrejoin, setShowPrejoin] = useState(false);
  // Device selections captured in the pre-join screen and forwarded to LiveKit
  const [deviceOpts, setDeviceOpts] = useState<{
    mic: boolean; cam: boolean; camId?: string; micId?: string; spkId?: string;
  } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The select below only fetches a subset of columns, but the rest of the
  // page reads `event?.title`, `event?.event_format`, etc. via optional
  // chaining. Typing the state as `Partial<EventRow>` captures that truth
  // without forcing every cell to be present.
  const [event, setEvent] = useState<Partial<EventRow> | null>(null);
  const webinarAllowed = useHasFeature(event?.org_id ?? null, "webinar");
  const [orgBrandingDefault, setOrgBrandingDefault] = useState<boolean>(true);
  const [org, setOrg] = useState<{ name: string | null; logo: string | null }>({ name: null, logo: null });
  const [creating, setCreating] = useState(false);
  const branding = useSessionBranding(session?.id);
  const effectiveBranding = event?.webinar_branding_enabled ?? orgBrandingDefault ?? true;
  const roomAccent = useMemo(
    () => resolveRoomAccent({ eventColor: eventThemeColor(event?.page_config), branding, brandingEnabled: effectiveBranding }),
    [event?.page_config, branding, effectiveBranding],
  );
  const roomStyle = useMemo(() => roomThemeStyle(roomAccent), [roomAccent]);

  // Resolve the URL param to a real event UUID. The route accepts both, so a
  // slug ("xyz") would otherwise be sent straight into a UUID column and fail
  // with `invalid input syntax for type uuid: "xyz"`. Look up by slug when
  // needed and stash the UUID in `eventId` for every DB call below.
  useEffect(() => {
    if (!routeId) {
      setEventId(null);
      return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId);
    if (isUuid) {
      setEventId(routeId);
      return;
    }
    let cancel = false;
    (async () => {
      const { data } = await db
        .from("events")
        .select("id")
        .eq("slug", routeId)
        .maybeSingle();
      if (!cancel && data) {
        setEventId((data as { id: string }).id);
      }
    })();
    return () => { cancel = true; };
  }, [routeId]);

  useEffect(() => {
    if (!eventId) return;
    db.from("events")
      .select("id, title, event_format, banner_landscape_url, page_config, video_provider, webinar_branding_enabled, org_id")
      .eq("id", eventId).maybeSingle()
      .then(async ({ data: raw }) => {
        // Generated types predate `video_provider`; see EventRow above.
        const data = raw as unknown as Partial<EventRow> | null;
        if (!data) return;
        setEvent(data);
        if (data.org_id) {
          const { data: o } = await db.from("organizations").select("name, logo_url, webinar_branding_enabled").eq("id", data.org_id).maybeSingle();
          if (o) {
            setOrgBrandingDefault(o.webinar_branding_enabled ?? true);
            setOrg({ name: o.name ?? null, logo: o.logo_url ?? null });
          }
        }
      });
  }, [eventId]);

  const setEventBranding = async (val: boolean | null) => {
    if (!eventId) return;
    await db.from("events").update({ webinar_branding_enabled: val }).eq("id", eventId);
    setEvent((e) => (e ? { ...e, webinar_branding_enabled: val } : e));
    toast.success(val === null ? "Using organization default" : `Branding overlays ${val ? "enabled" : "disabled"}`);
  };

  useEffect(() => {
    if (!eventId) return;
    const load = () => db.from("webinar_sessions").select("*").eq("event_id", eventId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setSession(data); } });
    load();
    const ch = supabase.channel(`bcast-session-${eventId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "webinar_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId]);

  useEffect(() => {
    if (!session?.id || !eventId) return;
    const sessionId = session.id;
    // Backfill: ensure every event speaker has a webinar_speakers row (with a unique invite_token).
    (async () => {
      const { data: rel } = await db.from("event_speakers")
        .select("speaker_id").eq("event_id", eventId);
      const speakerIds = (rel ?? []).map((r) => r.speaker_id);
      if (!speakerIds.length) return;
      const { data: spks } = await db.from("speakers")
        .select("id, name, email").in("id", speakerIds);
      const { data: existing } = await db.from("webinar_speakers")
        .select("email").eq("session_id", sessionId);
      const have = new Set((existing ?? []).map((e) => (e.email ?? "").toLowerCase()));
      const toInsert = (spks ?? [])
        .filter((s) => s.email && !have.has(s.email.toLowerCase()))
        .map((s) => ({ session_id: sessionId, email: s.email!, display_name: s.name, role: "speaker" }));
      if (toInsert.length) await db.from("webinar_speakers").insert(toInsert);
    })();
    db.from("webinar_speakers").select("*").eq("session_id", sessionId).order("created_at")
      .then(({ data }) => setSpeakers(data || []));
    const ch = supabase.channel(`speakers-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_speakers", filter: `session_id=eq.${sessionId}` },
        () => db.from("webinar_speakers").select("*").eq("session_id", sessionId).order("created_at").then(({ data }) => setSpeakers(data || [])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.id, eventId]);

  const createSession = async () => {
    if (creating) return;
    setCreating(true);
    try { await createSessionImpl(); } finally { setCreating(false); }
  };
  const createSessionImpl = async () => {
    // Clean up old ended/error sessions for this event to prevent row accumulation.
    if (eventId) {
      await db
        .from("webinar_sessions")
        .delete()
        .eq("event_id", eventId)
        .in("status", ["ended", "error"]);
    }

    // Resolve which provider this event uses (per-event override > platform
    // default > 'livekit'). Agora doesn't need a room-create edge function —
    // tokens are minted on-demand by `agora-token` at stage-mount time. So
    // for Agora we skip the LiveKit edge function entirely and just insert
    // the session row.
    const provider: WebinarProvider = getWebinarProvider({
      eventOverride: event?.video_provider ?? null,
    }).provider;

    if (provider === "livekit") {
      // LiveKit path: try the edge function first (creates a real LiveKit room).
      let edgeFnWorked = false;
      try {
        const { data, error } = await db.functions.invoke("livekit-room-create", { body: { event_id: eventId, record_enabled: false } });
        if (!error && data?.session) {
          setSession(data.session);
          toast.success("Stream room ready");
          edgeFnWorked = true;
        }
      } catch {
        // Edge function not available — fall through to fallback
      }

      if (edgeFnWorked) return;
    }

    // Provider is Agora, OR LiveKit edge function is unavailable. Create the
    // session row directly. For Agora this is the normal happy path; for
    // LiveKit it's a fallback for environments without LiveKit secrets.
    const room = `event-${(eventId || "").slice(0, 8)}-${Date.now().toString(36)}`;
    const { data: fallbackSession, error: dbErr } = await db
      .from("webinar_sessions")
      .insert({
        event_id: eventId,
        livekit_room: room,
        status: "scheduled",
        record_enabled: false,
        created_by: user!.id,
      })
      .select()
      .single();

    if (dbErr) {
      toast.error(`Could not create session: ${dbErr.message}`);
      return;
    }

    setSession(fallbackSession);

    if (provider === "agora") {
      toast.success("Webinar created — ready to go live via Agora");
    } else {
      toast.warning("Session created (LiveKit not configured — streaming won't work until you add LiveKit secrets in Supabase)");
    }
  };

  // Restart an ended session — resets status to "scheduled" so the host
  // can go live again on the same room without losing speaker config.
  const restartSession = async () => {
    if (!session) return;
    const { error } = await db
      .from("webinar_sessions")
      .update({ status: "scheduled", ended_at: null })
      .eq("id", session.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setSession({ ...session, status: "scheduled", ended_at: null });
    toast.success("Session restarted — click Go Live when ready");
  };

  const goLive = async () => {
    try {
      const { error } = await db.functions.invoke("livekit-go-live", { body: { session_id: session.id } });
      if (error) {
        // Edge function failed — just update status directly in DB
        await db.from("webinar_sessions").update({ status: "live" }).eq("id", session.id);
      }
    } catch {
      // Edge function not available — update DB directly
      await db.from("webinar_sessions").update({ status: "live" }).eq("id", session.id);
    }
    setSession({ ...session, status: "live" });
    setShowPrejoin(true);
  };

  const [recBusy, setRecBusy] = useState(false);
  const toggleRecording = async () => {
    if (!session || recBusy) return;
    setRecBusy(true);
    const fn = session.egress_id ? "recording-stop" : "recording-start";
    try {
      const { error } = await db.functions.invoke(fn, { body: { session_id: session.id } });
      if (error) { setRecBusy(false); return toast.error("Recording requires LiveKit to be configured."); }
    } catch {
      setRecBusy(false);
      return toast.error("Recording requires LiveKit to be configured.");
    }
    setRecBusy(false);
    toast.success(session.egress_id ? "Recording stopped" : "Recording started");
  };

  const fetchToken = async () => {
    const provider: WebinarProvider = getWebinarProvider({
      eventOverride: event?.video_provider ?? null,
    }).provider;
    if (provider === "agora") {
      // Agora path: AgoraWebinarStage fetches its own RTC token via the
      // agora-token edge function; we just unblock the stage render.
      setToken("agora");
      setWsUrl("agora");
      setCanPublish(true);
      return true;
    }
    try {
      const { data, error } = await db.functions.invoke("livekit-token", { body: { session_id: session.id } });
      if (error || !data?.token) { toast.error("LiveKit not configured — streaming requires LiveKit secrets in Supabase dashboard."); return false; }
      setToken(data.token); setWsUrl(data.ws_url); setCanPublish(data.can_publish);
      return true;
    } catch {
      toast.error("LiveKit not configured — streaming requires LiveKit secrets in Supabase dashboard.");
      return false;
    }
  };

  const endLive = async () => {
    if (!confirm("End stream for everyone?")) return;
    try {
      await db.functions.invoke("livekit-room-end", { body: { session_id: session.id } });
    } catch { /* edge fn unavailable */ }
    await db.from("webinar_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session.id);
    setToken(null);
    setSession({ ...session, status: "ended" });
    toast.success("Stream ended");
  };

  const leaveStage = useCallback(() => { setToken(null); toast.info("You left the stage"); }, []);

  const speakerLink = (token: string) => publicUrl(`/e/${routeId}/live?speaker=${token}`);

  const updateLounge = async (enabled: boolean) => {
    if (!session) return;
    await db.from("webinar_sessions").update({ lounge_enabled: enabled }).eq("id", session.id);
    setSession({ ...session, lounge_enabled: enabled });
  };
  const sendAnnouncement = async () => {
    if (!announcement.trim() || !session) return;
    await db.from("webinar_announcements").insert({ session_id: session.id, message: announcement.trim() });
    setAnnouncement("");
    toast.success("Announcement sent");
  };

  if (!user) return null;

  if (event && event.event_format === "physical") {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-6">
        <div className="max-w-2xl">
          <Card className="p-8 text-center space-y-4">
            <MapPinned className="h-8 w-8 mx-auto text-muted-foreground" />
            <h1 className="text-lg font-semibold tracking-tight">Webinar not available</h1>
            <p className="text-[13px] text-muted-foreground">
              In-person events don't include the live webinar studio. Switch the event format to Virtual or Hybrid to enable it.
            </p>
            <Button asChild variant="outline"><Link to={`/dashboard/events/${routeId}`}>Back to event</Link></Button>
          </Card>
        </div>
      </div>
    );
  }

  if (webinarAllowed === false && !isAdmin) {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-6">
        <Card className="max-w-2xl">
          <FeatureGate feature="webinar" orgId={event?.org_id ?? null}>{null}</FeatureGate>
        </Card>
      </div>
    );
  }

  const eventHref = `/dashboard/events/${routeId}`;
  const eventTitle = event?.title || "Webinar";
  const attendeeUrl = publicUrl(`/e/${routeId}/live`);
  const copy = (text: string, label: string) => { navigator.clipboard.writeText(text); toast.success(`${label} copied`); };

  if (!session) {
    const features = [
      { icon: Users, text: "Up to 10 speakers on stage" },
      { icon: Eye, text: "Unlimited viewers" },
      { icon: CircleDot, text: "Record any time while live" },
      { icon: MessageSquare, text: "Chat, Q&A, polls and raised hands" },
    ];
    return (
      <div className="space-y-5">
        <SectionHeader />
        <Card className="overflow-hidden">
          <div className="grid items-center gap-8 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
            <div>
              <h2 className="text-[15px] font-semibold">Set up the live stream</h2>
              <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
                One room for this event. Speakers join with their invite links, attendees watch from the event page.
              </p>
              <ul className="mt-5 max-w-md divide-y divide-border border-y border-border">
                {features.map((f) => (
                  <li key={f.text} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <f.icon className="h-4 w-4 shrink-0 text-muted-foreground" />{f.text}
                  </li>
                ))}
              </ul>
              <Button onClick={createSession} disabled={creating} className="mt-5 gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creating…" : "Create webinar"}
              </Button>
            </div>
            <StagePreview banner={event?.banner_landscape_url ?? null} title={eventTitle} caption="What attendees see" />
          </div>
        </Card>
      </div>
    );
  }

  if (showPrejoin && !token) {
    return (
      <Suspense fallback={<FullPageLoader label="Preparing studio…" />}>
        <PreJoinCheck
          asPublisher
          accent={roomAccent}
          onCancel={() => setShowPrejoin(false)}
          onJoin={async (opts) => {
            // Persist the chosen devices so WebinarStage can honour them
            if (opts) setDeviceOpts(opts);
            const ok = await fetchToken();
            if (ok) setShowPrejoin(false);
          }}
        />
      </Suspense>
    );
  }

  if (token) {
    // Stable stage element — LiveRoomShell keeps it mounted across minimize.
    const stageEl = (
      <Suspense fallback={<FullPageLoader label="Connecting to studio…" />}>
        <WebinarStage
          provider={getWebinarProvider({
            eventOverride: event?.video_provider ?? null,
          }).provider}
          token={token}
          wsUrl={wsUrl!}
          canPublish={canPublish}
          layout={toStageLayout(session.layout)}
          branding={branding}
          brandingEnabled={effectiveBranding}
          sessionId={session.id}
          userId={user.id}
          isHost
          onDisconnect={leaveStage}
          micEnabled={deviceOpts?.mic ?? true}
          camEnabled={deviceOpts?.cam ?? true}
          camDeviceId={deviceOpts?.camId}
          micDeviceId={deviceOpts?.micId}
        />
      </Suspense>
    );

    const live = session.status === "live";
    return (
      <LiveRoomShell
        style={roomStyle}
        sessionId={session.id}
        userId={user.id}
        isHost
        canPublish={canPublish}
        isLive={live}
        title={eventTitle}
        org={org}
        breadcrumbs={[
          { label: "Events", href: "/dashboard/events" },
          { label: eventTitle, href: eventHref },
          { label: "Studio" },
        ]}
        backHref={eventHref}
        backLabel="Event"
        logoOnStage={effectiveBranding && !!branding?.logo_url}
        stage={stageEl}
        stageOverlays={<><ReactionFloats sessionId={session.id} /><AnnouncementBanner sessionId={session.id} /></>}
        headerActions={live ? (
          <>
            <RoomHeaderButton
              onClick={toggleRecording}
              disabled={recBusy}
              tone={session.egress_id ? "danger" : "neutral"}
              title={session.egress_id ? "Stop recording" : "Start recording"}
            >
              {session.egress_id ? <StopCircle className="h-4 w-4" strokeWidth={1.5} /> : <CircleDot className="h-4 w-4" strokeWidth={1.5} />}
              <span className="hidden sm:inline">{session.egress_id ? "Stop recording" : "Record"}</span>
            </RoomHeaderButton>
            <RoomHeaderButton onClick={endLive} tone="danger" title="End session for everyone">
              <PhoneOff className="h-4 w-4" strokeWidth={1.5} /><span className="hidden sm:inline">End session</span>
            </RoomHeaderButton>
          </>
        ) : (
          <RoomHeaderButton onClick={goLive} tone="accent" title="Start session">
            <Radio className="h-4 w-4" strokeWidth={1.5} /><span className="hidden sm:inline">Go live</span>
          </RoomHeaderButton>
        )}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onLeave={leaveStage}
      />
    );
  }

  // ── Studio lobby: session exists, host not on stage ──
  const primaryAction =
    session.status === "live"
      ? { label: "Join as host", onClick: () => setShowPrejoin(true) }
      : session.status === "ended"
        ? { label: "Restart session", onClick: restartSession }
        : { label: "Go live", onClick: goLive };

  return (
    <div className="space-y-5">
      <SectionHeader
        status={session.status}
        recording={!!session.egress_id}
        actions={
          <>
            {session.status === "live" && (
              <>
                <Button variant="outline" size="sm" onClick={toggleRecording} disabled={recBusy} className="gap-1.5">
                  {session.egress_id ? <StopCircle className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
                  {session.egress_id ? "Stop recording" : "Record"}
                </Button>
                <Button variant="outline" size="sm" onClick={endLive} className="gap-1.5 text-destructive hover:text-destructive">
                  <Square className="h-4 w-4" />End session
                </Button>
              </>
            )}
            {session.status === "ended" && (
              <Button variant="outline" size="sm" onClick={createSession} disabled={creating} className="gap-1.5">
                <Plus className="h-4 w-4" />New session
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <div className="relative h-[280px] sm:h-[340px] bg-zinc-950">
              {event?.banner_landscape_url && (
                <img src={event.banner_landscape_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="max-w-sm text-balance text-[13.5px] leading-relaxed text-white/70">
                  {session.status === "live"
                    ? "The session is live. Step back on stage to present or moderate"
                    : session.status === "ended"
                      ? "This session has ended. Restart it to go live again in the same room"
                      : "The room is ready. Check your camera and mic, then go live"}
                </p>
                <Button onClick={primaryAction.onClick} className="gap-2">
                  <Radio className="h-4 w-4" />{primaryAction.label}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">{attendeeUrl}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => copy(attendeeUrl, "Attendee link")}>
                <Copy className="mr-1 h-3 w-3" />Copy
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" asChild>
                <a href={attendeeUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" />Open</a>
              </Button>
            </div>
            {session.recording_url && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px]">
                <span className="text-muted-foreground">Recording ready</span>
                <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={safeUrl(session.recording_url)} target="_blank" rel="noreferrer">
                  View recording <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Analytics</h2>
            <Suspense fallback={<div className="py-8 text-center text-[13px] text-muted-foreground">Loading analytics…</div>}>
              <AnalyticsPanel sessionId={session.id} />
            </Suspense>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4 space-y-3">
            <h2 className="text-[15px] font-semibold">Studio settings</h2>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-[13px] font-medium">Networking lounge</p>
                <p className="text-[12px] text-muted-foreground">Small-group video tables for attendees</p>
              </div>
              <Switch checked={!!session.lounge_enabled} onCheckedChange={updateLounge} aria-label="Networking lounge" />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium">Branding overlays</p>
                  <p className="text-[12px] text-muted-foreground">Logo, lower-thirds and banners on stage · org default {orgBrandingDefault ? "on" : "off"}</p>
                </div>
                <Switch checked={effectiveBranding} onCheckedChange={(v) => setEventBranding(v)} aria-label="Branding overlays" />
              </div>
              {event?.webinar_branding_enabled !== null && event?.webinar_branding_enabled !== undefined && (
                <button className="mt-1.5 text-[12px] font-medium text-primary hover:underline" onClick={() => setEventBranding(null)}>
                  Use org default
                </button>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <Label htmlFor="studio-announce" className="text-[13px] font-medium">Announcement</Label>
              <p className="mb-2 text-[12px] text-muted-foreground">Shown on every attendee's screen for a few seconds</p>
              <div className="flex gap-1.5">
                <Input
                  id="studio-announce"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendAnnouncement()}
                  placeholder="Announce something…"
                  className="h-9 text-[13px]"
                />
                <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={sendAnnouncement} disabled={!announcement.trim()} aria-label="Send announcement">
                  <Megaphone className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Speakers</h2>
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{speakers.length}/10</span>
            </div>
            {speakers.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Add speakers to the event and their invite links appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {speakers.map((sp) => (
                  <li key={sp.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-medium">
                      {(sp.display_name || sp.email || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{sp.display_name || sp.email}</p>
                      {sp.display_name && sp.email && <p className="truncate text-[12px] text-muted-foreground">{sp.email}</p>}
                    </div>
                    {sp.invite_token && (
                      <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-[12px]" onClick={() => copy(speakerLink(sp.invite_token!), "Invite link")}>
                        <Copy className="mr-1 h-3 w-3" />Invite link
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground/70" title={session.livekit_room}>{session.livekit_room}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Section title row, matching the other event dashboard sections. */
function SectionHeader({ status, recording, actions }: { status?: string; recording?: boolean; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Radio className="h-5 w-5" />Webinar
          {status && <StatusBadge status={status} />}
          {recording && <StatusBadge status="recording" />}
        </h1>
        <p className="text-[13px] text-muted-foreground">Stream this event live, with chat, Q&A and polls for attendees.</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const on = status === "live" || status === "recording";
  const label = status === "live" ? "Live" : status === "recording" ? "Recording" : status === "scheduled" ? "Ready" : status === "ended" ? "Ended" : status;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium capitalize tracking-normal text-muted-foreground">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-destructive" : "bg-muted-foreground/50")} />
      {label}
    </span>
  );
}

/** Small dark sketch of the attendee room (the stage is dark in both themes). */
function StagePreview({ banner, title, caption }: { banner: string | null; title: string; caption: string }) {
  return (
    <figure className="rounded-xl bg-zinc-950 p-2.5">
      <div className="flex gap-2.5">
        <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg bg-black">
          {banner ? (
            <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[16px] sm:text-[18px] font-medium leading-tight text-white/80 line-clamp-3">
              {title}
            </div>
          )}
          <OnAirChip live label="Live" className="absolute left-2.5 top-2.5" />
        </div>
        <div aria-hidden className="hidden w-[28%] flex-col gap-2 sm:flex">
          <div className="flex gap-1 rounded-md bg-white/[0.05] p-1">
            <span className="h-4 flex-1 rounded bg-white/[0.1]" /><span className="h-4 flex-1" /><span className="h-4 flex-1" />
          </div>
          <span className="h-1.5 w-4/5 rounded-full bg-white/[0.08]" />
          <span className="h-1.5 w-3/5 rounded-full bg-white/[0.06]" />
          <span className="ml-auto mt-auto h-5 w-3/4 rounded-md bg-primary/30" />
          <span className="h-5 w-2/3 rounded-md bg-white/[0.06]" />
        </div>
      </div>
      <figcaption className="px-1 pt-2.5 text-[12px] text-white/50">{caption}</figcaption>
    </figure>
  );
}

function ReactionFloats({ sessionId }: { sessionId: string }) {
  const [floats, setFloats] = useState<{ id: string; emoji: string; left: number }[]>([]);
  useEffect(() => {
    const ch = supabase.channel(`reactions-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_reactions", filter: `session_id=eq.${sessionId}` },
        (p: ReactionInsertPayload) => {
          const id = p.new.id; const emoji = p.new.emoji;
          const left = 10 + Math.random() * 80;
          setFloats((f) => [...f, { id, emoji, left }]);
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 3000);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {floats.map((f) => (
        <div key={f.id} className="absolute bottom-20 text-2xl sm:text-3xl lg:text-4xl animate-float" style={{ left: `${f.left}%` }}>
          {f.emoji}
        </div>
      ))}
    </div>
  );
}

function AnnouncementBanner({ sessionId }: { sessionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const ch = supabase.channel(`announce-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_announcements", filter: `session_id=eq.${sessionId}` },
        (p: AnnouncementInsertPayload) => {
          setMsg(p.new.message);
          setTimeout(() => setMsg(null), 6000);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);
  if (!msg) return null;
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md text-sm shadow-lg z-20">
      📣 {msg}
    </div>
  );
}
