/**
 * Agora-backed webinar stage. Minimal v1 cut-over from LiveKit:
 *
 *   - Joins the channel once useAgoraSessionToken delivers a fresh token.
 *   - Hosts publish mic + camera; audience subscribes only.
 *   - Renders local + remote video tiles in a responsive grid.
 *   - Mic / camera toggle + Leave button.
 *
 * Out of scope for this commit (deferred follow-ups):
 *   - Screen-share
 *   - RTM chat / data channel
 *   - Cloud recording
 *   - Focus / side-by-side / PIP layouts
 *   - Server-side webhook integration for live status / participant events
 *
 * The component is rendered through the existing <WebinarStage> entry point
 * when getWebinarProvider() resolves to 'agora', so callers don't need to
 * branch — they just pass `provider="agora"`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import {
  useAgoraClient,
  type AgoraRole,
} from "@/lib/webinar/useAgoraClient";
import {
  useAgoraSessionToken,
  type AgoraSessionRole,
  readAgoraAppId,
} from "@/lib/webinar/useAgoraSessionToken";
import { Mic, MicOff, Video, VideoOff, LogOut, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import { setSessionParticipants } from "./participantStore";

interface Props {
  sessionId: string;
  userId: string;
  isHost: boolean;
  canPublish: boolean;
  onDisconnect?: () => void;
  eventBannerUrl?: string | null;
  eventTitle?: string | null;
}

export function AgoraWebinarStage({
  sessionId,
  userId,
  isHost,
  canPublish,
  onDisconnect,
  eventBannerUrl,
  eventTitle,
}: Props) {
  const role: AgoraSessionRole = canPublish ? "publisher" : "subscriber";
  const agoraRole: AgoraRole = canPublish ? "host" : "audience";

  const tokenState = useAgoraSessionToken({
    sessionId,
    uid: userId,
    role,
  });

  const appId = readAgoraAppId();

  const client = useAgoraClient({
    appId,
    channel: tokenState.data?.channel ?? "",
    uid: tokenState.data?.uid ?? "",
    token: tokenState.data?.token ?? "",
    role: agoraRole,
    audienceLatencyLevel: "ultra-low",
    enabled: !!tokenState.data && !!appId,
    onTokenWillExpire: async () => {
      // Force a fresh fetch and return the new token. useAgoraSessionToken
      // already caches the most recent value in `tokenState.data`, but
      // we explicitly call refresh() so the new token round-trips through
      // the edge function and we never feed the SDK a stale token.
      await tokenState.refresh();
      // After refresh resolves, tokenState.data has been updated. Read
      // it from the closure-stable ref.
      return tokenStateRef.current?.token ?? tokenState.data?.token ?? "";
    },
  });

  // Keep the latest tokenState.data accessible to the onTokenWillExpire
  // closure without putting tokenState in useAgoraClient's identity tuple.
  const tokenStateRef = useRef(tokenState);
  useEffect(() => {
    tokenStateRef.current = tokenState;
  }, [tokenState]);

  // ── Track cleanup on unmount / session-end ───────────────────────────────
  // React's effect cleanup is the primary path; this useEffect adds a
  // synchronous safety net so the camera/mic hardware indicator turns off
  // immediately when the component is removed, even if the async effect
  // cleanup races with the unmount.
  useEffect(() => {
    return () => {
      // `client.leave()` calls `unpublish()` internally (which closes the
      // tracks). Calling it here in the component-level cleanup ensures
      // we don't wait for useAgoraClient's own cleanup effect, which runs
      // in a separate React batch after the render commit.
      client.leave().catch(() => { /* already disconnected — safe to ignore */ });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps: run only on unmount

  // Auto-publish for hosts the moment we're connected.
  const publishStartedRef = useRef(false);
  useEffect(() => {
    if (!canPublish) return;
    if (client.connectionState !== "CONNECTED") return;
    if (publishStartedRef.current) return;
    publishStartedRef.current = true;
    client.publish().catch((err) => {
      logger.warn("agora auto-publish failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
  }, [canPublish, client]);

  // Refresh the live RTC token whenever the token state has a fresh value.
  // useAgoraClient handles the in-place renewToken via opts.token in its
  // effect deps so we don't need extra glue here.

  // ── Participant store sync ────────────────────────────────────────────────
  // Mirrors local + remote Agora users into the shared participantStore so
  // the WebinarSidebar People panel shows the live roster for Agora sessions
  // the same way it does for LiveKit (via ParticipantsBridge in WebinarStage).
  useEffect(() => {
    const list = [
      // Local user (only when publishing)
      ...(canPublish
        ? [
            {
              identity: userId,
              name: isHost ? "You (Host)" : "You",
              isLocal: true,
              isHost,
              canPublish,
              micOn: true,   // reflects control-bar default; ControlBar manages actual mute
              camOn: true,
              isSpeaking: false,
            },
          ]
        : []),
      // Remote users
      ...client.remoteUsers.map((u) => ({
        identity: String(u.uid),
        name: `User ${shortUid(u.uid)}`,
        isLocal: false,
        isHost: false,
        canPublish: !!u.audioTrack || !!u.videoTrack,
        micOn: !!u.audioTrack && !u.audioTrack.muted,
        camOn: !!u.videoTrack,
        isSpeaking: false,
      })),
    ];
    setSessionParticipants(sessionId, list);
  }, [client.remoteUsers, canPublish, isHost, userId, sessionId]);

  // Clear the participant list when unmounting so the People panel goes empty
  // rather than showing stale entries after the user leaves.
  useEffect(() => () => setSessionParticipants(sessionId, []), [sessionId]);

  // ── Floating reactions ────────────────────────────────────────────────────
  // Listen for reaction inserts in real time and float them up the stage.
  const [reactionFloats, setReactionFloats] = useState<
    { id: string; emoji: string; left: number }[]
  >([]);

  useEffect(() => {
    const ch = supabase
      .channel(`agora-reactions-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "webinar_reactions", filter: `session_id=eq.${sessionId}` },
        (p: { new: { id: string; emoji: string } }) => {
          const id = p.new.id;
          const emoji = p.new.emoji;
          const left = 10 + Math.random() * 80;
          setReactionFloats((f) => [...f, { id, emoji, left }]);
          setTimeout(() => setReactionFloats((f) => f.filter((x) => x.id !== id)), 3000);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  // ── Announcement banner ───────────────────────────────────────────────────
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel(`agora-announce-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "webinar_announcements", filter: `session_id=eq.${sessionId}` },
        (p: { new: { message: string } }) => {
          setAnnouncement(p.new.message);
          setTimeout(() => setAnnouncement(null), 6000);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  // Surface the most useful errors to the user as overlay messages.
  const fatalError = useMemo(() => {
    if (!appId) return "Agora is not configured. Set VITE_AGORA_APP_ID in your build env.";
    if (tokenState.error) return tokenState.error;
    if (client.error) return client.error.message;
    return null;
  }, [appId, tokenState.error, client.error]);

  // Connecting overlay reasons.
  const connecting =
    !appId
      ? false
      : !tokenState.data || client.connectionState === "CONNECTING" || client.connectionState === "RECONNECTING";

  return (
    <div className="relative h-full w-full bg-black overflow-hidden">
      {/* Banner / waiting state */}
      {client.remoteUsers.length === 0 && (!canPublish || !client.localVideo) && (
        <WaitingBanner eventBannerUrl={eventBannerUrl} eventTitle={eventTitle} />
      )}

      {/* Video tiles */}
      <div className="absolute inset-0 grid gap-2 p-2 sm:p-3"
        style={{ gridTemplateColumns: tileGridCols(visibleTileCount(client, canPublish)) }}>
        {/* Local tile (only when host) */}
        {canPublish && client.localVideo && (
          <LocalTile
            videoTrack={client.localVideo}
            audioTrack={client.localAudio}
            label="You"
            mirrored
          />
        )}
        {/* Remote tiles */}
        {client.remoteUsers.map((user) => (
          <RemoteTile key={String(user.uid)} user={user} />
        ))}
      </div>

      {/* Connection / error overlays */}
      {connecting && !fatalError && (
        <Overlay>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Connecting…</span>
        </Overlay>
      )}
      {fatalError && (
        <Overlay tone="error">
          <WifiOff className="h-5 w-5" />
          <span className="text-sm">{fatalError}</span>
          <Button
            variant="outline"
            size="sm"
            className="text-white border-white/40"
            onClick={() => {
              void tokenState.refresh();
            }}
          >
            Retry
          </Button>
        </Overlay>
      )}

      {/* Announcement banner */}
      {announcement && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-foreground text-background px-4 py-2 rounded-md text-sm shadow-lg">
          📣 {announcement}
        </div>
      )}

      {/* Floating reaction emojis */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
        {reactionFloats.map((f) => (
          <div
            key={f.id}
            className="absolute bottom-20 text-2xl sm:text-3xl lg:text-4xl animate-float"
            style={{ left: `${f.left}%` }}
          >
            {f.emoji}
          </div>
        ))}
      </div>

      {/* Bottom control bar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 z-30">
        <ControlBar
          canPublish={canPublish}
          isHost={isHost}
          localAudio={client.localAudio}
          localVideo={client.localVideo}
          onLeave={async () => {
            await client.leave();
            onDisconnect?.();
          }}
          quality={connectionQualityLabel(client.networkQuality)}
        />
      </div>
    </div>
  );
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

function LocalTile({
  videoTrack,
  audioTrack,
  label,
  mirrored,
}: {
  videoTrack: ICameraVideoTrack;
  audioTrack: IMicrophoneAudioTrack | null;
  label: string;
  mirrored?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    videoTrack.play(el, { mirror: mirrored });
    return () => {
      try {
        videoTrack.stop();
      } catch {
        /* track may already be closed */
      }
    };
  }, [videoTrack, mirrored]);

  return (
    <div className="relative rounded-lg overflow-hidden bg-zinc-900 ring-1 ring-white/10 min-h-[180px]">
      <div ref={containerRef} className="absolute inset-0" />
      <TileLabel
        label={label}
        muted={!audioTrack || audioTrack.muted}
      />
    </div>
  );
}

function RemoteTile({ user }: { user: IAgoraRTCRemoteUser }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasVideo, setHasVideo] = useState<boolean>(!!user.videoTrack);

  useEffect(() => {
    setHasVideo(!!user.videoTrack);
    const v = user.videoTrack;
    if (!v) return;
    const el = containerRef.current;
    if (!el) return;
    try {
      v.play(el);
    } catch (err) {
      logger.warn("agora remote video play failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
    return () => {
      try {
        v.stop();
      } catch {
        /* already torn down */
      }
    };
  }, [user.videoTrack, user.uid]);

  // Audio plays automatically in agora-rtc-sdk-ng once subscribed; we just
  // need to call play() on it so it doesn't get GC'd.
  useEffect(() => {
    const a = user.audioTrack;
    if (!a) return;
    try {
      a.play();
    } catch {
      /* some browsers block until a user gesture; the joiner already gestured */
    }
  }, [user.audioTrack, user.uid]);

  return (
    <div className="relative rounded-lg overflow-hidden bg-zinc-900 ring-1 ring-white/10 min-h-[180px]">
      <div ref={containerRef} className="absolute inset-0" />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
          Camera off
        </div>
      )}
      <TileLabel
        label={`User ${shortUid(user.uid)}`}
        muted={!user.audioTrack || user.audioTrack.muted}
      />
    </div>
  );
}

function TileLabel({ label, muted }: { label: string; muted: boolean }) {
  return (
    <div className="absolute left-2 bottom-2 inline-flex items-center gap-1.5 rounded-md bg-black/55 backdrop-blur px-2 py-0.5 text-[11px] text-white">
      <span>{label}</span>
      {muted ? <MicOff className="h-3 w-3 text-red-400" /> : <Mic className="h-3 w-3" />}
    </div>
  );
}

// ─── Control bar ──────────────────────────────────────────────────────────────

function ControlBar({
  canPublish,
  isHost,
  localAudio,
  localVideo,
  onLeave,
  quality,
}: {
  canPublish: boolean;
  isHost: boolean;
  localAudio: IMicrophoneAudioTrack | null;
  localVideo: ICameraVideoTrack | null;
  onLeave: () => void;
  quality: string | null;
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    if (localAudio) localAudio.setMuted(!micOn).catch(() => {});
  }, [localAudio, micOn]);

  useEffect(() => {
    if (localVideo) localVideo.setMuted(!camOn).catch(() => {});
  }, [localVideo, camOn]);

  return (
    <div className="flex items-center gap-2 rounded-full bg-black/65 backdrop-blur-md ring-1 ring-white/10 px-2 py-1.5">
      {canPublish && (
        <>
          <ControlButton
            label={micOn ? "Mute" : "Unmute"}
            active={micOn}
            onClick={() => setMicOn((v) => !v)}
          >
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-400" />}
          </ControlButton>
          <ControlButton
            label={camOn ? "Stop video" : "Start video"}
            active={camOn}
            onClick={() => setCamOn((v) => !v)}
          >
            {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-red-400" />}
          </ControlButton>
          <span className="w-px h-5 bg-white/15" aria-hidden />
        </>
      )}

      {quality && (
        <span className="inline-flex items-center gap-1 px-2 text-[11px] text-white/70">
          <Wifi className="h-3.5 w-3.5" />
          {quality}
        </span>
      )}

      <Button
        size="sm"
        variant="destructive"
        className="h-8 rounded-full text-[12px] px-3"
        onClick={onLeave}
      >
        <LogOut className="h-3.5 w-3.5 mr-1.5" />
        {isHost ? "End" : "Leave"}
      </Button>
    </div>
  );
}

function ControlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-9 w-9 rounded-full inline-flex items-center justify-center text-white transition-colors ${
        active ? "bg-white/10 hover:bg-white/15" : "bg-red-500/15 hover:bg-red-500/20"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function visibleTileCount(
  client: { remoteUsers: IAgoraRTCRemoteUser[]; localVideo: ICameraVideoTrack | null },
  canPublish: boolean,
): number {
  return client.remoteUsers.length + (canPublish && client.localVideo ? 1 : 0);
}

function tileGridCols(n: number): string {
  if (n <= 1) return "1fr";
  if (n === 2) return "repeat(2, 1fr)";
  if (n <= 4) return "repeat(2, 1fr)";
  if (n <= 9) return "repeat(3, 1fr)";
  return "repeat(4, 1fr)";
}

function shortUid(uid: string | number): string {
  const s = String(uid);
  if (s.length <= 6) return s;
  return s.slice(0, 4) + "…" + s.slice(-2);
}

function connectionQualityLabel(q: { uplinkNetworkQuality: number; downlinkNetworkQuality: number } | null): string | null {
  if (!q) return null;
  const worst = Math.max(q.uplinkNetworkQuality, q.downlinkNetworkQuality);
  if (worst <= 0) return null;
  if (worst <= 2) return "Excellent";
  if (worst === 3) return "Good";
  if (worst === 4) return "Fair";
  return "Poor";
}

function WaitingBanner({
  eventBannerUrl,
  eventTitle,
}: {
  eventBannerUrl?: string | null;
  eventTitle?: string | null;
}) {
  return (
    <div className="absolute inset-0 z-0">
      {eventBannerUrl ? (
        <>
          <img
            src={eventBannerUrl}
            alt={eventTitle ?? ""}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/70" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
      )}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center">
        {eventTitle && (
          <h2 className="text-white text-3xl sm:text-5xl font-semibold tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
            {eventTitle}
          </h2>
        )}
        <p className="mt-3 text-white/70 text-sm">
          Waiting for speakers to join the stage…
        </p>
      </div>
    </div>
  );
}

function Overlay({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
}) {
  const cls =
    tone === "error"
      ? "bg-red-500/15 text-white ring-1 ring-red-500/40"
      : "bg-black/55 text-white ring-1 ring-white/10";
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className={`max-w-md w-[calc(100%-2rem)] rounded-xl backdrop-blur-md px-4 py-3 flex items-center gap-3 ${cls}`}>
        {children}
      </div>
    </div>
  );
}
