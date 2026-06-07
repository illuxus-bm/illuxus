import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, CheckCircle2, Hourglass, XCircle, ShieldCheck, UserPlus, MailWarning, Video, Copy,
} from "lucide-react";
import { formatMoney } from "@/lib/currency";

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
 * Lu.ma-style sticky RSVP card. Drops onto any public event page.
 * Handles three flows: instant approve, request-to-join, and waitlist when capacity is full.
 */
/**
 * Lu.ma-style registration card. Shown on the public event page above the
 * About section. Renders only the registration UX (state + CTA); date / venue
 * details live in the page header above it.
 */
export default function EventRsvpCard({ event, accentColor }: { event: RsvpEvent; accentColor?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<RsvpState>("idle");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [hasWebinar, setHasWebinar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailVerified = !!user?.email_confirmed_at;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("id, approval_status, status, join_token")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .maybeSingle();
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

  const isFull = !!event.capacity && (event.tickets_sold ?? 0) >= event.capacity;

  const handleRsvp = async () => {
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
    }
    setSubmitting(false);
  };

  const cancelRsvp = async () => {
    if (!registrationId) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("cancel_my_registration", { _registration_id: registrationId });
    if (error) {
      toast({ title: "Could not cancel", description: error.message, variant: "destructive" });
    } else {
      setRegistrationId(null);
      setState("idle");
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
        {user && !emailVerified && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <MailWarning className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-snug">
              <div className="font-semibold text-amber-700 dark:text-amber-300">Verify your email to register</div>
              <div className="text-muted-foreground">We sent a link to {user.email}. Open it, then refresh.</div>
            </div>
          </div>
        )}
        {/* State pill — mirrors Lu.ma's "Approval Required" header */}
        {isApprovalFlow && state === "idle" && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-lg bg-secondary flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight">Approval Required</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                Your registration is subject to host approval.
              </div>
            </div>
          </div>
        )}
        {!isApprovalFlow && state === "idle" && (
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
            </div>
          </div>
        )}

        {state === "approved" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> You're going
            </div>
            {hasWebinar && joinToken && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                  <Video className="h-3.5 w-3.5" /> Your webinar link
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-snug">
                  Personal link — works on one device at a time. Don't share it.
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1 h-8 text-[12px]">
                    <a href={`/e/${event.id}/live?join=${joinToken}`} target="_blank" rel="noreferrer">
                      Join webinar
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[12px]"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://illuxus.com/e/${event.id}/live?join=${joinToken}`);
                      toast({ title: "Join link copied" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {registrationId && (
                <Button asChild className="flex-1 h-9 text-[13px]" variant="default">
                  <a href={`/t/${registrationId}`}>View ticket</a>
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
        ) : (
          <Button
            onClick={handleRsvp}
            disabled={submitting}
            className="w-full h-11 text-[14px] font-semibold"
            style={accentColor ? { backgroundColor: accentColor, color: "#fff" } : undefined}
          >
            {isFull
              ? "Join Waitlist"
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