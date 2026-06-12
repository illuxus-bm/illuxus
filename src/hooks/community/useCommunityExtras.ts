// Hooks for the smaller phase-2/3/4 surfaces: polls, calendar, leaderboard,
// reports, connections, notifications, search.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import type {
  AppNotification,
  CalendarItem,
  CommunityConnection,
  CommunityPoll,
  CommunityPollVote,
  CommunityReport,
  LeaderboardRow,
} from "@/lib/community/types";

// ── Polls ─────────────────────────────────────────────────────────────────
export function usePollForPost(postId: string | undefined) {
  return useQuery({
    queryKey: ["community", "poll", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_polls" as never)
        .select("*")
        .eq("post_id", postId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const poll = data as unknown as CommunityPoll;
      const { data: votes } = await supabase
        .from("community_poll_votes" as never)
        .select("*")
        .eq("poll_id", poll.id);
      return { poll, votes: ((votes as unknown as CommunityPollVote[]) ?? []) };
    },
  });
}

export function useVotePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pollId: string; optionId: string }) => {
      const { error } = await supabase.rpc("community_vote" as never, {
        _poll_id: input.pollId, _option_id: input.optionId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "poll"] });
    },
  });
}

export function useCreatePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      communityId: string;
      question: string;
      options: { id: string; label: string }[];
      multi?: boolean;
      closesAt?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("community_create_poll" as never, {
        _community_id: input.communityId,
        _question: input.question,
        _options: input.options,
        _multi: input.multi ?? false,
        _closes_at: input.closesAt ?? null,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "feed"] });
    },
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────
export function useCommunityCalendar(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community", "calendar", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_calendar" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CalendarItem[];
    },
  });
}

// ── Leaderboard ───────────────────────────────────────────────────────────
export function useLeaderboard(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community", "leaderboard", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_leaderboard" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .order("points", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as LeaderboardRow[];
      const ids = rows.map((r) => r.user_id);
      if (ids.length === 0) return rows.map((r) => ({ ...r, profile: null }));
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      const byUser = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      (profs ?? []).forEach((p) => byUser.set(p.user_id, p as never));
      return rows.map((r) => ({ ...r, profile: byUser.get(r.user_id) ?? null }));
    },
  });
}

// ── Reports / Moderation ──────────────────────────────────────────────────
export function useReports(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community", "reports", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_reports" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommunityReport[];
    },
  });
}

export function useReport() {
  return useMutation({
    mutationFn: async (input: { postId?: string; commentId?: string; reason: string; notes?: string }) => {
      const { error } = await supabase.rpc("community_report" as never, {
        _post_id: input.postId ?? null,
        _comment_id: input.commentId ?? null,
        _reason: input.reason,
        _notes: input.notes ?? null,
      } as never);
      if (error) throw error;
    },
  });
}

export function useModerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId?: string; commentId?: string; action: "hide" | "unhide" | "delete" | "pin" | "unpin"; reason?: string }) => {
      const { error } = await supabase.rpc("community_moderate" as never, {
        _post_id: input.postId ?? null,
        _comment_id: input.commentId ?? null,
        _action: input.action,
        _reason: input.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

export function useSetMemberStatus(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; status: "active" | "suspended" | "banned"; reason?: string }) => {
      if (!communityId) throw new Error("No community");
      const { error } = await supabase.rpc("community_set_member_status" as never, {
        _community_id: communityId,
        _user_id: input.userId,
        _status: input.status,
        _reason: input.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "members", communityId] });
    },
  });
}

// ── Connections ───────────────────────────────────────────────────────────
export function useConnections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community", "connections", user?.id ?? null],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_connections" as never)
        .select("*")
        .or(`requester_id.eq.${user!.id},target_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommunityConnection[];
    },
  });
}

export function useConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { targetId: string; kind?: "follow" | "connect"; communityId?: string }) => {
      const { error } = await supabase.rpc("community_connect" as never, {
        _target_id: input.targetId,
        _kind: input.kind ?? "connect",
        _community_id: input.communityId ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "connections"] });
    },
  });
}

export function useRespondConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc("community_respond_connection" as never, {
        _request_id: input.requestId, _accept: input.accept,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "connections"] });
    },
  });
}

// ── Notifications ─────────────────────────────────────────────────────────
export function useAppNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["app-notifications", user?.id ?? null],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_notifications" as never)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as unknown as AppNotification[]);
    },
  });

  // Live subscription: prepend new notifications.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user:${user.id}:notifs`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification;
          qc.setQueryData<AppNotification[]>(["app-notifications", user.id], (prev) => {
            if (!prev) return [n];
            if (prev.some((x) => x.id === n.id)) return prev;
            return [n, ...prev];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const base = supabase.from("app_notifications" as never).update({ read: true } as never).eq("read", false);
      const q = ids && ids.length > 0
        ? base.in("id", ids)
        : user?.id
          ? base.eq("user_id", user.id)
          : base;
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-notifications"] });
    },
  });
}

// ── Search ────────────────────────────────────────────────────────────────
export function useCommunitySearch(q: string, communityId?: string) {
  return useQuery({
    queryKey: ["community", "search", q, communityId ?? null],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("community_search" as never, {
        _q: q, _community_id: communityId ?? null, _limit: 30,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        kind: "post" | "community";
        id: string;
        community_id: string;
        title: string;
        snippet: string;
        score: number;
        created_at: string;
      }>;
    },
  });
}
