import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AuthorProfile, CommunityChannel, CommunityMessage, MessageWithAuthor } from "@/lib/community/types";

export function useCommunityChannels(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community", "channels", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_channels" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .eq("archived", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CommunityChannel[];
    },
  });
}

const MSG_PAGE = 50;

export function useChannelMessages(channelId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["community", "messages", channelId], [channelId]);

  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_messages" as never)
        .select("*")
        .eq("channel_id", channelId as string)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MSG_PAGE);
      if (error) throw error;
      const msgs = ((data as unknown as CommunityMessage[]) ?? []).reverse();
      const ids = Array.from(new Set(msgs.map((m) => m.author_id)));
      if (ids.length === 0) return [] as MessageWithAuthor[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      const byUser = new Map<string, AuthorProfile>();
      (profs ?? []).forEach((p) => byUser.set(p.user_id, p as AuthorProfile));
      return msgs.map((m) => ({ ...m, author: byUser.get(m.author_id) ?? null }));
    },
  });

  // Realtime: append new messages live.
  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`channel:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const row = payload.new as CommunityMessage;
          const { data: prof } = await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .eq("user_id", row.author_id)
            .maybeSingle();
          const withAuthor: MessageWithAuthor = { ...row, author: (prof as AuthorProfile | null) ?? null };
          qc.setQueryData<MessageWithAuthor[]>(queryKey, (prev) => {
            if (!prev) return prev;
            if (prev.some((m) => m.id === withAuthor.id)) return prev;
            return [...prev, withAuthor];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, qc, queryKey]);

  return query;
}

export function useSendMessage(channelId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!channelId) throw new Error("No channel");
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Empty message");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("community_messages" as never)
        .insert({ channel_id: channelId, author_id: auth.user.id, body: trimmed } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "messages", channelId] });
    },
  });
}
