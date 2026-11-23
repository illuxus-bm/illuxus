import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/data/db";
import { supabaseRpc } from "@/lib/observability";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useSessionBranding } from "@/components/webinar/StageOverlays";
import { WaitingLobby } from "@/components/webinar/WaitingLobby";
import { uuid } from "@/lib/uuid";
import { getWebinarProvider, type WebinarProvider } from "@/lib/webinar/provider";
import { toast } from "sonner";
import { loginPath } from "@/lib/safe-redirect";
import { toStageLayout } from "@/lib/webinar/stage-layout";
import { eventThemeColor, resolveRoomAccent, roomThemeStyle } from "@/components/webinar/roomTheme";
import { LiveRoomShell } from "@/components/webinar/LiveRoomShell";

const WebinarStage = lazy(() =>
  import("@/components/webinar/WebinarStage").then((m) => ({ default: m.WebinarStage })),
);
const HlsStage = lazy(() =>
  import("@/components/webinar/HlsStage").then((m) => ({ default: m.HlsStage })),
);
const PreJoinCheck = lazy(() =>
  import("@/components/webinar/PreJoinCheck").then((m) => ({ default: m.PreJoinCheck })),
);

/** How often an HLS viewer reports that they're still watching. */
const HLS_HEARTBEAT_MS = 120_000;

/** What webinar_link_access returns for a valid join or speaker link (migration 088). */
interface WebinarLinkAccess {
  session: Tables<"webinar_sessions"> | null;
  visitor_name: string | null;
  visitor_role: "speaker" | "attendee";
}

