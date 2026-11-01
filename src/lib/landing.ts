/**
 * Where someone lands after signing in, worked out from what they can
 * actually reach — workspaces, portals, the control tower — never from the
 * `account_type` they picked at sign-up. One person can be an organiser, a
 * speaker, a sponsor contact and an attendee at once; the account menu
 * switches between them, and this picks the first stop.
 */
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { partnerHasAccess } from "@/lib/utm/partner-access";

export interface LandingAccess {
  isSuperAdmin: boolean;
  /** Owns, or is a member of, at least one workspace. */
  hasWorkspace: boolean;
  hasSponsor: boolean;
  hasSpeaker: boolean;
  hasPartner: boolean;
  /** Signed up meaning to organise; only matters before any workspace exists. */
  signedUpAsOrganizer: boolean;
}

/**
 * The first stop, most specific first: running the platform, then running
 * events, then the portals someone was invited into, then the attendee feed.
 * An organiser without a workspace yet goes to the dashboard, whose guard
 * sends them on to onboarding.
 */
export function landingPathFor(access: LandingAccess): string {
  if (access.isSuperAdmin) return "/dashboard/admin";
  if (access.hasWorkspace) return "/dashboard";
  if (access.hasSponsor) return "/sponsor";
  if (access.hasSpeaker) return "/speaker";
  if (access.hasPartner) return "/partner";
  if (access.signedUpAsOrganizer) return "/dashboard";
  return "/discover";
}

/**
 * Loads `LandingAccess` for the signed-in user. Each lookup fails closed: a
 * lookup that errors counts as no access, so the worst case is the
 * attendee feed, never a page they can't open.
 */
export async function loadLandingAccess(userId: string, accountType: string | null | undefined): Promise<LandingAccess> {
  const [admin, member, owner, portals, partner] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabase.from("org_members").select("org_id").eq("user_id", userId).limit(1),
    supabase.from("organizations").select("id").eq("owner_id", userId).limit(1),
    supabaseRpc("user_role_assignments" as never),
    partnerHasAccess().catch(() => false),
  ]);
  const roles = (portals.error ? null : portals.data) as { has_speaker?: boolean; has_sponsor?: boolean } | null;
  return {
    isSuperAdmin: !admin.error && !!admin.data,
    hasWorkspace: (!member.error && (member.data?.length ?? 0) > 0) || (!owner.error && (owner.data?.length ?? 0) > 0),
    hasSponsor: roles?.has_sponsor === true,
    hasSpeaker: roles?.has_speaker === true,
    hasPartner: partner === true,
    signedUpAsOrganizer: accountType === "organizer",
  };
}
