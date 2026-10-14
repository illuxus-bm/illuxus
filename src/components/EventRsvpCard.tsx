import { useEffect, useRef, useState } from "react";
import { ConsentCheckbox, CONSENT_REQUIRED_MESSAGE, LegalLink } from "@/components/ConsentCheckbox";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarPlus, MailWarning, Video, Copy, Users2, Share2,
} from "lucide-react";
import { buildIcsBlobUrl } from "@/lib/ics";
import { formatMoney } from "@/lib/currency";
import { publicUrl } from "@/lib/publicUrl";
import { GuestConfirmationPanel, GuestRegistrationForm } from "@/components/event/GuestRegistration";
import { loadGuestConfirmation, storeGuestConfirmation, type GuestConfirmation } from "@/lib/guest-registration";

interface RsvpEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  capacity: number | null;
  tickets_sold: number | null;
  price: number | null;
  currency?: string | null;
  requires_approval: boolean | null;
  timezone?: string | null;
  event_format?: string | null;
}

type RsvpState = "idle" | "approved" | "pending" | "waitlisted" | "declined";

const subBtn = "flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-[13.5px] font-semibold transition-colors hover:bg-muted";
const barBtn = "flex h-[46px] shrink-0 items-center justify-center rounded-[14px] bg-primary px-5 text-[14.5px] font-semibold text-primary-foreground";

/**
 * Lu.ma-style registration card. Shown on the public event page above the
 * About section. Renders only the registration UX (state + CTA); date / venue
 * details live in the page header above it.
 *
 * When `isEventOver` is true new registrations are blocked and the card
 * shows an "Event has ended" notice instead of a Register button.
 *
 * Signed-in visitors register in one click from their profile. Visitors who
 * are not signed in fill a short form instead (no account needed) and see a
 * confirmation here; their email carries an optional link to set up an
 * account afterwards.
 */
