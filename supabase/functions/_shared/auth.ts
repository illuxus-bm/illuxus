/**
 * Caller-identity + resource-authorization helpers for Supabase edge functions.
 *
 * ## Why this module exists
 *
 * `verify_jwt = true` in `supabase/config.toml` is NOT authentication.
 * The Supabase gateway only checks that the bearer token is a JWT signed
 * by the project's JWT secret — and the **anon / publishable key is
 * itself such a JWT**. That key ships in the browser bundle
 * (`VITE_SUPABASE_PUBLISHABLE_KEY`), so it is public by construction.
 *
 * Consequence: a function whose only gate is `verify_jwt = true` is
 * reachable by anyone on the internet. If that function then uses
 * `SUPABASE_SERVICE_ROLE_KEY` (which bypasses every RLS policy) and
 * trusts an id from the request body, it is an IDOR / privilege-
 * escalation hole regardless of what `config.toml` says.
 *
 * Every function that holds the service-role key MUST therefore:
 *   1. resolve the *real* caller from the `Authorization` header
 *      (`requireUser`), and
 *   2. prove that caller may touch the specific resource being mutated
 *      (`assertEventAccess` / `assertOrgMember` / `requirePlatformAdmin`)
 *
 * ...*before* performing any service-role read or write.
 *
 * ## Ordering contract
 *
 * Check first, elevate second. These helpers deliberately accept an
 * already-constructed service-role client so the caller can reuse one
 * client, but they never widen access on their own — each returns either
 * a positive identity/authorization result or an `AuthFailure` carrying
 * the HTTP status the function should return verbatim.
 *
 * ## Usage
 *
 * ```ts
 * const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
 * const caller = await requireUser(req, svc);
 * if (!caller.ok) return corsJson({ error: caller.error }, { status: caller.status, cors });
 *
 * const access = await assertEventAccess(svc, caller.user.id, eventId);
 * if (!access.ok) return corsJson({ error: access.error }, { status: access.status, cors });
 * // ...now safe to use `svc` for the mutation...
 * ```
 *
 * All helpers are dependency-injected on the Supabase client so they can
 * be unit-tested with a stub. They never throw — every failure path
 * returns a typed result.
 */

// ─── Minimal structural client type ─────────────────────────────────────────
//
// Declared structurally rather than importing `SupabaseClient` so this module
// has no runtime import (keeping it loadable by both Deno and vitest) and
// stays trivially stubbable in `__tests__/auth.test.ts`.
//
// Typed explicitly instead of `any` so a typo in a chained method name is a
// compile error here rather than a runtime `undefined is not a function`
// inside an authorization check — the worst possible place for one.

/** Row payload returned by a terminal query method. */
interface QueryResult {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

/**
 * The subset of PostgREST's chainable builder these helpers use. Every
 * filter method returns the builder so calls can be chained in any order;
 * `maybeSingle()` terminates the chain.
 */
interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
}

/** The subset of `SupabaseClient` these helpers depend on. */
export interface MinimalSupabaseClient {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
  };
  from(table: string): QueryBuilder;
}

type AnyClient = MinimalSupabaseClient;

/** A resolved, authenticated caller. */
export interface AuthedUser {
  id: string;
  email: string | null;
}

export interface AuthSuccess {
  ok: true;
  user: AuthedUser;
}

