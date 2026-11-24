/**
 * Live-room calls that work for signed-in people and for guests alike.
 *
 * Guests have no account: the database recognises them by the personal link
 * they opened the room with (`?join=` for attendees, `?speaker=` for invited
 * speakers), so every call passes those along (migration 091).
 */
import { useEffect, useMemo, useState } from "react";
import { supabaseRpc } from "@/lib/observability";

function linkTokens(): { _join_token: string | null; _speaker_token: string | null } {
  if (typeof window === "undefined") return { _join_token: null, _speaker_token: null };
  const q = new URLSearchParams(window.location.search);
  return { _join_token: q.get("join"), _speaker_token: q.get("speaker") };
}

/** Marks the caller as watching (about once a minute). Errors are ignored. */
export async function webinarHeartbeat(sessionId: string, onStage: boolean): Promise<void> {
  await supabaseRpc("webinar_heartbeat", { _session_id: sessionId, _on_stage: onStage, ...linkTokens() });
}

/** Toggles the caller's vote on a question. Resolves to the new count, or an error message. */
export async function voteOnQuestion(qaId: string): Promise<{ count: number | null; error: string | null }> {
  const { data, error } = await supabaseRpc<number>("webinar_qa_vote", { _qa_id: qaId, ...linkTokens() });
  return error ? { count: null, error: error.message } : { count: data ?? 0, error: null };
}

/** Ids of the questions the caller has voted for in this session. */
export async function myQuestionVotes(sessionId: string): Promise<Set<string>> {
  const { data } = await supabaseRpc<string[] | { webinar_my_qa_votes: string }[]>("webinar_my_qa_votes", {
    _session_id: sessionId, ...linkTokens(),
  });
  const ids = (data ?? []).map((r) => (typeof r === "string" ? r : r.webinar_my_qa_votes));
  return new Set(ids);
}

// ── Display names ───────────────────────────────────────────────────────────

const nameCache = new Map<string, string | null>();
const listeners = new Set<() => void>();
const pending = new Map<string, Set<string>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const cacheKey = (sessionId: string, id: string) => `${sessionId}:${id}`;

function flush() {
  flushTimer = null;
  const batches = [...pending.entries()];
  pending.clear();
  for (const [sessionId, ids] of batches) {
    const list = [...ids];
    void supabaseRpc<{ id: string; name: string }[]>("webinar_participant_names", {
      _session_id: sessionId, _ids: list, ...linkTokens(),
    }).then(({ data }) => {
      const found = new Map((data ?? []).map((r) => [r.id, r.name]));
      for (const id of list) nameCache.set(cacheKey(sessionId, id), found.get(id) ?? null);
      for (const l of listeners) l();
    });
  }
}

function request(sessionId: string, ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (!id || nameCache.has(cacheKey(sessionId, id))) continue;
    nameCache.set(cacheKey(sessionId, id), null); // in flight; don't ask twice
    const set = pending.get(sessionId) ?? new Set<string>();
    set.add(id);
    pending.set(sessionId, set);
    added = true;
  }
  if (added && !flushTimer) flushTimer = setTimeout(flush, 50);
}

/**
 * Display names for participant ids (user ids or "guest-<id>") in a session.
 * Returns a lookup that falls back to a neutral label while a name loads or
 * when none is known, so raw ids never reach the screen.
 */
export function useParticipantNames(sessionId: string | undefined, ids: string[]): (id: string) => string {
  const [tick, setTick] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    if (sessionId && ids.length) request(sessionId, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, key]);
  return useMemo(
    () => (id: string) => (sessionId && nameCache.get(cacheKey(sessionId, id))) || (id.startsWith("guest-") ? "Guest" : "Attendee"),
    // `tick` changes whenever names arrive, so the lookup re-renders callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, key, tick],
  );
}

/** Two-letter initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : parts[0][1] ?? "")).toUpperCase();
}
