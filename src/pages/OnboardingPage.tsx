import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Rocket, Check, ArrowRight, Sparkles, Zap, Crown, Globe } from "lucide-react";
import {
  sanitizeHandleInput,
  validateHandle,
  HANDLE_MAX_LEN,
} from "@/lib/workspace-handle";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Rocket,
    highlight: false,
    features: ["3 events", "50 attendees/event", "Basic analytics", "1 team member"],
  },
  {
    key: "starter",
    name: "Starter",
    price: "$29",
    period: "/month",
    icon: Zap,
    highlight: false,
    features: ["10 events", "200 attendees/event", "Custom branding", "Email notifications", "3 team members"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$79",
    period: "/month",
    icon: Crown,
    highlight: true,
    features: ["50 events", "1,000 attendees/event", "Advanced analytics", "Sponsor management", "Custom domain", "10 team members"],
  },
  {
    key: "business",
    name: "Business",
    price: "$199",
    period: "/month",
    icon: Globe,
    highlight: false,
    features: ["Unlimited events", "Unlimited attendees", "API access", "White label", "Priority support", "Unlimited team members"],
  },
];

const OnboardingPage = () => {
  const { user } = useAuth();
  const { refreshOrg, onboardingCompleted, org, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // If already onboarded, redirect to dashboard
  useEffect(() => {
    if (!orgLoading && onboardingCompleted && org) {
      navigate("/dashboard", { replace: true });
    }
  }, [orgLoading, onboardingCompleted, org, navigate]);
  const [orgName, setOrgName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [checkingSub, setCheckingSub] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [saving, setSaving] = useState(false);

  // Avoid flashing the onboarding UI while we're still resolving the user's org
  // (or while we're about to redirect them to the dashboard).
  if (orgLoading || (onboardingCompleted && org)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, HANDLE_MAX_LEN);

  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!subdomainTouched) setSubdomain(slugify(v));
    setSubdomainError(null);
  };

  const validateSubdomain = (s: string): string | null => {
    const result = validateHandle(s);
    return result.ok ? null : result.message;
  };

  const continueToPlan = async () => {
    const err = validateSubdomain(subdomain);
    if (err) { setSubdomainError(err); return; }
    setCheckingSub(true);
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();
    setCheckingSub(false);
    if (data) { setSubdomainError("That subdomain is already taken."); return; }
    setSubdomainError(null);
    setStep(1);
  };

  const handleComplete = async () => {
    if (!user || !orgName.trim()) return;
    setSaving(true);

    const baseSlug = slugify(orgName);
    const planLimits = PLAN_DETAILS[selectedPlan]?.limits || PLAN_DETAILS.free.limits;

    // Create org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: orgName.trim(),
        slug: baseSlug + "-" + Date.now().toString(36),
        subdomain: subdomain || null,
        owner_id: user.id,
        plan: selectedPlan,
        plan_limits: planLimits as any,
        billing_email: user.email,
      })
      .select()
      .single();

    if (orgErr || !org) {
      toast({ title: "Error", description: orgErr?.message || "Failed to create organization", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Add as member
    await supabase.from("org_members").insert({
      org_id: org.id,
      user_id: user.id,
      role: "owner",
    });

    // Create subscription
    await supabase.from("subscriptions").insert({
      org_id: org.id,
      plan: selectedPlan,
      status: "active",
    });

    // Mark onboarding done
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("user_id", user.id);

    await refreshOrg();
    setSaving(false);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step >= s ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s + 1}
              </div>
              {s < 1 && <div className={`w-16 h-0.5 ${step > 0 ? "bg-foreground" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-md mx-auto"
            >
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-6 w-6 text-foreground" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
                <p className="text-sm text-muted-foreground mt-1">Set up your organization to start managing events</p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <div>
                  <Label className="text-[13px]">Organization name</Label>
                  <Input
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="Acme Events Inc."
                    className="mt-1.5 h-9 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-[13px]">Workspace handle</Label>
                  <div className="flex items-center mt-1.5 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <span className="px-2.5 h-9 inline-flex items-center text-[12px] text-muted-foreground bg-muted border-r border-input shrink-0 font-mono">
                      {(typeof window !== "undefined" ? window.location.host.replace(/^www\./, "") : "yourapp.com")}/
                    </span>
                    <input
                      value={subdomain}
                      onChange={(e) => {
                        setSubdomainTouched(true);
                        setSubdomain(sanitizeHandleInput(e.target.value));
                        setSubdomainError(null);
                      }}
                      placeholder="acme"
                      className="flex-1 min-w-0 h-9 px-2 text-sm font-mono bg-transparent outline-none"
                      aria-label="Workspace handle"
                    />
                  </div>
                  {subdomainError ? (
                    <p className="text-[11px] text-destructive mt-1">{subdomainError}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">Your public landing page lives here. You can change this later.</p>
                  )}
                </div>
                <Button
                  onClick={continueToPlan}
                  disabled={!orgName.trim() || !subdomain || checkingSub}
                  className="w-full h-9 text-sm font-medium gap-1"
                >
                  {checkingSub ? "Checking…" : "Continue"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-foreground" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Choose your plan</h1>
                <p className="text-sm text-muted-foreground mt-1">You can change this anytime. Start free, upgrade when ready.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {PLANS.map((plan) => (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      selectedPlan === plan.key
                        ? "border-foreground bg-foreground/[0.02] shadow-sm"
                        : "border-border hover:border-foreground/20"
                    } ${plan.highlight ? "ring-1 ring-accent/20" : ""}`}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-2.5 left-3 px-2 py-0.5 text-[10px] font-semibold bg-accent text-accent-foreground rounded-full">
                        Popular
                      </span>
                    )}
                    <plan.icon className="h-5 w-5 text-muted-foreground mb-2" />
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="text-lg font-bold mt-0.5">
                      {plan.price}
                      <span className="text-xs font-normal text-muted-foreground">{plan.period}</span>
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                          <Check className="h-3 w-3 mt-0.5 text-foreground shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {selectedPlan === plan.key && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-foreground flex items-center justify-center">
                        <Check className="h-3 w-3 text-background" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between max-w-md mx-auto">
                <Button variant="ghost" size="sm" onClick={() => setStep(0)} className="text-[13px]">
                  Back
                </Button>
                <Button onClick={handleComplete} disabled={saving} size="sm" className="h-9 px-6 text-[13px] font-medium gap-1">
                  {saving ? "Setting up..." : "Get Started"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OnboardingPage;
