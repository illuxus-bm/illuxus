import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatEventDateTime } from "@/lib/datetime";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CalendarDays, MapPin, CheckCircle2, Copy, Check } from "lucide-react";
import { eventPublicPath } from "@/lib/event-routes";

interface TicketRow {
  id: string;
  qr_code: string | null;
  approval_status: string;
  checked_in: boolean;
  ticket_type: string;
  amount_paid: number | null;
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

  useEffect(() => {
    if (!id || !user) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("id, qr_code, approval_status, checked_in, ticket_type, amount_paid, events:events(id, title, slug, date, venue, location, image_url, banner_landscape_url, banner_portrait_url, timezone, organizations(name, slug, subdomain))")
        .eq("id", id)
        .maybeSingle();
      if (cancel) return;
      setRow(data as unknown as TicketRow);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [id, user]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-md mx-auto px-4 py-8">
        <Link to="/u/me/events" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> All events
        </Link>

        {loading ? (
          <Skeleton className="h-[420px] rounded-2xl" />
        ) : !row || !row.events ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
            Ticket not found.
          </div>
        ) : (
          <article className="bg-card border border-border rounded-2xl overflow-hidden">
            {(() => {
              // Prefer the organizer-uploaded landscape banner for the
              // ticket header (16:9, matches the create/edit Design tab).
              // Fall back to the square listing thumbnail when no banner
              // has been set so older events still render an image.
              const headerImg = row.events.banner_landscape_url || row.events.image_url;
              if (!headerImg) return null;
              return (
                <img
                  src={headerImg}
                  alt={row.events.title}
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                />
              );
            })()}
            <div className="p-6">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                {row.events.organizations?.name || "Event"}
              </div>
              <h1 className="text-xl font-semibold tracking-tight mb-3">{row.events.title}</h1>
              <div className="space-y-1.5 text-[13px] text-muted-foreground mb-5">
                <div className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatEventDateTime(row.events.date, row.events.timezone)}</div>
                {(row.events.venue || row.events.location) && (
                  <div className="inline-flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5" />{[row.events.venue, row.events.location].filter(Boolean).join(" · ")}</div>
                )}
              </div>

              {row.approval_status === "approved" ? (
                <div className="rounded-xl border border-border bg-background p-5 flex flex-col items-center">
                  <QRCodeSVG value={row.qr_code || row.id} size={180} bgColor="transparent" fgColor="currentColor" />
                  <div className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{row.ticket_type} ticket</div>
                  {row.checked_in && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                    </div>
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
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted-foreground">
                  Your ticket appears here once the host {row.approval_status === "pending" ? "approves your request" : "promotes you from the waitlist"}.
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <Button asChild variant="outline" className="flex-1 h-9 text-[13px]">
                  <Link to={eventPublicPath(row.events, row.events.organizations?.subdomain || row.events.organizations?.slug || null)}>Event page</Link>
                </Button>
              </div>
            </div>
          </article>
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
        <div className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-muted/40 font-mono text-[11px] tracking-tight break-all select-all text-center">
          {code}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy ticket code"}
          className="shrink-0 inline-flex items-center justify-center w-8 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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