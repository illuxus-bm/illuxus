import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Video, VideoOff, Loader2, CheckCircle2, Wifi, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PreJoinCheck({ onJoin, onCancel, asPublisher }: {
  onJoin: (opts?: { mic: boolean; cam: boolean; camId?: string; micId?: string; spkId?: string; headline?: string }) => void;
  onCancel?: () => void;
  asPublisher: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const barsRef = useRef<HTMLDivElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [perm, setPerm] = useState<{ cam: PermissionState | "unknown"; mic: PermissionState | "unknown" }>({ cam: "unknown", mic: "unknown" });
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; spks: MediaDeviceInfo[] }>({ cams: [], mics: [], spks: [] });
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [spkId, setSpkId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [resLabel, setResLabel] = useState<string>("");
  const [headline, setHeadline] = useState("");

  const refreshDevices = async () => {
    if (!navigator.mediaDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        cams: list.filter((d) => d.kind === "videoinput"),
        mics: list.filter((d) => d.kind === "audioinput"),
        spks: list.filter((d) => d.kind === "audiooutput"),
      });
    } catch { /* ignore */ }
  };

  const queryPermissions = async () => {
    try {
      const c = await (navigator.permissions as any)?.query({ name: "camera" });
      const m = await (navigator.permissions as any)?.query({ name: "microphone" });
      setPerm({ cam: (c?.state as any) || "unknown", mic: (m?.state as any) || "unknown" });
    } catch { /* ignore */ }
  };

  const startMedia = async (cId?: string, mId?: string) => {
    setErr(null);
    // navigator.mediaDevices is only available in secure contexts (HTTPS or localhost).
    // On plain HTTP over a network IP, it's undefined — show a helpful message.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr("Camera/mic access requires HTTPS. Open this page via https:// or localhost.");
      return;
    }
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: cId ? { exact: cId } : undefined,
          // Fixed 1280×720 — same as the published track so the preview matches
          // exactly what other speakers will see.
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        },
        audio: { deviceId: mId ? { exact: mId } : undefined, echoCancellation: true, noiseSuppression: true },
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      const vt = s.getVideoTracks()[0];
      const settings = vt?.getSettings();
      if (settings?.width && settings?.height) {
        setResLabel(`${settings.width}×${settings.height}${settings.frameRate ? ` @ ${Math.round(settings.frameRate)}fps` : ""}`);
      }
      try {
        audioCtxRef.current?.close();
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(s);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        // rAF-driven VU bars: writes a CSS variable to the DOM at ~60fps,
        // zero React re-renders. setLevel is throttled to 500ms for the
        // "speaking / silent" checklist row.
        let lastStateUpdate = 0;
        let cancelled = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const loop = () => {
          if (cancelled) return;
          if (!document.hidden) {
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
            const lv = Math.min(1, Math.sqrt(sum / buf.length) * 2);
            if (barsRef.current) barsRef.current.style.setProperty("--level", String(lv));
            const now = performance.now();
            if (now - lastStateUpdate > 500) {
              lastStateUpdate = now;
              setLevel(lv);
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch { /* ignore */ }
      await refreshDevices();
      await queryPermissions();
    } catch (e: any) {
      setErr(e?.message || "Could not access camera/mic");
    }
  };

  useEffect(() => {
    if (!asPublisher) return;
    startMedia();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      audioCtxRef.current?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asPublisher]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = mic));
    stream?.getVideoTracks().forEach((t) => (t.enabled = cam));
  }, [mic, cam, stream]);

  // Bind the stream to the <video> element AFTER React mounts it. Setting
  // srcObject inside startMedia() runs before the element exists (stream is
  // still null on first render), which is why the preview was blank.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && cam) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.play?.().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream, cam]);

  const join = () => {
    stream?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    audioCtxRef.current?.close();
    onJoin({ mic, cam, camId: camId || undefined, micId: micId || undefined, spkId: spkId || undefined, headline: headline.trim() || undefined });
  };

  const ChecklistRow = ({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) => (
    <div className="flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
        <span>{label}</span>
      </div>
      {hint && <span className="text-[11px] text-muted-foreground font-mono">{hint}</span>}
    </div>
  );

  if (!asPublisher) {
    return (
      <div className="max-w-md mx-auto p-6 rounded-xl border border-border bg-card space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Ready to join?</h2>
        <p className="text-sm text-muted-foreground">You'll join as a viewer. You can chat, ask questions, react and raise your hand.</p>
        <div className="flex gap-2">
          <Button onClick={() => onJoin({ mic: false, cam: false })} className="flex-1">Join now</Button>
          {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
      </div>
    );
  }

  const camOk = !!stream?.getVideoTracks()[0]?.enabled && !err;
  const micOk = !!stream?.getAudioTracks()[0]?.enabled && !err;
  const allOk = camOk && micOk && !err && !!resLabel;
  const bars = 5;

  const deviceRows = [
    { icon: <Video className="h-3.5 w-3.5" />, label: "Camera", value: camId, set: (v: string) => { setCamId(v); startMedia(v, micId); }, opts: devices.cams, ok: camOk },
    { icon: <Mic className="h-3.5 w-3.5" />, label: "Microphone", value: micId, set: (v: string) => { setMicId(v); startMedia(camId, v); }, opts: devices.mics, ok: micOk },
    { icon: <Wifi className="h-3.5 w-3.5" />, label: "Speaker", value: spkId, set: setSpkId, opts: devices.spks, ok: devices.spks.length > 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-6 sm:p-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">
        {/* LEFT — preview + device row */}
        <div className="space-y-5">
          <div className="aspect-video bg-zinc-900 rounded-xl overflow-hidden relative ring-1 ring-border">
            {err ? (
              <div className="h-full flex items-center justify-center text-sm text-foreground/70 p-4 text-center">{err}</div>
            ) : stream && cam ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{
                  // Mirror self-view (selfie convention) — published track is NOT mirrored.
                  transform: "scaleX(-1)",
                }}
              />
            ) : !stream ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-foreground/70" /></div>
            ) : (
              <div className="h-full flex items-center justify-center text-foreground/40 text-sm">Camera off</div>
            )}

            <div
              ref={barsRef}
              className="absolute bottom-3 left-3 flex items-end gap-[3px] h-4"
              style={{ ["--level" as any]: 0 }}
            >
              {Array.from({ length: bars }).map((_, i) => {
                // Threshold per bar; CSS-driven so updates happen at GPU speed
                // without React reconciliation.
                const threshold = (i + 1) / (bars * 1.4);
                return (
                  <span
                    key={i}
                    className="w-[3px] rounded-sm bg-white/20"
                    style={{
                      height: `${30 + i * 14}%`,
                      background: `linear-gradient(to top, rgb(52 211 153) calc((var(--level) - ${threshold}) * 1000%), rgb(255 255 255 / 0.2) 0%)`,
                    }}
                  />
                );
              })}
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <button
                onClick={() => setCam((v) => !v)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  cam ? "bg-white/10 hover:bg-white/20 text-white" : "bg-destructive text-destructive-foreground"
                )}
                aria-label="Toggle camera"
              >
                {cam ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setMic((v) => !v)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  mic ? "bg-white/10 hover:bg-white/20 text-white" : "bg-destructive text-destructive-foreground"
                )}
                aria-label="Toggle microphone"
              >
                {mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
            </div>

            {resLabel && (
              <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">{resLabel}</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {deviceRows.map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">{row.icon}{row.label}</span>
                  {row.ok && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                </div>
                <Select value={row.value} onValueChange={row.set}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue placeholder={row.opts[0]?.label?.slice(0, 18) || "Default"} />
                  </SelectTrigger>
                  <SelectContent>
                    {row.opts.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || row.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <button
            onClick={() => startMedia(camId, micId)}
            className="text-[13px] text-primary hover:underline flex items-center gap-1.5"
          >
            <Wifi className="h-3.5 w-3.5" /> Test audio & video
          </button>

          <details className="rounded-md border border-border p-3 bg-muted/30 text-[12px]">
            <summary className="cursor-pointer font-medium select-none">Pre-join checklist</summary>
            <div className="mt-3 space-y-2">
              <ChecklistRow ok={perm.cam !== "denied" && camOk} label="Camera permission" hint={perm.cam} />
              <ChecklistRow ok={perm.mic !== "denied" && micOk} label="Microphone permission" hint={perm.mic} />
              <ChecklistRow ok={!!stream?.getVideoTracks()[0]} label="Camera detected" hint={stream?.getVideoTracks()[0]?.label?.slice(0, 24)} />
              <ChecklistRow ok={!!stream?.getAudioTracks()[0]} label="Microphone detected" hint={stream?.getAudioTracks()[0]?.label?.slice(0, 24)} />
              <ChecklistRow ok={level > 0.02} label="Microphone receiving audio" hint={level > 0.02 ? "speaking" : "silent"} />
              <ChecklistRow ok={!!resLabel} label="Video capture ready" hint={resLabel || "—"} />
            </div>
          </details>
        </div>

        {/* RIGHT — test setup + Join */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Test your setup</h2>
            <p className="text-[13px] text-muted-foreground mt-2">
              Check your appearance and audio on the left before entering the venue.<br />
              <span className="text-amber-500/90">Your device selection will be used when you join the stage.</span>
            </p>
          </div>

          {/* Video headline — passed to LiveKit as participant metadata */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium">Video headline</Label>
            <p className="text-[12px] text-muted-foreground">Displayed below your name when you are live on stage</p>
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value.slice(0, 50))}
              placeholder="e.g. CEO at Acme Inc."
              className="mt-1.5"
            />
            <div className="text-[11px] text-muted-foreground text-right font-mono">{headline.length}/50</div>
          </div>

          {/* Device summary */}
          <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20">
            <p className="text-[13px] font-medium">Ready to join with:</p>
            <div className="grid grid-cols-2 gap-2 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-2">
                {cam ? <Video className="h-3.5 w-3.5 text-emerald-500" /> : <VideoOff className="h-3.5 w-3.5 text-destructive" />}
                Camera {cam ? "on" : "off"}
              </div>
              <div className="flex items-center gap-2">
                {mic ? <Mic className="h-3.5 w-3.5 text-emerald-500" /> : <MicOff className="h-3.5 w-3.5 text-destructive" />}
                Mic {mic ? "on" : "off"}
              </div>
            </div>
            {resLabel && <p className="text-[11px] font-mono text-muted-foreground">Capture: {resLabel}</p>}
          </div>

          <Button
            size="lg"
            onClick={join}
            disabled={!!err}
            className={cn("w-full h-12 text-base font-semibold", allOk && "bg-primary hover:bg-primary/90")}
          >
            Join Event
          </Button>

          {onCancel && (
            <button onClick={onCancel} className="text-[12px] text-muted-foreground hover:text-foreground w-full text-center">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
