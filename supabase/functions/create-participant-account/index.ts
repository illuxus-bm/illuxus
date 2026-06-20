/**
 * create-participant-account
 *
 * Called by the organizer's AddParticipantDialog after a registration is created.
 * Creates a Supabase Auth user with:
 *   - email = participant's email
 *   - password = participant's mobile number (initial password)
 *   - metadata = { must_change_password: true, account_type: "attendee", ...person fields }
 *
 * If a user with this email already exists, it simply links the registration
 * to the existing user (sets user_id on the registrations row).
 *
 * Expected request body:
 * {
 *   registration_id: string   — UUID of the newly created registration
 *   email:           string   — participant email
 *   password:        string   — mobile number (used as initial password)
 *   first_name:      string
 *   last_name:       string
 *   title?:          string
 *   designation?:    string
 *   company?:        string
 *   mobile_country_code?: string
 *   mobile_number?:  string
 *   linkedin_url?:   string
 *   company_website?: string
 *   company_employee_count?: string
 *   industry?:       string
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("create-participant-account");

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
    const {
      registration_id,
      email,
      password,
      first_name,
      last_name,
      title,
      designation,
      company,
      mobile_country_code,
      mobile_number,
      linkedin_url,
      company_website,
      company_employee_count,
      industry,
    } = await req.json();

    if (!registration_id || !email || !password) {
      return json({ error: "Missing required fields: registration_id, email, password" }, 400);
    }

    // Service-role client can create users and bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Check if user already exists ──────────────────────────────────────────
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId: string;

    if (existingUser) {
      // User exists — just link the registration to them
      userId = existingUser.id;
    } else {
      // Create new auth user with phone number as initial password
      const displayName = [first_name, last_name].filter(Boolean).join(" ").trim() || email;

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: password,
        email_confirm: true, // Skip email verification since organizer added them
        user_metadata: {
          must_change_password: true,
          account_type: "attendee",
          title: title || "",
          first_name: first_name || "",
          last_name: last_name || "",
          designation: designation || "",
          company: company || "",
          mobile_country_code: mobile_country_code || "",
          mobile_number: mobile_number || "",
          linkedin_url: linkedin_url || "",
          company_website: company_website || "",
          company_employee_count: company_employee_count || "",
          industry: industry || "",
          display_name: displayName,
        },
      });

      if (createErr) {
        return json({ error: `Failed to create user: ${createErr.message}` }, 500);
      }

      userId = newUser.user.id;
    }

    // ── Link registration to the user ─────────────────────────────────────────
    const { error: linkErr } = await supabase
      .from("registrations")
      .update({ user_id: userId })
      .eq("id", registration_id);

    if (linkErr) {
      log.error("link registration failed", { error_message: linkErr.message, error_code: linkErr.code });
      // Non-fatal — the account was still created
    }

    // ── Also check for other unlinked registrations with same email ───────────
    // This handles the case where the participant was added to multiple events
    // before signing in — link all of them.
    const { error: bulkLinkErr } = await supabase
      .from("registrations")
      .update({ user_id: userId })
      .eq("email", email.toLowerCase())
      .is("user_id", null);

    if (bulkLinkErr) {
      log.error("bulk-link registrations failed", { error_message: bulkLinkErr.message, error_code: bulkLinkErr.code });
    }

    return json({
      success: true,
      user_id: userId,
      is_existing_user: !!existingUser,
    });

  } catch (err) {
    log.error("unhandled error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
