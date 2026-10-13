/**
 * Registration for visitors who are not signed in: a short form in the event
 * page's registration card, and the confirmation shown once it is submitted.
 * No account is needed; the confirmation email carries an optional link to
 * set one up afterwards.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Hourglass, Loader2, MailCheck, MailWarning } from "lucide-react";
import { ConsentCheckbox, LegalLink } from "@/components/ConsentCheckbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  callGuestRegistration, registerGuest, validateGuestFields,
  type GuestConfirmation, type GuestFieldErrors, type GuestFields,
} from "@/lib/guest-registration";
import { COUNTRIES, detectDefaultDial } from "@/lib/phone-country";
import type { UtmParams } from "@/lib/utm";

const DIAL_CODES = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-[12px]">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p id={`${id}-error`} className="mt-1 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}

export function GuestRegistrationForm({
  eventId, requiresApproval, submitLabel, accentColor, utmParams, signInHref, onRegistered,
}: {
  eventId: string;
  requiresApproval: boolean;
  submitLabel: string;
  accentColor?: string;
  utmParams: UtmParams;
  signInHref: string;
  /** Called with the confirmation and a way to send its email again. */
  onRegistered: (confirmation: GuestConfirmation, resendDetails: () => Promise<boolean>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<GuestFields>(() => ({
    first_name: "", last_name: "", email: "", mobile_country_code: detectDefaultDial(), mobile_number: "", company: "", designation: "",
  }));
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<GuestFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof GuestFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const style = accentColor ? { backgroundColor: accentColor, color: "#fff" } : undefined;

  if (!open) {
    return (
      <div className="space-y-2.5">
        <Button onClick={() => setOpen(true)} className="w-full h-11 text-[14px] font-semibold" style={style}>
          {submitLabel}
        </Button>
        <p className="text-center text-[12px] text-muted-foreground">
          No account needed. <Link to={signInHref} className="font-medium text-foreground underline-offset-2 hover:underline">Sign in</Link> if you have one.
        </p>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const found = validateGuestFields(fields, agreed);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const send = () => registerGuest({ eventId, fields, utm: utmParams, website });
    const result = await send();
    setSubmitting(false);
    if ("error" in result) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setFormError(result.error);
      return;
    }
    // Submitting the same details again creates nothing new; the server just
    // sends the confirmation email to that address once more.
    onRegistered(result.confirmation, async () => {
      const again = await send();
      return "confirmation" in again && again.confirmation.emailSent;
    });
  };

  const input = "h-10 text-[13.5px]";

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field id="guest-first-name" label="First name" error={errors.first_name}>
          <Input id="guest-first-name" autoComplete="given-name" value={fields.first_name} onChange={(e) => set("first_name", e.target.value)} maxLength={80} aria-invalid={!!errors.first_name} className={input} />
        </Field>
        <Field id="guest-last-name" label="Last name" error={errors.last_name}>
          <Input id="guest-last-name" autoComplete="family-name" value={fields.last_name} onChange={(e) => set("last_name", e.target.value)} maxLength={80} aria-invalid={!!errors.last_name} className={input} />
        </Field>
      </div>
      <Field id="guest-email" label="Email" error={errors.email}>
        <Input id="guest-email" type="email" inputMode="email" autoComplete="email" value={fields.email} onChange={(e) => set("email", e.target.value)} maxLength={254} placeholder="you@example.com" aria-invalid={!!errors.email} className={input} />
      </Field>
      <Field id="guest-mobile" label="Mobile number" error={errors.mobile_number || errors.mobile_country_code}>
        <div className="flex gap-2">
          <select
            aria-label="Country code"
            value={fields.mobile_country_code}
            onChange={(e) => set("mobile_country_code", e.target.value)}
            className="h-10 w-[84px] shrink-0 rounded-md border border-input bg-background px-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {DIAL_CODES.map((dial) => <option key={dial} value={dial}>{dial}</option>)}
          </select>
          <Input id="guest-mobile" type="tel" inputMode="tel" autoComplete="tel-national" value={fields.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} maxLength={20} aria-invalid={!!errors.mobile_number} className={`${input} min-w-0 flex-1`} />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id="guest-company" label="Company" error={errors.company}>
          <Input id="guest-company" autoComplete="organization" value={fields.company} onChange={(e) => set("company", e.target.value)} maxLength={160} aria-invalid={!!errors.company} className={input} />
        </Field>
        <Field id="guest-designation" label="Designation" error={errors.designation}>
          <Input id="guest-designation" autoComplete="organization-title" value={fields.designation} onChange={(e) => set("designation", e.target.value)} maxLength={120} aria-invalid={!!errors.designation} className={input} />
        </Field>
      </div>

      {/* Not for people: hidden from sight and from assistive technology. */}
      <div className="hidden" aria-hidden="true">
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      <ConsentCheckbox
        checked={agreed}
        onCheckedChange={(value) => { setAgreed(value); if (value) setErrors((e) => ({ ...e, consent: undefined })); }}
        error={errors.consent ?? null}
      >
        I agree to the <LegalLink to="/terms">Terms</LegalLink>, <LegalLink to="/refunds">Refund Policy</LegalLink>{" "}
        and <LegalLink to="/privacy">Privacy Policy</LegalLink>, and to my registration details being shared with
        the event organiser.
      </ConsentCheckbox>

      {formError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{formError}</p>}

      <Button type="submit" disabled={submitting} className="w-full h-11 text-[14px] font-semibold" style={style}>
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering…</> : requiresApproval ? "Request to Join" : submitLabel}
      </Button>
      <p className="text-center text-[12px] text-muted-foreground">
        Have an account? <Link to={signInHref} className="font-medium text-foreground underline-offset-2 hover:underline">Sign in</Link> to register in one click.
      </p>
    </form>
  );
}

