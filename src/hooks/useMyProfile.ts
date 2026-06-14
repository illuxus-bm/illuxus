import { useQuery } from "@tanstack/react-query";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shape returned by the `get_my_profile` RPC. Mirrors the generated
 * Supabase types but kept local so feature code doesn't have to import
 * the giant generated `Database` type just to read a profile.
 */
export interface MyProfile {
  account_type: string;
  avatar_url: string | null;
  bio: string | null;
  city_id: string | null;
  company: string | null;
  company_employee_count: string | null;
  company_website: string | null;
  designation: string | null;
  display_name: string | null;
  email_verified: boolean;
  first_name: string | null;
  headline: string | null;
  industry: string | null;
  last_name: string | null;
  linkedin_url: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  mobile_verified: boolean;
  title: string | null;
  username: string | null;
}

/**
 * Returns the signed-in user's profile via the `get_my_profile` RPC.
 *
 * Cached for 5 minutes — the apply dialogs and any other surface that
 * prefills from the profile will share the same query result without
 * hitting the network on every mount.
 *
 * Returns `null` data when the user is not signed in (so callers can
 * branch on `data` without a separate auth check).
 */
export function useMyProfile() {
  const { user } = useAuth();
  return useQuery<MyProfile | null>({
    queryKey: ["my-profile", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseRpc("get_my_profile");
      if (error) throw error;
      return (data as unknown as MyProfile | null) ?? null;
    },
  });
}

/**
 * Build a "Firstname Lastname" string from a profile, falling back to
 * display_name, username, or empty string. Helpful for prefilling the
 * full-name fields on application dialogs.
 */
export function profileFullName(p: MyProfile | null | undefined): string {
  if (!p) return "";
  const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fl || p.display_name || p.username || "";
}
