/**
 * Plan feature checks for edge functions (migration 048, org_has_feature).
 *
 * An explicit "not included" is always honoured. If the check itself can't be
 * made — the migration isn't applied yet, or the database call fails — the
 * request is allowed: a hiccup must not take a feature away from an organiser
 * who is entitled to it, and the database triggers still guard the writes.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function orgHasFeature(
  admin: SupabaseClient,
  orgId: string | null | undefined,
  feature: string,
): Promise<boolean> {
  if (!orgId) return true;
  const { data, error } = await admin.rpc("org_has_feature", { _org_id: orgId, _feature: feature });
  if (error) return true;
  return data !== false;
}

export async function eventHasFeature(
  admin: SupabaseClient,
  eventId: string | null | undefined,
  feature: string,
): Promise<boolean> {
  if (!eventId) return true;
  const { data, error } = await admin.from("events").select("org_id").eq("id", eventId).maybeSingle();
  if (error || !data) return true;
  return orgHasFeature(admin, (data as { org_id: string | null }).org_id, feature);
}

/** Response body for a request the plan doesn't cover (sent with HTTP 403). */
export function featureNotIncluded(feature: string, label: string): Record<string, unknown> {
  return {
    error: `This organiser's plan doesn't include ${label}.`,
    code: "plan_feature_not_included",
    feature,
  };
}
