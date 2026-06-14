import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import CityAutocomplete, { type CitySuggestion } from "@/components/CityAutocomplete";
import { CheckCircle2, Loader2, ShieldCheck, UserRound } from "lucide-react";
import PersonFieldsForm, {
  type PersonFields,
  emptyPersonFields,
  validatePersonFields,
  displayName as buildDisplayName,
} from "@/components/people/PersonFieldsForm";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { z } from "zod";

const citySchema = z.string().uuid("Pick your city from the suggestions");

/**
 * Mandatory profile completion screen — shown after signup before the
 * user can access the rest of the platform.
 *
 * Email verification is handled via Supabase's native 6-digit OTP
 * (free, no email-domain setup required). Mobile is captured but not
 * OTP-verified per the chosen setup.
 */
export default function CompleteProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state — uses the same field set as the Settings → Profile and the
  // event registration forms so the three flows stay in lockstep.
  const [person, setPerson] = useState<PersonFields>(emptyPersonFields());
  const [department, setDepartment] = useState("");
  const [city, setCity] = useState<CitySuggestion | null>(null);

  // Verification state
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Hydrate existing profile (in case the user partially filled it before)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Sensitive columns (mobile_number, email_verified) are no longer readable
      // through the table for other users — use the RPC for the caller's own row.
      const { data } = await supabaseRpc("get_my_profile");
      if (cancelled) return;
      const p = data as any;
      if (p) {
        if (p.profile_completed) {
          navigate("/", { replace: true });
          return;
        }
        setPerson({
          title: p.title ?? "",
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          designation: p.designation ?? "",
          company: p.company ?? "",
          email: user.email ?? "",
          mobile_country_code: p.mobile_country_code ?? "",
          mobile_number: p.mobile_number ?? "",
          linkedin_url: p.linkedin_url ?? "",
          company_website: p.company_website ?? "",
          company_employee_count: p.company_employee_count ?? "",
          industry: p.industry ?? "",
        });
        setDepartment(p.department ?? "");
        setEmailVerified(!!p.email_verified);
        if (p.city_id) {
          const { data: c } = await supabase
            .from("cities")
            .select("id, name, region, country, country_code, population")
            .eq("id", p.city_id)
            .maybeSingle();
          const cc = c as any;
          if (cc) {
            setCity({
              id: cc.id,
              name: cc.name,
              region: cc.region,
              country: cc.country,
              country_code: cc.country_code,
              population: cc.population,
              label:
                cc.name +
                (cc.region ? `, ${cc.region}` : "") +
                `, ${cc.country}`,
            });
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  const sendOtp = async () => {
    if (!user?.email) return;
    setOtpSending(true);
    // Uses Supabase's built-in OTP mailer (6-digit code) — no domain setup needed.
    const { error } = await supabase.auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false },
    });
    setOtpSending(false);
    if (error) {
      toast({ title: "Could not send code", description: error.message, variant: "destructive" });
      return;
    }
    setOtpSent(true);
    toast({ title: "Code sent", description: `Check ${user.email} for a 6-digit code.` });
  };

  const verifyOtp = async () => {
    if (!user?.email) return;
    if (!/^\d{6}$/.test(otpCode)) {
      toast({ title: "Invalid code", description: "Enter the 6-digit code.", variant: "destructive" });
      return;
    }
    setOtpVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: user.email,
      token: otpCode,
      type: "email",
    });
    setOtpVerifying(false);
    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      return;
    }
    setEmailVerified(true);
    toast({ title: "Email verified" });
    // Persist verified flag immediately
    await supabase
      .from("profiles")
      .update({ email_verified: true })
      .eq("user_id", user.id);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!emailVerified) {
      toast({
        title: "Verify your email first",
        description: "Please verify your email before completing your profile.",
        variant: "destructive",
      });
      return;
    }

    const personCheck = validatePersonFields({ ...person, email: user.email ?? person.email });
    if (!personCheck.ok) {
      toast({ title: "Check your details", description: personCheck.error, variant: "destructive" });
      return;
    }
    const cityCheck = citySchema.safeParse(city?.id ?? "");
    if (!cityCheck.success) {
      toast({ title: "Check your details", description: cityCheck.error.errors[0].message, variant: "destructive" });
      return;
    }
    if (!department.trim()) {
      toast({ title: "Check your details", description: "Department is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        title: personCheck.data.title || null,
        first_name: personCheck.data.first_name,
        last_name: personCheck.data.last_name,
        display_name: buildDisplayName(personCheck.data),
        department: department.trim(),
        designation: personCheck.data.designation,
        company: personCheck.data.company,
        mobile_country_code: personCheck.data.mobile_country_code,
        mobile_number: personCheck.data.mobile_number,
        linkedin_url: personCheck.data.linkedin_url || null,
        company_website: personCheck.data.company_website || null,
        company_employee_count: personCheck.data.company_employee_count || null,
        industry: personCheck.data.industry || null,
        city_id: cityCheck.data,
        email_verified: true,
        profile_completed: true,
      } as never)
      .eq("user_id", user.id);
    setSaving(false);

    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome aboard!", description: "Your profile is set up." });
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-10">
      {/* Brand wordmark — present on the profile completion screen */}
      <a href="/" className="mb-6 inline-flex" aria-label="illuxus home">
        <IlluxusWordmark height={26} ariaLabel="" />
      </a>
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
            <UserRound className="h-6 w-6 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We need a few details before you continue. All fields are required unless marked optional.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-card border border-border rounded-2xl p-6 space-y-5"
        >
          {/* Email verification */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Email
                </Label>
                <div className="text-sm font-medium truncate">{user?.email}</div>
              </div>
              {emailVerified ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Verified
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={sendOtp}
                  disabled={otpSending}
                  className="h-8 text-xs"
                >
                  {otpSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send code"}
                </Button>
              )}
            </div>
            {!emailVerified && otpSent && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  className="h-9 max-w-[160px] tracking-[0.4em] font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={verifyOtp}
                  disabled={otpVerifying || otpCode.length !== 6}
                  className="h-9 text-xs gap-1"
                >
                  {otpVerifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  Verify
                </Button>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpSending}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Resend
                </button>
              </div>
            )}
          </div>

          {/* Shared person fields — identical to Settings → Profile and the
              event registration form. */}
          <PersonFieldsForm value={person} onChange={setPerson} hideEmail />

          <div>
            <Label className="text-[12px]">Department *</Label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering"
              className="h-9 mt-1 text-sm"
              required
            />
          </div>

          <div>
            <Label className="text-[12px]">City</Label>
            <div className="mt-1">
              <CityAutocomplete value={city} onChange={setCity} required />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Start typing — pick from the global suggestions (e.g. "Mumbai, Maharashtra, India").
            </p>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={saving} className="w-full h-10 text-sm font-medium">
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}