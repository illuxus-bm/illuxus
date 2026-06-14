/**
 * Agora RTC client hook — stub for the LiveKit → Agora migration.
 *
 * NOT wired into any UI yet. Exists so the next migration commits can
 * build the new WebinarStage / WaitingLobby / etc. against a stable,
 * type-checked surface without touching the production LiveKit code.
 *
 * What this hook does today
 * - Creates a single `IAgoraRTCClient` per `(channel, uid)` pair.
 * - Joins the channel with the supplied token.
 * - Subscribes to remote users automatically and exposes them as a list.
 * - Emits connection-state and network-quality updates as React state.
 * - Exposes imperative methods for publishing local audio/video,
 *   unpublishing, leaving, and swapping role (audience ↔ host).
 * - Cleans up tracks + client on unmount or when channel/uid changes.
 *
 * What it deliberately does NOT do (yet)
 * - Doesn't render any DOM (callers attach video tracks to `<div>`s).
 * - Doesn't wire RTM (chat / data channels) — separate hook will follow.
 * - Doesn't handle screen-share — separate path.
 * - Doesn't implement token refresh-before-expire — `refreshToken()` is
 *   exposed for the caller to invoke; auto-refresh based on the
 *   `token-privilege-will-expire` event will land in the next pass.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import AgoraRTC, {
  type ConnectionState,
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type NetworkQuality,
} from "agora-rtc-sdk-ng";
import { logger } from "@/lib/observability";

export type AgoraRole = "host" | "audience";

export interface UseAgoraClientOptions {
  /** Agora App ID. Read from `VITE_AGORA_APP_ID` by callers. */
  appId: string;
  /** Channel name. One channel per webinar session. */
  channel: string;
  /**
   * uid passed at join time. `0` lets Agora assign one server-side; the
   * resolved uid is exposed via the `uid` field on the hook's return.
   * Numeric uids are stable; string uids use `joinWithUserAccount`.
   */
  uid: number | string;
  /** Initial RTC token — must match the role and uid. */
  token: string;
  /** Caller's role on join. Audience by default. */
  role?: AgoraRole;
  /**
   * When `false`, the hook won't actually call `client.join()`. Useful
   * for hosting the hook in a render tree before credentials are ready
   * (e.g. waiting for the token edge function to respond).
   */
  enabled?: boolean;
  /**
   * Codec hint passed to `AgoraRTC.createClient`. Default 'vp8' which
   * matches what the Web SDK ships with.
   */
  codec?: "vp8" | "vp9" | "h264";
}

export interface PublishOptions {
  /** Publish microphone audio. Default true. */
  audio?: boolean;
  /** Publish camera video. Default true. */
  video?: boolean;
}

export interface UseAgoraClientReturn {
  /** Underlying AgoraRTC client. Use sparingly — prefer the imperative methods below. */
  client: IAgoraRTCClient | null;
  /** Resolved uid after join. Null while disconnected. */
  uid: number | string | null;
  connectionState: ConnectionState;
  /** Last reported uplink/downlink network quality (1=best, 6=worst, 0=unknown). */
  networkQuality: NetworkQuality | null;
  remoteUsers: IAgoraRTCRemoteUser[];
  localAudio: IMicrophoneAudioTrack | null;
  localVideo: ICameraVideoTrack | null;
  /** Last error surfaced by the client — categorized for UI consumption. */
  error: { name: string; message: string } | null;

  /** Publish local audio + video (camera and mic). Resolves once tracks are live. */
  publish: (opts?: PublishOptions) => Promise<void>;
  /** Stop publishing and release tracks. */
  unpublish: () => Promise<void>;
  /** Swap between host and audience. Requires a fresh token from `tokenFetcher`. */
  swapRole: (
    nextRole: AgoraRole,
    tokenFetcher: (nextRole: AgoraRole) => Promise<string>,
  ) => Promise<void>;
  /** Replace the current token (e.g. after a refresh-before-expire). */
  refreshToken: (newToken: string) => Promise<void>;
  /** Leave the channel; safe to call multiple times. */
  leave: () => Promise<void>;
}

const ROLE_MAP: Record<AgoraRole, "host" | "audience"> = {
  host: "host",
  audience: "audience",
};

