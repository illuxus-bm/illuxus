import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { publicOrigin } from "@/lib/publicUrl";
import { captureUtm, loadStoredUtm } from "@/lib/utm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Ticket, Building2, ChevronLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import TwoFactorChallengeDialog from "@/components/auth/TwoFactorChallengeDialog";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { scorePassword } from "@/lib/password-strength";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { safeInternalPath } from "@/lib/safe-redirect";
import { useTheme } from "@/contexts/ThemeContext";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import PersonFieldsForm, {
  emptyPersonFields,
  validatePersonFields,
  type PersonFields,
} from "@/components/people/PersonFieldsForm";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<"attendee" | "organizer">("attendee");
  // Sign-up is a 2-step flow: credentials → mandatory personal details.
  // Step 2 collects the same fields as Settings → Profile and the event
  // registration form so the three surfaces stay in lockstep, and we save
  // them on the profile via the new-user trigger so users skip the
  // "Complete your profile" page entirely.
  const [signUpStep, setSignUpStep] = useState<1 | 2>(1);
  const [person, setPerson] = useState<PersonFields>(emptyPersonFields());
  const [twoFactor, setTwoFactor] = useState<{ open: boolean; email: string; nextRoute: string }>({
    open: false, email: "", nextRoute: "/dashboard",
  });
  // Must-change-password flow: organizer-created accounts start with phone as password
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Capture UTM query params on mount so they persist across the sign-in /
  // sign-up two-step flow and are still available when the sign-up submit
  // path reads `loadStoredUtm()` before calling `supabase.auth.signUp`.
  // Runs once — the empty dep array is intentional (Requirements 2.2, 2.4-2.7).
  useEffect(() => {
    captureUtm(window.location.search);
  }, []);
  /** Pending team-invite token from `?invite=<uuid>`. Consumed by
   *  `accept_org_invitation` after the user successfully signs in (or after
   *  the must-change-password reset for organiser-created accounts). */
  const inviteToken = searchParams.get("invite");
  /**
   * `?next=<path>` — when an auth-gated route bounces the visitor here,
   * we store the destination so they land on it after signing in / signing
   * up. Always validated to be an in-app path before navigating to prevent
   * open redirects.
   */
  const nextParam = searchParams.get("next");
  // Validated by `safeInternalPath`, which resolves the candidate against the
  // current origin instead of prefix-matching it.
  //
  // The previous inline check was `decoded.startsWith("/") &&
  // !decoded.startsWith("//")`. That blocked `https://evil.com` and
  // `//evil.com` but PASSED `/\evil.com`: this value reaches
  // `window.location.assign()` below, where the browser normalises a backslash
  // into a forward slash before resolving the authority, so `/\evil.com`
  // became `https://evil.com`. `/%5Cevil.com` and `/\t/evil.com` bypassed it
  // the same way. That made `illuxus.com/login?next=/\evil.com` a phishing
  // link on our own domain that redirects post-authentication.
  //
  // See src/lib/safe-redirect.ts and its regression tests.
  const safeNext = safeInternalPath(nextParam);
  /** True when the visitor arrived because they need to claim a ticket — we
   *  show a friendlier "sign up to claim" callout on the form. */
  const claimingTicket = !!safeNext && safeNext.startsWith("/t/");

  /**
   * Redeem the invite (when present). Returns the next route to navigate
   * to after redemption — `/dashboard` when an invitation was accepted so
   * the new team member lands inside the organisation, or null when there
   * was no token / redemption failed (the toast already explains why).
   */
  const consumeInviteIfAny = async (): Promise<string | null> => {
    if (!inviteToken) return null;
    const { data, error } = await supabaseRpc(
      "accept_org_invitation" as never,
      { _token: inviteToken } as never,
    );
    if (error) {
      toast({
        title: "Invitation not accepted",
        description: error.message || "Please ask your organiser to resend the invite.",
        variant: "destructive",
      });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const role = (row as { assigned_role?: string } | null)?.assigned_role || "member";
    toast({
      title: "Invitation accepted",
      description: `You're in as ${role}. Redirecting to the dashboard…`,
    });
    return "/dashboard";
  };
  const { content } = useSiteContent();
  const { theme: appTheme } = useTheme();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isForgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${publicOrigin()}/reset-password`,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a password reset link." });
      }
    } else if (isSignUp) {
      // Block submitting step 1 here — step 1's CTA advances to step 2.
      if (signUpStep === 1) {
        setLoading(false);
        return;
      }
      const personCheck = validatePersonFields({ ...person, email });
      if (!personCheck.ok) {
        toast({ title: "Check your details", description: personCheck.error, variant: "destructive" });
        setLoading(false);
        return;
      }
      // Read First_Touch_UTM from Attribution_Storage and thread it through
      // `options.data` so the `handle_new_user` trigger can stamp the five
      // UTM_Fields onto the new `profiles` row (Requirements 5.1, 5.3). A
      // failing read is treated as absent — the row's UTM_Fields land as
      // SQL NULL (Requirement 5.3). Storage is NOT cleared after signUp so
      // a subsequent RSVP or Application in the same tab still attributes
      // to the same First_Touch_UTM (Requirements 5.4, 5.5).
      let utm: ReturnType<typeof loadStoredUtm> = {};
      try {
        utm = loadStoredUtm() ?? {};
      } catch {
        utm = {};
      }
      const { data: signUpResult, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: publicOrigin(),
          data: {
            account_type: accountType,
            title: personCheck.data.title || "",
            first_name: personCheck.data.first_name,
            last_name: personCheck.data.last_name,
            designation: personCheck.data.designation,
            company: personCheck.data.company,
            mobile_country_code: personCheck.data.mobile_country_code,
            mobile_number: personCheck.data.mobile_number,
            linkedin_url: personCheck.data.linkedin_url || "",
            company_website: personCheck.data.company_website || "",
            company_employee_count: personCheck.data.company_employee_count || "",
            industry: personCheck.data.industry || "",
            display_name: `${personCheck.data.first_name} ${personCheck.data.last_name}`.trim(),
            utm_source:   utm.utm_source   ?? null,
            utm_medium:   utm.utm_medium   ?? null,
            utm_campaign: utm.utm_campaign ?? null,
            utm_content:  utm.utm_content  ?? null,
            utm_term:     utm.utm_term     ?? null,
          },
        },
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else if (signUpResult?.session) {
        // Auto-session path: email confirmation is disabled OR auto-confirm
        // fired. Two sub-cases that both need handling here, otherwise the
        // new user lands on the wrong page:
        //  1. They came in via `/login?invite=<token>` → consume the invite
        //     so the org_members row is created with the chosen role.
        //  2. They came in via `/login?next=/t/<id>` (ticket claim flow).
        const inviteNext = await consumeInviteIfAny();
        const destination = inviteNext ?? safeNext ?? "/";
        toast({ title: "Account created", description: "Welcome to Illuxus." });
        // Force a full reload when we accepted an invitation so the
        // OrgContext re-fetches `memberships` (which was empty when the
        // user record was first created). Without this, `OnboardingGuard`
        // sees no org and bounces the new member to /onboarding.
        if (inviteNext) {
          window.location.assign(destination);
        } else {
          navigate(destination);
        }
      } else {
        toast({
          title: "Check your email",
          description: `We sent a verification link to ${email}. Open it to activate your account${inviteToken ? " and accept the workspace invitation" : safeNext ? " and view your ticket" : ""}.`,
        });
        // Email confirmation is required — Supabase will not return a session.
        // Take them to the sign-in screen so they can log in after verifying.
        setIsSignUp(false);
        setSignUpStep(1);
        setPassword("");
        setPerson(emptyPersonFields());
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // "Invalid login credentials" is the generic Supabase error for both
        // wrong-password AND no-such-user. Surface a more actionable message
        // when the visitor was sent here from a ticket link — they probably
        // haven't created an account yet.
        const isInvalid = /invalid login credentials/i.test(error.message);
        if (isInvalid && claimingTicket) {
          toast({
            title: "No account yet for this email",
            description: "Create an account below using the same email and your ticket will appear automatically.",
            variant: "destructive",
          });
          setIsSignUp(true);
          setSignUpStep(1);
        } else if (isInvalid) {
          toast({
            title: "Invalid email or password",
            description: "If you don't have an account yet, click \"Sign up\" below to create one.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
      } else {
        // Look up the user's account type to route correctly
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Check if this is a participant account created by an organizer
          // that needs to change their initial password (phone number).
          const mustChange = user.user_metadata?.must_change_password === true;
          if (mustChange) {
            // Clear the flag and redirect to password reset
            toast({
              title: "Welcome! Please set a new password",
              description: "Your account was created by an event organizer. Choose a secure password to continue.",
            });
            setIsForgot(false);
            setMustChangePassword(true);
            setLoading(false);
            return;
          }

          const { data: profile } = await supabaseRpc("get_my_profile");
          const p = profile as { account_type?: string; two_factor_enabled?: boolean } | null;

          // Super admin check — has the platform-level `admin` role grant.
          // We look this up directly (don't trust profile data which is org-facing).
          // Super admins skip the organizer dashboard and land on the Control Tower.
          const { data: adminRow } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          const isSuperAdmin = !!adminRow;

          const defaultNext = isSuperAdmin
            ? "/dashboard/admin"
            : p?.account_type === "attendee"
              ? "/discover"
              : "/dashboard";
          // Priority order:
          //   1. invite acceptance → /dashboard with full reload so
          //      OrgContext re-fetches memberships (the RPC just inserted
          //      one and the existing context snapshot has no row).
          //   2. ?next= (preserved by every auth gate when bouncing here)
          //   3. account-type default
          const inviteNext = await consumeInviteIfAny();
          const next = inviteNext ?? safeNext ?? defaultNext;
          if (p?.two_factor_enabled) {
            // Pause and require an OTP before letting them through.
            setTwoFactor({ open: true, email: user.email ?? email, nextRoute: next });
          } else if (inviteNext) {
            // Full reload guarantees the new org_members row is visible to
            // OrgContext before the OnboardingGuard runs. SPA navigation
            // would otherwise hit the guard with the stale empty
            // memberships array and bounce the new member to /onboarding.
            window.location.assign(next);
          } else {
            navigate(next);
          }
        } else {
          navigate("/dashboard");
        }
      }
    }
    setLoading(false);
  };

  const title = mustChangePassword
    ? "Set your new password"
    : isForgot
      ? "Reset password"
      : isSignUp
        ? signUpStep === 1
          ? accountType === "attendee" ? "Create your attendee account" : "Create your organizer account"
          : "A few details about you"
        : "Welcome back";
  const buttonText = mustChangePassword
    ? "Update Password"
    : isForgot
      ? "Send Reset Link"
      : isSignUp
        ? signUpStep === 1 ? "Continue" : "Create Account"
        : "Sign In";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-sm">
        <TwoFactorChallengeDialog
          open={twoFactor.open}
          email={twoFactor.email}
          onCancel={async () => {
            setTwoFactor((s) => ({ ...s, open: false }));
            await supabase.auth.signOut();
            toast({ title: "Sign-in cancelled" });
          }}
          onVerified={() => {
            setTwoFactor((s) => ({ ...s, open: false }));
            navigate(twoFactor.nextRoute);
          }}
          title="Verify it's you"
          description={`Enter the 6-digit code we sent to ${twoFactor.email} to finish signing in.`}
        />
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-4" aria-label={brandName}>
            <IlluxusWordmark height={26} ariaLabel="" />
          </a>
          <p className="text-muted-foreground text-sm">{title}</p>
        </div>

        {claimingTicket && !mustChangePassword && (
          <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-blue-700 dark:text-blue-300">
            <span className="font-semibold">Claiming a ticket?</span>{" "}
            {isSignUp
              ? "Use the same email the organiser added so your ticket loads automatically once you finish signing up."
              : "Sign in if you already have an account. Otherwise switch to \"Sign up\" below using the same email the organiser added — your ticket will appear right after."}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6">
          {/* ── Must change password screen ─── */}
          {mustChangePassword ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const strength = scorePassword(newPassword);
                if (!strength.acceptable) {
                  toast({
                    title: "Password too weak",
                    description: strength.hint || "Use at least 8 characters with a mix of letters, numbers and a symbol.",
                    variant: "destructive",
                  });
                  return;
                }
                if (newPassword !== confirmPassword) {
                  toast({ title: "Passwords don't match", description: "Re-enter your new password.", variant: "destructive" });
                  return;
                }
                setLoading(true);
                // Update the password and clear the must_change_password flag
                const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
                if (pwErr) {
                  toast({ title: "Error", description: pwErr.message, variant: "destructive" });
                  setLoading(false);
                  return;
                }
                // Clear the flag in user metadata
                await supabase.auth.updateUser({
                  data: { must_change_password: false },
                });
                toast({ title: "Password updated!", description: "You can now sign in with your new password." });
                setMustChangePassword(false);
                setNewPassword("");
                setConfirmPassword("");
                // If this user got here from a team invitation link
                // (`/login?invite=<token>`), redeem it now — they were a
                // pending member until this point and we want them to land
                // inside the org's dashboard, not the discover feed.
                const inviteNext = await consumeInviteIfAny();
                if (inviteNext) {
                  // Hard reload so OrgContext picks up the just-inserted
                  // org_members row. SPA navigation would race with the
                  // existing context snapshot and bounce them to onboarding.
                  window.location.assign(inviteNext);
                } else {
                  navigate(safeNext ?? "/discover");
                }
                setLoading(false);
              }}
              className="space-y-4"
            >
              <p className="text-[13px] text-muted-foreground">
                Your account was created by an event organizer. Please choose a secure password to continue.
              </p>
              <div>
                <Label htmlFor="new-password" className="text-[13px]">New password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                    className="h-9 text-sm pr-9"
                    aria-describedby="new-password-strength"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter id="new-password-strength" password={newPassword} />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-[13px]">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                  className="mt-1.5 h-9 text-sm"
                />
                {confirmPassword && newPassword && confirmPassword !== newPassword && (
                  <p className="mt-1.5 text-[11px] text-destructive">Passwords don't match.</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full h-9 text-sm font-medium"
                disabled={
                  loading ||
                  !scorePassword(newPassword).acceptable ||
                  newPassword !== confirmPassword
                }
              >
                {loading ? "Updating…" : buttonText}
              </Button>
            </form>
          ) : (
            <>
              {!isForgot && (!isSignUp || signUpStep === 1) && (
                <div className="grid grid-cols-2 gap-1 p-1 mb-5 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAccountType("attendee")}
                    className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${accountType === "attendee"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Ticket className="h-3.5 w-3.5" /> Attendee
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("organizer")}
                    className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${accountType === "organizer"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Building2 className="h-3.5 w-3.5" /> Organizer
                  </button>
                </div>
              )}
              {!isForgot && (!isSignUp || signUpStep === 1) && (
                <div className={`rounded-lg border px-3 py-2.5 mb-4 -mt-1 text-[12px] leading-relaxed ${accountType === "attendee"
                    ? "border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-400"
                    : "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-400"
                  }`}>
                  {accountType === "attendee" ? (
                    <span>
                      <span className="font-semibold">For attendees, members, sponsors & speakers.</span>
                      {" "}Use this login to access events you've registered for, manage your tickets, and connect with organizers.
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold">For organizers & Team Members.</span>
                      {" "}Use this login to create and manage events, handle registrations, and access your organization dashboard.
                    </span>
                  )}
                </div>
              )}
              {isSignUp && signUpStep === 2 && (
                <button
                  type="button"
                  onClick={() => setSignUpStep(1)}
                  className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground mb-3"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>
              )}
              <form
                onSubmit={(e) => {
                  // Step 1 of signup: validate basics, advance to step 2 instead
                  // of calling the API.
                  if (isSignUp && signUpStep === 1) {
                    e.preventDefault();
                    if (!email) {
                      toast({ title: "Check your details", description: "Enter your email.", variant: "destructive" });
                      return;
                    }
                    const strength = scorePassword(password);
                    if (!strength.acceptable) {
                      toast({
                        title: "Password too weak",
                        description: strength.hint || "Use at least 8 characters with a mix of letters, numbers and a symbol.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setSignUpStep(2);
                    return;
                  }
                  handleSubmit(e);
                }}
                className="space-y-4"
              >
                {(!isSignUp || signUpStep === 1) && (
                  <>
                    <div>
                      <Label htmlFor="email" className="text-[13px]">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="mt-1.5 h-9 text-sm"
                      />
                    </div>
                    {!isForgot && (
                      <div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password" className="text-[13px]">Password</Label>
                          {!isSignUp && (
                            <button
                              type="button"
                              onClick={() => setIsForgot(true)}
                              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative mt-1.5">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={isSignUp ? 8 : 6}
                            className="h-9 text-sm pr-9"
                            aria-describedby={isSignUp ? "password-strength" : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {isSignUp && (
                          <PasswordStrengthMeter id="password-strength" password={password} />
                        )}
                      </div>
                    )}
                  </>
                )}
                {isSignUp && signUpStep === 2 && (
                  <PersonFieldsForm value={{ ...person, email }} onChange={(v) => setPerson(v)} hideEmail />
                )}
                <Button
                  type="submit"
                  className="w-full h-9 text-sm font-medium"
                  disabled={
                    loading ||
                    (isSignUp && signUpStep === 1 && !scorePassword(password).acceptable)
                  }
                >
                  {loading ? "Please wait..." : buttonText}
                </Button>
              </form>

              <div className="mt-5 text-center text-[13px]">
                {isForgot ? (
                  <>
                    <button
                      onClick={() => setIsForgot(false)}
                      className="text-foreground font-medium hover:underline"
                    >
                      Back to sign in
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">
                      {isSignUp ? "Already have an account?" : "Don't have an account?"}
                    </span>{" "}
                    <button
                      onClick={() => { setIsSignUp(!isSignUp); setSignUpStep(1); }}
                      className="text-foreground font-medium hover:underline"
                    >
                      {isSignUp ? "Sign in" : "Sign up"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;