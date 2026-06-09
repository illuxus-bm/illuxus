import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  FocusLayout,
  FocusLayoutContainer,
  CarouselLayout,
} from "@livekit/components-react";
import { Track, VideoPresets, DisconnectReason, type LocalVideoTrack } from "livekit-client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StageOverlays, type Branding } from "./StageOverlays";
import { AirmeetControlBar } from "./AirmeetControlBar";
import { setSessionParticipants, type SidebarParticipant } from "./participantStore";

type Props = {
  token: string;
  wsUrl: string;
  canPublish: boolean;
  onDisconnect?: () => void;
  layout?: "grid" | "speaker" | "sidebyside" | "pip";
  branding?: Branding;
  brandingEnabled?: boolean;
  sessionId?: string;
  userId?: string;
  isHost?: boolean;
  eventBannerUrl?: string | null;
  eventTitle?: string | null;
  // Device selections from PreJoinCheck — honoured when the host joins
  micEnabled?: boolean;
  camEnabled?: boolean;
  camDeviceId?: string;
  micDeviceId?: string;
};

function WebinarStageImpl({
  token, wsUrl, canPublish, onDisconnect, layout = "grid",
  branding, brandingEnabled = true, sessionId, userId, isHost,
  eventBannerUrl, eventTitle,
  micEnabled = true, camEnabled = true, camDeviceId, micDeviceId,
}: Props) {
  // Only treat *intentional* disconnects as "leave the stage". Transient
  // disconnects fire during screen-share negotiation, tab switches, network
  // blips, and page suspensions — the SDK reconnects automatically and we
  // must NOT clear the token, otherwise the user gets booted off the stage.
  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    const intentional =
      reason === DisconnectReason.CLIENT_INITIATED ||
      reason === DisconnectReason.ROOM_DELETED ||
      reason === DisconnectReason.PARTICIPANT_REMOVED ||
      reason === DisconnectReason.DUPLICATE_IDENTITY;
    if (intentional) onDisconnect?.();
  }, [onDisconnect]);
  // Memoize options to keep <LiveKitRoom> from re-mounting on parent state churn.
  // Default capture/publish at 1080p (Full HD) for Airmeet-style quality.
  // Fixed 1280×720 capture & publish for every speaker — predictable bandwidth,
  // identical-sized tiles for everyone, lower CPU than 1080p.
  const options = useMemo(() => ({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
      facingMode: "user" as const,
    },
    publishDefaults: {
      videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
      videoEncoding: VideoPresets.h720.encoding,
      screenShareEncoding: VideoPresets.h1080.encoding,
    },
  }), []);
  // Build audio/video constraints from the device selection captured in PreJoinCheck.
  // LiveKitRoom accepts MediaTrackConstraints for audio/video so we embed the
  // exact deviceId the user chose — this is what was previously ignored.
  const audioConstraints = useMemo(() => {
    if (!canPublish) return false;
    if (!micEnabled) return false;
    if (micDeviceId) return { deviceId: { exact: micDeviceId }, echoCancellation: true, noiseSuppression: true } as MediaTrackConstraints;
    return true;
  }, [canPublish, micEnabled, micDeviceId]);

  const videoConstraints = useMemo(() => {
    if (!canPublish) return false;
    if (!camEnabled) return false;
    if (camDeviceId) return { deviceId: { exact: camDeviceId } } as MediaTrackConstraints;
    return true;
  }, [canPublish, camEnabled, camDeviceId]);

  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect
      audio={audioConstraints}
      video={videoConstraints}
      options={options}
      onDisconnected={handleDisconnected}
      data-lk-theme="default"
      style={{ height: "100%", position: "relative" }}
    >
      <MemoStage layout={layout} branding={brandingEnabled ? branding : undefined} eventBannerUrl={eventBannerUrl} eventTitle={eventTitle} />
      <RoomAudioRenderer />
      {sessionId && <ParticipantsBridge sessionId={sessionId} />}
      {sessionId && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 z-30 px-3 w-auto max-w-[calc(100%-1.5rem)]">
          <AirmeetControlBar
            sessionId={sessionId}
            userId={userId}
            isHost={!!isHost}
          />
        </div>
      )}
      <style>{`
        /* Breathing room between participant name and mute/status icons */
        .lk-participant-metadata { gap: 0.5rem; padding: 4px 8px; }
        .lk-participant-metadata-item { margin-left: 0; }
        .lk-participant-name { padding-right: 4px; }
        /* Mirror only the LOCAL participant's camera (selfie-view convention).
           Remote tiles and screen-share are NEVER mirrored. */
        .lk-participant-tile[data-lk-local-participant="true"] video:not([data-lk-source="screen_share"]) {
          transform: scaleX(-1);
        }
        /* Hide horizontal scrollbar on the control bar */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </LiveKitRoom>
  );
}

/** Memoized so parent re-renders (chat counts, headers, etc.) don't churn the LiveKit room. */
export const WebinarStage = memo(WebinarStageImpl);

/**
 * Mirrors LiveKit's live participants list out to a module-level pub/sub
 * store so the sidebar (which lives outside `<LiveKitRoom>`) can render a
 * matching Airmeet-style participants panel.
 */
function ParticipantsBridge({ sessionId }: { sessionId: string }) {
  const participants = useParticipants();
  useEffect(() => {
    const list: SidebarParticipant[] = participants.map((p) => {
      const meta = (() => { try { return p.metadata ? JSON.parse(p.metadata) : {}; } catch { return {}; } })();
      return {
        identity: p.identity,
        name: p.name || meta.name || p.identity,
        isLocal: !!(p as any).isLocal,
        isHost: meta.role === "host" || meta.isHost === true,
        canPublish: !!p.permissions?.canPublish,
        micOn: !!p.isMicrophoneEnabled,
        camOn: !!p.isCameraEnabled,
        isSpeaking: !!p.isSpeaking,
      };
    });
    setSessionParticipants(sessionId, list);
  }, [participants, sessionId]);
  useEffect(() => () => setSessionParticipants(sessionId, []), [sessionId]);
  return null;
}

function Stage({ layout, branding, eventBannerUrl, eventTitle }: { layout: Props["layout"]; branding?: Branding; eventBannerUrl?: string | null; eventTitle?: string | null }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  // Stable signature — changes only when the *set* of tracks changes, not on
  // every useTracks poll. Drives both derivation and JSX memoization.
  const sigKey = tracks
    .map((t) => t.publication?.trackSid || t.participant.identity)
    .join("|");

  const screenTrack = useMemo(
    () => tracks.find((t) => t.source === Track.Source.ScreenShare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sigKey],
  );

  // Memoize the whole layout subtree. With this in place, useTracks polling
  // no longer reconciles GridLayout / FocusLayout / ParticipantTile children.
  const layoutNode = useMemo(() => {
    if (tracks.length === 0) {
      const waitingChip = (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-md text-white/90 text-[12px] px-3.5 py-1.5 ring-1 ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Waiting for speakers to start their video…
        </div>
      );
      if (eventBannerUrl) {
        return (
          <div className="relative h-full w-full bg-black overflow-hidden">
            <img src={eventBannerUrl} alt={eventTitle ?? ""} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/70" />
            {eventTitle && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center">
                <h2 className="text-white text-3xl sm:text-5xl font-semibold tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
                  {eventTitle}
                </h2>
              </div>
            )}
            {waitingChip}
          </div>
        );
      }
      if (eventTitle) {
        return (
          <div className="relative h-full w-full bg-black flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
            <h2 className="relative px-8 text-center text-white text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight max-w-5xl">
              {eventTitle}
            </h2>
            {waitingChip}
          </div>
        );
      }
      return (
        <div className="relative flex flex-col items-center justify-center h-full text-white/70 gap-2 bg-black">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Waiting for speakers to start their video…
        </div>
      );
    }
    const cams = tracks.filter((t) => t.source === Track.Source.Camera);
    if (screenTrack || layout === "speaker") {
      const focus = screenTrack || tracks[0];
      const others = tracks.filter((t) => t !== focus);
      return (
        <FocusLayoutContainer style={{ height: "100%" }}>
          {others.length > 0 && (
            <CarouselLayout tracks={others}>
              <ParticipantTile />
            </CarouselLayout>
          )}
          <FocusLayout trackRef={focus} />
        </FocusLayoutContainer>
      );
    }
    if (layout === "sidebyside" && cams.length >= 2) {
      return (
        <div className="grid grid-cols-2 gap-2 h-full">
          {cams.slice(0, 2).map((t, i) => (
            <ParticipantTile key={i} trackRef={t} />
          ))}
        </div>
      );
    }
    if (layout === "pip" && cams.length >= 2) {
      return (
        <div className="relative h-full">
          <ParticipantTile trackRef={cams[0]} />
          <div className="absolute bottom-4 right-4 w-1/4 aspect-video rounded-lg overflow-hidden ring-2 ring-white/30">
            <ParticipantTile trackRef={cams[1]} />
          </div>
        </div>
      );
    }
    return (
      <GridLayout tracks={tracks} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigKey, layout, screenTrack, eventBannerUrl, eventTitle]);

  return (
    <FittedStage branding={branding} screenSharing={!!screenTrack}>
      {layoutNode}
    </FittedStage>
  );
}

/**
 * Fixed 1280×720 internal stage scaled to fit its container without scrollbars.
 * The stage geometry never changes — overlays, tiles, and tags stay positioned
 * relative to 1280×720; only a CSS transform shrinks/centers the canvas.
 */
const FittedStage = memo(function FittedStage({
  children,
  branding,
  screenSharing,
}: {
  children: React.ReactNode;
  branding?: Branding;
  screenSharing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const next = Math.min(width / 1280, height / 720, 1);
      setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-[calc(100%-80px)] bg-black overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 1280,
          height: 720,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <div className="absolute inset-0">{children}</div>
        {branding && <StageOverlays branding={branding} screenSharing={screenSharing} />}
      </div>
    </div>
  );
});

const MemoStage = memo(Stage);

/**
 * Live indicator showing the local publisher's video resolution, FPS and bitrate.
 * Helps speakers confirm they're streaming at 1080p.
 */
function StreamQualityIndicator() {
  const { localParticipant } = useLocalParticipant();
  const wrapRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const resRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const bpsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastBytes = 0;
    let lastTs = 0;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const pub = localParticipant?.getTrackPublication?.(Track.Source.Camera);
      const track = pub?.track as LocalVideoTrack | undefined;
      const sender = (track as any)?.sender as RTCRtpSender | undefined;
      if (sender?.getStats) {
        try {
          const report = await sender.getStats();
          let w = 0, h = 0, fps = 0, bytes = 0, ts = 0;
          report.forEach((s: any) => {
            if (s.type === "outbound-rtp" && s.kind === "video") {
              w = s.frameWidth || w;
              h = s.frameHeight || h;
              fps = Math.round(s.framesPerSecond || fps);
              bytes = s.bytesSent || bytes;
              ts = s.timestamp || ts;
            }
          });
          let kbps = 0;
          if (lastTs && ts > lastTs) {
            kbps = Math.round(((bytes - lastBytes) * 8) / (ts - lastTs));
          }
          lastBytes = bytes; lastTs = ts;
          if (w && h && wrapRef.current) {
            // Direct DOM writes — no React reconciliation during live broadcast.
            wrapRef.current.style.display = "flex";
            if (resRef.current) resRef.current.textContent = `${w}×${h}`;
            if (fpsRef.current) fpsRef.current.textContent = `${fps}fps`;
            if (bpsRef.current) bpsRef.current.textContent = kbps > 1000 ? `${(kbps / 1000).toFixed(1)}Mbps` : `${kbps}kbps`;
            if (dotRef.current) dotRef.current.className = `h-1.5 w-1.5 rounded-full animate-pulse ${h >= 700 ? "bg-green-400" : "bg-amber-400"}`;
          }
        } catch {/* ignore */}
      }
    };
    const i = setInterval(tick, 1500);
    tick();
    return () => { cancelled = true; clearInterval(i); };
  }, [localParticipant]);

  return (
    <div
      ref={wrapRef}
      style={{ display: "none" }}
      className="absolute bottom-24 right-3 z-30 bg-black/70 backdrop-blur text-white text-[10px] font-mono px-2 py-1 rounded border border-white/10 items-center gap-2"
    >
      <span ref={dotRef} className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      <span ref={resRef}>—</span>
      <span className="opacity-60">·</span>
      <span ref={fpsRef}>—</span>
      <span className="opacity-60">·</span>
      <span ref={bpsRef}>—</span>
    </div>
  );
}

const MemoStreamQuality = memo(StreamQualityIndicator);