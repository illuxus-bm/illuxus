import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Ticket, Building2, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import TwoFactorChallengeDialog from "@/components/auth/TwoFactorChallengeDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { content } = useSiteContent();
  const { theme: appTheme } = useTheme();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isForgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
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
          },
        },
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Check your email",
          description: `We sent a verification link to ${email}. Open it to activate your account.`,
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
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        // Look up the user's account type to route correctly
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.rpc("get_my_profile");
          const p = profile as { account_type?: string; two_factor_enabled?: boolean } | null;
          const next = p?.account_type === "attendee" ? "/u/me/events" : "/dashboard";
          if (p?.two_factor_enabled) {
            // Pause and require an OTP before letting them through.
            setTwoFactor({ open: true, email: user.email ?? email, nextRoute: next });
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

  const title = isForgot
    ? "Reset password"
    : isSignUp
    ? signUpStep === 1
      ? accountType === "attendee" ? "Create your attendee account" : "Create your organizer account"
      : "A few details about you"
    : "Welcome back";
  const buttonText = isForgot
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
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt={brandName}
                className="h-8 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <span className="text-lg font-semibold tracking-tight">{brandName}</span>
            )}
          </a>
          <p className="text-muted-foreground text-sm">{title}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          {!isForgot && (!isSignUp || signUpStep === 1) && (
            <div className="grid grid-cols-2 gap-1 p-1 mb-5 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setAccountType("attendee")}
                className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${
                  accountType === "attendee"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Ticket className="h-3.5 w-3.5" /> Attendee
              </button>
              <button
                type="button"
                onClick={() => setAccountType("organizer")}
                className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${
                  accountType === "organizer"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" /> Organizer
              </button>
            </div>
          )}
          {!isForgot && (!isSignUp || signUpStep === 1) && (
            <p className="text-[11px] text-muted-foreground mb-4 -mt-1">
              {accountType === "attendee"
                ? "Attend events and manage your tickets."
                : "Run an organization and host events."}
            </p>
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
                if (!email || password.length < 6) {
                  toast({ title: "Check your details", description: "Enter your email and a password of 6+ characters.", variant: "destructive" });
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
                    minLength={6}
                    className="h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            </>
            )}
            {isSignUp && signUpStep === 2 && (
              <PersonFieldsForm value={{ ...person, email }} onChange={(v) => setPerson(v)} hideEmail />
            )}
            <Button type="submit" className="w-full h-9 text-sm font-medium" disabled={loading}>
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