export default function EventRsvpCard({
  event,
  accentColor,
  isEventOver = false,
  utmParams = {},
  organiserHref,
}: {
  event: RsvpEvent;
  accentColor?: string;
  isEventOver?: boolean;
  /** Where "Contact organiser" leads a declined visitor (the organiser's page). */
  organiserHref?: string;
  /** UTM params captured from the page URL — saved with the registration. */
  utmParams?: import("@/lib/utm").UtmParams;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<RsvpState>("idle");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [hasWebinar, setHasWebinar] = useState(false);
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Agreement to the Terms and Privacy Policy, asked for before registering.
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  // Phones: once the card has scrolled off the top, a bar at the bottom of
  // the screen keeps the status and the main action in reach.
  const cardRef = useRef<HTMLElement>(null);
  const [barShown, setBarShown] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      setBarShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /**
   * Live count of non-cancelled registrations for this event. The
   * `events.tickets_sold` column is not maintained by any trigger, so we
   * compute capacity usage from the `registrations` table directly. A
   * realtime subscription keeps this in sync if someone else registers
   * while the page is open.
   */
  const [goingCount, setGoingCount] = useState<number>(0);
  const emailVerified = !!user?.email_confirmed_at;
  // A guest registration made in this tab: its confirmation is shown in
  // place of the form (and again after a refresh).
  const [guestConfirmation, setGuestConfirmation] = useState<GuestConfirmation | null>(() => loadGuestConfirmation(event.id));
  const [resendGuestDetails, setResendGuestDetails] = useState<(() => Promise<boolean>) | null>(null);
  const updateGuestConfirmation = (next: GuestConfirmation | null) => {
    setGuestConfirmation(next);
    storeGuestConfirmation(event.id, next);
  };
  const showGuestConfirmation = !user && !!guestConfirmation;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Check by user_id first, then fall back to email match for organizer-created registrations
      // that may not yet be linked (e.g. edge function failed to set user_id).
      let { data } = await supabase
        .from("registrations")
        .select("id, approval_status, status, join_token, user_id")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data && user.email) {
        const { data: byEmail } = await supabase
          .from("registrations")
          .select("id, approval_status, status, join_token, user_id")
          .eq("event_id", event.id)
          .eq("email", user.email.toLowerCase())
          .is("user_id", null)
          .maybeSingle();
        if (byEmail) {
          // Link this orphan registration to the current user
          await supabase.from("registrations").update({ user_id: user.id }).eq("id", byEmail.id);
          data = byEmail;
        }
      }

      if (cancelled || !data) return;
      setRegistrationId(data.id);
      setJoinToken((data as { join_token?: string }).join_token ?? null);
      const ap = (data as { approval_status?: string }).approval_status;
      setState(((ap as RsvpState) || "approved"));
    })();
    return () => { cancelled = true; };
  }, [event.id, user]);

  // Check if a webinar session exists for this event so we can surface the
  // "Join webinar" CTA after registration.
  useEffect(() => {
    if (event.event_format === "physical") return;
    let cancelled = false;
    supabase.from("webinar_sessions").select("id").eq("event_id", event.id).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setHasWebinar(!!data); });
    return () => { cancelled = true; };
  }, [event.id, event.event_format]);

  // Resolve this event's community slug once the user is registered. The
  // SECURITY DEFINER `community_resolve_event` RPC works for any signed-in
  // user, and the auto-join trigger has already added them as a member.
  useEffect(() => {
    if (!user || state !== "approved") return;
    let cancelled = false;
    (async () => {
      const { data: cid } = await supabaseRpc("community_resolve_event" as never, {
        _event_id: event.id,
      } as never);
      if (cancelled || !cid) return;
      const { data: comm } = await supabase
        .from("communities" as never)
        .select("slug")
        .eq("id", cid as string)
        .maybeSingle();
      if (cancelled) return;
      const slug = (comm as { slug?: string } | null)?.slug ?? null;
      setCommunitySlug(slug);
    })();
    return () => { cancelled = true; };
  }, [event.id, user, state]);

  // Live registration count → drives the "X tickets left" / "Sold out" UI.
  // We count rows that aren't cancelled / declined; this matches what an
  // organizer would consider "going" capacity.
  useEffect(() => {
    let cancelled = false;
    const loadCount = async () => {
      const { count } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .neq("status", "cancelled")
        .neq("approval_status", "declined")
        .neq("approval_status", "waitlisted");
      if (!cancelled && typeof count === "number") setGoingCount(count);
    };
    loadCount();
    const channel = supabase
      .channel(`rsvp-count-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${event.id}` },
        loadCount,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [event.id]);

  const hasCapacity = !!event.capacity && event.capacity > 0;
  const remaining = hasCapacity ? Math.max(0, (event.capacity ?? 0) - goingCount) : null;
  const isFull = hasCapacity && remaining === 0;

  const handleRsvp = async () => {
    if (isEventOver) return;
    // Visitors who are not signed in use the guest form below instead.
    if (!user) return;
    if (!emailVerified) {
      toast({
        title: "Verify your email first",
        description: "Open the link we sent to your inbox, then try again.",
        variant: "destructive",
      });
      return;
    }
    if (!agreed) {
      setConsentError(CONSENT_REQUIRED_MESSAGE);
      return;
    }
    // Defense-in-depth: if the live count says we're at capacity, refuse the
    // submit even though the button should already be disabled.
    if (isFull) {
      toast({
        title: "Sold out",
        description: "All tickets for this event have been claimed.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    // Pull the user's profile so the registration row is pre-populated with
    // the same fields the user already filled in on Settings → Profile.
    const { data: profile } = await supabase
      .rpc("get_my_profile");
    const p = (profile || {}) as Record<string, string | null>;
    const nameFromProfile = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const initial: RsvpState = isFull
      ? "waitlisted"
      : event.requires_approval
        ? "pending"
        : "approved";
    // The DB trigger will normalize approval_status (paid -> approved,
    // free + requires_approval -> pending). We still send our best guess.
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        event_id: event.id,
        user_id: user.id,
        email: user.email ?? "",
        name: nameFromProfile || p.display_name || user.email?.split("@")[0] || "Guest",
        ticket_type: "general",
        status: "confirmed",
        approval_status: initial,
        title: p.title,
        first_name: p.first_name,
        last_name: p.last_name,
        designation: p.designation,
        company: p.company,
        mobile_country_code: p.mobile_country_code,
        mobile_number: p.mobile_number,
        linkedin_url: p.linkedin_url,
        company_website: p.company_website,
        company_employee_count: p.company_employee_count,
        industry: p.industry,
        // First-touch UTM attribution
        utm_source:   utmParams.utm_source   ?? null,
        utm_medium:   utmParams.utm_medium   ?? null,
        utm_campaign: utmParams.utm_campaign ?? null,
        utm_content:  utmParams.utm_content  ?? null,
        utm_term:     utmParams.utm_term     ?? null,
      } as never)
      .select("id, approval_status, join_token")
      .single();
    if (error) {
      toast({ title: "Could not register", description: error.message, variant: "destructive" });
    } else {
      setRegistrationId(data.id);
      setJoinToken((data as { join_token?: string }).join_token ?? null);
      const finalState = (data.approval_status as RsvpState) || initial;
      setState(finalState);
      // Clear stored UTM so a second registration in this tab isn't credited
      // to the same campaign.
      import("@/lib/utm").then(({ clearStoredUtm }) => clearStoredUtm()).catch(() => {});
      toast({
        title:
          finalState === "approved"
            ? "You're going!"
            : finalState === "waitlisted"
              ? "Added to the waitlist"
              : "Request sent",
        description:
          finalState === "approved"
            ? hasWebinar
              ? "Your unique webinar join link is ready below."
              : "Your ticket is ready in My Events."
            : finalState === "waitlisted"
              ? "We'll let you know if a spot opens."
              : "The host will let you know when you're approved.",
      });

      // Fire ticket confirmation email in the background. The registration row
      // already exists so a delivery failure is non-fatal — the attendee can
      // always view their ticket at /t/<id> even without the email. We DO
      // surface failures via a discreet warning toast so the user (and we)
      // can tell the function isn't responding instead of silently swallowing
      // every error. Reads `error.context` (the response body) on non-2xx
      // so the real backend error is shown, not the SDK's generic message.
      if (finalState !== "waitlisted") {
        void supabase.functions
          .invoke("send-ticket-email", { body: { registration_id: data.id } })
          .then(async ({ data: emailData, error: emailErr }) => {
            type R = { ok?: boolean; delivered?: boolean; error?: string; note?: string; step?: string };
            if (emailErr) {
              let detail = emailErr.message ?? "Edge function unreachable. Deploy send-ticket-email.";
              const ctx = (emailErr as { context?: Response }).context;
              if (ctx && typeof ctx.text === "function") {
                try {
                  const txt = await ctx.text();
                  if (txt) {
                    const parsed = JSON.parse(txt) as Partial<R>;
                    detail = parsed.error ?? (parsed.step ? `step=${parsed.step}` : detail);
                  }
                } catch { /* keep generic detail */ }
              }
              toast({ title: "Ticket email not sent", description: detail, variant: "destructive" });
              return;
            }
            const result = emailData as R | null;
            if (result?.error) {
              toast({ title: "Ticket email not sent", description: result.error, variant: "destructive" });
              return;
            }
            if (result?.delivered === false) {
              toast({
                title: "Ticket email skipped",
                description: result.note ?? "SMTP not configured in Supabase secrets.",
              });
            }
            // Success path stays quiet — the user already saw the "You're going!" toast.
          });
      }
    }
    setSubmitting(false);
  };

  const cancelRsvp = async () => {
    if (!registrationId || !user) return;
    setSubmitting(true);
    // Use direct DELETE — the existing RLS policy "Attendee cancel own" lets the user delete their own row
    const { error } = await supabase
      .from("registrations")
      .delete()
      .eq("id", registrationId)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Could not cancel", description: error.message, variant: "destructive" });
    } else {
      setRegistrationId(null);
      setState("idle");
      setJoinToken(null);
      toast({ title: "RSVP cancelled" });
    }
    setSubmitting(false);
  };

  const isApprovalFlow = !!event.requires_approval;
  const idle = state === "idle" && !showGuestConfirmation;
  const registerLabel = event.requires_approval
    ? "Request to Join"
    : event.price && Number(event.price) > 0
      ? `Register · ${formatMoney(event.price, event.currency || undefined)}`
      : "Register";
  const eventDateText = (() => {
    const d = new Date(event.date);
    if (Number.isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: event.timezone || undefined }).format(d);
    } catch {
      return d.toLocaleString();
    }
  })();

  // What the card says for each situation: a status pill, a heading and a line.
  type Tone = "good" | "warn" | "bad" | "plain";
  const status: { pill: string; tone: Tone; title: string; text: string } | null =
    showGuestConfirmation && guestConfirmation ? null
    : state === "approved" ? { pill: "Confirmed", tone: "good", title: "You’re going", text: "Your seat is confirmed. Show your QR ticket at the venue desk to check in." }
    : state === "pending" ? { pill: "Pending", tone: "warn", title: "Request sent", text: "The organiser reviews every request and confirms by email." }
    : state === "waitlisted" ? { pill: "Waitlist", tone: "plain", title: "You’re on the waitlist", text: "We’ll let you know if a seat opens up." }
    : state === "declined" ? { pill: "Declined", tone: "bad", title: "Your request wasn’t approved", text: "The organiser reviews every request. If you think this is a mistake, contact them and they can take another look." }
    : isEventOver ? { pill: "Ended", tone: "plain", title: "This event has ended", text: "Registration is closed." }
    : isFull ? { pill: "Sold out", tone: "plain", title: "Sold out", text: `All ${event.capacity} tickets have been claimed.` }
    : isApprovalFlow ? { pill: "Approval required", tone: "good", title: "Request your seat", text: "The organiser reviews each request and confirms by email." }
    : event.price && Number(event.price) > 0
      ? { pill: formatMoney(event.price, event.currency || undefined), tone: "good", title: "Get your ticket", text: "Register below to book your seat." }
      : { pill: "Free", tone: "good", title: "Register for free", text: "Register below to save your seat." };
  const pillStyle: Record<Tone, string> = {
    good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bad: "bg-destructive/10 text-destructive",
    plain: "bg-muted text-muted-foreground",
  };
  const accentButton = accentColor ? { backgroundColor: accentColor, color: "#fff" } : undefined;

  const addToCalendar = () => {
    const href = buildIcsBlobUrl({
      uid: event.id,
      title: event.title,
      location: [event.venue, event.location].filter(Boolean).join(", ") || undefined,
      start: event.date,
      end: event.end_date,
      url: window.location.href,
    });
    const a = document.createElement("a");
    a.href = href;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };
  const shareEvent = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); }
    } catch { /* dismissed */ }
  };

  const toCard = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const shortDate = (() => {
    const d = new Date(event.date);
    if (Number.isNaN(d.getTime())) return "";
    let day = "";
    try {
      day = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: event.timezone || undefined }).format(d);
    } catch {
      day = d.toDateString();
    }
    return [day, event.location || event.venue].filter(Boolean).join(" · ");
  })();
  const barAction =
    state === "approved" && registrationId ? <a href={`/t/${registrationId}`} className={barBtn} style={accentButton}>View ticket</a>
    : state === "declined" && organiserHref ? <a href={organiserHref} className={`${barBtn} !bg-foreground !text-background`}>Contact organiser</a>
    : state === "idle" && !isEventOver && !isFull
      ? <button type="button" onClick={toCard} className={barBtn} style={accentButton}>{isApprovalFlow ? "Request to join" : "Register"}</button>
      : <button type="button" onClick={toCard} className={`${barBtn} !bg-card !text-foreground border border-border`}>Details</button>;

  return (
    // `text-card-foreground` resets inherited text color so the card stays
    // readable even when the parent page sets a preset text color (e.g. cream
    // on the Festival preset would otherwise leak onto the white card bg).
    <aside
      ref={cardRef}
      className="scroll-mt-28 rounded-[20px] border border-border bg-card p-[18px] text-card-foreground lg:rounded-3xl lg:p-[22px] lg:shadow-[0_1px_2px_rgba(16,23,22,.04),0_18px_40px_-26px_rgba(16,23,22,.3)]"
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Registration</span>
          {status && <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${pillStyle[status.tone]}`}>{status.pill}</span>}
        </div>

        {user && !emailVerified && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <MailWarning className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-snug">
              <div className="font-semibold text-amber-700 dark:text-amber-300">Verify your email to register</div>
              <div className="text-muted-foreground">We sent a link to {user.email}. Open it, then refresh.</div>
            </div>
          </div>
        )}

        {status && (
          <div>
            <h3 className="mb-1 text-[17px] font-semibold lg:text-[19px]">{status.title}</h3>
            <p className="m-0 text-[14px] leading-[1.55] text-muted-foreground">{status.text}</p>
          </div>
        )}

        {showGuestConfirmation && guestConfirmation ? (
          <GuestConfirmationPanel
            confirmation={guestConfirmation}
            eventId={event.id}
            eventTitle={event.title}
            eventDateText={eventDateText}
            onResendDetails={resendGuestDetails ?? undefined}
            onUpdate={updateGuestConfirmation}
            onStartOver={() => { setResendGuestDetails(null); updateGuestConfirmation(null); }}
          />
        ) : state === "approved" ? (
          <div className="flex flex-col gap-2.5">
            {registrationId && (
              <Button asChild className="h-12 w-full rounded-[14px] text-[14.5px] font-semibold" style={accentButton}>
                <a href={`/t/${registrationId}`}>View ticket</a>
              </Button>
            )}
            {event.event_format !== "physical" && (() => {
              // Always show a Join Webinar entry-point for virtual / hybrid events.
              // - Personal token form when both webinar exists AND we have a join_token
              //   (works without sign-in, single-device).
              // - Otherwise a generic "Open webinar room" link to /e/:id/live which
              //   gracefully handles the "not live yet" state for the user.
              const hasPersonalLink = hasWebinar && joinToken;
              const liveHref = hasPersonalLink
                ? `/e/${event.id}/live?join=${joinToken}`
                : `/e/${event.id}/live`;
              return (
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <Video className="h-3.5 w-3.5" />
                    {hasPersonalLink ? "Your webinar link" : "Webinar room"}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-snug">
                    {hasPersonalLink
                      ? "Personal link — works on one device at a time. Don't share it."
                      : hasWebinar
                        ? "Open the webinar room. Sign in if prompted."
                        : "The room opens automatically when the host goes live. You can bookmark this link now."}
                  </p>
                  <div className="flex gap-2">
                    <Button asChild size="sm" className="flex-1 h-8 text-[12px]">
                      <a href={liveHref} target="_blank" rel="noreferrer">
                        {hasPersonalLink ? "Join webinar" : "Open webinar room"}
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[12px]"
                      onClick={() => {
                        navigator.clipboard.writeText(publicUrl(liveHref));
                        toast({ title: "Join link copied" });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-2">
              {communitySlug && (
                <Button asChild variant="outline" className="h-10 flex-1 gap-1.5 rounded-xl text-[13px]">
                  <a href={`/community/${communitySlug}/feed`}>
                    <Users2 className="h-3.5 w-3.5" />
                    Community
                  </a>
                </Button>
              )}
              <Button onClick={cancelRsvp} variant="outline" className="h-10 flex-1 rounded-xl text-[13px]" disabled={submitting}>
                Cancel registration
              </Button>
            </div>
          </div>
        ) : state === "pending" ? (
          <Button onClick={cancelRsvp} variant="outline" className="h-11 w-full rounded-xl text-[13.5px]" disabled={submitting}>
            Withdraw request
          </Button>
        ) : state === "waitlisted" ? (
          <Button onClick={cancelRsvp} variant="outline" className="h-11 w-full rounded-xl text-[13.5px]" disabled={submitting}>
            Leave waitlist
          </Button>
        ) : state === "declined" ? (
          organiserHref ? (
            <Button asChild className="h-12 w-full rounded-[14px] bg-foreground text-[14.5px] font-semibold text-background hover:bg-foreground/90">
              <a href={organiserHref}>Contact organiser</a>
            </Button>
          ) : null
        ) : isEventOver ? null : !user && !isFull ? (
          // Not signed in: register with a short form, no account needed.
          <GuestRegistrationForm
            eventId={event.id}
            requiresApproval={isApprovalFlow}
            submitLabel={registerLabel}
            accentColor={accentColor}
            utmParams={utmParams}
            signInHref={`/login?next=${encodeURIComponent(window.location.pathname)}`}
            onRegistered={(confirmation, resend) => {
              setResendGuestDetails(() => resend);
              updateGuestConfirmation(confirmation);
              // A second registration in this tab isn't credited to the same campaign.
              import("@/lib/utm").then(({ clearStoredUtm }) => clearStoredUtm()).catch(() => {});
            }}
          />
        ) : (
          <>
          {/* Signed in and able to register. */}
          {user && !isFull && (
            <ConsentCheckbox
              checked={agreed}
              onCheckedChange={(value) => {
                setAgreed(value);
                if (value) setConsentError(null);
              }}
              error={consentError}
            >
              I agree to the <LegalLink to="/terms">Terms</LegalLink>, <LegalLink to="/refunds">Refund Policy</LegalLink>{" "}
              and <LegalLink to="/privacy">Privacy Policy</LegalLink>, and to my registration details being shared with
              the event organiser.
            </ConsentCheckbox>
          )}
          <Button
            onClick={handleRsvp}
            disabled={submitting || isFull}
            className="h-12 w-full rounded-[14px] text-[14.5px] font-semibold"
            style={!isFull ? accentButton : undefined}
          >
            {isFull
              ? "Sold Out"
              : event.requires_approval
                ? "Request to join"
                : event.price && Number(event.price) > 0
                  ? `Register · ${formatMoney(event.price, event.currency || undefined)}`
                  : "One-click register"}
          </Button>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={addToCalendar} className={subBtn}>
            <CalendarPlus className="h-[17px] w-[17px]" /> Calendar
          </button>
          <button type="button" onClick={shareEvent} className={subBtn}>
            <Share2 className="h-[17px] w-[17px]" /> Share
          </button>
        </div>
      </div>

      {/* Phone bottom bar */}
      {status && (
        <div
          role="region"
          aria-label="Registration"
          className={`fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] text-card-foreground shadow-[0_-10px_30px_-18px_rgba(16,23,22,.35)] backdrop-blur-md transition-transform duration-200 md:hidden ${barShown ? "translate-y-0" : "translate-y-[110%]"}`}
        >
          <div className="flex min-w-0 flex-1 flex-col leading-[1.35]">
            <b className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
              {(status.tone === "good" || status.tone === "bad") && (
                <i className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${status.tone === "bad" ? "bg-destructive" : "bg-emerald-500"}`} />
              )}
              {status.title}
            </b>
            <span className="truncate text-[12.5px] text-muted-foreground">{shortDate}</span>
          </div>
          {barAction}
        </div>
      )}
    </aside>
  );
}