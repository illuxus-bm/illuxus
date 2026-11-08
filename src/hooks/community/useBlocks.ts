/**
 * Blocking people (migration 086). A blocked person's posts, comments and
 * chat messages are hidden from the person who blocked them, by the database
 * for every query and live update; the app also skips them while the list
 * refreshes. Blocks are private: the blocked person isn't told.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPublicProfiles, type PublicProfile } from "@/lib/public-profiles";

export const BLOCKS_QUERY_KEY = ["user-blocks"] as const;

// The generated Supabase types predate migration 086.
const blocks = () =>
  (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string; code?: string } | null }>;
      delete: () => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> };
    };
  }).from("user_blocks");

export interface BlockedPerson {
  userId: string;
  blockedAt: string;
  profile: PublicProfile | null;
}

/** The people the signed-in user has blocked, newest first. Empty when signed out or before migration 086. */
export function useBlockedPeople() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...BLOCKS_QUERY_KEY, user?.id ?? null],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<BlockedPerson[]> => {
      const { data, error } = await blocks().select("blocked_id, created_at").order("created_at", { ascending: false });
      if (error) return [];
      const rows = (data ?? []) as Array<{ blocked_id: string; created_at: string }>;
      const profiles = await fetchPublicProfiles(rows.map((r) => r.blocked_id)).catch((): PublicProfile[] => []);
      const byId = new Map(profiles.map((p) => [p.user_id, p]));
      return rows.map((r) => ({ userId: r.blocked_id, blockedAt: r.created_at, profile: byId.get(r.blocked_id) ?? null }));
    },
  });
}

/** Ids of blocked people, for hiding their content while a list catches up. */
export function useBlockedIds(): Set<string> {
  const { data } = useBlockedPeople();
  return new Set((data ?? []).map((b) => b.userId));
}

function useRefreshAfterBlockChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: BLOCKS_QUERY_KEY }),
      // Feeds, comments and chat refetch without (or with) the person.
      qc.invalidateQueries({ queryKey: ["community"] }),
    ]);
}

export function useBlockUser() {
  const { user } = useAuth();
  const refresh = useRefreshAfterBlockChange();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!user) throw new Error("Sign in to block people.");
      if (userId === user.id) throw new Error("You can't block yourself.");
      const { error } = await blocks().insert({ blocker_id: user.id, blocked_id: userId });
      // Already blocked is fine.
      if (error && error.code !== "23505") throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

export function useUnblockUser() {
  const refresh = useRefreshAfterBlockChange();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await blocks().delete().eq("blocked_id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}
