import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { logger, supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, XCircle, ScanLine, Camera, CameraOff, Loader2, Ticket,
  AlertTriangle, Clock, LogOut,
} from "lucide-react";

/**
 * Public self check-OUT page. Continuous-scan kiosk mode: the camera
 * mounts once and stays running, decoded scans flash a result banner
 * that auto-dismisses, and the same QR is dedup'd within a short
 * window so the camera holding on a printed badge doesn't double-fire.
 */

type Status =
  | "ok"
  | "already"
  | "not_checked_in_yet"
  | "not_found"
  | "wrong_event"
  | "expired"
  | "cancelled"
  | "invalid"
  | "error";

type Result = {
  id: number;
  status: Status;
  name?: string | null;
  ticket?: string | null;
  checked_out_at?: string | null;
  message?: string;
};

const COPY: Record<Status, { title: string; body: (r: Result) => string; kind: "success" | "warn" | "error" }> = {
  ok:                  { kind: "success", title: "Checked out",                  body: (r) => `Thanks for coming${r.name ? `, ${r.name}` : ""}${r.ticket ? ` · ${roleLabel(r.ticket)}` : ""}.` },
  already:             { kind: "warn",    title: "Already checked out",          body: (r) => `${r.name ?? "This ticket"}${r.checked_out_at ? ` · ${new Date(r.checked_out_at).toLocaleTimeString()}` : ""}.` },
  not_checked_in_yet:  { kind: "warn",    title: "Not checked in yet",           body: () => "Visit the check-in scanner first." },
  not_found:           { kind: "error",   title: "Ticket not found",             body: () => "We couldn't find this ticket." },
  wrong_event:         { kind: "error",   title: "Wrong event",                  body: () => "This ticket is for a different event." },
  expired:             { kind: "error",   title: "Tracking closed",              body: () => "Check-out is closed for this event." },
  cancelled:           { kind: "error",   title: "Registration cancelled",       body: () => "This registration was cancelled." },
  invalid:             { kind: "error",   title: "Invalid code",                 body: () => "That doesn't look like a valid ticket code." },
  error:               { kind: "error",   title: "Something went wrong",         body: (r) => r.message || "Please try again in a moment." },
};

function roleLabel(ticket: string): string {
  if (ticket === "speaker") return "Speaker";
  if (ticket === "sponsor") return "Sponsor";
  return "Attendee";
}

const SAME_TOKEN_DEDUP_MS = 2500;
const RESULT_DISPLAY_MS = 4500;

