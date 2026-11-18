/**
 * Verifies the access token the app already has (a Supabase Auth session
 * token) and turns it into a Caller. Signed with the project's asymmetric
 * keys (checked against its published JWKS) or, while the project still uses
 * one, the legacy HS256 secret. Anything else, expired or for another
 * audience/issuer, is refused.
 */
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import { serverEnv, type ServerEnv } from "../env.js";
import { ANONYMOUS, type Caller } from "../db/caller.js";

export class AuthError extends Error {
  readonly status = 401;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function remoteKeys(url: string) {
  if (!jwks || jwksUrl !== url) {
    jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 600_000 });
    jwksUrl = url;
  }
  return jwks;
}

export async function verifyAccessToken(token: string, env: ServerEnv = serverEnv()): Promise<JWTPayload> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new AuthError("Malformed access token");
  }
  const options = { issuer: env.AUTH_ISSUER, audience: env.AUTH_AUDIENCE, clockTolerance: 5 };
  try {
    if (alg === "HS256") {
      if (!env.AUTH_JWT_SECRET) throw new AuthError("HS256 tokens are not accepted");
      return (await jwtVerify(token, new TextEncoder().encode(env.AUTH_JWT_SECRET), { ...options, algorithms: ["HS256"] })).payload;
    }
    if (!env.AUTH_JWKS_URL) throw new AuthError("No signing keys configured");
    return (await jwtVerify(token, remoteKeys(env.AUTH_JWKS_URL), { ...options, algorithms: ["RS256", "ES256", "EdDSA"] })).payload;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("Invalid or expired access token");
  }
}

/** No Authorization header: an anonymous visitor. A bad token: refused, never downgraded to anonymous. */
export async function callerFromRequest(headers: Headers, env?: ServerEnv): Promise<Caller> {
  const header = headers.get("authorization");
  if (!header) return ANONYMOUS;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new AuthError("Authorization must be a Bearer token");
  const payload = await verifyAccessToken(match[1], env);
  if (typeof payload.sub !== "string" || !payload.sub) throw new AuthError("Token has no subject");
  return { kind: "user", userId: payload.sub, claims: payload as Record<string, unknown> };
}
