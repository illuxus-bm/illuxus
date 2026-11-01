/**
 * ActivateAccountPage — where every "Set up your account" link leads: the
 * one in a registration confirmation, and the one in a speaker, sponsor,
 * sponsor-team or partner invitation. The details Illuxus already holds are
 * filled in; the person corrects anything wrong, adds only what is missing,
 * chooses a password, and lands in the right place.
 *
 * The link's token is checked by the `guest-registration` edge function; it
 * works once and expires. The account is always for the address the link
 * was sent to — that address is shown but cannot be changed.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CompanyInput } from "@/components/intelligence/CompanyInput";
import { CountryCodePicker } from "@/components/people/CountryCodePicker";
import { loginPath, safeInternalPath } from "@/lib/safe-redirect";
import { CheckCircle2, Eye, EyeOff, Loader2, MailWarning } from "lucide-react";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callGuestRegistration, passwordFormProblem } from "@/lib/guest-registration";

type Phase =
  | { kind: "checking" }
  | { kind: "ready"; email: string; purpose: string }
  | { kind: "unusable"; reason: string; canResend: boolean }
  | { kind: "done"; email: string; next: string | null }
  | { kind: "resent" };

const REASONS: Record<string, string> = {
  invalid: "This link is not valid. Check that you opened the full link from your email.",
  used: "This link has already been used. Sign in with the password you set, or reset it from the sign-in page.",
  expired: "This link has expired.",
  account_exists: "An account already exists for this email. Sign in, or reset your password from the sign-in page.",
};

const DETAIL_KEYS = ["first_name", "last_name", "designation", "company", "mobile_country_code", "mobile_number"] as const;
type Details = Record<(typeof DETAIL_KEYS)[number], string>;
const EMPTY_DETAILS = Object.fromEntries(DETAIL_KEYS.map((k) => [k, ""])) as Details;
/** Where a guest goes when the link names nowhere else. */
const DEFAULT_NEXT = "/u/me/events";