export function GuestConfirmationPanel({
  confirmation, eventId, eventTitle, eventDateText, onResendDetails, onUpdate, onStartOver,
}: {
  confirmation: GuestConfirmation;
  eventId: string;
  eventTitle: string;
  eventDateText: string;
  /** Sends the confirmation email again; absent after a page refresh. */
  onResendDetails?: () => Promise<boolean>;
  onUpdate: (next: GuestConfirmation) => void;
  onStartOver: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"" | "details" | "link">("");
  const pending = confirmation.status === "pending";

  const resendDetails = async () => {
    if (!onResendDetails || busy) return;
    setBusy("details");
    const sent = await onResendDetails();
    setBusy("");
    if (sent) {
      onUpdate({ ...confirmation, emailSent: true });
      toast({ title: "Email sent", description: `Check ${confirmation.email}.` });
    } else {
      toast({ title: "Still could not send the email", description: "Your registration is saved. Please try again in a few minutes.", variant: "destructive" });
    }
  };

  const resendLink = async () => {
    if (busy) return;
    setBusy("link");
    const reply = await callGuestRegistration({ action: "resend", event_id: eventId, email: confirmation.email });
    setBusy("");
    if (reply.body.ok === true) toast({ title: "Check your inbox", description: "If this email has no Illuxus account yet, a new account link is on its way." });
    else toast({ title: "Could not send a new link", description: typeof reply.body.error === "string" ? reply.body.error : undefined, variant: "destructive" });
  };

  const heading = confirmation.duplicate
    ? "You're already registered"
    : pending ? "Application submitted successfully" : confirmation.status === "waitlisted" ? "You're on the waitlist" : "Registration successful";

  return (
    <div className="space-y-4" role="status">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 size-9 rounded-lg flex items-center justify-center ${pending ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
          {pending ? <Hourglass className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">{heading}</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">
            {confirmation.duplicate
              ? "This email is already registered for this event, so nothing new was created."
              : pending
                ? "Your application is pending approval. A ticket is issued only once the organiser approves it."
                : confirmation.status === "waitlisted"
                  ? "We'll email you if a place opens up."
                  : "Your place is confirmed."}
          </div>
        </div>
      </div>

      <dl className="rounded-lg border border-border bg-muted/40 p-3 text-[12.5px] space-y-1.5">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground shrink-0">Event</dt><dd className="font-medium text-right truncate">{eventTitle}</dd></div>
        {eventDateText && <div className="flex justify-between gap-3"><dt className="text-muted-foreground shrink-0">Date</dt><dd className="text-right">{eventDateText}</dd></div>}
        {confirmation.reference && <div className="flex justify-between gap-3"><dt className="text-muted-foreground shrink-0">Reference</dt><dd className="font-mono">{confirmation.reference}</dd></div>}
        {!confirmation.duplicate && confirmation.status && (
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground shrink-0">Status</dt><dd className="capitalize">{pending ? "Pending approval" : confirmation.status === "approved" ? "Confirmed" : confirmation.status}</dd></div>
        )}
      </dl>

      {confirmation.emailSent ? (
        <div className="flex items-start gap-2.5 text-[12.5px] leading-snug">
          <MailCheck className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p>
            We've sent {confirmation.duplicate ? "your registration details" : pending ? "a confirmation of your application" : "your confirmation and ticket"} to{" "}
            <span className="font-medium break-all">{confirmation.email}</span>.
            {pending && " We'll email you again when the organiser decides."}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12.5px] leading-snug">
          <MailWarning className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p>
              {confirmation.duplicate ? "We could not send the details" : "Your registration is saved, but we could not send the confirmation email"} to{" "}
              <span className="font-medium break-all">{confirmation.email}</span> just now.
            </p>
            {onResendDetails
              ? <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-[12px]" disabled={!!busy} onClick={() => void resendDetails()}>{busy === "details" ? "Sending…" : "Send it again"}</Button>
              : <p className="mt-1 text-muted-foreground">Register again with the same email to have it sent — no second registration is created.</p>}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border p-3 text-[12.5px] leading-snug">
        <p className="font-medium">Set up your Illuxus account (optional)</p>
        <p className="mt-0.5 text-muted-foreground">
          The email includes a link to set a password, so you can view your tickets and manage your registrations. Already have an account? Just sign in.
        </p>
        <button type="button" onClick={() => void resendLink()} disabled={!!busy} className="mt-2 text-[12px] font-medium underline-offset-2 hover:underline disabled:opacity-60">
          {busy === "link" ? "Sending…" : "Send me a new account link"}
        </button>
      </div>

      <button type="button" onClick={onStartOver} className="block w-full text-center text-[12px] text-muted-foreground hover:text-foreground">
        Register someone else
      </button>
    </div>
  );
}
