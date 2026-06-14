import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import type { Community, CommunityMember } from "@/lib/community/types";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Load a single community by slug, plus the current user's membership row
 * (if any). Both are returned in one hook so the layout can decide on join
 * prompts, role-based UI, etc.
 */
export function useCommunityBySlug(slug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community", "by-slug", slug, user?.id ?? null],
    enabled: !!slug,
    queryFn: async () => {
      const { data: community, error } = await supabase
        .from("communities" as never)
        .select("*")
        .eq("slug", slug as string)
        .maybeSingle();
      if (error) throw error;
      if (!community) return { community: null, membership: null };

      let membership: CommunityMember | null = null;
      if (user?.id) {
        const { data } = await supabase
          .from("community_members" as never)
          .select("*")
          .eq("community_id", (community as Community).id)
          .eq("user_id", user.id)
          .maybeSingle();
        membership = (data as CommunityMember | null) ?? null;
      }
      return { community: community as Community, membership };
    },
  });
}

/**
 * List of communities the signed-in user is a member of, plus a separate
 * list of public parent communities they could explore. The hub page
 * combines these into a single tabbed view.
 */
export function useMyCommunities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community", "mine", user?.id ?? null],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members" as never)
        .select("role, status, community:communities(*)")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        role: CommunityMember["role"];
        status: CommunityMember["status"];
        community: Community;
      }>;
    },
  });
}

export function usePublicCommunities() {
  return useQuery({
    queryKey: ["community", "public-parents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities" as never)
        .select("*")
        .eq("kind", "parent")
        .eq("visibility", "public")
        .order("member_count", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Community[];
    },
  });
}

/**
 * Fetch child communities (event communities) for a specific parent hub.
 */
export function useChildCommunities(parentId: string | null) {
  return useQuery({
    queryKey: ["community", "children", parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities" as never)
        .select("*")
        .eq("parent_id", parentId)
        .eq("visibility", "public")
        .order("member_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Community[];
    },
  });
}

/** Resolve `event_id → communities.id` so EventDetailPage can deep-link. */
export function useEventCommunity(eventId: string | undefined) {
  return useQuery({
    queryKey: ["community", "by-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabaseRpc("community_resolve_event" as never, {
        _event_id: eventId,
      } as never);
      if (error) throw error;
      const id = (data as string | null) ?? null;
      if (!id) return null;
      const { data: comm } = await supabase
        .from("communities" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return (comm as Community | null) ?? null;
    },
  });
}
