import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { logger, supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, XCircle, ScanLine, Camera, CameraOff, Loader2, Ticket,
  AlertTriangle, Clock, ArrowRight,
} from "lucide-react";

type Status = "ok" | "already" | "checked_out" | "not_found" | "wrong_event" | "expired" | "cancelled" | "invalid" | "error";

type Result = {
  status: Status;
  name?: string | null;
  ticket?: string | null;
  checked_in_at?: string | null;
  message?: string;
};

const COPY: Record<Status, { title: string; body: (r: Result) => string; kind: "success" | "warn" | "error" }> = {
  ok:          { kind: "success", title: "You're checked in!",        body: (r) => `Welcome${r.name ? `, ${r.name}` : ""}${r.ticket ? ` · ${roleLabel(r.ticket)}` : ""}.` },
  already:     { kind: "warn",    title: "Already checked in",        body: (r) => `${r.name ?? "This ticket"} was checked in${r.checked_in_at ? ` at ${new Date(r.checked_in_at).toLocaleString()}` : ""}.` },
  checked_out: { kind: "success", title: "Checked out",                body: (r) => `See you next time${r.name ? `, ${r.name}` : ""}. Scan again to check back in.` },
  not_found:   { kind: "error",   title: "Ticket not found",           body: () => "We couldn't find this ticket. Double-check the QR or ask the front desk." },
  wrong_event: { kind: "error",   title: "Wrong event",                body: () => "This ticket is for a different event." },
  expired:     { kind: "error",   title: "Tracking closed",            body: () => "This event ended more than 2 hours ago, so check-in is closed." },
  cancelled:   { kind: "error",   title: "Registration cancelled",     body: () => "This registration was cancelled and can't be used." },
  invalid:     { kind: "error",   title: "Invalid code",               body: () => "That doesn't look like a valid ticket code." },
  error:       { kind: "error",   title: "Something went wrong",       body: (r) => r.message || "Please try again in a moment." },
};

function roleLabel(ticket: string): string {
  if (ticket === "speaker") return "Speaker";
  if (ticket === "sponsor") return "Sponsor";
  return "Attendee";
}

