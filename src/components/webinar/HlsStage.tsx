import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

type Props = {
  /** The live playlist on the CDN (livekit-token's `playback_url`). */
  src: string;
  /** The session is live; before that the stage shows the event banner. */
  isLive: boolean;
  eventBannerUrl?: string | null;
  eventTitle?: string | null;
};

/** How often to look for the playlist while the stream hasn't started. */
const RETRY_MS = 4_000;

/**
 * The audience's stage: the composed webinar stream, played from the CDN.
 *
 * Viewers don't join the LiveKit room. LiveKit Egress writes the stage as
 * HLS and this plays it a few seconds behind the room. The playlist only
 * exists once the host is live and the first segments are written, so a
 * missing playlist means "not started yet", not an error: keep looking.
 */
export function HlsStage({ src, isLive, eventBannerUrl, eventTitle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Browsers only autoplay muted video, so start muted and offer the sound.
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLive) return;
    let cancelled = false;
    let retry: number | undefined;
    let destroy: (() => void) | undefined;

    const onPlaying = () => setPlaying(true);
    video.addEventListener("playing", onPlaying);
    const play = () => { void video.play().catch(() => { /* waits for the unmute tap */ }); };

    const start = async () => {
      // Safari and iOS play HLS natively and have no Media Source support
      // on iPhone, so prefer the built-in player where there is one.
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        const onError = () => {
          retry = window.setTimeout(() => { video.src = src; video.load(); play(); }, RETRY_MS);
        };
        video.addEventListener("error", onError);
        video.src = src;
        play();
        destroy = () => {
          video.removeEventListener("error", onError);
          video.removeAttribute("src");
          video.load();
        };
        return;
      }

      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (!Hls.isSupported()) return;
      const hls = new Hls({
        // Stay close to the live edge: two-second segments, three behind.
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxLiveSyncPlaybackRate: 1.1,
        backBufferLength: 30,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        // Playlist not there yet, or the network dropped: try again shortly.
        window.clearTimeout(retry);
        retry = window.setTimeout(() => { hls.loadSource(src); hls.startLoad(); }, RETRY_MS);
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      destroy = () => hls.destroy();
    };
    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      video.removeEventListener("playing", onPlaying);
      destroy?.();
      setPlaying(false);
    };
  }, [src, isLive]);

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) void video.play().catch(() => { /* ignore */ });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        muted={muted}
        playsInline
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          {eventBannerUrl && (
            <img loading="lazy" decoding="async" src={eventBannerUrl} alt={eventTitle ?? ""} className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          <p className="relative px-4 text-center text-sm text-white/80">
            {isLive ? "Connecting to the live stream…" : "The stream will start when the host goes live."}
          </p>
        </div>
      )}
      {playing && (
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-[13px] text-white hover:bg-black/80"
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          {muted ? "Tap for sound" : "Sound on"}
        </button>
      )}
    </div>
  );
}
