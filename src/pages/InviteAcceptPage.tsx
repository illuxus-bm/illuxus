/**
 * InviteAcceptPage — where the "Accept invitation" link in a team invitation
 * email leads (`/invite?token=…`).
 *
 * Someone new to Illuxus gives their name, designation, mobile number and a
 * password, and lands in the workspace. There is no company form (they are
 * joining a company that already exists) and no verification email (the
 * link itself was delivered to their inbox). Someone who already has an
 * account signs in first; their account is never changed here.
 *
 * Every rule is enforced by the `team-invitation` edge function.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2, Lock, MailWarning } from "lucide-react";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CountryCodePicker } from "@/components/people/CountryCodePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { passwordFormProblem } from "@/lib/guest-registration";
import {
  callTeamInvitation, isInvitationLinkToken, openJoinedWorkspace, replyError, validateInviteeFields,
  type InviteeFieldErrors, type InviteeFields,
} from "@/lib/team-invitation";

interface Invitation { email: string; orgName: string; role: string; accountExists: boolean; becomesOwner: boolean }

type Phase =
  | { kind: "checking" }
  | { kind: "ready"; invitation: Invitation }
  | { kind: "unusable"; title: string; reason: string };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

const unusable = (reason: string, orgName: string | null): Phase => {
  const who = orgName ? `the ${orgName} team` : "the person who invited you";
  switch (reason) {
    case "expired": return { kind: "unusable", title: "This invitation has expired", reason: `Invitation links work for 14 days. Ask ${who} to send you a new one.` };
    case "revoked": return { kind: "unusable", title: "This invitation was withdrawn", reason: `It can no longer be used. Ask ${who} if you should still join.` };
    case "accepted": return { kind: "unusable", title: "Invitation already accepted", reason: "This link has been used. Sign in to open the workspace." };
    default: return { kind: "unusable", title: "This link can't be used", reason: "This invitation link is not valid. Check that you opened the full link from your email." };
  }
};

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-[12.5px]">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <p id={`${id}-error`} className="mt-1 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}

const InviteAcceptPage = () => {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const { user, loading: authLoading } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [fields, setFields] = useState<InviteeFields>({ first_name: "", last_name: "", designation: "", mobile_country_code: "", mobile_number: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<InviteeFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Keep the secret out of the address bar, history and any referrer.
    if (token) window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      if (!isInvitationLinkToken(token)) { setPhase(unusable("invalid", null)); return; }
      const reply = await callTeamInvitation({ action: "inspect", token });
      if (!alive) return;
      const b = reply.body;
      if (b.ok === true && b.valid === true && typeof b.email === "string") {
        setPhase({
          kind: "ready",
          invitation: { email: b.email, orgName: String(b.org_name || "your team"), role: String(b.role || "member"), accountExists: b.account_exists === true, becomesOwner: b.becomes_owner === true },
        });
        // Details entered by whoever set up the invitation; the invitee can change them.
        const p = (b.prefill && typeof b.prefill === "object" ? b.prefill : {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setFields((f) => ({
          first_name: f.first_name || str(p.first_name),
          last_name: f.last_name || str(p.last_name),
          designation: f.designation || str(p.designation),
          mobile_country_code: f.mobile_country_code || str(p.mobile_country_code),
          mobile_number: f.mobile_number || str(p.mobile_number),
        }));
      } else if (b.ok === true) {
        setPhase(unusable(String(b.reason), typeof b.org_name === "string" && b.org_name ? b.org_name : null));
      } else {
        setPhase({ kind: "unusable", title: "Something went wrong", reason: replyError(reply, "We could not check this invitation. Please try again.") });
      }
    })();
    return () => { alive = false; };
    // The token is read once, from the link the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof InviteeFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setError(null);
  };

  /** Shows a failed answer: field errors inline, a dead link as its own screen. */
  const showFailure = (code: string, reply: Awaited<ReturnType<typeof callTeamInvitation>>, invitation: Invitation) => {
    if (["invalid", "expired", "revoked", "accepted"].includes(code)) { setPhase(unusable(code, invitation.orgName)); return; }
    if (code === "account_exists") { setPhase({ kind: "ready", invitation: { ...invitation, accountExists: true } }); return; }
    if (reply.body.errors && typeof reply.body.errors === "object") setErrors(reply.body.errors as InviteeFieldErrors);
    setError(replyError(reply, "We could not accept the invitation. Please try again."));
  };

  const createAccount = async (event: React.FormEvent, invitation: Invitation) => {
    event.preventDefault();
    if (busy) return;
    const fieldErrors = validateInviteeFields(fields);
    const passwordError = passwordFormProblem(password, confirm);
    if (passwordError) fieldErrors.password = passwordError;
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    const reply = await callTeamInvitation({ action: "accept", token, ...fields, password });
    const b = reply.body;
    if (b.ok !== true) {
      setBusy(false);
      showFailure(String(b.code ?? ""), reply, invitation);
      return;
    }
    // The account exists and is in the workspace; sign straight in.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitation.email, password });
    if (signInError) {
      setBusy(false);
      setPhase({ kind: "unusable", title: "You're in", reason: `Your account is ready and you've joined ${invitation.orgName}. Sign in with ${invitation.email} to continue.` });
      return;
    }
    openJoinedWorkspace(b.org_id);
  };

  const joinAsSignedIn = async (invitation: Invitation) => {
    if (busy) return;
    setBusy(true);
    const reply = await callTeamInvitation({ action: "accept_existing", token });
    if (reply.body.ok === true) { openJoinedWorkspace(reply.body.org_id); return; }
    setBusy(false);
    showFailure(String(reply.body.code ?? ""), reply, invitation);
  };

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  const input = "h-10 text-sm";
  const invitation = phase.kind === "ready" ? phase.invitation : null;
  const signedInAs = user?.email?.toLowerCase() ?? null;

  const title =
    phase.kind === "unusable" ? phase.title
    : invitation ? `Join ${invitation.orgName}`
    : "Team invitation";

  return (
    <div className="app-shell min-h-screen flex items-center justify-center p-4 py-10">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <Link to="/" className="inline-flex items-center gap-2 mb-6" aria-label="illuxus home">
            <IlluxusWordmark height={26} ariaLabel="" />
          </Link>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-0.035em]">{title}</h1>
          {invitation && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {invitation.becomesOwner
                ? <>Illuxus has set up this organization for you. You'll be its <span className="font-medium text-foreground">owner</span>.</>
                : <>You've been invited to join as <span className="font-medium text-foreground">{ROLE_LABEL[invitation.role] ?? "Member"}</span>.</>}
            </p>
          )}
        </div>

        <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-7 shadow-[0_24px_60px_-40px_rgb(0_0_0/0.35)]">
          {phase.kind === "checking" && (
            <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your invitation…
            </p>
          )}

          {invitation && (
            <div className="mb-5 grid gap-2 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
              <div className="flex items-center gap-2.5 text-[13px]">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Organization</span>
                <span className="ml-auto truncate font-medium">{invitation.orgName}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[13px]">
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Email</span>
                <span className="ml-auto truncate font-medium" data-testid="invite-email">{invitation.email}</span>
              </div>
            </div>
          )}

          {invitation && !invitation.accountExists && (
            <form onSubmit={(e) => void createAccount(e, invitation)} className="space-y-3.5" noValidate>
              <div className="grid grid-cols-2 gap-2.5">
                <Field id="invite-first-name" label="First name" error={errors.first_name}>
                  <Input id="invite-first-name" autoComplete="given-name" value={fields.first_name} onChange={(e) => set("first_name", e.target.value)} maxLength={80} aria-invalid={!!errors.first_name} className={input} />
                </Field>
                <Field id="invite-last-name" label="Last name" error={errors.last_name}>
                  <Input id="invite-last-name" autoComplete="family-name" value={fields.last_name} onChange={(e) => set("last_name", e.target.value)} maxLength={80} aria-invalid={!!errors.last_name} className={input} />
                </Field>
              </div>
              <Field id="invite-designation" label="Designation" error={errors.designation}>
                <Input id="invite-designation" autoComplete="organization-title" value={fields.designation} onChange={(e) => set("designation", e.target.value)} maxLength={120} placeholder="e.g. Marketing Manager" aria-invalid={!!errors.designation} className={input} />
              </Field>
              <Field id="invite-mobile" label="Mobile number" error={errors.mobile_number || errors.mobile_country_code}>
                <div className="flex gap-2">
                  <CountryCodePicker value={fields.mobile_country_code} onChange={(dial) => set("mobile_country_code", dial)} invalid={!!errors.mobile_country_code} className="w-[104px] shrink-0" />
                  <Input id="invite-mobile" type="tel" inputMode="tel" autoComplete="tel-national" value={fields.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} maxLength={20} aria-invalid={!!errors.mobile_number} className={`${input} min-w-0 flex-1`} />
                </div>
              </Field>
              <Field id="invite-password" label="Password" error={errors.password}>
                <div className="relative">
                  <Input
                    id="invite-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); setError(null); }}
                    maxLength={128}
                    aria-invalid={!!errors.password}
                    aria-describedby="invite-password-rules"
                    className={`${input} pr-10`}
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter id="invite-password-strength" password={password} />
                <p id="invite-password-rules" className="mt-1.5 text-[12px] text-muted-foreground">At least 8 characters, with letters and numbers.</p>
              </Field>
              <Field id="invite-confirm" label="Confirm password">
                <Input
                  id="invite-confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, password: undefined })); setError(null); }}
                  maxLength={128}
                  className={input}
                />
              </Field>
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-10 text-sm font-medium" disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…</> : "Accept invitation & create account"}
              </Button>
              <p className="text-center text-[11.5px] leading-relaxed text-muted-foreground">
                By joining you agree to the Illuxus <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
              </p>
            </form>
          )}

          {invitation && invitation.accountExists && (
            <div className="space-y-4">
              {authLoading ? (
                <p className="flex items-center justify-center gap-2 py-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> One moment…</p>
              ) : signedInAs === invitation.email ? (
                <>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    You're signed in as <span className="font-medium text-foreground break-all">{invitation.email}</span>. Join {invitation.orgName} with this account.
                  </p>
                  {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
                  <Button type="button" className="w-full h-10 text-sm font-medium" disabled={busy} onClick={() => void joinAsSignedIn(invitation)}>
                    {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…</> : `Join ${invitation.orgName}`}
                  </Button>
                </>
              ) : signedInAs ? (
                <>
                  <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                    This invitation is for <span className="font-medium break-all">{invitation.email}</span>, but you're signed in as <span className="font-medium break-all">{signedInAs}</span>. Sign out, then sign in with the invited email.
                  </p>
                  <Button type="button" className="w-full h-10 text-sm font-medium" disabled={busy} onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground break-all">{invitation.email}</span> already has an Illuxus account. Sign in to accept — your account and password stay as they are.
                  </p>
                  <Button asChild className="w-full h-10 text-sm font-medium">
                    <Link to={`/login?invite=${token}`}>Sign in to accept</Link>
                  </Button>
                  <p className="text-center text-[12px] text-muted-foreground">
                    Forgot your password? Reset it from the sign-in page — the invitation stays waiting.
                  </p>
                </>
              )}
            </div>
          )}

          {phase.kind === "unusable" && (
            <div className="space-y-4 text-center">
              <MailWarning className="mx-auto h-9 w-9 text-amber-600" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">{phase.reason}</p>
              <Button asChild className="w-full h-10 text-sm font-medium">
                <Link to="/login">Go to sign in</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InviteAcceptPage;
