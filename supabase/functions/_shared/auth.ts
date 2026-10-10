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

/**
 * The signed-in user making the request, or null for anonymous callers
 * (no Authorization header, the anon key, or an invalid/expired token).
 */
export async function getCallerUser(req: Request, admin: SupabaseClient): Promise<User | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
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
