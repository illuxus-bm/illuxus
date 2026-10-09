/**
 * Read OTHER users' public profile fields (name, avatar, headline, company…).
 *
 * `profiles` rows are readable only by their owner or a platform admin
 * (migration 038) because they hold mobile numbers, verification / 2FA flags
 * and attribution data. Everything another user may see comes from the
 * `profiles_public` view, which carries only the columns below.
 *
 * Reading your own profile is unaffected — query `profiles` (or the
 * `get_my_profile` RPC) for that.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PublicProfile {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  company: string | null;
  designation: string | null;
}

const COLUMNS = "user_id, display_name, first_name, last_name, username, avatar_url, headline, bio, company, designation";

/** Public profiles for the given user ids (duplicates and blanks ignored). */
export async function fetchPublicProfiles(userIds: readonly (string | null | undefined)[]): Promise<PublicProfile[]> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return [];

  const fromView = await supabase.from("profiles_public" as never).select(COLUMNS).in("user_id", ids);
  if (!fromView.error) return (fromView.data as unknown as PublicProfile[]) ?? [];

  // The view ships with migration 038. Until that has been applied the table
  // is still readable, so fall back to it rather than showing "Unknown".
  const fromTable = await supabase.from("profiles").select(COLUMNS).in("user_id", ids);
  return (fromTable.data as unknown as PublicProfile[]) ?? [];
}

/** One user's public profile, or null. */
export async function fetchPublicProfile(userId: string | null | undefined): Promise<PublicProfile | null> {
  return (await fetchPublicProfiles([userId]))[0] ?? null;
}