function DetailField({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[13px]">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}

const ActivateAccountPage = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const setField = (key: keyof Details, value: string) => {
    setDetails((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  useEffect(() => {
    let alive = true;
    // Keep the token out of the address bar, history and any referrer.
    if (token) window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      if (!/^[0-9a-f]{64}$/.test(token)) { setPhase({ kind: "unusable", reason: REASONS.invalid, canResend: false }); return; }
      const reply = await callGuestRegistration({ action: "inspect", token });
      if (!alive) return;
      const b = reply.body;
      if (b.ok === true && b.valid === true && typeof b.email === "string") {
        const known = (b.details && typeof b.details === "object" ? b.details : {}) as Record<string, unknown>;
        setDetails(Object.fromEntries(DETAIL_KEYS.map((k) => [k, typeof known[k] === "string" ? known[k] as string : ""])) as Details);
        setPhase({ kind: "ready", email: b.email, purpose: typeof b.purpose === "string" ? b.purpose : "guest" });
      }
      else if (b.ok === true) setPhase({ kind: "unusable", reason: REASONS[String(b.reason)] ?? REASONS.invalid, canResend: b.can_resend === true });
      else setPhase({ kind: "unusable", reason: typeof b.error === "string" ? b.error : "We could not check this link. Please try again.", canResend: false });
    })();
    return () => { alive = false; };
    // The token is read once, from the link the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || phase.kind !== "ready") return;
    const problem = passwordFormProblem(password, confirm);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const reply = await callGuestRegistration({ action: "activate", token, password, details });
    const b = reply.body;
    if (b.ok === true) {
      const next = safeInternalPath(typeof b.next === "string" ? b.next : null) ?? DEFAULT_NEXT;
      // Straight in: the account is ready and the address is proven by this link.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: phase.email, password });
      setPassword(""); setConfirm("");
      if (!signInError) { window.location.replace(next); return; }
      setBusy(false);
      setPhase({ kind: "done", email: phase.email, next });
      return;
    }
    setBusy(false);
    const code = String(b.code ?? "");
    if (code === "details_required") {
      setFieldErrors((b.errors ?? {}) as Partial<Record<keyof Details, string>>);
      setError(typeof b.error === "string" ? b.error : "Check the highlighted details.");
      return;
    }
    if (code === "weak_password" || code === "rate_limited" || code === "create_failed" || code === "unreachable") {
      setError(typeof b.error === "string" ? b.error : "Please try again.");
      return;
    }
    setPhase({ kind: "unusable", reason: REASONS[code] ?? (typeof b.error === "string" ? b.error : REASONS.invalid), canResend: b.can_resend === true });
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    const reply = await callGuestRegistration({ action: "resend", token });
    setBusy(false);
    if (reply.body.ok === true) setPhase({ kind: "resent" });
    else setError(typeof reply.body.error === "string" ? reply.body.error : "We could not send a new link. Please try again.");
  };

  const title =
    phase.kind === "done" ? "Your account is ready"
    : phase.kind === "resent" ? "Check your inbox"
    : phase.kind === "unusable" ? "This link can't be used"
    : "Set up your Illuxus account";

  return (
    <div className="app-shell min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <Link to="/" className="inline-flex items-center gap-2 mb-6" aria-label="illuxus home">
            <IlluxusWordmark height={26} ariaLabel="" />
          </Link>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-0.035em]">{title}</h1>
        </div>

        <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-7 shadow-[0_24px_60px_-40px_rgb(0_0_0/0.35)]">
          {phase.kind === "checking" && (
            <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
            </p>
          )}

          {phase.kind === "ready" && (
            <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {phase.purpose === "guest"
                  ? "Your registration is recorded. We've filled in your details from it — check them and choose a password."
                  : "We've filled in your details from your invitation — check them, correct anything that's wrong, and choose a password."}
              </p>
              <div>
                <Label htmlFor="activate-email" className="text-[13px]">Email</Label>
                <Input id="activate-email" value={phase.email} readOnly aria-readonly="true" className="mt-1.5 h-10 text-sm bg-muted/50" />
                <p className="mt-1 text-[12px] text-muted-foreground">Your account uses the address this link was sent to.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailField id="activate-first" label="First name" error={fieldErrors.first_name}>
                  <Input id="activate-first" autoComplete="given-name" value={details.first_name} onChange={(e) => setField("first_name", e.target.value)} maxLength={80} aria-invalid={!!fieldErrors.first_name} className="h-10 text-sm" />
                </DetailField>
                <DetailField id="activate-last" label="Last name" error={fieldErrors.last_name}>
                  <Input id="activate-last" autoComplete="family-name" value={details.last_name} onChange={(e) => setField("last_name", e.target.value)} maxLength={80} aria-invalid={!!fieldErrors.last_name} className="h-10 text-sm" />
                </DetailField>
              </div>
              <DetailField id="activate-designation" label="Designation" error={fieldErrors.designation}>
                <Input id="activate-designation" autoComplete="organization-title" value={details.designation} onChange={(e) => setField("designation", e.target.value)} maxLength={120} aria-invalid={!!fieldErrors.designation} className="h-10 text-sm" />
              </DetailField>
              <DetailField id="activate-company" label="Company" error={fieldErrors.company}>
                <CompanyInput id="activate-company" value={details.company} onChange={(v) => setField("company", v)} maxLength={160} aria-invalid={!!fieldErrors.company} className="h-10 text-sm" />
              </DetailField>
              <DetailField id="activate-mobile" label="Mobile number" error={fieldErrors.mobile_country_code ?? fieldErrors.mobile_number}>
                <div className="flex gap-2">
                  <CountryCodePicker value={details.mobile_country_code} onChange={(dial) => setField("mobile_country_code", dial)} invalid={!!fieldErrors.mobile_country_code} className="w-[104px] shrink-0" />
                  <Input id="activate-mobile" type="tel" inputMode="tel" autoComplete="tel-national" value={details.mobile_number} onChange={(e) => setField("mobile_number", e.target.value)} maxLength={20} aria-invalid={!!fieldErrors.mobile_number} className="h-10 text-sm min-w-0 flex-1" />
                </div>
              </DetailField>
              <div>
                <Label htmlFor="activate-password" className="text-[13px]">New password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="activate-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    maxLength={128}
                    aria-describedby="activate-password-rules"
                    className="h-10 text-sm pr-10"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter id="activate-password-strength" password={password} />
                <p id="activate-password-rules" className="mt-1.5 text-[12px] text-muted-foreground">At least 8 characters, with letters and numbers.</p>
              </div>
              <div>
                <Label htmlFor="activate-confirm" className="text-[13px]">Confirm password</Label>
                <Input
                  id="activate-confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  maxLength={128}
                  className="mt-1.5 h-10 text-sm"
                />
              </div>
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-10 text-sm font-medium" disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up…</> : "Set up my account"}
              </Button>
            </form>
          )}

          {phase.kind === "done" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Your account is ready for <span className="font-medium text-foreground break-all">{phase.email}</span>. Sign in to continue.
              </p>
              <Button asChild className="w-full h-10 text-sm font-medium">
                <Link to={loginPath(phase.next)}>Sign in</Link>
              </Button>
            </div>
          )}

          {phase.kind === "unusable" && (
            <div className="space-y-4 text-center">
              <MailWarning className="mx-auto h-9 w-9 text-amber-600" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">{phase.reason}</p>
              {error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
              {phase.canResend && (
                <Button type="button" className="w-full h-10 text-sm font-medium" disabled={busy} onClick={() => void resend()}>
                  {busy ? "Sending…" : "Email me a new link"}
                </Button>
              )}
              <Button asChild variant={phase.canResend ? "outline" : "default"} className="w-full h-10 text-sm font-medium">
                <Link to="/login">Go to sign in</Link>
              </Button>
              <p className="text-[12px] text-muted-foreground">Your event registration is not affected.</p>
            </div>
          )}

          {phase.kind === "resent" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                If this email has a registration without an account, a new link is on its way. It works once and expires in 72 hours.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivateAccountPage;
