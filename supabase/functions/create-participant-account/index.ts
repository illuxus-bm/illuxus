/**
 * create-participant-account
 *
 * Lets an event organiser create a login for a participant they have added
 * to their own event, and links the registration to that account.
 *
 * AUTHORISATION (all enforced here — the function runs with the service role):
 *   • The caller must be signed in.
 *   • The caller must manage the event the registration belongs to (creator,
 *     org owner, non-viewer org member, or platform admin).
 *   • The account email must be the registration's own email. An organiser
 *     cannot create an account for an address that isn't on their
 *     registration, nor attach someone else's registration to an account.
 *
 * Without these checks anyone holding the public anon key could create a
 * pre-confirmed account for any email with a password of their choosing, or
 * re-point any registration at their own account.
 *
 * New accounts are created with `must_change_password: true` and a password
 * supplied by the organiser (by convention the participant's mobile number).
 * If an account already exists for the email, its password is NOT touched —
 * the registration is just linked to it.
 *
 * RESIDUAL RISK (by design of this flow): the organiser knows the initial
 * password of an account they create, and the email is marked confirmed
 * without the participant proving they own it. Replace this with an emailed
 * set-password link if organiser-created accounts are kept long term.
 *
 * Request body:
 * {
 *   registration_id: string   — the registration to create the account for
 *   email:           string   — must equal the registration's email
 *   password:        string   — initial password (min 6 chars)
 *   first_name?, last_name?, title?, designation?, company?,
 *   mobile_country_code?, mobile_number?, linkedin_url?, company_website?,
 *   company_employee_count?, industry?
 * }
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import { getCallerUser, getManagedEvent, isUuid, serviceClient } from "../_shared/auth.ts";

const log = createEdgeLogger("create-participant-account");

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Exact lookup of an existing account by email. Uses the service-role-only
 * `admin_user_id_by_email` RPC (migration 038); falls back to paging through
 * the admin user list when that RPC isn't deployed yet. (The old code read
 * only the first page — 50 users — and missed everyone after that.)
 */
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("admin_user_id_by_email", { _email: email });
  if (!error) return (data as string | null) ?? null;

  for (let page = 1; page <= 50; page++) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr || !list?.users?.length) return null;
    const hit = list.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (list.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const registrationId = body?.registration_id;
    const email = str(body?.email, 254).toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isUuid(registrationId) || !email || !password) {
      return json({ error: "Missing required fields: registration_id, email, password" }, 400);
    }
    if (password.length < 6 || password.length > 128) {
      return json({ error: "Password must be between 6 and 128 characters" }, 400);
    }

    const admin = serviceClient();
    const caller = await getCallerUser(req, admin);
    if (!caller) return json({ error: "Sign in required" }, 401);

    const { data: regRow } = await admin
      .from("registrations")
      .select("id, event_id, email, user_id")
      .eq("id", registrationId)
      .maybeSingle();
    const registration = regRow as { id: string; event_id: string; email: string | null; user_id: string | null } | null;
    // Same response for "no such registration" and "not yours", so the
    // function can't be used to probe which registration ids exist.
    if (!registration || !(await getManagedEvent(admin, caller.id, registration.event_id))) {
      log.warn("refused — caller does not manage this registration's event", { caller_id: caller.id });
      return json({ error: "Registration not found or access denied" }, 403);
    }
    if ((registration.email ?? "").trim().toLowerCase() !== email) {
      return json({ error: "Email does not match this registration" }, 400);
    }

    let userId = await findUserIdByEmail(admin, email);
    const isExistingUser = !!userId;

    if (!userId) {
      const firstName = str(body?.first_name);
      const lastName = str(body?.last_name);
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || email;

      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // organiser-added participant; see RESIDUAL RISK above
        user_metadata: {
          must_change_password: true,
          account_type: "attendee",
          title: str(body?.title),
          first_name: firstName,
          last_name: lastName,
          designation: str(body?.designation),
          company: str(body?.company),
          mobile_country_code: str(body?.mobile_country_code, 8),
          mobile_number: str(body?.mobile_number, 32),
          linkedin_url: str(body?.linkedin_url, 500),
          company_website: str(body?.company_website, 500),
          company_employee_count: str(body?.company_employee_count, 50),
          industry: str(body?.industry, 100),
          display_name: displayName,
        },
      });

      if (createErr || !newUser?.user) {
        return json({ error: `Failed to create user: ${createErr?.message ?? "unknown error"}` }, 500);
      }
      userId = newUser.user.id;
    }

    // Link this registration, and any other still-unclaimed registrations
    // made with the same email (the signup trigger does the same for
    // self-service signups) — never a registration under a different email.
    const { error: linkErr } = await admin
      .from("registrations")
      .update({ user_id: userId })
      .eq("id", registration.id);
    if (linkErr) {
      log.error("link registration failed", { error_message: linkErr.message, error_code: linkErr.code });
    }

    const { error: bulkLinkErr } = await admin
      .from("registrations")
      .update({ user_id: userId })
      .eq("email", email)
      .is("user_id", null);
    if (bulkLinkErr) {
      log.error("bulk-link registrations failed", { error_message: bulkLinkErr.message, error_code: bulkLinkErr.code });
    }

    return json({ success: true, user_id: userId, is_existing_user: isExistingUser });
  } catch (err) {
    log.error("unhandled error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
