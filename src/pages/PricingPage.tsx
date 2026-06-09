import { useState } from "react";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, Zap, Crown, Globe, Rocket, Radio, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const PLANS = [
  {
    key: "free", name: "Free", price: "$0", period: "forever", icon: Rocket,
    features: ["3 events", "50 attendees/event", "Basic analytics", "1 team member"],
  },
  {
    key: "starter", name: "Starter", price: "$29", period: "/month", icon: Zap,
    features: ["10 events", "200 attendees/event", "Custom branding", "Email notifications", "3 team members"],
  },
  {
    key: "pro", name: "Pro", price: "$79", period: "/month", icon: Crown, highlight: true,
    features: ["50 events", "1,000 attendees/event", "Advanced analytics", "Sponsor management", "Custom domain", "10 team members"],
  },
  {
    key: "business", name: "Business", price: "$199", period: "/month", icon: Globe,
    features: ["Unlimited events", "Unlimited attendees", "API access", "White label", "Priority support", "Unlimited members"],
  },
];

const PricingPage = () => {
  const { org, subscription, refreshOrg, eventCount, memberCount } = useOrg();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [togglingAddon, setTogglingAddon] = useState(false);
  const webinarEnabled = (org?.addons || []).includes("webinar");

  const handleChangePlan = async (planKey: string) => {
    if (!org) return;
    setUpgrading(planKey);
    const limits = PLAN_DETAILS[planKey]?.limits || PLAN_DETAILS.free.limits;

    await supabase.from("organizations").update({ plan: planKey, plan_limits: limits as any }).eq("id", org.id);
    await supabase.from("subscriptions").update({ plan: planKey }).eq("org_id", org.id);
    await refreshOrg();
    setUpgrading(null);
    toast({ title: "Plan updated", description: `You're now on the ${PLAN_DETAILS[planKey]?.name || planKey} plan.` });
  };

  const currentPlan = org?.plan || "free";

  const toggleWebinarAddon = async () => {
    if (!org) return;
    setTogglingAddon(true);
    const next = webinarEnabled
      ? (org.addons || []).filter((a) => a !== "webinar")
      : [...(org.addons || []), "webinar"];
    const { error } = await supabase
      .from("organizations")
      .update({ addons: next as any })
      .eq("id", org.id);
    setTogglingAddon(false);
    if (error) {
      toast({ title: "Could not update add-on", description: error.message, variant: "destructive" });
    } else {
      await refreshOrg();
      toast({
        title: webinarEnabled ? "Webinar add-on disabled" : "Webinar add-on enabled",
        description: webinarEnabled ? "Built-in streaming is no longer available." : "Built-in streaming, Q&A, polls and lounge are now active.",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Plans & Billing</h1>
          <p className="text-[13px] text-muted-foreground">Manage your subscription and billing</p>
        </div>

        {/* Current plan card */}
        <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-muted-foreground uppercase tracking-wider font-medium">Current Plan</p>
            <p className="text-xl font-bold mt-0.5">{PLAN_DETAILS[currentPlan]?.name || "Free"}</p>
            {subscription && (
              <p className="text-[12px] text-muted-foreground mt-1">
                {subscription.status === "active" ? "Active" : subscription.status} · Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{PLANS.find(p => p.key === currentPlan)?.price || "$0"}</p>
            <p className="text-[12px] text-muted-foreground">{PLANS.find(p => p.key === currentPlan)?.period}</p>
          </div>
        </div>

        {/* Usage */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Usage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UsageBar label="Events" current={eventCount} max={PLAN_DETAILS[currentPlan]?.limits.max_events || 3} />
            <UsageBar label="Team members" current={memberCount} max={PLAN_DETAILS[currentPlan]?.limits.max_team_members || 1} />
            <UsageBar label="Max attendees/event" current={0} max={PLAN_DETAILS[currentPlan]?.limits.max_attendees_per_event || 50} />
          </div>
        </div>

        {/* Plans */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Available Plans</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`relative bg-card border rounded-xl p-4 ${
                  plan.key === currentPlan ? "border-foreground shadow-sm" : "border-border"
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
                  {plan.price}<span className="text-xs font-normal text-muted-foreground">{plan.period}</span>
                </p>
                <ul className="mt-3 space-y-1.5 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                      <Check className="h-3 w-3 mt-0.5 text-foreground shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.key === currentPlan ? "outline" : "default"}
                  size="sm"
                  className="w-full h-8 text-[12px]"
                  disabled={plan.key === currentPlan || upgrading === plan.key}
                  onClick={() => handleChangePlan(plan.key)}
                >
                  {plan.key === currentPlan ? "Current plan" : upgrading === plan.key ? "Updating..." : "Switch"}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Add-ons */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Add-ons</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`relative bg-card border rounded-xl p-4 ${webinarEnabled ? "border-foreground" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Radio className="h-4 w-4" />
                    <p className="text-sm font-semibold">Webinar Studio</p>
                    {webinarEnabled && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/15 text-green-700 dark:text-green-400 rounded">Active</span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">Airmeet-style virtual events: up to 10 speakers, unlimited viewers, Q&amp;A, polls, networking lounge, recording.</p>
                  <p className="text-lg font-bold mt-2">$49<span className="text-xs font-normal text-muted-foreground">/month</span></p>
                </div>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
              <Button
                variant={webinarEnabled ? "outline" : "default"}
                size="sm"
                className="w-full h-8 text-[12px] mt-3"
                disabled={togglingAddon}
                onClick={toggleWebinarAddon}
              >
                {togglingAddon ? "Updating…" : webinarEnabled ? "Disable add-on" : "Enable add-on"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
  const isUnlimited = max === -1;
  const pct = isUnlimited ? 5 : Math.min((current / max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className="text-[12px] font-medium">{current}{isUnlimited ? " / ∞" : ` / ${max}`}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? "bg-destructive" : "bg-foreground/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default PricingPage;
