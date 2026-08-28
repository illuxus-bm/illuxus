/**
 * Fetches an Agora RTC token for a webinar session via the `agora-token`
 * Supabase edge function.
 *
 * Returns enough state for the AgoraWebinarStage to mount useAgoraClient:
 *   - appId       — VITE_AGORA_APP_ID from the build env
 *   - channel     — webinar_sessions.id (one channel per session)
 *   - uid         — string user id (auth.uid for signed-in users; random
 *                   guest id when no session yet — matches what
 *                   livekit-token does for the public live page)
 *   - role        — 'publisher' for hosts, 'subscriber' for everyone else
 *   - token       — short-lived RTC token signed by the edge function
 *
 * Auto-refreshes the token 60s before expiry so a one-hour session can
 * stay live without the speaker dropping.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

export type AgoraSessionRole = "publisher" | "subscriber";

export interface AgoraSessionToken {
  appId: string;
  channel: string;
  uid: string;
  role: AgoraSessionRole;
  token: string;
  expireAt: number;
}

export interface UseAgoraSessionTokenOpts {
  sessionId: string | null | undefined;
  /** Stable channel id; defaults to sessionId. */
  channelOverride?: string | null;
  /** Stable uid for the local participant. */
  uid: string | null | undefined;
  role: AgoraSessionRole;
  /** When false, the hook stays idle (no fetch). */
  enabled?: boolean;
  /** Token expiry in seconds. Capped at 24h server-side. */
  expireSeconds?: number;
  /**
   * `registrations.join_token` from the `?join=` query param. Lets a GUEST
   * with no Supabase session obtain a subscriber token — the public live
   * page supports link-based attendees who never sign in. Forwarded to the
   * edge function, which validates it against this session's event.
   */
  joinToken?: string | null;
  /**
   * `webinar_speakers.invite_token` from the `?speaker=` query param. Lets
   * an invited speaker publish without signing in.
   */
  speakerToken?: string | null;
}

export interface UseAgoraSessionTokenReturn {
  data: AgoraSessionToken | null;
  loading: boolean;
  error: string | null;
  /** Force a refresh — useful for swapRole transitions. */
  refresh: () => Promise<void>;
}

const DEFAULT_EXPIRE_SECONDS = 3600;
const REFRESH_BUFFER_SECONDS = 60;

/**
 * Read the Agora App ID from the Vite env. Returns an empty string when
 * not configured so callers can render a clear "not configured" hint.
 */
export function readAgoraAppId(): string {
  // import.meta.env is replaced at build time
  return (import.meta.env.VITE_AGORA_APP_ID as string | undefined) ?? "";
}

export function useAgoraSessionToken({
  sessionId,
  channelOverride,
  uid,
  role,
  enabled = true,
  expireSeconds = DEFAULT_EXPIRE_SECONDS,
  joinToken,
  speakerToken,
}: UseAgoraSessionTokenOpts): UseAgoraSessionTokenReturn {
  const appId = readAgoraAppId();
  const channel = channelOverride ?? sessionId ?? null;

  const [data, setData] = useState<AgoraSessionToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimerRef = useRef<number | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const fetchToken = useCallback(async () => {
    if (!enabled) return;
    if (!appId) {
      setError("VITE_AGORA_APP_ID is not configured");
      return;
    }
    if (!channel) {
      setError("session id missing");
      return;
    }
    if (!uid) {
      setError("user id missing");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // `session_id` is the authoritative field; `channel` is still sent for
      // backward compatibility with an older deployed function revision.
      // `uid` and `role` are deliberately NOT sent — the edge function
      // derives both server-side from the caller's JWT and their membership
      // of the session. Sending them would be misleading, since they are
      // ignored (see supabase/functions/agora-token/index.ts).
      const { data: rsp, error: invokeErr } = await supabase.functions.invoke(
        "agora-token",
        {
          body: {
            type: "rtc",
            session_id: channel,
            channel,
            expireSeconds,
            // Guest credentials. Omitted when absent so the edge function
            // falls through to the signed-in path.
            ...(joinToken ? { join_token: joinToken } : {}),
            ...(speakerToken ? { speaker_token: speakerToken } : {}),
          },
        },
      );
      if (invokeErr) throw invokeErr;
      const parsed = rsp as {
        rtc?: { token?: string; expireAtSeconds?: number; uid?: string };
        role?: AgoraSessionRole;
      } | null;
      const rtc = parsed?.rtc;
      if (!rtc?.token || !rtc?.expireAtSeconds) {
        throw new Error("agora-token edge function returned no rtc token");
      }
      // The server's role decision wins. The caller's requested `role` is a
      // UI hint derived from client state; if the server downgraded us to
      // subscriber, publishing with this token would fail at the SDK layer,
      // so we surface the effective role instead of the requested one.
      const effectiveRole: AgoraSessionRole = parsed?.role ?? role;
      if (effectiveRole !== role) {
        logger.warn("agora role downgraded by server", {
          channel,
          requested_role: role,
          effective_role: effectiveRole,
        });
      }
      const next: AgoraSessionToken = {
        appId,
        channel,
        uid: String(rtc.uid ?? uid),
        role: effectiveRole,
        token: rtc.token,
        expireAt: rtc.expireAtSeconds,
      };
      setData(next);
      logger.info("agora token fetched", {
        channel: next.channel,
        role: next.role,
        expire_in_seconds: rtc.expireAtSeconds - Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error("agora token fetch failed", {
        channel,
        role,
        error_message: message,
      });
    } finally {
      setLoading(false);
    }
  }, [appId, channel, enabled, expireSeconds, role, uid, joinToken, speakerToken]);

  // Initial fetch + dependency-driven refetches.
  useEffect(() => {
    if (!enabled) return;
    void fetchToken();
  }, [enabled, fetchToken]);

  // Auto-refresh shortly before the token expires. A signed token typically
  // lasts an hour; we refresh 60s early so the host's stream never drops.
  useEffect(() => {
    clearRefreshTimer();
    if (!data) return;
    const now = Math.floor(Date.now() / 1000);
    const refreshIn = Math.max(5, data.expireAt - now - REFRESH_BUFFER_SECONDS);
    refreshTimerRef.current = window.setTimeout(() => {
      void fetchToken();
    }, refreshIn * 1000);
    return clearRefreshTimer;
  }, [data, clearRefreshTimer, fetchToken]);

  // Cleanup the timer on unmount.
  useEffect(() => clearRefreshTimer, [clearRefreshTimer]);

  return {
    data,
    loading,
    error,
    refresh: fetchToken,
  };
}
