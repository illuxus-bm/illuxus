import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
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

/** A single workspace the signed-in user is a member of. Surfaced via the
 *  workspace switcher so members of multiple orgs can pick which one they're
 *  acting on. */
export interface Membership {
  org_id: string;
  role: string;
  org_name: string;
  org_slug: string;
  org_logo_url: string | null;
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
  /** Every workspace the signed-in user belongs to. Empty when they have none. */
  memberships: Membership[];
  /** Role the signed-in user has on the *currently active* org. */
  myRole: string | null;
  /** Switch the active workspace. The choice is persisted in localStorage. */
  setActiveOrg: (orgId: string) => void;
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
  memberships: [],
  myRole: null,
  setActiveOrg: () => {},
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

const ACTIVE_ORG_KEY = "illuxus.active-org-id";

function loadActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(ACTIVE_ORG_KEY); } catch { return null; }
}
function saveActiveOrgId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_ORG_KEY, id);
    else window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch { /* noop */ }
}

export const OrgProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventCount, setEventCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => loadActiveOrgId());
  const [myRole, setMyRole] = useState<string | null>(null);

  // Switcher action — exposed via context. Validation against the current
  // memberships happens in the next render so a stale id never persists.
  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    saveActiveOrgId(orgId);
  }, []);

  const fetchOrg = useCallback(async () => {
    if (!user) {
      setOrg(null);
      setSubscription(null);
      setEventCount(0);
      setMemberCount(0);
      setOnboardingCompleted(false);
      setMemberships([]);
      setMyRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Onboarding flag — used by `OnboardingGuard` upstream.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();
    setOnboardingCompleted(profile?.onboarding_completed ?? false);

    // Pull EVERY workspace the user belongs to so the switcher has a list to
    // render. Includes the org's display fields via a relational select so a
    // single query is sufficient — no N+1 lookup per workspace.
    const { data: memRows } = await supabase
      .from("org_members")
      .select("org_id, role, organizations:org_id(id, name, slug, logo_url)")
      .eq("user_id", user.id);

    type MemRow = {
      org_id: string;
      role: string;
      organizations: { id: string; name: string; slug: string; logo_url: string | null } | null;
    };
    const rows = (memRows ?? []) as MemRow[];
    const list: Membership[] = rows
      .filter((r) => r.organizations) // RLS could hide an org row on rare occasions
      .map((r) => ({
        org_id: r.org_id,
        role: r.role,
        org_name: r.organizations!.name,
        org_slug: r.organizations!.slug,
        org_logo_url: r.organizations!.logo_url,
      }))
      // Stable order: alphabetical by name keeps the dropdown predictable.
      .sort((a, b) => a.org_name.localeCompare(b.org_name));
    setMemberships(list);

    // Fallback: user owns an org but has no membership row (legacy / repair).
    let allOrgIds = list.map((m) => m.org_id);
    if (allOrgIds.length === 0) {
      const { data: ownedOrg } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url")
        .eq("owner_id", user.id)
        .limit(1)
        .maybeSingle();
      if (ownedOrg) {
        // Auto-repair: insert the missing org_members row so future loads
        // don't need this branch.
        await supabase.from("org_members").insert({
          org_id: ownedOrg.id,
          user_id: user.id,
          role: "owner",
        }).then(() => {});
        const repaired: Membership = {
          org_id: ownedOrg.id,
          role: "owner",
          org_name: ownedOrg.name,
          org_slug: ownedOrg.slug,
          org_logo_url: ownedOrg.logo_url,
        };
        setMemberships([repaired]);
        allOrgIds = [ownedOrg.id];
      }
    }

    if (allOrgIds.length === 0) {
      setOrg(null);
      setSubscription(null);
      setMyRole(null);
      setLoading(false);
      return;
    }

    // Resolve the active workspace. Honour the persisted choice when it's
    // still in the user's membership list; otherwise fall back to the first
    // (alphabetical) workspace and refresh storage.
    const persisted = activeOrgId && allOrgIds.includes(activeOrgId) ? activeOrgId : null;
    const effectiveOrgId = persisted ?? allOrgIds[0];
    if (effectiveOrgId !== activeOrgId) {
      setActiveOrgIdState(effectiveOrgId);
      saveActiveOrgId(effectiveOrgId);
    }
    const myMembership = list.find((m) => m.org_id === effectiveOrgId)
      ?? memberships.find((m) => m.org_id === effectiveOrgId);
    setMyRole(myMembership?.role ?? null);

    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", effectiveOrgId)
      .single();

    if (orgData) {
      setOrg({
        ...orgData,
        plan_limits: (orgData.plan_limits as unknown as PlanLimits) || PLAN_DETAILS.free.limits,
        addons: ((orgData as { addons?: string[] }).addons) || [],
      });

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("org_id", orgData.id)
        .maybeSingle();
      setSubscription(subData);

      const { count: evtCount } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgData.id);
      setEventCount(evtCount || 0);

      const { count: memCount } = await supabase
        .from("org_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgData.id);
      setMemberCount(memCount || 0);
    } else {
      setOrg(null);
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeOrgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const limits = org?.plan_limits || PLAN_DETAILS.free.limits;
  const canCreateEvent = limits.max_events === -1 || eventCount < limits.max_events;

  const hasFeature = (feature: string) => limits.features.includes(feature);
  const hasAddon = (addon: string) => (org?.addons || []).includes(addon);

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
        memberships,
        myRole,
        setActiveOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
};
