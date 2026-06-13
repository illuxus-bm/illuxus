import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Minimize2, Maximize2, X, LogOut } from "lucide-react";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useSessionBranding } from "@/components/webinar/StageOverlays";
import { WaitingLobby } from "@/components/webinar/WaitingLobby";
import { uuid } from "@/lib/uuid";

const WebinarStage = lazy(() =>
  import("@/components/webinar/WebinarStage").then((m) => ({ default: m.WebinarStage })),
);
const WebinarSidebar = lazy(() =>
  import("@/components/webinar/WebinarSidebar").then((m) => ({ default: m.WebinarSidebar })),
);
const PreJoinCheck = lazy(() =>
  import("@/components/webinar/PreJoinCheck").then((m) => ({ default: m.PreJoinCheck })),
);

export default function EventLivePage() {
  const { id: eventId } = useParams();
  const { user, loading } = useAuth();
  const [search] = useSearchParams();
  const speakerToken = search.get("speaker");
  const joinToken = search.get("join");
  const [session, setSession] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
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
  const [eventMeta, setEventMeta] = useState<{ title: string | null; banner: string | null }>({ title: null, banner: null });
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
    const load = () => supabase.from("webinar_sessions").select("*").eq("event_id", eventId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setSession(data));
    load();
    const ch = supabase.channel(`session-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId]);

  // Fetch event title + landscape banner for the empty-stage placeholder.
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("title, banner_landscape_url")
        .eq("id", eventId)
        .maybeSingle();
      if (data) setEventMeta({ title: data.title ?? null, banner: data.banner_landscape_url ?? null });
    })();
  }, [eventId]);

  // Resolve visitor name + role for the lobby welcome.
  useEffect(() => {
    (async () => {
      if (speakerToken && session?.id) {
        const { data: sp } = await supabase
          .from("webinar_speakers")
          .select("display_name, email")
          .eq("session_id", session.id)
          .eq("invite_token", speakerToken)
          .maybeSingle();
        if (sp) {
          setVisitorName(sp.display_name || sp.email || null);
          setVisitorRole("speaker");
          return;
        }
      }
      if (joinToken) {
        const { data: reg } = await supabase
          .from("registrations").select("name, email")
          .eq("join_token", joinToken).maybeSingle();
        if (reg) {
          setVisitorName(reg.name || reg.email || null);
          setVisitorRole("attendee");
          return;
        }
      }
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, first_name, last_name, username")
          .eq("user_id", user.id).maybeSingle();
        const full = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
        setVisitorName(full || prof?.display_name || prof?.username || user.email || null);
        setVisitorRole("attendee");
      }
    })();
  }, [user, joinToken, speakerToken, session?.id]);

  const requestToken = async () => {
    setError(null);
    const { data, error } = await supabase.functions.invoke("livekit-token", {
      body: { session_id: session.id, speaker_token: speakerToken || undefined, join_token: joinToken || undefined, browser_session_id: browserSessionId, fingerprint },
    });
    if (error || !data?.token) { setError(error?.message || data?.error || "Failed"); return null; }
    if (data.registration_id) setRegistrationId(data.registration_id);
    return data;
  };

  // Resolve effective branding flag for this event (event override > org default).
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await supabaseRpc("event_branding_enabled", { _event_id: eventId });
      if (typeof data === "boolean") setBrandingEnabled(data);
    })();
  }, [eventId]);

  // Claim join link (single-active-session enforcement). Works for guests too —
  // the edge function will bind the active session when issuing the token.
  useEffect(() => {
    if (!joinToken || !user) return;
    (async () => {
      const { data, error } = await supabaseRpc("claim_join_session", {
        _join_token: joinToken, _session_id: browserSessionId,
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
        (p: any) => {
          const newId = p.new?.active_session_id;
          // Ignore null/empty and our own id (defensive against echoes / remounts).
          if (!newId) return;
          if (newId === browserSessionId) return;
          setKicked(true); setToken(null);
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [registrationId, browserSessionId]);

  const handleJoinClick = async () => {
    // Pre-fetch token to know if we can publish, then show prejoin
    const data = await requestToken();
    if (!data) return;
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
      <Button asChild><Link to={`/login?redirect=/e/${eventId}/live`}>Sign in</Link></Button>
    </div>
  );

  if (!session) {
    return (
      <WaitingLobby
        eventId={eventId!}
        visitorName={visitorName}
        role={visitorRole}
        sessionStatus={null}
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
        <PreJoinCheck asPublisher={canPublish} onCancel={() => setShowPrejoin(false)} onJoin={confirmJoin} />
      </Suspense>
    );
  }

  if (token) {
    // Keep-alive: the WebinarStage element is rendered in ONE stable container
    // regardless of `minimized`. We only swap CSS positioning so the underlying
    // <LiveKitRoom>, media tracks, and React tree never unmount — switching
    // tabs, minimizing, or transient reconnects will not remount the stage.
    const stageEl = (
      <Suspense fallback={<FullPageLoader label="Connecting…" />}>
        <WebinarStage
          token={token}
          wsUrl={wsUrl!}
          canPublish={canPublish}
          layout={session.layout}
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
      <>
        {/* Minimized "shell" — only rendered when minimized, kept separate from stage */}
        {minimized && (
          <div className="p-6 max-w-2xl mx-auto space-y-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/e/${eventId}`}><ArrowLeft className="h-4 w-4 mr-1" />Back to event</Link>
            </Button>
            <Card className="p-4">
              <p className="text-[13px] text-muted-foreground">Webinar minimized — still connected.</p>
              <Button size="sm" className="mt-2" onClick={() => setMinimized(false)}>
                <Maximize2 className="h-3 w-3 mr-1" />Return to webinar
              </Button>
            </Card>
          </div>
        )}

        {/* Stable stage container — same React node for full + minimized.
            We swap class names instead of remounting. */}
        <div
          className={
            minimized
              ? "fixed bottom-4 right-4 w-[340px] h-[200px] rounded-lg overflow-hidden border border-border shadow-2xl bg-background z-50"
              : "fixed inset-0 flex bg-background z-40"
          }
        >
          <div className="flex-1 relative min-w-0">
            {stageEl}
            {!minimized && (
              <>
                <LiveReactions sessionId={session.id} />
                <LiveAnnouncement sessionId={session.id} />
                <div className="absolute top-3 left-3 flex gap-2 z-20">
                  <Button size="sm" variant="secondary" asChild>
                    <Link to={`/e/${eventId}`}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
                  </Button>
                  <span className="bg-destructive text-destructive-foreground text-[11px] px-2 py-1 rounded-md animate-pulse font-medium">● LIVE</span>
                </div>
                <div className="absolute top-3 right-3 flex gap-2 z-20">
                  <Button size="sm" variant="secondary" onClick={() => setMinimized(true)}><Minimize2 className="h-4 w-4 mr-1.5" />Minimize</Button>
                  <Button size="sm" variant="secondary" onClick={() => setToken(null)}><LogOut className="h-4 w-4 mr-1.5" />Leave</Button>
                </div>
              </>
            )}
            {minimized && (
              <div className="absolute top-1 right-1 z-30 flex gap-1">
                <Button size="icon" variant="secondary" className="h-6 w-6" onClick={() => setMinimized(false)}><Maximize2 className="h-3 w-3" /></Button>
                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => setToken(null)}><X className="h-3 w-3" /></Button>
              </div>
            )}
          </div>
          {!minimized && (
            <div className="w-80 bg-background border-l border-border">
              <Suspense fallback={<div className="p-4 text-[12px] text-muted-foreground">Loading chat…</div>}>
                <WebinarSidebar sessionId={session.id} isHost={false} canPublish={canPublish} userId={user?.id ?? `guest-${registrationId ?? "anon"}`} />
              </Suspense>
            </div>
          )}
        </div>
      </>
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
    />
  );
}

function LiveReactions({ sessionId }: { sessionId: string }) {
  const [floats, setFloats] = useState<{ id: string; emoji: string; left: number }[]>([]);
  useEffect(() => {
    const ch = supabase.channel(`reactions-live-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_reactions", filter: `session_id=eq.${sessionId}` },
        (p: any) => {
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
        (p: any) => { setMsg(p.new.message); setTimeout(() => setMsg(null), 6000); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);
  if (!msg) return null;
  return <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md text-sm shadow-lg z-20">📣 {msg}</div>;
}
