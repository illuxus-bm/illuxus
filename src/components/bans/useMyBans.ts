import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseRpc } from "@/lib/observability";

/** One of the signed-in user's bans (platform or community) and its latest unban request. */
export interface MyBan {
  scope: "platform" | "community";
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  banned_at: string | null;
  reason: string | null;
  request_id: string | null;
  request_status: "pending" | "approved" | "rejected" | null;
  request_created_at: string | null;
  review_note: string | null;
}

/** The signed-in user's bans and where their requests stand. */
export function useMyBans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-bans", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseRpc<MyBan[]>("my_bans");
      if (error) throw error;
      return data ?? [];
    },
  });
}

