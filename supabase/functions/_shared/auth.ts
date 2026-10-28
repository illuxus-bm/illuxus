/**
 * Caller identification and authorisation for edge functions.
 *
 * `verify_jwt = true` only proves the request carries *a* valid project JWT —
 * and the public anon key is one. Functions that act with the service-role
 * key must therefore identify the signed-in user themselves and check what
 * that user is allowed to do. These helpers centralise that.
 */
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

/** Service-role client (bypasses RLS). Never return its results unchecked. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** A JWT's payload, unverified — only read claims of a token that has been checked elsewhere. */
function tokenClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "="))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The `aal` claim of a JWT (already verified by getUser), or null. */
export function tokenAal(token: string): string | null {
  const aal = tokenClaims(token).aal;
  return typeof aal === "string" ? aal : null;
}

const bearer = (req: Request) => (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

/**
 * True for a call made with the service-role key — the database (pg_net
 * triggers, scheduled sends) or another function. The public anon key and
 * user tokens are not. A key other than this function's own is accepted
 * only if the Auth admin API accepts it, so nothing rests on an unchecked
 * claim.
 */
export async function isServiceCall(req: Request): Promise<boolean> {
  const token = bearer(req);
  if (!token) return false;
  const own = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (own && token === own) return true;
  const looksService = token.startsWith("sb_secret_") || tokenClaims(token).role === "service_role";
  if (!looksService) return false;
  try {
    const probe = createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

export type Caller = { kind: "service" } | { kind: "user"; user: User };

/** Who is calling: the service role, a signed-in user, or nobody (null). */
export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  if (await isServiceCall(req)) return { kind: "service" };
  const user = await getCallerUser(req, admin);
  return user ? { kind: "user", user } : null;
}

/** A user with two-factor on has to have given the code (aal2) for this session to count. */
export function sessionMeetsTwoFactor(user: User, token: string): boolean {
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  return !hasFactor || tokenAal(token) === "aal2";
}

/**
 * The signed-in user making the request, or null for anonymous callers
 * (no Authorization header, the anon key, or an invalid/expired token) and
 * for a password-only session of a user who has two-factor sign-in on.
 */
export async function getCallerUser(req: Request, admin: SupabaseClient): Promise<User | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    if (!sessionMeetsTwoFactor(data.user, token)) return null;
    return data.user;
  } catch {
    return null;
  }
}

/** Platform (super) admin — `user_roles.role = 'admin'`. */
export async function isPlatformAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/**
 * Ids of the organisations the user manages: the canonical owner, or an
 * `org_members` row with role owner/admin (mirrors `is_org_manager`).
 */
export async function managedOrgIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [owned, memberOf] = await Promise.all([
    admin.from("organizations").select("id").eq("owner_id", userId),
    admin.from("org_members").select("org_id").eq("user_id", userId).in("role", ["owner", "admin"]),
  ]);
  const ids = new Set<string>();
  for (const o of owned.data ?? []) ids.add((o as { id: string }).id);
  for (const m of memberOf.data ?? []) ids.add((m as { org_id: string }).org_id);
  return [...ids];
}

export interface EventAccess {
  id: string;
  user_id: string | null;
  org_id: string | null;
  title: string | null;
}

/**
 * The event, if the user may manage it: its creator, a platform admin, the
 * owner of its organisation, or a non-viewer member of that organisation.
 * Returns null when the event doesn't exist or the user has no such access.
 */
export async function getManagedEvent(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<EventAccess | null> {
  const { data: ev } = await admin
    .from("events")
    .select("id, user_id, org_id, title")
    .eq("id", eventId)
    .maybeSingle();
  const event = ev as EventAccess | null;
  if (!event) return null;
  if (event.user_id === userId) return event;
  if (event.org_id) {
    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", event.org_id).maybeSingle(),
      admin.from("org_members").select("role").eq("org_id", event.org_id).eq("user_id", userId).maybeSingle(),
    ]);
    if ((org as { owner_id?: string } | null)?.owner_id === userId) return event;
    const role = (member as { role?: string } | null)?.role;
    if (role && role !== "viewer") return event;
  }
  if (await isPlatformAdmin(admin, userId)) return event;
  return null;
}

/**
 * May the user send this communication? A platform admin; the owner or a
 * non-viewer member of its organisation; or, for a community one, someone
 * who moderates that community. Mirrors the `communications` RLS policies,
 * minus read-only viewers.
 */
export async function canSendCommunication(
  admin: SupabaseClient,
  userId: string,
  comm: { org_id: string | null; community_id: string | null },
): Promise<boolean> {
  if (comm.org_id) {
    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", comm.org_id).maybeSingle(),
      admin.from("org_members").select("role").eq("org_id", comm.org_id).eq("user_id", userId).maybeSingle(),
    ]);
    if ((org as { owner_id?: string } | null)?.owner_id === userId) return true;
    const role = (member as { role?: string } | null)?.role;
    if (role && role !== "viewer") return true;
  }
  if (comm.community_id) {
    const { data } = await admin.rpc("can_moderate_community", { _user_id: userId, _community_id: comm.community_id });
    if (data === true) return true;
  }
  return isPlatformAdmin(admin, userId);
}

/**
 * Loads a communication and checks the caller may send it: the service role
 * (the scheduled-send job) or a user allowed by canSendCommunication.
 */
export async function authorizeCommunication(
  req: Request,
  admin: SupabaseClient,
  communicationId: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isUuid(communicationId)) return { ok: false, status: 400, error: "communication_id is required" };
  const caller = await resolveCaller(req, admin);
  if (!caller) return { ok: false, status: 401, error: "Sign in required" };
  if (caller.kind === "service") return { ok: true };
  const { data } = await admin
    .from("communications").select("org_id, community_id").eq("id", communicationId).maybeSingle();
  const comm = data as { org_id: string | null; community_id: string | null } | null;
  if (!comm || !(await canSendCommunication(admin, caller.user.id, comm))) {
    return { ok: false, status: 403, error: "You can't send this communication" };
  }
  return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Trimmed, lower-cased, de-duplicated list of syntactically valid emails. */
export function normalizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const e = v.trim().toLowerCase();
    if (/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(e) && e.length <= 254) out.add(e);
  }
  return [...out];
}