export interface AuthFailure {
  ok: false;
  /** HTTP status the calling function should return verbatim. */
  status: number;
  /** Human-safe message. Deliberately vague — never leaks whether a
   *  resource exists, only whether the caller may act on it. */
  error: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

export interface AuthzSuccess {
  ok: true;
  /** True when access was granted by platform-admin role rather than
   *  direct ownership. Useful for audit logging. */
  viaAdmin: boolean;
}

export type AuthzResult = AuthzSuccess | AuthFailure;

/**
 * Extracts the raw JWT from an `Authorization: Bearer <jwt>` header.
 * Returns `""` when the header is absent or malformed — callers treat
 * that as unauthenticated rather than attempting a lookup.
 */
export function readBearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

/**
 * Resolves the real end user behind the request.
 *
 * IMPORTANT: this rejects the anon key. `supabase.auth.getUser(jwt)`
 * returns no user for the anon/publishable key because that token has
 * no `sub` claim pointing at an `auth.users` row — which is exactly the
 * distinction `verify_jwt` fails to make. A caller presenting only the
 * anon key therefore lands in the 401 branch here.
 *
 * @param req    the inbound request (read for its Authorization header)
 * @param client any Supabase client — service-role is fine, since
 *               `getUser(jwt)` validates the *passed* token, not the
 *               client's own key.
 */
export async function requireUser(req: Request, client: AnyClient): Promise<AuthResult> {
  const jwt = readBearerToken(req);
  if (!jwt) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }

  try {
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data?.user?.id) {
      return { ok: false, status: 401, error: "Not signed in" };
    }
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  } catch {
    // A network blip talking to the auth server must not fall through
    // into an authorized code path.
    return { ok: false, status: 401, error: "Not signed in" };
  }
}

/**
 * True when the user holds the platform `admin` role.
 *
 * Reads `user_roles` directly rather than calling the `has_role` RPC so
 * this works identically under a service-role client (where RLS is off)
 * and does not depend on the RPC's `GRANT EXECUTE`. Returns `false` on
 * any error — failing closed is the only safe default for an
 * authorization predicate.
 */
export async function isPlatformAdmin(client: AnyClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Authorizes the caller as platform admin, or fails with 403.
 * Use for genuinely platform-wide operations (data seeding, cross-tenant
 * reporting) — never as a substitute for a per-resource ownership check.
 */
export async function requirePlatformAdmin(
  client: AnyClient,
  userId: string,
): Promise<AuthzResult> {
  const admin = await isPlatformAdmin(client, userId);
  if (!admin) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, viaAdmin: true };
}

/**
 * Authorizes the caller against a single event: they must be the event's
 * owner (`events.user_id`) or a platform admin.
 *
 * Returns 403 — not 404 — when the event does not exist, so the response
 * cannot be used to probe which event ids are real.
 */
export async function assertEventAccess(
  client: AnyClient,
  userId: string,
  eventId: string | null | undefined,
): Promise<AuthzResult> {
  if (!eventId) return { ok: false, status: 400, error: "event id is required" };

  try {
    const { data: event, error } = await client
      .from("events")
      .select("user_id")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event) {
      // Deliberately 403, not 404 — see doc comment.
      return { ok: false, status: 403, error: "Forbidden" };
    }
    if (event.user_id === userId) return { ok: true, viaAdmin: false };

    const admin = await isPlatformAdmin(client, userId);
    if (admin) return { ok: true, viaAdmin: true };

    return { ok: false, status: 403, error: "Forbidden" };
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }
}

/**
 * Authorizes the caller against an organization: they must be a member
 * (`org_members`), the org owner, or a platform admin.
 */
export async function assertOrgAccess(
  client: AnyClient,
  userId: string,
  orgId: string | null | undefined,
): Promise<AuthzResult> {
  if (!orgId) return { ok: false, status: 400, error: "org id is required" };

  try {
    const { data: member } = await client
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member) return { ok: true, viaAdmin: false };

    const { data: org } = await client
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .maybeSingle();
    if (org?.owner_id === userId) return { ok: true, viaAdmin: false };

    const admin = await isPlatformAdmin(client, userId);
    if (admin) return { ok: true, viaAdmin: true };

    return { ok: false, status: 403, error: "Forbidden" };
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }
}

/**
 * Authorizes the caller against a `communications` row by resolving its
 * `org_id` and delegating to `assertOrgAccess`. This is the check the
 * `send-email` / `send-communication-email` / `send-whatsapp` trio were
 * missing — without it, any caller could replay another tenant's
 * communication and fan out mail under that org's name.
 */
