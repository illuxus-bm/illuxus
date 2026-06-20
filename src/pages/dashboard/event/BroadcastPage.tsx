import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Radio, Square, Plus, Copy, Megaphone, Sparkles, LogOut, ArrowLeft, Minimize2, Maximize2, X, MessageSquare, Maximize, Minimize, Circle, CircleDot, StopCircle, PhoneOff, MapPinned, ExternalLink, Link2 } from "lucide-react";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useSessionBranding } from "@/components/webinar/StageOverlays";
import { publicUrl } from "@/lib/publicUrl";
import { getWebinarProvider, type WebinarProvider } from "@/lib/webinar/provider";

// Lazy-load heavy webinar UI so the dashboard bundle stays small and the
// LiveKit client / styles only download when a host actually opens a session.
const WebinarStage = lazy(() =>
  import("@/components/webinar/WebinarStage").then((m) => ({ default: m.WebinarStage })),
);
const WebinarSidebar = lazy(() =>
  import("@/components/webinar/WebinarSidebar").then((m) => ({ default: m.WebinarSidebar })),
);
const AnalyticsPanel = lazy(() =>
  import("@/components/webinar/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })),
);
const PreJoinCheck = lazy(() =>
  import("@/components/webinar/PreJoinCheck").then((m) => ({ default: m.PreJoinCheck })),
);

export default function BroadcastPage() {
  const { id: routeId } = useParams();
  const { user } = useAuth();
  const { hasAddon } = useOrg();
  // The route param can be either a UUID or a slug (other dashboard pages
  // already accept both). DB queries expect UUIDs, so resolve once up-front
  // and gate every DB call on the resolved id. URLs / nav links keep using
  // the original `routeId` so the address bar stays stable for slug routes.
  const [eventId, setEventId] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [showPrejoin, setShowPrejoin] = useState(false);
  // Device selections captured in the pre-join screen and forwarded to LiveKit
  const [deviceOpts, setDeviceOpts] = useState<{
    mic: boolean; cam: boolean; camId?: string; micId?: string; spkId?: string;
  } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [event, setEvent] = useState<any>(null);
  const [orgBrandingDefault, setOrgBrandingDefault] = useState<boolean>(true);
  const branding = useSessionBranding(session?.id);
  const effectiveBranding = event?.webinar_branding_enabled ?? orgBrandingDefault ?? true;

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
      const { data } = await supabase
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
    supabase.from("events").select("id, webinar_branding_enabled, org_id").eq("id", eventId).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        setEvent(data);
        if (data.org_id) {
          const { data: o } = await supabase.from("organizations").select("webinar_branding_enabled").eq("id", data.org_id).maybeSingle();
          if (o) setOrgBrandingDefault(o.webinar_branding_enabled ?? true);
        }
      });
  }, [eventId]);

  const setEventBranding = async (val: boolean | null) => {
    if (!eventId) return;
    await supabase.from("events").update({ webinar_branding_enabled: val }).eq("id", eventId);
    setEvent((e: any) => ({ ...e, webinar_branding_enabled: val }));
    toast.success(val === null ? "Using organization default" : `Branding overlays ${val ? "enabled" : "disabled"}`);
  };

  useEffect(() => {
    if (!eventId) return;
    const load = () => supabase.from("webinar_sessions").select("*").eq("event_id", eventId)
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
      const { data: rel } = await supabase.from("event_speakers")
        .select("speaker_id").eq("event_id", eventId);
      const speakerIds = (rel || []).map((r: any) => r.speaker_id);
      if (!speakerIds.length) return;
      const { data: spks } = await supabase.from("speakers")
        .select("id, name, email").in("id", speakerIds);
      const { data: existing } = await supabase.from("webinar_speakers")
        .select("email").eq("session_id", sessionId);
      const have = new Set((existing || []).map((e: any) => (e.email || "").toLowerCase()));
      const toInsert = (spks || [])
        .filter((s: any) => s.email && !have.has(s.email.toLowerCase()))
        .map((s: any) => ({ session_id: sessionId, email: s.email, display_name: s.name, role: "speaker" }));
      if (toInsert.length) await supabase.from("webinar_speakers").insert(toInsert);
    })();
    supabase.from("webinar_speakers").select("*").eq("session_id", sessionId).order("created_at")
      .then(({ data }) => setSpeakers(data || []));
    const ch = supabase.channel(`speakers-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_speakers", filter: `session_id=eq.${sessionId}` },
        () => supabase.from("webinar_speakers").select("*").eq("session_id", sessionId).order("created_at").then(({ data }) => setSpeakers(data || [])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.id, eventId]);

  const createSession = async () => {
    // Clean up old ended/error sessions for this event to prevent row accumulation.
    if (eventId) {
      await supabase
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
      eventOverride: (event as { video_provider?: string | null } | null)?.video_provider ?? null,
    }).provider;

    if (provider === "livekit") {
      // LiveKit path: try the edge function first (creates a real LiveKit room).
      let edgeFnWorked = false;
      try {
        const { data, error } = await supabase.functions.invoke("livekit-room-create", { body: { event_id: eventId, record_enabled: false } });
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
    const { data: fallbackSession, error: dbErr } = await supabase
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
    const { error } = await supabase
      .from("webinar_sessions")
      .update({ status: "scheduled", ended_at: null })
      .eq("id", session.id);
    if (error) { toast.error(error.message); return; }
    setSession({ ...session, status: "scheduled", ended_at: null });
    toast.success("Session restarted — click Go Live when ready");
  };

  const goLive = async () => {
    try {
      const { error } = await supabase.functions.invoke("livekit-go-live", { body: { session_id: session.id } });
      if (error) {
        // Edge function failed — just update status directly in DB
        await supabase.from("webinar_sessions").update({ status: "live" }).eq("id", session.id);
      }
    } catch {
      // Edge function not available — update DB directly
      await supabase.from("webinar_sessions").update({ status: "live" }).eq("id", session.id);
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
      const { error } = await supabase.functions.invoke(fn, { body: { session_id: session.id } });
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
      eventOverride: (event as { video_provider?: string | null } | null)?.video_provider ?? null,
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
      const { data, error } = await supabase.functions.invoke("livekit-token", { body: { session_id: session.id } });
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
      await supabase.functions.invoke("livekit-room-end", { body: { session_id: session.id } });
    } catch { /* edge fn unavailable */ }
    await supabase.from("webinar_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session.id);
    setToken(null);
    setSession({ ...session, status: "ended" });
    toast.success("Stream ended");
  };

  const leaveStage = useCallback(() => { setToken(null); toast.info("You left the stage"); }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch { /* ignore */ }
  }, []);

  const speakerLink = (token: string) => publicUrl(`/e/${routeId}/live?speaker=${token}`);

  const updateLayout = async (layout: string) => {
    if (!session) return;
    await supabase.from("webinar_sessions").update({ layout }).eq("id", session.id);
    setSession({ ...session, layout });
  };
  const updateLounge = async (enabled: boolean) => {
    if (!session) return;
    await supabase.from("webinar_sessions").update({ lounge_enabled: enabled }).eq("id", session.id);
    setSession({ ...session, lounge_enabled: enabled });
  };
  const sendAnnouncement = async () => {
    if (!announcement.trim() || !session) return;
    await supabase.from("webinar_announcements").insert({ session_id: session.id, message: announcement.trim() });
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

  if (!hasAddon("webinar")) {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-6">
      <div className="max-w-2xl">
        <Card className="p-8 text-center space-y-4">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">Webinar add-on required</h1>
          <p className="text-[13px] text-muted-foreground">
            The built-in webinar studio (10 speakers, unlimited viewers, Q&amp;A, polls, networking lounge, recording, branded overlays) is part of the Webinar add-on.
          </p>
          <Button asChild><Link to="/dashboard/billing">Enable Webinar add-on</Link></Button>
        </Card>
      </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-6">
      <div className="max-w-[1200px] space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Webinar</h1>
          <p className="text-[13px] text-muted-foreground">Set up a livestream room for this event.</p>
        </div>
        <Card className="p-6 space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Up to 10 on-stage speakers, unlimited viewers. You can start and stop recording at any time once the session is live.
          </p>
          <Button onClick={createSession}><Plus className="h-4 w-4 mr-2" />Create webinar</Button>
        </Card>
      </div>
      </div>
    );
  }

  if (showPrejoin && !token) {
    return (
      <Suspense fallback={<FullPageLoader label="Preparing studio…" />}>
        <PreJoinCheck
          asPublisher
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
    // Stable stage element — rendered in one container regardless of `minimized`
    // so LiveKit never unmounts on tab switch / minimize.
    const stageEl = (
      <Suspense fallback={<FullPageLoader label="Connecting to studio…" />}>
        <WebinarStage
          provider={getWebinarProvider({
            eventOverride: (event as { video_provider?: string | null } | null)?.video_provider ?? null,
          }).provider}
          token={token}
          wsUrl={wsUrl!}
          canPublish={canPublish}
          layout={session.layout}
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

    const sidebarEl = (
      <Suspense fallback={<div className="p-4 text-[12px] text-muted-foreground">Loading panel…</div>}>
        <WebinarSidebar sessionId={session.id} isHost canPublish={canPublish} userId={user.id} />
      </Suspense>
    );

    return (
      <div
        className={
          minimized
            ? "fixed bottom-4 right-4 w-[360px] h-[210px] rounded-lg overflow-hidden border border-border shadow-2xl bg-background z-50"
            : "fixed inset-0 z-50 flex flex-col bg-zinc-950 overflow-hidden"
        }
      >
        {!minimized && !focusMode && (
          <header className="h-14 flex items-center justify-between px-3 sm:px-4 gap-2 bg-zinc-950 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 text-white min-w-0">
              <Link to={`/dashboard/events/${routeId}`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-[12px]">
                <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Back</span>
              </Link>
              <span className={`text-[11px] font-bold tracking-wider px-2.5 py-1 rounded ${session.status === "live" ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-white/10 text-white/70"}`}>
                {session.status === "live" ? "● LIVE" : "NOT LIVE"}
              </span>
              <span className="text-[13px] font-semibold truncate hidden sm:inline">{event?.title || "Webinar"}</span>
            </div>
            <div className="flex items-center gap-2">
              {session.status !== "live" ? (
                <Button onClick={goLive} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-[12px] px-3">
                  <Radio className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Start Session</span>
                </Button>
              ) : (
                <>
                  <Button
                    onClick={toggleRecording}
                    disabled={recBusy}
                    variant={session.egress_id ? "destructive" : "secondary"}
                    className="h-9 text-[12px] px-3"
                    title={session.egress_id ? "Stop recording" : "Start recording"}
                  >
                    {session.egress_id
                      ? <StopCircle className="h-4 w-4 sm:mr-1.5" />
                      : <CircleDot className="h-4 w-4 sm:mr-1.5" />}
                    <span className="hidden sm:inline">{session.egress_id ? "Stop rec" : "Record"}</span>
                  </Button>
                  <Button onClick={endLive} variant="destructive" className="h-9 text-[12px] px-3">
                    <PhoneOff className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">End Session</span>
                  </Button>
                </>
              )}
              {/* Mobile-only chat trigger */}
              <Sheet open={chatOpen} onOpenChange={setChatOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="secondary" className="h-9 w-9 lg:hidden" aria-label="Open chat">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="p-0 w-[min(420px,100vw)]">
                  <div className="h-full">{sidebarEl}</div>
                </SheetContent>
              </Sheet>
              <Button size="icon" variant="secondary" className="h-9 w-9" onClick={() => setFocusMode((v) => !v)} title={focusMode ? "Exit focus" : "Focus stage"}>
                {focusMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="secondary" className="h-9 w-9 hidden sm:inline-flex" onClick={() => setMinimized(true)} title="Minimize">
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="secondary" className="h-9 text-[12px] px-3" onClick={leaveStage}>
                <LogOut className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Leave</span>
              </Button>
            </div>
          </header>
        )}

        {/* Floating exit pill while in focus mode */}
        {!minimized && focusMode && (
          <button
            onClick={() => setFocusMode(false)}
            className="fixed top-3 right-3 z-50 bg-black/60 backdrop-blur text-white text-[11px] px-2.5 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-black/80"
          >
            <Minimize className="h-3 w-3" />Exit focus
          </button>
        )}

        <div className={minimized ? "h-full w-full relative" : "flex-1 flex min-h-0"}>
          <div className={minimized ? "h-full w-full relative" : "flex-1 relative min-w-0 bg-black"}>
            {stageEl}
            {!minimized && (
              <>
                <ReactionFloats sessionId={session.id} />
                <AnnouncementBanner sessionId={session.id} />
              </>
            )}
            {minimized && (
              <div className="absolute top-1 right-1 z-30 flex gap-1">
                <Button size="icon" variant="secondary" className="h-6 w-6" onClick={() => setMinimized(false)}><Maximize2 className="h-3 w-3" /></Button>
                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={leaveStage}><X className="h-3 w-3" /></Button>
              </div>
            )}
            {minimized && (
              <span className="absolute top-1 left-1 z-30 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded animate-pulse">● LIVE</span>
            )}
          </div>
          {!minimized && !focusMode && (
            <div className="hidden lg:block w-80 bg-zinc-950 border-l border-white/5 shrink-0">
              {sidebarEl}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
    <div className="max-w-[1200px] space-y-5">
      <div className="space-y-3">
        <Link
          to={`/dashboard/events/${routeId}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to event
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">Webinar studio</h1>
              <StatusPill status={session.status} />
              {session.egress_id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-destructive">
                  <CircleDot className="h-3 w-3 animate-pulse" /> REC
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">
              {event?.title ? <>Stream, speakers and analytics for <span className="text-foreground">{event.title}</span>.</> : "Manage stream, speakers, and analytics."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.status === "scheduled" && (
              <Button onClick={goLive} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Radio className="h-4 w-4 mr-2" />Go live
              </Button>
            )}
            {session.status === "live" && (
              <>
                <Button
                  onClick={toggleRecording}
                  disabled={recBusy}
                  variant={session.egress_id ? "destructive" : "outline"}
                >
                  {session.egress_id ? <StopCircle className="h-4 w-4 mr-2" /> : <CircleDot className="h-4 w-4 mr-2" />}
                  {session.egress_id ? "Stop recording" : "Record"}
                </Button>
                <Button onClick={() => setShowPrejoin(true)} variant="secondary">
                  <Radio className="h-4 w-4 mr-2" />Re-join as host
                </Button>
                <Button variant="destructive" onClick={endLive}>
                  <Square className="h-4 w-4 mr-2" />End
                </Button>
              </>
            )}
            {session.status === "ended" && (
              <>
                <Button onClick={restartSession} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Radio className="h-4 w-4 mr-2" />Restart session
                </Button>
                <Button onClick={createSession} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />New session
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border">
          {[
            {
              label: "Speakers",
              value: (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-mono font-semibold tabular-nums leading-none">{speakers.length}</span>
                  <span className="text-[12px] text-muted-foreground leading-none">/ 10</span>
                </span>
              ),
            },
            {
              label: "Room",
              value: (
                <span className="font-mono text-[12px] text-muted-foreground truncate block leading-none" title={session.livekit_room}>
                  {session.livekit_room}
                </span>
              ),
            },
          ].map((cell) => (
            <div key={cell.label} className="px-5 py-4 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 mb-2">{cell.label}</div>
              <div className="min-w-0">{cell.value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-muted/30 px-5 py-2.5 flex items-center justify-between gap-3">
          <div className="text-[12px] text-muted-foreground flex items-center gap-2 min-w-0">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono truncate">{publicUrl(`/e/${routeId}/live`)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => { navigator.clipboard.writeText(publicUrl(`/e/${routeId}/live`)); toast.success("Attendee link copied"); }}
            >
              <Copy className="h-3 w-3 mr-1" />Copy
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
              <a href={publicUrl(`/e/${routeId}/live`)} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />Open
              </a>
            </Button>
          </div>
        </div>
        {session.recording_url && (
          <div className="border-t border-border bg-emerald-500/5 px-4 py-2.5 text-[12px] flex items-center justify-between">
            <span className="text-muted-foreground">Recording ready</span>
            <a className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1" href={session.recording_url} target="_blank" rel="noreferrer">
              View recording <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </Card>

      <Tabs defaultValue="setup" className="space-y-4">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <Card className="p-4 space-y-3">
            <h2 className="font-medium">Studio settings</h2>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-[13px] font-medium">Networking lounge</p>
                <p className="text-[12px] text-muted-foreground">Small-group video tables for attendees.</p>
              </div>
              <Switch checked={!!session.lounge_enabled} onCheckedChange={updateLounge} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-[13px] font-medium">Branding overlays</p>
                <p className="text-[12px] text-muted-foreground">
                  Show logo, lower-thirds and banners on stage. Org default: <span className="font-mono">{orgBrandingDefault ? "on" : "off"}</span>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={effectiveBranding}
                  onCheckedChange={(v) => setEventBranding(v)}
                />
                {event?.webinar_branding_enabled !== null && event?.webinar_branding_enabled !== undefined && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEventBranding(null)}>Use org default</Button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Announce something to all attendees…" value={announcement} onChange={(e) => setAnnouncement(e.target.value)} />
              <Button variant="outline" onClick={sendAnnouncement}><Megaphone className="h-4 w-4 mr-1" />Send</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Suspense fallback={<FullPageLoader label="Loading analytics…" />}>
            <AnalyticsPanel sessionId={session.id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot?: boolean }> = {
    live: { label: "Live", cls: "bg-destructive/10 text-destructive border-destructive/20", dot: true },
    scheduled: { label: "Ready", cls: "bg-muted text-muted-foreground border-border" },
    ended: { label: "Ended", cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${s.cls}`}>
      {s.dot && <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />}
      {s.label}
    </span>
  );
}

function ReactionFloats({ sessionId }: { sessionId: string }) {
  const [floats, setFloats] = useState<{ id: string; emoji: string; left: number }[]>([]);
  useEffect(() => {
    const ch = supabase.channel(`reactions-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_reactions", filter: `session_id=eq.${sessionId}` },
        (p: any) => {
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
        (p: any) => {
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
