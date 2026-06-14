/**
 * Pure wrappers around the `agora-token` SDK for token signing.
 *
 * These functions are NOT used in the production frontend bundle — token
 * issuance always happens server-side in the `agora-token` Supabase edge
 * function so the App Certificate never reaches the browser. The helpers
 * here exist for two reasons:
 *
 *   1. Property-based tests (`fast-check`) that exercise the signer with
 *      thousands of generated inputs to lock down round-trip behaviour
 *      and expiry monotonicity.
 *   2. Local development scripts that mint a token without going through
 *      the edge function (e.g. for a curl-based smoke test).
 *
 * The Agora SDK is purely synchronous and deterministic given identical
 * inputs, so it composes well with `fast-check`.
 */

import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from "agora-token";

export type AgoraRole = "publisher" | "subscriber";

export interface RtcTokenInput {
  appId: string;
  appCertificate: string;
  channelName: string;
  /** Numeric or string uid. Pass 0 to let Agora assign one server-side. */
  uid: number | string;
  role: AgoraRole;
  /** Token lifetime in seconds, counted from `nowSeconds`. Must be > 0. */
  expireSeconds: number;
  /** Override the "now" reference; useful for property tests. */
  nowSeconds?: number;
}

export interface RtmTokenInput {
  appId: string;
  appCertificate: string;
  /** RTM user id; typically the same identifier used as RTC uid. */
  userId: string;
  expireSeconds: number;
  nowSeconds?: number;
}

export interface SignedToken {
  token: string;
  expireAtSeconds: number;
}

function rtcRoleFor(role: AgoraRole): number {
  return role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
}

/**
 * Sign an RTC token. Throws when:
 *   - appId or appCertificate is empty
 *   - expireSeconds <= 0
 *   - channelName is empty
 *   - uid is a non-finite number
 */
export function signRtcToken(input: RtcTokenInput): SignedToken {
  if (!input.appId) throw new Error("appId required");
  if (!input.appCertificate) throw new Error("appCertificate required");
  if (!input.channelName) throw new Error("channelName required");
  if (input.expireSeconds <= 0) throw new Error("expireSeconds must be > 0");
  if (typeof input.uid === "number" && !Number.isFinite(input.uid)) {
    throw new Error("uid must be a finite number");
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expireAt = now + input.expireSeconds;
  const role = rtcRoleFor(input.role);

  const token =
    typeof input.uid === "string"
      ? RtcTokenBuilder.buildTokenWithUserAccount(
          input.appId,
          input.appCertificate,
          input.channelName,
          input.uid,
          role,
          expireAt,
          // privilegeExpireAt — match token expiry
          expireAt,
        )
      : RtcTokenBuilder.buildTokenWithUid(
          input.appId,
          input.appCertificate,
          input.channelName,
          input.uid,
          role,
          expireAt,
          expireAt,
        );

  return { token, expireAtSeconds: expireAt };
}

/** Sign an RTM token (used for chat / data channel auth). */
export function signRtmToken(input: RtmTokenInput): SignedToken {
  if (!input.appId) throw new Error("appId required");
  if (!input.appCertificate) throw new Error("appCertificate required");
  if (!input.userId) throw new Error("userId required");
  if (input.expireSeconds <= 0) throw new Error("expireSeconds must be > 0");

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expireAt = now + input.expireSeconds;

  const token = RtmTokenBuilder.buildToken(
    input.appId,
    input.appCertificate,
    input.userId,
    expireAt,
  );

  return { token, expireAtSeconds: expireAt };
}
