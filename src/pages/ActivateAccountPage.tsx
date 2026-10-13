/**
 * ActivateAccountPage — where the "Set Up Your Illuxus Account" link in a
 * registration confirmation email leads. The visitor chooses a password and
 * that is all: their registrations are already recorded and are attached to
 * the new account by the server.
 *
 * The link's token is checked by the `guest-registration` edge function; it
 * works once and expires. Nothing here signs the visitor in — they continue
 * to the normal sign-in page afterwards.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  | { kind: "ready"; email: string }
  | { kind: "unusable"; reason: string; canResend: boolean }
  | { kind: "done"; email: string }
  | { kind: "resent" };

const REASONS: Record<string, string> = {
  invalid: "This link is not valid. Check that you opened the full link from your email.",
  used: "This link has already been used. Sign in with the password you set, or reset it from the sign-in page.",
  expired: "This link has expired.",
  account_exists: "An account already exists for this email. Sign in, or reset your password from the sign-in page.",
};

const ActivateAccountPage = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Keep the token out of the address bar, history and any referrer.
    if (token) window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      if (!/^[0-9a-f]{64}$/.test(token)) { setPhase({ kind: "unusable", reason: REASONS.invalid, canResend: false }); return; }
      const reply = await callGuestRegistration({ action: "inspect", token });
      if (!alive) return;
      const b = reply.body;
      if (b.ok === true && b.valid === true && typeof b.email === "string") setPhase({ kind: "ready", email: b.email });
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
    const reply = await callGuestRegistration({ action: "activate", token, password });
    setBusy(false);
    const b = reply.body;
    if (b.ok === true) { setPassword(""); setConfirm(""); setPhase({ kind: "done", email: phase.email }); return; }
    const code = String(b.code ?? "");
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
      <div className="w-full max-w-sm">
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
                Choose a password for <span className="font-medium text-foreground break-all">{phase.email}</span>. Your registrations are already
                recorded — there is nothing else to fill in.
              </p>
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
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up…</> : "Set password"}
              </Button>
            </form>
          )}

          {phase.kind === "done" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Your password is set for <span className="font-medium text-foreground break-all">{phase.email}</span>. Sign in to see your tickets and
                manage your registrations.
              </p>
              <Button asChild className="w-full h-10 text-sm font-medium">
                <Link to="/login?next=%2Fu%2Fme%2Fevents">Sign in</Link>
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