export function useAgoraClient(opts: UseAgoraClientOptions): UseAgoraClientReturn {
  const enabled = opts.enabled ?? true;
  const codec = opts.codec ?? "vp8";

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const cleanupRunningRef = useRef(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>("DISCONNECTED");
  const [uid, setUid] = useState<number | string | null>(null);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);
  const [localAudio, setLocalAudio] = useState<IMicrophoneAudioTrack | null>(null);
  const [localVideo, setLocalVideo] = useState<ICameraVideoTrack | null>(null);

  const recordError = useCallback((label: string, err: unknown) => {
    const e = err as { name?: string; message?: string } | null;
    const name = e?.name ?? "AgoraError";
    const message = e?.message ?? String(err ?? "");
    logger.error(label, { error_name: name, error_message: message });
    setError({ name, message });
  }, []);

  // Channel join lifecycle. Re-runs when the identity tuple changes.
  useEffect(() => {
    if (!enabled) return;
    if (!opts.appId || !opts.channel || !opts.token) return;

    let cancelled = false;
    cleanupRunningRef.current = false;

    const client = AgoraRTC.createClient({ mode: "live", codec });
    clientRef.current = client;

    const onUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => {
      try {
        await client.subscribe(user, mediaType);
        setRemoteUsers((prev) => {
          const next = prev.filter((u) => u.uid !== user.uid);
          next.push(user);
          return next;
        });
      } catch (err) {
        recordError("agora subscribe failed", err);
      }
    };
    const onUserUnpublished = (user: IAgoraRTCRemoteUser) => {
      setRemoteUsers((prev) => prev.map((u) => (u.uid === user.uid ? user : u)));
    };
    const onUserLeft = (user: IAgoraRTCRemoteUser) => {
      setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    };
    const onConnectionStateChange = (next: ConnectionState) => {
      setConnectionState(next);
    };
    const onNetworkQuality = (q: NetworkQuality) => {
      setNetworkQuality(q);
    };
    const onException = (event: { code: number; msg: string; uid: number | string }) => {
      logger.warn("agora exception", {
        code: event.code,
        message: event.msg,
        peer_uid: event.uid,
      });
    };

    client.on("user-published", onUserPublished);
    client.on("user-unpublished", onUserUnpublished);
    client.on("user-left", onUserLeft);
    client.on("connection-state-change", onConnectionStateChange);
    client.on("network-quality", onNetworkQuality);
    client.on("exception", onException);

    (async () => {
      try {
        await client.setClientRole(ROLE_MAP[opts.role ?? "audience"]);
        const joined =
          typeof opts.uid === "string"
            ? await client.join(opts.appId, opts.channel, opts.token, opts.uid)
            : await client.join(opts.appId, opts.channel, opts.token, opts.uid);
        if (cancelled) {
          await client.leave().catch(() => {});
          return;
        }
        setUid(joined ?? null);
        setError(null);
        logger.info("agora joined", {
          channel: opts.channel,
          uid: String(joined ?? ""),
          role: opts.role ?? "audience",
        });
      } catch (err) {
        if (!cancelled) recordError("agora join failed", err);
      }
    })();

    return () => {
      cancelled = true;
      // Avoid overlapping teardown if React re-runs this effect rapidly
      // (StrictMode dev double-invoke).
      if (cleanupRunningRef.current) return;
      cleanupRunningRef.current = true;

      client.off("user-published", onUserPublished);
      client.off("user-unpublished", onUserUnpublished);
      client.off("user-left", onUserLeft);
      client.off("connection-state-change", onConnectionStateChange);
      client.off("network-quality", onNetworkQuality);
      client.off("exception", onException);

      const audio = localAudioRef.current;
      const video = localVideoRef.current;
      if (audio) audio.close();
      if (video) video.close();
      localAudioRef.current = null;
      localVideoRef.current = null;
      setLocalAudio(null);
      setLocalVideo(null);

      client.leave().catch((err) => {
        logger.debug("agora leave on unmount raced", {
          error_message: err instanceof Error ? err.message : String(err),
        });
      });
      clientRef.current = null;
      setRemoteUsers([]);
      setUid(null);
      setConnectionState("DISCONNECTED");
    };
  }, [
    enabled,
    opts.appId,
    opts.channel,
    opts.uid,
    opts.token,
    opts.role,
    codec,
    recordError,
  ]);

  const publish = useCallback(
    async ({ audio = true, video = true }: PublishOptions = {}) => {
      const client = clientRef.current;
      if (!client) throw new Error("client not connected");
      try {
        if (audio && !localAudioRef.current) {
          const track = await AgoraRTC.createMicrophoneAudioTrack();
          localAudioRef.current = track;
          setLocalAudio(track);
        }
        if (video && !localVideoRef.current) {
          const track = await AgoraRTC.createCameraVideoTrack();
          localVideoRef.current = track;
          setLocalVideo(track);
        }
        const tracks = [
          audio ? localAudioRef.current : null,
          video ? localVideoRef.current : null,
        ].filter(Boolean) as (IMicrophoneAudioTrack | ICameraVideoTrack)[];
        if (tracks.length > 0) await client.publish(tracks);
      } catch (err) {
        recordError("agora publish failed", err);
        throw err;
      }
    },
    [recordError],
  );

  const unpublish = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const tracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [];
      if (localAudioRef.current) tracks.push(localAudioRef.current);
      if (localVideoRef.current) tracks.push(localVideoRef.current);
      if (tracks.length > 0) await client.unpublish(tracks);
      localAudioRef.current?.close();
      localVideoRef.current?.close();
      localAudioRef.current = null;
      localVideoRef.current = null;
      setLocalAudio(null);
      setLocalVideo(null);
    } catch (err) {
      recordError("agora unpublish failed", err);
    }
  }, [recordError]);

  const swapRole = useCallback(
    async (nextRole: AgoraRole, tokenFetcher: (r: AgoraRole) => Promise<string>) => {
      const client = clientRef.current;
      if (!client) throw new Error("client not connected");
      try {
        const nextToken = await tokenFetcher(nextRole);
        await client.renewToken(nextToken);
        await client.setClientRole(ROLE_MAP[nextRole]);
        if (nextRole === "audience") {
          await unpublish();
        }
        logger.info("agora role swapped", { role: nextRole });
      } catch (err) {
        recordError("agora role swap failed", err);
        throw err;
      }
    },
    [unpublish, recordError],
  );

  const refreshToken = useCallback(async (newToken: string) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.renewToken(newToken);
      logger.debug("agora token refreshed", {});
    } catch (err) {
      recordError("agora refresh token failed", err);
      throw err;
    }
  }, [recordError]);

  const leave = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await unpublish();
      await client.leave();
      setRemoteUsers([]);
      setUid(null);
      setConnectionState("DISCONNECTED");
    } catch (err) {
      recordError("agora leave failed", err);
    }
  }, [unpublish, recordError]);

  return {
    client: clientRef.current,
    uid,
    connectionState,
    networkQuality,
    remoteUsers,
    localAudio,
    localVideo,
    error,
    publish,
    unpublish,
    swapRole,
    refreshToken,
    leave,
  };
}
