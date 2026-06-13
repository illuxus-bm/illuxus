import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import type {
  AuthorProfile,
  CommentWithAuthor,
  CommunityPost,
  PostWithAuthor,
} from "@/lib/community/types";
import type { CommunityPostType } from "@/lib/community/rbac";

const PAGE_SIZE = 20;

async function attachAuthors(posts: CommunityPost[]): Promise<PostWithAuthor[]> {
  if (posts.length === 0) return [];
  const ids = Array.from(new Set(posts.map((p) => p.author_id)));
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", ids);
  const byUser = new Map<string, AuthorProfile>();
  (data ?? []).forEach((p) => byUser.set(p.user_id, p as AuthorProfile));
  return posts.map((p) => ({ ...p, author: byUser.get(p.author_id) ?? null }));
}

/**
 * Infinite-scroll feed for one community, with optional type filter and a
 * realtime subscription that prepends new posts as they arrive.
 */
export function useCommunityFeed(
  communityId: string | undefined,
  filter: { type?: CommunityPostType; pinned?: boolean } = {},
) {
  const qc = useQueryClient();
  const queryKey = ["community", "feed", communityId, filter];

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!communityId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("community_posts" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (filter.type) q = q.eq("type", filter.type);
      if (filter.pinned !== undefined) q = q.eq("pinned", filter.pinned);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return attachAuthors((data as unknown as CommunityPost[]) ?? []);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < PAGE_SIZE ? null : lastPage[lastPage.length - 1].created_at,
  });

  // Realtime: prepend new posts to the first page.
  useEffect(() => {
    if (!communityId) return;
    const channel = supabase
      .channel(`community:${communityId}:feed`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_posts",
          filter: `community_id=eq.${communityId}`,
        },
        async (payload) => {
          const row = payload.new as CommunityPost;
          if (row.hidden) return;
          if (filter.type && row.type !== filter.type) return;
          const [withAuthor] = await attachAuthors([row]);
          qc.setQueryData<{ pages: PostWithAuthor[][]; pageParams: unknown[] }>(
            queryKey,
            (prev) => {
              if (!prev) return prev;
              const first = prev.pages[0] ?? [];
              if (first.some((p) => p.id === withAuthor.id)) return prev;
              return {
                ...prev,
                pages: [[withAuthor, ...first], ...prev.pages.slice(1)],
              };
            },
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, filter.type, filter.pinned]);

  return query;
}

/** Comments on a single post. Lightweight — Phase 1 doesn't realtime-subscribe per post. */
export function usePostComments(postId: string | undefined) {
  return useQuery({
    queryKey: ["community", "comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_comments" as never)
        .select("*")
        .eq("post_id", postId as string)
        .eq("hidden", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data as unknown as CommentWithAuthor[]) ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.author_id)));
      if (ids.length === 0) return rows;
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      const byUser = new Map<string, AuthorProfile>();
      (profs ?? []).forEach((p) => byUser.set(p.user_id, p as AuthorProfile));
      return rows.map((c) => ({ ...c, author: byUser.get(c.author_id) ?? null }));
    },
  });
}

export function useCreatePost(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: CommunityPostType;
      title?: string;
      body_md: string;
      attachments?: unknown[];
      link_url?: string;
    }) => {
      if (!communityId) throw new Error("No community");
      const { data, error } = await supabaseRpc("community_create_post" as never, {
        _community_id: communityId,
        _type: input.type,
        _title: input.title ?? null,
        _body_md: input.body_md,
        _attachments: input.attachments ?? [],
        _link_url: input.link_url ?? null,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "feed", communityId] });
    },
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId?: string; commentId?: string; emoji?: string }) => {
      const { data, error } = await supabaseRpc("community_react" as never, {
        _post_id: input.postId ?? null,
        _comment_id: input.commentId ?? null,
        _emoji: input.emoji ?? "👍",
      } as never);
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: (_d, vars) => {
      if (vars.postId) qc.invalidateQueries({ queryKey: ["community", "feed"] });
      if (vars.commentId) qc.invalidateQueries({ queryKey: ["community", "comments"] });
    },
  });
}

export function useAddComment(postId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body_md: string) => {
      if (!postId) throw new Error("No post");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("community_comments" as never)
        .insert({
          post_id: postId,
          author_id: auth.user.id,
          body_md,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "comments", postId] });
      qc.invalidateQueries({ queryKey: ["community", "feed"] });
    },
  });
}

export function useJoinCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await supabaseRpc("community_join" as never, {
        _community_id: communityId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

export function useLeaveCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await supabaseRpc("community_leave" as never, {
        _community_id: communityId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}
