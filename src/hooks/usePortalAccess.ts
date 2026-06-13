import { useQuery } from "@tanstack/react-query";
import { logger, supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRoleAssignments } from "@/types/portals";

/**
 * Detects whether the current user has Speaker or Sponsor portal access.
 * Used by SiteHeader and DashboardLayout to conditionally render
 * "Speaker Dashboard" and "Sponsor Dashboard" menu items.
 *
 * Uses a SECURITY DEFINER RPC so it bypasses RLS for the lookup —
 * speakers are matched by email (speakers.email = auth.users.email),
 * sponsors are matched by accepted sponsor_members row.
 */
export function usePortalAccess() {
  const { user } = useAuth();

  return useQuery<UserRoleAssignments>({
    queryKey: ["portal-access", user?.id],
    queryFn: async () => {
      if (!user) return { has_speaker: false, has_sponsor: false };
      const { data, error } = await supabaseRpc("user_role_assignments" as never);
      if (error) {
        // Non-fatal — fail closed (no portal access shown)
        logger.warn("portal access fetch failed", {
          error_message: error instanceof Error ? error.message : String(error),
        });
        return { has_speaker: false, has_sponsor: false };
      }
      return (data as unknown as UserRoleAssignments) ?? { has_speaker: false, has_sponsor: false };
    },
    enabled: !!user,
    staleTime: 60_000, // 1 minute — role assignments rarely change
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
