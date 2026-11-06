import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatEventDateTime } from "@/lib/datetime";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { PullToRefresh } from "@/components/native/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, CalendarDays, MapPin, CheckCircle2, Copy, Check, Download, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { eventPublicPath } from "@/lib/event-routes";
import { downloadTicketPdf } from "@/lib/ticket-pdf";
import { logger, supabaseRpc } from "@/lib/observability";
import { toast } from "sonner";

interface TicketRow {
  id: string;
  qr_code: string | null;
  approval_status: string;
  checked_in: boolean;
  ticket_type: string;
  amount_paid: number | null;
  name: string | null;
  email: string | null;
  user_id: string | null;
  /** Whether this registrant lets the event's sponsors have their contact details. */
  sponsor_share_consent: boolean | null;
  events: {
    id: string;
    title: string;
    slug: string | null;
    date: string;
    venue: string | null;
    location: string | null;
    image_url: string | null;
    banner_landscape_url: string | null;
    banner_portrait_url: string | null;
    timezone: string | null;
    organizations?: { name?: string | null; slug?: string | null; subdomain?: string | null } | null;
  } | null;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [row, setRow] = useState<TicketRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!row || !row.events) return;
    setDownloading(true);
    try {
      await downloadTicketPdf({
        attendeeName: row.name ?? "",
        attendeeEmail: row.email ?? "",
        eventTitle: row.events.title,
        eventDate: row.events.date,
        venue: row.events.venue,
        location: row.events.location,
        ticketType: row.ticket_type,
        qrCodeValue: row.qr_code || row.id,
        registrationId: row.id,
        organizerName: row.events.organizations?.name ?? null,
      });
    } catch (err) {
      logger.error("ticket pdf download failed", {
        registration_id: row.id,
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Could not download ticket", {
        description: "Please try again in a moment.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const load = useCallback(async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from("registrations")
      .select("id, qr_code, approval_status, checked_in, ticket_type, amount_paid, name, email, user_id, sponsor_share_consent, events:events(id, title, slug, date, venue, location, image_url, banner_landscape_url, banner_portrait_url, timezone, organizations(name, slug, subdomain))")
      .eq("id", id)
      .maybeSingle();
    setRow(data as unknown as TicketRow);
    setLoading(false);
  }, [id, user]);

  useEffect(() => { void load(); }, [load]);

  const ev = row?.events ?? null;
  // Prefer the organizer-uploaded landscape banner for the ticket header
  // (16:9, matches the create/edit Design tab). Fall back to the square
  // listing thumbnail when no banner has been set so older events still
  // render an image.
  const headerImg = ev ? ev.banner_landscape_url || ev.image_url : null;
  const where = ev ? [ev.venue, ev.location].filter(Boolean).join(" · ") : "";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {/* Pull down to see a check-in made at the door. */}
      <PullToRefresh onRefresh={load} />
      <main className="max-w-md mx-auto px-4 pb-10 pt-2 sm:py-8">
        <Link to="/u/me/events" className="app-chrome inline-flex h-9 items-center gap-1 -ml-1.5 pl-1 pr-2.5 rounded-full text-[14px] font-medium text-muted-foreground hover:text-foreground mb-3">
          <ChevronLeft className="h-4 w-4" /> My tickets
        </Link>

        {loading ? (
          <Skeleton className="h-[520px] rounded-[28px]" />
        ) : !row || !ev ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
            Ticket not found.
          </div>
        ) : (
          <>
            {/* A pass: the event on top, a tear line, the code to scan below. */}
            <article className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_60px_-36px_rgb(0_0_0/0.45)]">
              <div className="relative">
                {headerImg ? (
                  <img src={headerImg} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" />
                ) : (
                  <div className="login-art w-full aspect-[16/9]" aria-hidden="true" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="text-[11px] uppercase tracking-widest font-semibold text-white/80 mb-1">
                    {ev.organizations?.name || "Event"}
                  </div>
                  <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white line-clamp-2">{ev.title}</h1>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pt-5 text-[13px]">
                <div className="col-span-2 flex items-start gap-2.5">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="sr-only">When</dt>
                    <dd className="font-medium">{formatEventDateTime(ev.date, ev.timezone)}</dd>
                  </div>
                </div>
                {where && (
                  <div className="col-span-2 flex items-start gap-2.5">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="sr-only">Where</dt>
                      <dd className="font-medium">{where}</dd>
                    </div>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Guest</dt>
                  <dd className="mt-0.5 font-medium truncate">{row.name || row.email || "You"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Ticket</dt>
                  <dd className="mt-0.5 font-medium capitalize truncate">{row.ticket_type}</dd>
                </div>
              </dl>

              {/* Tear line, with a notch cut out of each edge. */}
              <div className="relative my-5 h-6" aria-hidden="true">
                <span className="absolute left-0 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background" />
                <span className="absolute right-0 top-1/2 h-6 w-6 translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background" />
                <span className="absolute left-5 right-5 top-1/2 border-t-2 border-dashed border-border" />
              </div>

              <div className="px-5 pb-6">
                {row.approval_status === "approved" ? (
                  <div className="flex flex-col items-center">
                    {/* Always dark on white: door scanners misread inverted codes. */}
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                      <QRCodeSVG value={row.qr_code || row.id} size={200} bgColor="#ffffff" fgColor="#111111" level="M" />
                    </div>
                    {row.checked_in ? (
                      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                      </div>
                    ) : (
                      <p className="mt-4 text-[12px] text-muted-foreground">Show this at the door</p>
                    )}
                    {/*
                      Plain-text ticket code under the QR. Lets staff type
                      the code into the scanner's manual entry field if the
                      camera can't focus, or for the attendee to read out
                      at a desk.
                    */}
                    <TicketCodeDisplay code={row.qr_code || row.id} />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-center text-[13px] text-muted-foreground">
                    Your ticket appears here once the host {row.approval_status === "pending" ? "approves your request" : "promotes you from the waitlist"}.
                  </div>
                )}
              </div>
            </article>

            <div className="mt-4 flex gap-2.5">
              <Button asChild variant="outline" className="flex-1 h-11 rounded-full text-[14px]">
                <Link to={eventPublicPath(ev, ev.organizations?.subdomain || ev.organizations?.slug || null)}>Event page</Link>
              </Button>
              {row.approval_status === "approved" && (
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex-1 h-11 rounded-full text-[14px] gap-1.5"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> Save PDF
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Only the registrant can give or withdraw this (migration 079). */}
            {user && row.user_id === user.id && (
              <SponsorShareSetting registrationId={row.id} value={!!row.sponsor_share_consent}
                                   onChange={(v) => setRow((r) => (r ? { ...r, sponsor_share_consent: v } : r))} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Plain-text ticket code shown under the QR. Staff at the door can read
 * it out or copy it into the scanner's manual entry field when the
 * camera won't focus.
 */
function TicketCodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; the code text
      // is still selectable so the user can copy it manually.
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 w-full">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center mb-1.5">
        Ticket code
      </p>
      <div className="flex items-stretch gap-1.5">
        <div className="flex-1 px-3 py-2 rounded-xl border border-border bg-muted/40 font-mono text-[11px] tracking-tight break-all select-all text-center">
          {code}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy ticket code"}
          className="shrink-0 inline-flex items-center justify-center w-10 rounded-xl border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/70 text-center mt-1.5">
        Use this if the QR scanner can't read the code.
      </p>
    </div>
  );
}

/**
 * The registrant's answer to "share my contact details with this event's
 * sponsors", which they can change at any time. Withdrawing also takes the
 * details out of anything already shared (migration 079).
 */
function SponsorShareSetting({ registrationId, value, onChange }: { registrationId: string; value: boolean; onChange: (value: boolean) => void }) {
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setSaving(true);
    onChange(next);
    const { error } = await supabaseRpc("set_my_sponsor_share_consent" as never, { _registration: registrationId, _consent: next } as never);
    setSaving(false);
    if (error) {
      onChange(!next);
      toast.error("Couldn't save your choice", { description: "Please try again in a moment." });
      return;
    }
    toast.success(next ? "Sponsors can now see your contact details" : "Your contact details are no longer shared with sponsors");
  };

  return (
    <label className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-4">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">Share my contact details with sponsors</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
          Your email, mobile number and LinkedIn, so this event's sponsors can contact you. Sponsors always see your name,
          company and whether you attended.
        </span>
      </span>
      <Switch checked={value} disabled={saving} onCheckedChange={(v) => void change(v)} aria-label="Share my contact details with sponsors" />
    </label>
  );
}