export default function SelfCheckOutPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [params] = useSearchParams();
  const [eventTitle, setEventTitle] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const manualRef = useRef<HTMLInputElement>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef("self-checkout-" + Math.random().toString(36).slice(2));
  const inFlightRef = useRef(false);
  const lastDecodeRef = useRef<{ token: string; at: number } | null>(null);
  const resultIdRef = useRef(0);
  const resultTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!eventId) return;
    supabase.from("events").select("title").eq("id", eventId).maybeSingle()
      .then(({ data }) => { if (data?.title) setEventTitle(data.title); });
  }, [eventId]);

  const showResult = useCallback((r: Omit<Result, "id">) => {
    const id = ++resultIdRef.current;
    setResult({ ...r, id });
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    resultTimerRef.current = window.setTimeout(() => {
      setResult((curr) => (curr && curr.id === id ? null : curr));
      resultTimerRef.current = null;
    }, RESULT_DISPLAY_MS);
  }, []);

  const submit = useCallback(async (raw: string) => {
    let token = raw.trim();
    try {
      const u = new URL(token);
      const t = u.searchParams.get("token") || u.searchParams.get("join");
      if (t) token = t;
    } catch { /* not a URL */ }
    if (!token) return;

    const now = Date.now();
    const last = lastDecodeRef.current;
    if (last && last.token === token && now - last.at < SAME_TOKEN_DEDUP_MS) return;
    if (inFlightRef.current) return;
    lastDecodeRef.current = { token, at: now };

    inFlightRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabaseRpc(
        "self_check_out" as never,
        { p_token: token, p_event_id: eventId ?? null } as never,
      );
      if (error) {
        logger.warn("self_check_out failed", {
          rpc: "self_check_out",
          event_id: eventId ?? null,
          error_message: error.message,
        });
        showResult({ status: "error", message: error.message });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { showResult({ status: "not_found" }); return; }
      showResult({
        status: (row.status as Status) ?? "error",
        name: row.name,
        ticket: row.ticket_type,
        checked_out_at: row.checked_out_at,
      });
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [eventId, showResult]);

  useEffect(() => {
    const t = params.get("token");
    if (t) void submit(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    if (s && s.isScanning) {
      try { await s.stop(); } catch { /* race during teardown */ }
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setCameraError(null);
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw Object.assign(new Error("Camera requires HTTPS"), { name: "InsecureContextError" });
      }
      if (scannerRef.current && scannerRef.current.isScanning) return;
      const s = new Html5Qrcode(containerId.current);
      scannerRef.current = s;
      await s.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (viewW: number, viewH: number) => {
            const edge = Math.min(viewW, viewH);
            const target = Math.floor(edge * 0.75);
            const clamped = Math.max(220, Math.min(target, 480));
            return { width: clamped, height: clamped };
          },
        },
        (text) => { void submit(text); },
        () => {},
      );
      setScanning(true);
    } catch (err) {
      const e = err as { name?: string; message?: string } | null;
      const message =
        e?.name === "InsecureContextError"
          ? "The camera only works on HTTPS. Open this page via the secure URL."
          : e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError"
            ? "Camera permission denied. Allow camera access in your browser, then click Start camera."
            : e?.name === "NotFoundError"
              ? "We couldn't find a camera on this device. Use manual entry below."
              : e?.name === "NotReadableError"
                ? "Another app or tab is using the camera. Close it and click Start camera."
                : "Could not access the camera. Use manual entry below.";
      logger.warn("self check-out camera start failed", {
        error_name: e?.name ?? null,
        error_message: e?.message ?? String(err ?? ""),
      });
      scannerRef.current = null;
      setCameraError(message);
      setScanning(false);
    }
  }, [submit]);

  useEffect(() => {
    void start();
    return () => {
      void stop();
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onManualSubmit = async () => {
    if (!manual.trim()) return;
    await submit(manual);
    setManual("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8 sm:py-10">
      <div className="w-full max-w-xl space-y-5 sm:space-y-6">
        <header className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center justify-center gap-1.5">
            <LogOut className="h-3 w-3" /> Self check-out
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">{eventTitle || "Event check-out"}</h1>
          <p className="text-[13px] sm:text-[14px] text-muted-foreground">Scan your ticket QR code to check yourself out.</p>
        </header>

        <ResultBanner result={result} onDismiss={() => setResult(null)} />

        {cameraError && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-[13px] bg-red-500/10 text-red-600 border border-red-500/20">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-semibold">Camera unavailable</div>
              <div className="text-[12px] leading-relaxed">{cameraError}</div>
              <Button size="sm" variant="outline" onClick={() => void start()} className="mt-1.5 h-7 text-[12px] gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          </div>
        )}

        <div
          id={containerId.current}
          className="w-full aspect-square mx-auto rounded-xl overflow-hidden border border-border bg-muted/40 relative"
          style={{ maxWidth: "min(90vmin, 560px)" }}
        >
          {busy && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-1.5 bg-background/70 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Recording…
            </div>
          )}
        </div>

        <div className="flex gap-2 max-w-md mx-auto w-full">
          {!scanning ? (
            <Button onClick={() => void start()} className="flex-1 gap-2" size="lg">
              <Camera className="h-4 w-4" /> Start camera
            </Button>
          ) : (
            <Button onClick={() => void stop()} variant="outline" className="flex-1 gap-2" size="lg">
              <CameraOff className="h-4 w-4" /> Stop camera
            </Button>
          )}
        </div>

        <div className="space-y-2 max-w-md mx-auto w-full">
          <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" /> Or enter your ticket code manually
          </p>
          <div className="flex gap-2">
            <Input
              ref={manualRef}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onManualSubmit();
                }
              }}
              placeholder="Paste code or link"
              disabled={busy}
            />
            <Button onClick={() => void onManualSubmit()} disabled={busy || !manual.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultBanner({ result, onDismiss }: { result: Result | null; onDismiss: () => void }) {
  if (!result) return null;
  const meta = COPY[result.status];
  const tone =
    meta.kind === "success" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
    : meta.kind === "warn"  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
    :                          "bg-destructive/10 text-destructive border-destructive/30";
  const Icon = meta.kind === "success" ? CheckCircle2 : meta.kind === "warn" ? Clock : meta.kind === "error" ? XCircle : AlertTriangle;
  return (
    <div
      role="status"
      data-status={result.status}
      className={`flex items-start gap-3 p-4 rounded-xl border ${tone}`}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" strokeWidth={2} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[14px] font-semibold">{meta.title}</p>
        <p className="text-[12px] leading-relaxed opacity-90">{meta.body(result)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}
