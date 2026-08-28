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
import AgoraRTC from "agora-rtc-sdk-ng";
import type {
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  ILocalVideoTrack,
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
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, LogOut, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";
import { setSessionParticipants, type SidebarParticipant } from "./participantStore";

interface Props {
  sessionId: string;
  userId: string;
  isHost: boolean;
  canPublish: boolean;
  onDisconnect?: () => void;
  eventBannerUrl?: string | null;
  eventTitle?: string | null;
  /** `?join=` param — authenticates a guest viewer with no account. */
  joinToken?: string | null;
  /** `?speaker=` param — authenticates an invited speaker with no account. */
  speakerToken?: string | null;
}

export function AgoraWebinarStage({
  sessionId,
  userId,
  isHost,
  canPublish,
  onDisconnect,
  eventBannerUrl,
  eventTitle,
  joinToken,
  speakerToken,
}: Props) {
  const role: AgoraSessionRole = canPublish ? "publisher" : "subscriber";

  const tokenState = useAgoraSessionToken({
    sessionId,
    uid: userId,
    role,
    joinToken,
    speakerToken,
  });

  // The edge function decides publish rights server-side and reports the
  // effective role back on the token. Joining the SDK as "host" while
  // holding a subscriber token makes publishing fail at the SDK layer with
  // an opaque error, so mirror the server's answer once it arrives and fall
  // back to the local guess only while the token is still in flight.
  const effectiveRole: AgoraSessionRole = tokenState.data?.role ?? role;
  const agoraRole: AgoraRole = effectiveRole === "publisher" ? "host" : "audience";

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
      return tokenStateRef.current?.data?.token ?? tokenState.data?.token ?? "";
    },
  });

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  // A screen-share track from `AgoraRTC.createScreenVideoTrack` is
  // either a single `ILocalVideoTrack` or a `[ILocalVideoTrack,
  // ILocalAudioTrack]` tuple when the user grants system-audio
  // capture. We hold whichever shape we get so `stopScreenShare` can
  // unpublish the same object we published.
  type ScreenTrack = ICameraVideoTrack | [ICameraVideoTrack, IMicrophoneAudioTrack];
  const [localScreenTrack, setLocalScreenTrack] = useState<ScreenTrack | null>(null);
  const localScreenRef = useRef<ScreenTrack | null>(null);
  // Refs that hold the latest local mute state so the auto-publish
  // effect below can apply the pre-join choice immediately without
  // relying on stale render-time closures.
  const micOnRef = useRef(micOn);
  const camOnRef = useRef(camOn);
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { camOnRef.current = camOn; }, [camOn]);

  const activeLocalVideoTrack = useMemo(() => {
    if (!localScreenTrack) return client.localVideo;
    if (Array.isArray(localScreenTrack)) {
      return localScreenTrack[0];
    }
    return localScreenTrack;
  }, [localScreenTrack, client.localVideo]);

  const closeScreenTrack = (track: ScreenTrack): void => {
    // Close every underlying MediaStreamTrack. Skipping close (as the
    // previous try/catch swallow did) leaves the browser's screen-
    // capture indicator on after the user thinks they've stopped
    // sharing, which was one of the reported "not working properly"
    // symptoms. Wrap each close call individually so one failing track
    // doesn't stop the other from cleaning up.
    const tracks = Array.isArray(track) ? track : [track];
    for (const t of tracks) {
      try {
        t.close();
      } catch (err) {
        logger.debug("agora screen track close threw", {
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const stopScreenShare = async (track: ScreenTrack) => {
    const c = client.client;
    if (!c) return;
    // Unpublish the exact screen track object we published — passing
    // the wrong reference silently leaves the CDN slot occupied.
    try {
      await c.unpublish(track as unknown as Parameters<typeof c.unpublish>[0]);
    } catch (err) {
      logger.warn("agora screen unpublish failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
    closeScreenTrack(track);

    localScreenRef.current = null;
    setLocalScreenTrack(null);
    setScreenOn(false);

    // Re-publish the camera track if the user's camera was on before
    // sharing. `client.localVideo` is still valid because the earlier
    // `client.unpublish(client.localVideo)` inside `toggleScreenShare`
    // doesn't close the track — the hook's own `unpublish()` would
    // have, but we bypassed it deliberately so the camera track is
    // ready to re-publish here without re-requesting camera
    // permission from the browser.
    if (client.localVideo && camOnRef.current) {
      try {
        await c.publish(client.localVideo);
      } catch (err) {
        logger.warn("agora camera re-publish after screen share failed", {
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!canPublish || !client.client) return;

    if (screenOn) {
      // Stopping.
      if (localScreenRef.current) {
        await stopScreenShare(localScreenRef.current);
      }
      return;
    }

    // Starting. Any thrown error must not leave a partially-published
    // screen track live, so wrap the entire start flow in try/finally
    // and roll back if publish fails.
    let screenTrack: ScreenTrack | null = null;
    try {
      // `withAudio: "auto"` returns an array [video, audio] when the
      // user grants system-audio capture, or a single track otherwise.
      const captured = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: "1080p_1" },
        "auto",
      );
      screenTrack = captured as ScreenTrack;
      const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;

      // Unpublish the camera BEFORE publishing screen so the CDN slot
      // isn't briefly shared. Preserve `client.localVideo` (don't
      // close) so we can re-publish it on stop without a re-permission
      // prompt.
      if (client.localVideo) {
        await client.client.unpublish(client.localVideo);
      }

      // Publish both video (and system audio if captured).
      await client.client.publish(screenTrack as unknown as Parameters<typeof client.client.publish>[0]);

      localScreenRef.current = screenTrack;
      setLocalScreenTrack(screenTrack);
      setScreenOn(true);

      // Browser's "Stop sharing" button fires this — treat as user-
      // initiated stop so the UI catches up.
      videoTrack.on("track-ended", () => {
        void stopScreenShare(screenTrack as ScreenTrack);
      });
    } catch (err) {
      logger.warn("agora screen share failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
      // Roll back — close any track we opened, and re-publish camera
      // if we managed to unpublish it before failing.
      if (screenTrack) closeScreenTrack(screenTrack);
      if (client.localVideo && camOnRef.current) {
        try {
          await client.client.publish(client.localVideo);
        } catch {
          /* best-effort: camera was already unpublished */
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      // Ensure the browser's screen-capture indicator turns off when
      // the component unmounts mid-share (route change, dialog close).
      if (localScreenRef.current) {
        closeScreenTrack(localScreenRef.current);
        localScreenRef.current = null;
      }
    };
    // Intentionally no deps — closure only reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mic toggle: mute if the track exists, otherwise create + publish
  // it on demand. This makes "pre-mute → later unmute" actually turn
  // the mic on (previously the toggle silently no-op'd because the
  // audio track was never created, since the auto-publish flow above
  // now skips pre-muted sides).
  //
  // Depends on specific `client.*` fields rather than the whole
  // `client` object because the hook returns a fresh object every
  // render (nothing memoizes it), and depending on the whole thing
  // would re-run this effect on every parent render even when no
  // relevant state changed. `client.publish` is stable via useCallback
  // inside the hook, and the other fields are React state values that
  // only change when they actually change.
  useEffect(() => {
    if (!canPublish) return;
    if (client.connectionState !== "CONNECTED") return;
    if (micOn && !client.localAudio) {
      void client.publish({ audio: true, video: false }).catch((err) => {
        logger.warn("agora mic publish on toggle failed", {
          error_message: err instanceof Error ? err.message : String(err),
        });
      });
    } else if (client.localAudio) {
      void client.localAudio.setMuted(!micOn).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, client.publish, client.localAudio, client.connectionState, micOn]);

  // Camera toggle: same pattern as mic (see comment above).
  useEffect(() => {
    if (!canPublish) return;
    if (client.connectionState !== "CONNECTED") return;
    if (camOn && !client.localVideo) {
      void client.publish({ audio: false, video: true }).catch((err) => {
        logger.warn("agora camera publish on toggle failed", {
          error_message: err instanceof Error ? err.message : String(err),
        });
      });
    } else if (client.localVideo) {
      void client.localVideo.setMuted(!camOn).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, client.publish, client.localVideo, client.connectionState, camOn]);

  // Keep the latest tokenState.data accessible to the onTokenWillExpire
  // closure without putting tokenState in useAgoraClient's identity tuple.
  const tokenStateRef = useRef(tokenState);
  useEffect(() => {
    tokenStateRef.current = tokenState;
  }, [tokenState]);

  // Auto-publish for hosts the moment we're connected.
  //
  // Respects the user's pre-mute state: if they toggled mic or camera
  // off before joining (e.g. in the prejoin dialog on the host page),
  // `publish()` is called WITHOUT that side, so the corresponding
  // track is never created and the browser's permission indicator
  // stays off. Previously the hook always created both tracks and
  // then a separate effect muted them after the fact — which
  // (a) briefly published the user unmuted before the mute effect
  // ran, and (b) still lit up the camera/mic indicator lights even
  // though the user meant to keep them off. Reading the pre-mute
  // state through refs avoids capturing stale render-time values.
  const publishStartedRef = useRef(false);
  useEffect(() => {
    if (!canPublish) return;
    if (client.connectionState !== "CONNECTED") return;
    if (publishStartedRef.current) return;
    publishStartedRef.current = true;
    const startAudio = micOnRef.current;
    const startVideo = camOnRef.current;
    // If BOTH sides are pre-muted, defer publishing entirely — the
    // toggle handlers will create tracks on demand when the user turns
    // one on. This matches Zoom/Meet UX where "join with mic and
    // camera off" doesn't hold hardware.
    if (!startAudio && !startVideo) return;
    client.publish({ audio: startAudio, video: startVideo }).catch((err) => {
      publishStartedRef.current = false;
      logger.warn("agora auto-publish failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
  }, [canPublish, client]);

  // ── Participant bridge ────────────────────────────────────────────────────
  // Mirror Agora's local + remote users into the shared participantStore so
  // the WebinarSidebar's "People" tab (which lives outside this component
  // tree) renders the same list LiveKit's sidebar gets via useParticipants().
  // Anyone publishing video/audio is treated as "on stage"; subscribers fall
  // into "in attendance".
  useEffect(() => {
    if (!sessionId) return;
    const localEntry: SidebarParticipant = {
      identity: userId,
      name: "You",
      isLocal: true,
      isHost,
      canPublish,
      micOn: !!client.localAudio && micOn,
      camOn: !!client.localVideo && camOn,
      isSpeaking: false,
    };
    const remoteEntries: SidebarParticipant[] = client.remoteUsers.map((u) => {
      const uid = String(u.uid);
      // Without metadata we can't know names or roles for remote users.
      // Best-effort: anyone we've subscribed to audio/video for is publishing,
      // which by definition means they're on stage (host or speaker).
      const publishingAudio = !!u.audioTrack;
      const publishingVideo = !!u.videoTrack;
      const onStage = publishingAudio || publishingVideo;
      return {
        identity: uid,
        name: `Participant ${uid.length > 6 ? uid.slice(0, 6) + "…" : uid}`,
        isLocal: false,
        isHost: false,
        canPublish: onStage,
        micOn: publishingAudio,
        camOn: publishingVideo,
        isSpeaking: false,
      };
    });
    setSessionParticipants(sessionId, [localEntry, ...remoteEntries]);
  }, [sessionId, userId, isHost, canPublish, client.localAudio, client.localVideo, client.remoteUsers, micOn, camOn]);

  // Cleanup on unmount: clear the list so a stale "you" doesn't linger.
  useEffect(() => {
    if (!sessionId) return;
    return () => setSessionParticipants(sessionId, []);
  }, [sessionId]);

  // Refresh the live RTC token whenever the token state has a fresh value.
  // useAgoraClient handles the in-place renewToken via opts.token in its
  // effect deps so we don't need extra glue here.

  // Surface the most useful errors to the user as overlay messages.
  const fatalError = useMemo(() => {
    if (!appId) return "Agora is not configured. Set VITE_AGORA_APP_ID in your build env.";
    if (tokenState.error) return tokenState.error;
    if (client.error) return client.error.message;
    return null;
  }, [appId, tokenState.error, client.error]);

  // Connecting overlay reasons. Reconnect gets a distinct label so
  // an organizer / attendee can tell "the network just blipped and
  // we're rejoining" from "we haven't connected yet" — previously
  // both states showed the same "Connecting…" spinner and users
  // reported thinking the stream had frozen when it was actually
  // recovering. `RECONNECTING` is Agora's SDK-emitted state name; it
  // means the transport dropped and the client is auto-rejoining
  // (typically resolves within 5-15s on a flaky link).
  const isReconnecting = !!appId && client.connectionState === "RECONNECTING";
  const connecting =
    !appId
      ? false
      : !isReconnecting && (!tokenState.data || client.connectionState === "CONNECTING");

  return (
    <div className="relative h-full w-full bg-black overflow-hidden">
      {/* Banner / waiting state */}
      {client.remoteUsers.length === 0 && (!canPublish || (!client.localVideo && !screenOn)) && (
        <WaitingBanner eventBannerUrl={eventBannerUrl} eventTitle={eventTitle} />
      )}

      {/* Video tiles */}
      <div className="absolute inset-0 grid gap-2 p-2 sm:p-3"
        style={{ gridTemplateColumns: tileGridCols(visibleTileCount(client, canPublish, screenOn)) }}>
        {/* Local tile (only when host) */}
        {canPublish && (client.localVideo || screenOn) && activeLocalVideoTrack && (
          <LocalTile
            videoTrack={activeLocalVideoTrack}
            muted={!micOn}
            label={screenOn ? "You (Screen Share)" : "You"}
            mirrored={!screenOn}
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
      {isReconnecting && !fatalError && (
        <Overlay tone="warn">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">
            Connection dropped — reconnecting automatically…
          </span>
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

      {/* Bottom control bar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 z-30">
        <ControlBar
          canPublish={canPublish}
          isHost={isHost}
          micOn={micOn}
          setMicOn={setMicOn}
          camOn={camOn}
          setCamOn={setCamOn}
          screenOn={screenOn}
          onToggleScreen={toggleScreenShare}
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
  muted,
  label,
  mirrored,
}: {
  /** Either the camera track (mirrored) or the screen-share video
   *  track (not mirrored). Both share the `play(container, opts)` and
   *  `stop()` surface that this tile uses. `ILocalVideoTrack` is the
   *  common base — `ICameraVideoTrack` and screen tracks both extend
   *  from it. */
  videoTrack: ILocalVideoTrack;
  muted: boolean;
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
      {/* [agora-contain] Force the SDK-injected <video> to show the full
          camera frame without cropping. Agora sets object-fit: cover by
          default; we override it to contain so no part of the image is
          clipped when the aspect ratio differs from the tile. */}
      <div ref={containerRef} className="absolute inset-0 [&_video]:object-contain" />
      <TileLabel
        label={label}
        muted={muted}
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
      {/* [agora-contain] Same override as LocalTile — full frame, no crop. */}
      <div ref={containerRef} className="absolute inset-0 [&_video]:object-contain" />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
          Camera off
        </div>
      )}
      <TileLabel
        label={`User ${shortUid(user.uid)}`}
        muted={!user.hasAudio}
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
  micOn,
  setMicOn,
  camOn,
  setCamOn,
  screenOn,
  onToggleScreen,
  onLeave,
  quality,
}: {
  canPublish: boolean;
  isHost: boolean;
  micOn: boolean;
  setMicOn: React.Dispatch<React.SetStateAction<boolean>>;
  camOn: boolean;
  setCamOn: React.Dispatch<React.SetStateAction<boolean>>;
  screenOn: boolean;
  onToggleScreen: () => void;
  onLeave: () => void;
  quality: string | null;
}) {

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
          <ControlButton
            label={screenOn ? "Stop sharing" : "Share screen"}
            active={screenOn}
            onClick={onToggleScreen}
          >
            {screenOn ? <MonitorOff className="h-4 w-4 text-red-400" /> : <MonitorUp className="h-4 w-4" />}
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
  screenOn: boolean,
): number {
  return client.remoteUsers.length + (canPublish && (client.localVideo || screenOn) ? 1 : 0);
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
  tone?: "info" | "warn" | "error";
}) {
  const cls =
    tone === "error"
      ? "bg-red-500/15 text-white ring-1 ring-red-500/40"
      : tone === "warn"
        ? "bg-amber-500/15 text-white ring-1 ring-amber-500/40"
        : "bg-black/55 text-white ring-1 ring-white/10";
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className={`max-w-md w-[calc(100%-2rem)] rounded-xl backdrop-blur-md px-4 py-3 flex items-center gap-3 ${cls}`}>
        {children}
      </div>
    </div>
  );
}
