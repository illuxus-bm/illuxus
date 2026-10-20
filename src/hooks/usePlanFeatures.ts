import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PLANS, parseEntitlements, parsePlan, type Entitlements, type Plan } from "@/lib/plans/features";

// The generated Supabase types predate migration 048.
const db = supabase as unknown as {
  from: (table: string) => {
    select: (cols: string) => { order: (col: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const PLANS_QUERY_KEY = ["plans"] as const;
export const entitlementsQueryKey = (orgId: string | null | undefined) => ["org-entitlements", orgId ?? null] as const;

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await db.from("plans").select("*").order("sort_order");
  if (error || !data || data.length === 0) return DEFAULT_PLANS;
  return (data as Record<string, unknown>[]).map(parsePlan);
}

/** Every plan, in display order. Falls back to the built-in plans until migration 048 is applied. */
export function usePlans() {
  return useQuery({ queryKey: PLANS_QUERY_KEY, queryFn: fetchPlans, staleTime: 60_000 });
}

export async function fetchOrgEntitlements(orgId: string): Promise<Entitlements | null> {
  const { data, error } = await db.rpc("org_entitlements", { _org_id: orgId });
  if (error) return null;
  return parseEntitlements(data);
}

/**
 * What an organisation's plan includes. `null` data means the server couldn't
 * say (migration not applied, or no access); callers treat that as allowed,
 * matching the edge functions, because the database still guards the writes.
 */
export function useOrgEntitlements(orgId: string | null | undefined) {
  return useQuery({
    queryKey: entitlementsQueryKey(orgId),
    queryFn: () => fetchOrgEntitlements(orgId as string),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

/** The organisation an event belongs to (cached; `null` for personal events). */
export function useEventOrgId(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ["event-org-id", eventId ?? null],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("org_id").eq("id", eventId as string).maybeSingle();
      return (data as { org_id: string | null } | null)?.org_id ?? null;
    },
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });
}

/** Does this organisation have `feature`? `undefined` while loading. */
export function useHasFeature(orgId: string | null | undefined, feature: string): boolean | undefined {
  const { data, isLoading } = useOrgEntitlements(orgId);
  if (!orgId) return true;
  if (isLoading) return undefined;
  return data ? data.features.includes(feature) : true;
}

/** Whether `feature` is known to be missing for an event's organisation. Super admins are never locked out. */
export function useEventFeatureLocked(eventId: string | null | undefined, feature: string) {
  const { isAdmin } = useAuth();
  const { data: orgId } = useEventOrgId(eventId);
  const has = useHasFeature(orgId, feature);
  return { orgId: orgId ?? null, locked: !isAdmin && has === false };
}