export default function SelfCheckInPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [params] = useSearchParams();
  const [eventTitle, setEventTitle] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState("");
  const [lastMethod, setLastMethod] = useState<"camera" | "manual" | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef("self-checkin-" + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!eventId) return;
    supabase.from("events").select("title").eq("id", eventId).maybeSingle()
      .then(({ data }) => { if (data?.title) setEventTitle(data.title); });
  }, [eventId]);

  useEffect(() => {
    const t = params.get("token");
    if (t) submit(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = async () => {
    try { if (scannerRef.current?.isScanning) await scannerRef.current.stop(); } catch { /* ignore */ }
    setScanning(false);
  };

  const start = async () => {
    setResult(null);
    setLastMethod("camera");
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw Object.assign(new Error("Camera requires HTTPS"), { name: "InsecureContextError" });
      }
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
        async (text) => { await stop(); submit(text); },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      const e = err as { name?: string; message?: string } | null;
      const message =
        e?.name === "InsecureContextError"
          ? "The camera only works on HTTPS. Open this page via the secure URL."
          : e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError"
            ? "Camera permission denied. Allow camera access in your browser, then try again."
            : e?.name === "NotFoundError"
              ? "We couldn't find a camera on this device. Use manual entry below."
              : e?.name === "NotReadableError"
                ? "Another app or tab is using the camera. Close it and try again."
                : "Could not access the camera. Use manual entry below.";
      logger.warn("self check-in camera start failed", {
        error_name: e?.name ?? null,
        error_message: e?.message ?? String(err ?? ""),
      });
      setResult({ status: "error", message });
    }
  };

  useEffect(() => () => { stop(); }, []);

  const reset = async (forceMethod?: "camera" | "manual") => {
    setResult(null);
    const method = forceMethod ?? lastMethod;
    setManual("");
    if (method === "camera") {
      await start();
    } else if (method === "manual") {
      setTimeout(() => manualRef.current?.focus(), 0);
    }
  };

  const submit = async (raw: string) => {
    let token = raw.trim();
    try {
      const u = new URL(token);
      const t = u.searchParams.get("token") || u.searchParams.get("join");
      if (t) token = t;
    } catch { /* not a URL */ }
    if (!token) return;
    if (!lastMethod) setLastMethod("manual");

    setBusy(true);
    const { data, error } = await supabaseRpc("self_check_in", { p_token: token, p_event_id: eventId ?? null });
    setBusy(false);

    if (error) {
      logger.warn("self_check_in failed", {
        rpc: "self_check_in",
        event_id: eventId ?? null,
        error_message: error.message,
      });
      setResult({ status: "error", message: error.message });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { setResult({ status: "not_found" }); return; }
    setResult({
      status: (row.status as Status) ?? "error",
      name: row.name,
      ticket: row.ticket_type,
      checked_in_at: row.checked_in_at,
    });
  };

  // Full-screen confirmation when there's a result
  if (result) {
    const meta = COPY[result.status];
    const colors =
      meta.kind === "success" ? "from-green-500/15 to-green-500/5 border-green-500/30 text-green-700 dark:text-green-400"
      : meta.kind === "warn"  ? "from-amber-500/15 to-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400"
      :                         "from-destructive/15 to-destructive/5 border-destructive/30 text-destructive";
    const Icon = meta.kind === "success" ? CheckCircle2 : meta.kind === "warn" ? Clock : meta.kind === "error" ? XCircle : AlertTriangle;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
        <div className={`w-full max-w-md rounded-2xl border bg-gradient-to-b p-8 text-center ${colors}`}>
          <Icon className="h-16 w-16 mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold mb-2 text-foreground">{meta.title}</h1>
          <p className="text-[14px] text-muted-foreground">{meta.body(result)}</p>
          {eventTitle && <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-4">{eventTitle}</p>}
        </div>
        <Button onClick={() => reset()} className="mt-6 gap-2" size="lg">
          <ScanLine className="h-4 w-4" /> {meta.kind === "success" ? "Scan another" : "Try again"} <ArrowRight className="h-4 w-4" />
        </Button>
        {meta.kind !== "success" && (
          <button
            onClick={() => reset("manual")}
            className="mt-3 text-[12px] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Enter code instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-10">
      <div className="w-full max-w-xl space-y-6">
        <header className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Self check-in</p>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">{eventTitle || "Event check-in"}</h1>
          <p className="text-[13px] sm:text-[14px] text-muted-foreground">Scan your ticket QR code to check yourself in.</p>
        </header>

        {/* Scanner — sized to the viewport so it fills the screen on
            phones and stays generous on tablets / kiosk displays.
            Capped at min(90vmin, 560px) so it never overflows. */}
        <div
          id={containerId.current}
          className="w-full aspect-square mx-auto rounded-xl overflow-hidden border border-border bg-muted/40"
          style={{ maxWidth: "min(90vmin, 560px)" }}
        />

        <div className="flex gap-2 max-w-md mx-auto w-full">
          {!scanning ? (
            <Button onClick={start} className="flex-1 gap-2" disabled={busy} size="lg">
              <Camera className="h-4 w-4" /> Start camera
            </Button>
          ) : (
            <Button onClick={stop} variant="outline" className="flex-1 gap-2" size="lg">
              <CameraOff className="h-4 w-4" /> Stop camera
            </Button>
          )}
        </div>

        <div className="space-y-2 max-w-md mx-auto w-full">
          <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" /> Or enter your ticket code manually
          </p>
          <div className="flex gap-2">
            <Input ref={manualRef} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste code or link" />
            <Button onClick={() => submit(manual)} disabled={busy || !manual.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
