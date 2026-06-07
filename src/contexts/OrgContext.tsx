import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PlanLimits {
  max_events: number;
  max_attendees_per_event: number;
  max_team_members: number;
  features: string[];
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  owner_id: string;
  plan: string;
  plan_limits: PlanLimits;
  billing_email: string | null;
  addons: string[];
  webinar_branding_enabled?: boolean | null;
}

interface Subscription {
  id: string;
  plan: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
}

interface OrgContextType {
  org: Organization | null;
  subscription: Subscription | null;
  loading: boolean;
  eventCount: number;
  memberCount: number;
  canCreateEvent: boolean;
  hasFeature: (feature: string) => boolean;
  hasAddon: (addon: string) => boolean;
  refreshOrg: () => Promise<void>;
  onboardingCompleted: boolean;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  subscription: null,
  loading: true,
  eventCount: 0,
  memberCount: 0,
  canCreateEvent: false,
  hasFeature: () => false,
  hasAddon: () => false,
  refreshOrg: async () => {},
  onboardingCompleted: false,
});

export const useOrg = () => useContext(OrgContext);

const PLAN_DETAILS: Record<string, { name: string; limits: PlanLimits }> = {
  free: {
    name: "Free",
    limits: { max_events: 3, max_attendees_per_event: 50, max_team_members: 1, features: ["basic_analytics"] },
  },
  starter: {
    name: "Starter",
    limits: { max_events: 10, max_attendees_per_event: 200, max_team_members: 3, features: ["basic_analytics", "custom_branding", "email_notifications"] },
  },
  pro: {
    name: "Pro",
    limits: { max_events: 50, max_attendees_per_event: 1000, max_team_members: 10, features: ["basic_analytics", "advanced_analytics", "custom_branding", "email_notifications", "sponsor_management", "custom_domain"] },
  },
  business: {
    name: "Business",
    limits: { max_events: -1, max_attendees_per_event: -1, max_team_members: -1, features: ["basic_analytics", "advanced_analytics", "custom_branding", "email_notifications", "sponsor_management", "custom_domain", "api_access", "priority_support", "white_label"] },
  },
};

export { PLAN_DETAILS };
export type { Organization, Subscription, PlanLimits };

export const OrgProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventCount, setEventCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const fetchOrg = async () => {
    if (!user) {
      setOrg(null);
      setSubscription(null);
      setEventCount(0);
      setMemberCount(0);
      setOnboardingCompleted(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Check onboarding status
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    setOnboardingCompleted(profile?.onboarding_completed ?? false);

    // Get user's org membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setLoading(false);
      return;
    }

    // Fetch org
    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", membership.org_id)
      .single();

    if (orgData) {
      setOrg({
        ...orgData,
        plan_limits: (orgData.plan_limits as unknown as PlanLimits) || PLAN_DETAILS.free.limits,
        addons: ((orgData as any).addons as string[]) || [],
      });

      // Fetch subscription
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("org_id", orgData.id)
        .maybeSingle();
      setSubscription(subData);

      // Count events
      const { count: evtCount } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgData.id);
      setEventCount(evtCount || 0);

      // Count members
      const { count: memCount } = await supabase
        .from("org_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgData.id);
      setMemberCount(memCount || 0);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchOrg();
  }, [user]);

  const limits = org?.plan_limits || PLAN_DETAILS.free.limits;
  const canCreateEvent = limits.max_events === -1 || eventCount < limits.max_events;

  const hasFeature = (feature: string) => {
    return limits.features.includes(feature);
  };

  const hasAddon = (addon: string) => {
    return (org?.addons || []).includes(addon);
  };

  return (
    <OrgContext.Provider
      value={{
        org,
        subscription,
        loading,
        eventCount,
        memberCount,
        canCreateEvent,
        hasFeature,
        hasAddon,
        refreshOrg: fetchOrg,
        onboardingCompleted,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
};