export default function EventLivePage() {
  const { id: eventId } = useParams();
  const { user, loading } = useAuth();
  const [search] = useSearchParams();
  const speakerToken = search.get("speaker");
  const joinToken = search.get("join");
  const [session, setSession] = useState<Tables<"webinar_sessions"> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  // Set once a viewer has joined over HLS: they watch the composed stream
  // from the CDN and only get a room token when brought on stage.
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [showPrejoin, setShowPrejoin] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  // Persist a stable browser session id per join token / user so tab switches,
  // screen-share popups, and remounts don't re-claim the link and self-kick.
  const [browserSessionId] = useState(() => {
    const key = `lk-bsid-${joinToken || speakerToken || user?.id || "anon"}`;
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const fresh = uuid();
      localStorage.setItem(key, fresh);
      return fresh;
    } catch {
      return uuid();
    }
  });
  const [kicked, setKicked] = useState(false);
  const [brandingEnabled, setBrandingEnabled] = useState(true);
  const [visitorName, setVisitorName] = useState<string | null>(null);
  const [visitorRole, setVisitorRole] = useState<"speaker" | "attendee" | "guest" | "host">("guest");
  // Set true when the logged-in user is found in event_speakers for this event.
  // Lets us grant publish permission on the Agora path even though they
  // arrived without a `?speaker=<token>` URL.
  const [isEventSpeaker, setIsEventSpeaker] = useState(false);
  const [linkVisitor, setLinkVisitor] = useState<{ name: string | null; role: "speaker" | "attendee" } | null>(null);
  const [eventMeta, setEventMeta] = useState<{
    title: string | null;
    banner: string | null;
    videoProvider: string | null;
    color: string | null;
  }>({ title: null, banner: null, videoProvider: null, color: null });
  const [org, setOrg] = useState<{ name: string | null; logo: string | null }>({ name: null, logo: null });
  const branding = useSessionBranding(session?.id);

  // Stable, low-entropy device fingerprint used as a server-side fallback when
  // localStorage is cleared. Not for tracking — only matched within a single
  // registration_id to avoid self-kick.
  const fingerprint = useMemo(() => {
    try {
      const s = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
      return `fp_${(h >>> 0).toString(36)}`;
    } catch { return "fp_unknown"; }
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const hasLink = !!(joinToken || speakerToken);
    const load = async () => {
      const { data } = await db.from("webinar_sessions").select("*").eq("event_id", eventId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data || !hasLink) { setSession(data); return; }
      // Guests and invited speakers who aren't signed in can't read the table;
      // their link is checked server-side instead (webinar_link_access, 088).
      const { data: access } = await supabaseRpc<WebinarLinkAccess | null>("webinar_link_access", {
        _event_id: eventId, _join_token: joinToken, _speaker_token: speakerToken,
      });
      setSession(access?.session ?? null);
      if (access?.visitor_role) {
        setLinkVisitor({ name: access.visitor_name, role: access.visitor_role });
      }
    };
    void load();
    const ch = supabase.channel(`session-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_sessions" }, () => { void load(); })
      .subscribe();
    // Live updates only reach visitors who can read the table, so link
    // visitors re-check now and then to see the session go live.
    const poll = hasLink && !user ? window.setInterval(() => { void load(); }, 20_000) : undefined;
    return () => { supabase.removeChannel(ch); if (poll) window.clearInterval(poll); };
  }, [eventId, joinToken, speakerToken, user]);

  // Fetch event title + landscape banner for the empty-stage placeholder.
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data: raw } = await db
        .from("events")
        .select("title, banner_landscape_url, video_provider, org_id, page_config")
        .eq("id", eventId)
        .maybeSingle();
      // Generated types predate `video_provider`, so type the row by hand.
      const data = raw as unknown as {
        title: string | null; banner_landscape_url: string | null;
        video_provider?: string | null; org_id: string | null; page_config: unknown;
      } | null;
      if (!data) return;
      setEventMeta({
        title: data.title ?? null,
        banner: data.banner_landscape_url ?? null,
        videoProvider: data.video_provider ?? null,
        color: eventThemeColor(data.page_config),
      });
      if (data.org_id) {
        const { data: brief } = await supabaseRpc("get_public_org_brief", { _oid: data.org_id });
        const row = Array.isArray(brief) ? brief[0] : brief;
        if (row) setOrg({ name: row.name ?? null, logo: row.logo_url ?? null });
      }
    })();
  }, [eventId]);

  // Resolve visitor name + role for the lobby welcome.
  useEffect(() => {
    (async () => {
      // A link visitor who isn't signed in was identified by webinar_link_access.
      if (!user && linkVisitor) {
        setVisitorName(linkVisitor.name);
        setVisitorRole(linkVisitor.role);
        if (linkVisitor.role === "speaker") setIsEventSpeaker(true);
        return;
      }
      if (speakerToken && session?.id) {
        const { data: sp } = await db
          .from("webinar_speakers")
          .select("display_name, email")
          .eq("session_id", session.id)
          .eq("invite_token", speakerToken)
          .maybeSingle();
        if (sp) {
          setVisitorName(sp.display_name || sp.email || null);
          setVisitorRole("speaker");
          setIsEventSpeaker(true);
          return;
        }
      }
      if (joinToken) {
        const { data: reg } = await db
          .from("registrations").select("name, email")
          .eq("join_token", joinToken).maybeSingle();
        if (reg) {
          setVisitorName(reg.name || reg.email || null);
          setVisitorRole("attendee");
          return;
        }
      }
      if (user) {
        const { data: prof } = await db
          .from("profiles")
          .select("display_name, first_name, last_name, username")
          .eq("user_id", user.id).maybeSingle();
        const full = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
        const resolvedName = full || prof?.display_name || prof?.username || user.email || null;
        setVisitorName(resolvedName);

        // Is this signed-in user a speaker for THIS event?
        // Match by speakers.user_id (preferred) or by email fallback so we
        // catch speakers added before the user_id linking trigger ran.
        const userEmailLower = (user.email || "").toLowerCase();
        const { data: speakerRows } = await db
          .from("speakers")
          .select("id, user_id, email, event_speakers!inner(event_id)")
          .or(`user_id.eq.${user.id}${userEmailLower ? `,email.eq.${userEmailLower}` : ""}`);
        const matchedAsSpeaker = ((speakerRows ?? []) as Array<{ event_speakers?: Array<{ event_id: string }> }>)
          .some((row) => (row.event_speakers ?? []).some((es) => es.event_id === eventId));

        if (matchedAsSpeaker) {
          setVisitorRole("speaker");
          setIsEventSpeaker(true);
        } else {
          setVisitorRole("attendee");
          setIsEventSpeaker(false);
        }
      }
    })();
  }, [user, joinToken, speakerToken, session?.id, eventId, linkVisitor]);

  const roomAccent = useMemo(
    () => resolveRoomAccent({ eventColor: eventMeta.color, branding, brandingEnabled }),
    [eventMeta.color, branding, brandingEnabled],
  );
  const roomStyle = useMemo(() => roomThemeStyle(roomAccent), [roomAccent]);

  const requestToken = async (opts: { quiet?: boolean } = {}) => {
    if (opts.quiet) {
      // Heartbeat: never surface an error or touch the join state.
      const { data } = await db.functions.invoke("livekit-token", {
        body: { session_id: session!.id, speaker_token: speakerToken || undefined, join_token: joinToken || undefined, browser_session_id: browserSessionId, fingerprint },
      }).catch(() => ({ data: null }));
      return data ?? null;
    }
    setError(null);
    const { data, error } = await db.functions.invoke("livekit-token", {
      body: { session_id: session.id, speaker_token: speakerToken || undefined, join_token: joinToken || undefined, browser_session_id: browserSessionId, fingerprint },
    });
    if (error || !(data?.token || data?.mode === "hls")) { setError(error?.message || data?.error || "Failed"); return null; }
    if (data.registration_id) setRegistrationId(data.registration_id);
    return data;
  };

  // Resolve effective branding flag for this event (event override > org default).
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await supabaseRpc("event_branding_enabled", { _eid: eventId });
      if (typeof data === "boolean") setBrandingEnabled(data);
    })();
  }, [eventId]);

  // Claim join link (single-active-session enforcement). Works for guests too —
  // the edge function will bind the active session when issuing the token.
  useEffect(() => {
    if (!joinToken || !user) return;
    (async () => {
      const { data, error } = await supabaseRpc("claim_join_session", {
        _jt: joinToken, _sid: browserSessionId,
      });
      if (error) { return; }
      const row = (data as Array<{ registration_id: string }>)?.[0];
      if (row) setRegistrationId(row.registration_id);
    })();
  }, [joinToken, user, browserSessionId]);

  // Watch for another tab claiming the same link → boot this one
  useEffect(() => {
    if (!registrationId) return;
    const ch = supabase.channel(`reg-${registrationId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "registrations", filter: `id=eq.${registrationId}` },
        (p: { new: Tables<"registrations"> }) => {
          const newId = p.new?.active_session_id;
          // Ignore null/empty and our own id (defensive against echoes / remounts).
          if (!newId) return;
          if (newId === browserSessionId) return;
          setKicked(true); setToken(null);
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [registrationId, browserSessionId]);

  // Brought on stage from the HLS stream: the accepted request lets
  // livekit-token issue a publishing token, then the usual device check.
  const joinStage = async () => {
    const data = await requestToken();
    if (!data?.token || !data.can_publish) return;
    setWsUrl(data.ws_url);
    setCanPublish(true);
    sessionStorage.setItem(`lk-token-${session!.id}`, data.token);
    setShowPrejoin(true);
  };
  // The realtime listener below outlives renders; give it the current values.
  const joinStageRef = useRef(joinStage);
  joinStageRef.current = joinStage;
  const hlsViewerRef = useRef(false);
  hlsViewerRef.current = !!playbackUrl;

  // Attendance heartbeat for HLS viewers, who never appear in the room:
  // each livekit-token request moves their watch time forward.
  const watchingHls = !!playbackUrl && !token && session?.status === "live";
  const requestTokenRef = useRef(requestToken);
  requestTokenRef.current = requestToken;
  useEffect(() => {
    if (!watchingHls) return;
    const beat = () => { void requestTokenRef.current({ quiet: true }); };
    beat();
    const timer = window.setInterval(beat, HLS_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [watchingHls]);

  // Listen for stage request promotions (raise hand approval)
  useEffect(() => {
    if (!session?.id) return;
    const clientUserId = user?.id ?? `guest-${registrationId ?? "anon"}`;
    const ch = supabase.channel(`my-stage-request-${session.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "webinar_stage_requests"
      }, (p) => {
        const next = p.new as { session_id?: string; user_id?: string; status?: string } | null;
        if (next && next.session_id === session.id && next.user_id === clientUserId) {
          if (next.status === "accepted") {
            toast.success("You have been promoted to the stage!");
            if (hlsViewerRef.current) void joinStageRef.current();
            else setCanPublish(true);
          } else if (next.status === "cancelled" || next.status === "demoted") {
            setCanPublish(false);
            // An HLS viewer leaves the room and goes back to the stream.
            if (hlsViewerRef.current) { setShowPrejoin(false); setToken(null); }
            toast.success("You have been moved back to the audience.");
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.id, user?.id, registrationId]);

  const handleJoinClick = async () => {
    if (!session) {
      // Speakers may land here while the webinar_sessions SELECT is still
      // pending (or RLS-blocked if migration 016 isn't applied). Surface a
      // clear error rather than silently no-op.
      setError("Webinar room is not ready yet. Refresh in a moment, or ask the host to create / start the session.");
      return;
    }
    const provider: WebinarProvider = getWebinarProvider({
      eventOverride: eventMeta.videoProvider,
    }).provider;
    if (provider === "agora") {
      // Agora path: AgoraWebinarStage fetches its own RTC token from the
      // agora-token edge function. We just need to flip the stage on with
      // a placeholder ws/token so the existing render gating opens.
      // Publish-capable when (a) we arrived via a speaker invite link, or
      // (b) the signed-in user is a registered speaker for this event.
      const canPub = !!speakerToken || isEventSpeaker;
      setWsUrl("agora");
      setCanPublish(canPub);
      setToken("agora");
      return;
    }
    // Pre-fetch token to know if we can publish, then show prejoin
    const data = await requestToken();
    if (!data) return;
    if (data.mode === "hls") {
      setCanPublish(false);
      setPlaybackUrl(data.playback_url);
      return;
    }
    setWsUrl(data.ws_url); setCanPublish(data.can_publish);
    if (data.can_publish) {
      // Show prejoin check, but keep token until user confirms
      sessionStorage.setItem(`lk-token-${session.id}`, data.token);
      setShowPrejoin(true);
    } else {
      setToken(data.token);
    }
  };

  const confirmJoin = () => {
    const t = sessionStorage.getItem(`lk-token-${session.id}`);
    if (t) setToken(t);
    setShowPrejoin(false);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  // Guests with a unique join link or speaker invite link can enter without signing in.
  if (!user && !joinToken && !speakerToken) return (
    <div className="p-8 max-w-md mx-auto text-center space-y-3">
      <p>Please sign in to join the live stream.</p>
      <Button asChild><Link to={loginPath(`${window.location.pathname}${window.location.search}`)}>Sign in</Link></Button>
    </div>
  );

  if (!session) {
    return (
      <WaitingLobby
        eventId={eventId!}
        visitorName={visitorName}
        role={visitorRole}
        sessionStatus={null}
        onJoin={handleJoinClick}
        accent={roomAccent}
      />
    );
  }

  if (kicked) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <h1 className="text-lg font-semibold">Signed out</h1>
        <p className="text-[13px] text-muted-foreground">This join link was opened on another device. Only one active session is allowed.</p>
      </div>
    );
  }

  if (session.status === "ended") {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">Webinar ended</h1>
        {session.recording_url ? (
          <video controls className="w-full rounded-lg" src={session.recording_url} />
        ) : (
          <p className="text-muted-foreground">Recording will appear here once processed.</p>
        )}
      </div>
    );
  }

  if (showPrejoin && !token) {
    return (
      <Suspense fallback={<FullPageLoader label="Preparing your setup…" />}>
        <PreJoinCheck asPublisher={canPublish} onCancel={() => setShowPrejoin(false)} onJoin={confirmJoin} accent={roomAccent} />
      </Suspense>
    );
  }

  if (token || playbackUrl) {
    // Keep-alive: the WebinarStage element is rendered in ONE stable container
    // regardless of `minimized`. We only swap CSS positioning so the underlying
    // <LiveKitRoom>, media tracks, and React tree never unmount — switching
    // tabs, minimizing, or transient reconnects will not remount the stage.
    const stageEl = !token ? (
      <Suspense fallback={<FullPageLoader label="Connecting…" />}>
        <HlsStage
          src={playbackUrl!}
          isLive={session.status === "live"}
          eventBannerUrl={eventMeta.banner}
          eventTitle={eventMeta.title}
        />
      </Suspense>
    ) : (
      <Suspense fallback={<FullPageLoader label="Connecting…" />}>
        <WebinarStage
          provider={getWebinarProvider({
            eventOverride: eventMeta.videoProvider,
          }).provider}
          token={token}
          wsUrl={wsUrl!}
          canPublish={canPublish}
          layout={toStageLayout(session.layout)}
          branding={branding}
          brandingEnabled={brandingEnabled}
          sessionId={session.id}
          userId={user?.id ?? `guest-${registrationId ?? "anon"}`}
          isHost={false}
          eventBannerUrl={eventMeta.banner}
          eventTitle={eventMeta.title}
          onDisconnect={() => setToken(null)}
        />
      </Suspense>
    );
    return (
      <LiveRoomShell
        style={roomStyle}
        sessionId={session.id}
        userId={user?.id ?? `guest-${registrationId ?? "anon"}`}
        isHost={false}
        canPublish={canPublish}
        isLive={session.status === "live"}
        title={eventMeta.title ?? "Live session"}
        org={org}
        breadcrumbs={[
          { label: "Events", href: "/events" },
          ...(org.name ? [{ label: org.name }] : []),
          { label: eventMeta.title ?? "Live session" },
        ]}
        backHref={`/events/${eventId}`}
        backLabel="Back"
        logoOnStage={brandingEnabled && !!branding?.logo_url}
        stage={stageEl}
        stageOverlays={<><LiveReactions sessionId={session.id} /><LiveAnnouncement sessionId={session.id} /></>}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onLeave={() => { setToken(null); setPlaybackUrl(null); }}
      />
    );
  }

  return (
    <WaitingLobby
      eventId={eventId!}
      visitorName={visitorName}
      role={visitorRole}
      sessionStatus={session.status}
      onJoin={handleJoinClick}
      error={error}
      accent={roomAccent}
    />
  );
}

function LiveReactions({ sessionId }: { sessionId: string }) {
  const [floats, setFloats] = useState<{ id: string; emoji: string; left: number }[]>([]);
  useEffect(() => {
    const ch = supabase.channel(`reactions-live-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_reactions", filter: `session_id=eq.${sessionId}` },
        (p: { new: Tables<"webinar_reactions"> }) => {
          const id = p.new.id; const emoji = p.new.emoji;
          const left = 10 + Math.random() * 80;
          setFloats((f) => [...f, { id, emoji, left }]);
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 3000);
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {floats.map((f) => (
        <div key={f.id} className="absolute bottom-20 text-2xl sm:text-3xl lg:text-4xl animate-float" style={{ left: `${f.left}%` }}>{f.emoji}</div>
      ))}
    </div>
  );
}

function LiveAnnouncement({ sessionId }: { sessionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const ch = supabase.channel(`announce-live-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_announcements", filter: `session_id=eq.${sessionId}` },
        (p: { new: Tables<"webinar_announcements"> }) => { setMsg(p.new.message); setTimeout(() => setMsg(null), 6000); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);
  if (!msg) return null;
  return <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md text-sm shadow-lg z-20">📣 {msg}</div>;
}