export async function assertCommunicationAccess(
  client: AnyClient,
  userId: string,
  communicationId: string | null | undefined,
): Promise<AuthzResult> {
  if (!communicationId) {
    return { ok: false, status: 400, error: "communication id is required" };
  }

  try {
    const { data: comm, error } = await client
      .from("communications")
      .select("org_id")
      .eq("id", communicationId)
      .maybeSingle();
    if (error || !comm) return { ok: false, status: 403, error: "Forbidden" };
    // Row values are `unknown` (QueryResult.data is Record<string, unknown>),
    // so narrow explicitly. A non-string org_id falls through to
    // `assertOrgAccess`'s own null/empty guard and denies.
    const orgId = typeof comm.org_id === "string" ? comm.org_id : null;
    return await assertOrgAccess(client, userId, orgId);
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }
}

/**
 * Authorizes the caller against a registration by resolving the
 * registration's parent event and delegating to `assertEventAccess`.
 * Also returns the resolved `event_id` so the caller can scope
 * subsequent writes to that event instead of acting globally.
 *
 * This is the ORGANIZER-ONLY check. For flows an attendee performs on
 * their own registration (e.g. receiving their own ticket email after
 * RSVP), use `assertRegistrationSelfOrOwner` instead — this function
 * will correctly reject the attendee, since they do not own the event.
 */
export async function assertRegistrationAccess(
  client: AnyClient,
  userId: string,
  registrationId: string | null | undefined,
): Promise<AuthzResult & { eventId?: string }> {
  if (!registrationId) {
    return { ok: false, status: 400, error: "registration id is required" };
  }

  try {
    const { data: reg, error } = await client
      .from("registrations")
      .select("event_id")
      .eq("id", registrationId)
      .maybeSingle();
    if (error || !reg) return { ok: false, status: 403, error: "Forbidden" };

    const access = await assertEventAccess(client, userId, reg.event_id as string);
    if (!access.ok) return access;
    return { ...access, eventId: reg.event_id as string };
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }
}

/**
 * Authorizes the caller against a registration when EITHER party has a
 * legitimate reason to act:
 *
 *   - the registration's own user (an attendee triggering their own
 *     ticket email immediately after RSVP), or
 *   - the event's owner / a platform admin (an organizer importing
 *     attendees, approving a request, or re-sending a ticket).
 *
 * Both paths are real product flows:
 *   - `src/components/EventRsvpCard.tsx` — attendee RSVPs on the public
 *     event page (login required) and the ticket email fires as them.
 *   - `src/components/event/registrations/ImportRegistrationsDialog.tsx`,
 *     `AddParticipantDialog.tsx`, `RegistrationsSection.tsx` — organizer
 *     acts on someone else's registration.
 *
 * Using the organizer-only `assertRegistrationAccess` here would 403 every
 * attendee's own ticket email, because an attendee does not own the event.
 *
 * `isSelf` is reported back so callers can log which path was taken and,
 * if needed, restrict what the response body reveals.
 */
export async function assertRegistrationSelfOrOwner(
  client: AnyClient,
  userId: string,
  registrationId: string | null | undefined,
): Promise<AuthzResult & { eventId?: string; isSelf?: boolean }> {
  if (!registrationId) {
    return { ok: false, status: 400, error: "registration id is required" };
  }

  try {
    const { data: reg, error } = await client
      .from("registrations")
      .select("event_id, user_id")
      .eq("id", registrationId)
      .maybeSingle();
    if (error || !reg) return { ok: false, status: 403, error: "Forbidden" };

    const eventId = reg.event_id as string;

    // Attendee acting on their own registration. Checked first because it
    // needs no further query.
    if (reg.user_id && reg.user_id === userId) {
      return { ok: true, viaAdmin: false, eventId, isSelf: true };
    }

    // Otherwise the caller must be the organizer (or a platform admin).
    const access = await assertEventAccess(client, userId, eventId);
    if (!access.ok) return access;
    return { ...access, eventId, isSelf: false };
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }
}
