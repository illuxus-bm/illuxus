import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, CheckCircle2, Hourglass, XCircle, ShieldCheck, UserPlus, MailWarning, Video, Copy, Users2,
} from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { publicUrl } from "@/lib/publicUrl";

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

/**
 * Lu.ma-style registration card. Shown on the public event page above the
 * About section. Renders only the registration UX (state + CTA); date / venue
 * details live in the page header above it.
 *
 * When `isEventOver` is true new registrations are blocked and the card
 * shows an "Event has ended" notice instead of a Register button.
 */
export default function EventRsvpCard({
  event,
  accentColor,
  isEventOver = false,
  utmParams = {},
}: {
  event: RsvpEvent;
  accentColor?: string;
  isEventOver?: boolean;
  /** UTM params captured from the page URL — saved with the registration. */
  utmParams?: import("@/lib/utm").UtmParams;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<RsvpState>("idle");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [hasWebinar, setHasWebinar] = useState(false);
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Live count of non-cancelled registrations for this event. The
   * `events.tickets_sold` column is not maintained by any trigger, so we
   * compute capacity usage from the `registrations` table directly. A
   * realtime subscription keeps this in sync if someone else registers
   * while the page is open.
   */
  const [goingCount, setGoingCount] = useState<number>(0);
  const emailVerified = !!user?.email_confirmed_at;

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
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!emailVerified) {
      toast({
        title: "Verify your email first",
        description: "Open the link we sent to your inbox, then try again.",
        variant: "destructive",
      });
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

  return (
    // `text-card-foreground` resets inherited text color so the card stays
    // readable even when the parent page sets a preset text color (e.g. cream
    // on the Festival preset would otherwise leak onto the white card bg).
    <aside className="bg-card text-card-foreground border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Header band — Lu.ma "Registration" */}
      <div className="px-4 py-2.5 bg-muted/60 border-b border-border text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">
        Registration
      </div>

      <div className="p-5 space-y-4">
        {/* Event-over notice — replaces the registration flow for past events */}
        {isEventOver && state === "idle" && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-lg bg-secondary flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight">Event has ended</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                Registration for this event is now closed.
              </div>
            </div>
          </div>
        )}
        {user && !emailVerified && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <MailWarning className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-snug">
              <div className="font-semibold text-amber-700 dark:text-amber-300">Verify your email to register</div>
              <div className="text-muted-foreground">We sent a link to {user.email}. Open it, then refresh.</div>
            </div>
          </div>
        )}
        {/* State pill — mirrors Lu.ma's "Approval Required" header.
            When the event is sold out we show a single sold-out card
            regardless of the approval flow. */}
        {state === "idle" && isFull && !isEventOver && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-lg bg-secondary flex items-center justify-center">
              <XCircle className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight">Sold Out</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                All {event.capacity} tickets have been claimed for this event.
              </div>
            </div>
          </div>
        )}
        {isApprovalFlow && state === "idle" && !isFull && !isEventOver && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-lg bg-secondary flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight">Approval Required</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                Your registration is subject to host approval.
              </div>
              {hasCapacity && remaining !== null && remaining > 0 && (
                <div className="text-[11.5px] font-medium text-foreground/80 mt-1.5">
                  {remaining} {remaining === 1 ? "spot" : "spots"} left
                  <span className="text-muted-foreground font-normal">
                    {" "}· {goingCount}/{event.capacity} registered
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {!isApprovalFlow && state === "idle" && !isFull && !isEventOver && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-lg bg-secondary flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight">
                {event.price && Number(event.price) > 0 ? "Get Tickets" : "Free Registration"}
              </div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                Welcome! To join the event, please register below.
              </div>
              {/* Capacity indicator — only when the organizer set a hard cap. */}
              {hasCapacity && remaining !== null && remaining > 0 && (
                <div className="text-[11.5px] font-medium text-foreground/80 mt-1.5">
                  {remaining} {remaining === 1 ? "ticket" : "tickets"} left
                  <span className="text-muted-foreground font-normal">
                    {" "}· {goingCount}/{event.capacity} registered
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {state === "approved" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> You're going
            </div>
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
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
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
              {registrationId && (
                <Button asChild className="flex-1 h-9 text-[13px]" variant="default">
                  <a href={`/t/${registrationId}`}>View ticket</a>
                </Button>
              )}
              {communitySlug && (
                <Button asChild variant="outline" className="h-9 text-[13px] gap-1.5">
                  <a href={`/community/${communitySlug}/feed`}>
                    <Users2 className="h-3.5 w-3.5" />
                    Community
                  </a>
                </Button>
              )}
              <Button onClick={cancelRsvp} variant="outline" className="h-9 text-[13px]" disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        ) : state === "pending" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-amber-600">
              <Hourglass className="h-4 w-4" /> Request pending
            </div>
            <p className="text-[12px] text-muted-foreground">The host will review your request.</p>
            <Button onClick={cancelRsvp} variant="outline" className="w-full h-9 text-[13px]" disabled={submitting}>
              Withdraw request
            </Button>
          </div>
        ) : state === "waitlisted" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <CalendarDays className="h-4 w-4" /> On the waitlist
            </div>
            <p className="text-[12px] text-muted-foreground">We'll notify you if a spot opens.</p>
            <Button onClick={cancelRsvp} variant="outline" className="w-full h-9 text-[13px]" disabled={submitting}>
              Leave waitlist
            </Button>
          </div>
        ) : state === "declined" ? (
          <div className="flex items-center gap-2 text-[13px] font-medium text-destructive">
            <XCircle className="h-4 w-4" /> Request declined
          </div>
        ) : isEventOver ? (
          // Event already over — show a muted disabled button instead of Register
          <Button
            disabled
            className="w-full h-11 text-[14px] font-semibold opacity-50 cursor-not-allowed"
            variant="outline"
          >
            Registration closed
          </Button>
        ) : (
          <Button
            onClick={handleRsvp}
            disabled={submitting || isFull}
            className="w-full h-11 text-[14px] font-semibold"
            style={accentColor && !isFull ? { backgroundColor: accentColor, color: "#fff" } : undefined}
          >
            {isFull
              ? "Sold Out"
              : event.requires_approval
                ? "Request to Join"
                : event.price && Number(event.price) > 0
                  ? `Register · ${formatMoney(event.price, event.currency || undefined)}`
                  : "One-Click Register"}
          </Button>
        )}
      </div>
    </aside>
  );
}