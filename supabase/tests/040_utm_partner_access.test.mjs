// Tests migration 040 (UTM partner sharing) on an in-memory Postgres.
// Focus: a partner can only ever see / add to the one link shared with them.
// Run:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/040_utm_partner_access.test.mjs supabase/migrations/040_utm_partner_access.sql supabase/migrations/042_partner_utm_analytics.sql supabase/migrations/043_utm_partner_remove.sql
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = fs.readFileSync(process.argv[2], "utf8") + "\n" + (process.argv[3] ? fs.readFileSync(process.argv[3], "utf8") : "") + "\n" + (process.argv[4] ? fs.readFileSync(process.argv[4], "utf8") : "");
const db = new PGlite();

const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333"; // organiser of another event
const AGENCY_A = "44444444-4444-4444-8444-444444444444";
const AGENCY_B = "55555555-5555-4555-8555-555555555555";
const UNVERIFIED = "66666666-6666-4666-8666-666666666666"; // signed up as late@x.com, email not confirmed
const BANNED = "77777777-7777-4777-8777-777777777777";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";        // free, approval required, capacity 12
const OTHER_EVENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";  // someone else's event
const OPEN_EVENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";   // free, no approval
const PAST_EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAID_EVENT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const DRAFT_EVENT = "99999999-9999-4999-8999-999999999999";

await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role); $$;
  CREATE TABLE public.profiles (user_id uuid UNIQUE, display_name text, banned_at timestamptz);
  CREATE FUNCTION public.is_user_banned(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=_user_id AND banned_at IS NOT NULL); $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text, owner_id uuid);
  CREATE TABLE public.org_members (org_id uuid, user_id uuid, role text);
  CREATE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=_org_id AND user_id=_user_id); $$;

  CREATE TABLE public.events (
    id uuid PRIMARY KEY, user_id uuid, org_id uuid, title text, date timestamptz NOT NULL, end_date timestamptz,
    timezone text, venue text, location text, capacity int DEFAULT 0, price numeric DEFAULT 0,
    status text NOT NULL DEFAULT 'published', event_format text NOT NULL DEFAULT 'physical',
    requires_approval boolean NOT NULL DEFAULT false,
    description text, image_url text, banner_landscape_url text
  );
  GRANT SELECT ON public.events TO anon, authenticated;
  CREATE TABLE public.registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id uuid, name text NOT NULL, email text NOT NULL,
    ticket_type text NOT NULL DEFAULT 'general', status text NOT NULL DEFAULT 'confirmed',
    approval_status text NOT NULL DEFAULT 'approved', amount_paid numeric DEFAULT 0, qr_code text,
    join_token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
    checked_in boolean NOT NULL DEFAULT false, checked_in_at timestamptz,
    title text, first_name text, last_name text, company text, designation text,
    mobile_country_code text, mobile_number text, linkedin_url text, company_website text,
    company_employee_count text, industry text,
    approved_by uuid, approved_at timestamptz, decline_reason text,
    utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX registrations_event_email_unique ON public.registrations (event_id, lower(email)) WHERE status <> 'cancelled';
  ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
  -- Same policies as production: organisers of the event, and the attendee themself.
  CREATE POLICY "Owner view regs" ON public.registrations FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR public.is_org_member(auth.uid(), e.org_id) OR public.has_role(auth.uid(), 'admin'))));
  CREATE POLICY "Attendee view own" ON public.registrations FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "Owner update regs" ON public.registrations FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR public.is_org_member(auth.uid(), e.org_id))));
  CREATE POLICY "Auth register" ON public.registrations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;

  -- Production trigger (approval rule), verbatim logic.
  CREATE FUNCTION public.registrations_validate() RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
  DECLARE _ra boolean; _p numeric; _org_id uuid; _is_organiser boolean;
  BEGIN
    SELECT requires_approval, COALESCE(price, 0), org_id INTO _ra, _p, _org_id FROM events WHERE id = NEW.event_id;
    _is_organiser := EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND (
      e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))));
    IF _p > 0 THEN NEW.approval_status := 'approved';
    ELSIF _ra AND TG_OP = 'INSERT' AND NOT _is_organiser THEN NEW.approval_status := 'pending';
    END IF;
    IF NEW.approval_status NOT IN ('pending', 'approved', 'waitlisted', 'declined') THEN RAISE EXCEPTION 'Invalid approval_status'; END IF;
    IF NEW.qr_code IS NULL THEN NEW.qr_code := substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 24); END IF;
    RETURN NEW;
  END; $$;
  CREATE TRIGGER registrations_validate_trg BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.registrations_validate();

  CREATE TABLE public.utm_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, utm_source text NOT NULL, utm_medium text NOT NULL,
    utm_campaign text NOT NULL, label text, url text NOT NULL DEFAULT 'x', UNIQUE (event_id, utm_source, utm_medium, utm_campaign));
  ALTER TABLE public.utm_links ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "org read" ON public.utm_links FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR public.is_org_member(auth.uid(), e.org_id))));
  GRANT SELECT ON public.utm_links TO authenticated;
  CREATE TABLE public.utm_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, utm_source text, utm_medium text, utm_campaign text, clicked_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.utm_clicks ENABLE ROW LEVEL SECURITY;

  CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, actor_email text, action text NOT NULL,
    target_type text, target_id text, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL,
    title text NOT NULL, body text, link text, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.registrant_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action text NOT NULL, reg_id text NOT NULL,
    actor_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION public.log_registrant_action(_action text, _registration_id uuid, _details jsonb DEFAULT '{}'::jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN INSERT INTO public.registrant_audit_log(action, reg_id, actor_id, details) VALUES (_action, _registration_id::text, auth.uid(), COALESCE(_details, '{}'::jsonb));
  EXCEPTION WHEN OTHERS THEN NULL; END; $$;

  INSERT INTO auth.users VALUES
    ('${OWNER}', 'owner@org.com', now()), ('${MEMBER}', 'member@org.com', now()), ('${OUTSIDER}', 'outsider@else.com', now()),
    ('${AGENCY_A}', 'Ana@AgencyA.com', now()), ('${AGENCY_B}', 'bo@agencyb.com', now()),
    ('${UNVERIFIED}', 'late@x.com', NULL), ('${BANNED}', 'banned@x.com', now());
  INSERT INTO public.profiles VALUES ('${AGENCY_A}', 'Ana Agency', NULL), ('${BANNED}', 'Banned', now());
  INSERT INTO public.organizations VALUES ('${ORG}', 'Biz Millennium', '${OWNER}');
  INSERT INTO public.org_members VALUES ('${ORG}', '${OWNER}', 'owner'), ('${ORG}', '${MEMBER}', 'member');
  INSERT INTO public.events (id, user_id, org_id, title, date, capacity, price, status, requires_approval) VALUES
    ('${EVENT}', '${OWNER}', '${ORG}', 'CFO Summit', now() + interval '10 days', 12, 0, 'published', true),
    ('${OTHER_EVENT}', '${OUTSIDER}', NULL, 'Other Event', now() + interval '10 days', 0, 0, 'published', false),
    ('${OPEN_EVENT}', '${OWNER}', '${ORG}', 'Open Roundtable', now() + interval '5 days', 0, 0, 'published', false),
    ('${PAST_EVENT}', '${OWNER}', '${ORG}', 'Past Event', now() - interval '5 days', 0, 0, 'published', false),
    ('${PAID_EVENT}', '${OWNER}', '${ORG}', 'Paid Event', now() + interval '5 days', 0, 500, 'published', false),
    ('${DRAFT_EVENT}', '${OWNER}', '${ORG}', 'Draft Event', now() + interval '5 days', 0, 0, 'draft', false);
  INSERT INTO public.utm_links (event_id, utm_source, utm_medium, utm_campaign, label) VALUES
    ('${EVENT}', 'agency-a', 'referral', 'cfo', 'Agency A link'), ('${EVENT}', 'agency-b', 'referral', 'cfo', NULL),
    ('${EVENT}', 'agency-a', 'paid', 'cfo', NULL), ('${EVENT}', 'email', 'broadcast', 'cfo', NULL),
    ('${OTHER_EVENT}', 'agency-a', 'referral', 'cfo', NULL),
    ('${OPEN_EVENT}', 'agency-a', 'referral', 'open', NULL), ('${PAST_EVENT}', 'agency-a', 'referral', 'past', NULL),
    ('${PAID_EVENT}', 'agency-a', 'referral', 'paid', NULL), ('${DRAFT_EVENT}', 'agency-a', 'referral', 'draft', NULL);
  INSERT INTO public.utm_clicks (event_id, utm_source, utm_medium, utm_campaign, clicked_at) VALUES ('${EVENT}', 'qr', NULL, NULL, now()),
    ('${EVENT}', 'agency-a', 'referral', 'cfo', now() - interval '3 days'), ('${EVENT}', 'agency-a', 'referral', 'cfo', now() - interval '3 days'),
    ('${EVENT}', 'agency-a', 'referral', 'cfo', now()), ('${EVENT}', 'agency-a', 'paid', 'cfo', now()),
    ('${EVENT}', 'agency-b', 'referral', 'cfo', now()), ('${EVENT}', 'agency-b', 'referral', 'cfo', now()), ('${EVENT}', 'agency-b', 'referral', 'cfo', now()), ('${EVENT}', 'agency-b', 'referral', 'cfo', now()),
    ('${OTHER_EVENT}', 'agency-a', 'referral', 'cfo', now());
  UPDATE public.events SET timezone = 'Asia/Kolkata', description = 'Finance 6.0', banner_landscape_url = 'https://img/banner.png' WHERE id = '${EVENT}';
  UPDATE public.events SET timezone = 'Not/AZone' WHERE id = '${OPEN_EVENT}';
`);
// Seed registrations as the owner (so the approval trigger treats them as organiser-added).
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
  INSERT INTO public.registrations (event_id, name, email, company, designation, approval_status, checked_in, checked_in_at, decline_reason, status, utm_source, utm_medium, utm_campaign) VALUES
    ('${EVENT}', 'A One',   'a1@x.com', 'Acme',   'CFO', 'approved', true,  now(), NULL, 'confirmed', 'agency-a', 'referral', 'cfo'),
    ('${EVENT}', 'A Two',   'a2@x.com', 'Globex', 'VP',  'pending',  false, NULL,  NULL, 'confirmed', 'agency-a', 'referral', 'cfo'),
    ('${EVENT}', 'A Three', 'a3@x.com', 'Initech','FD',  'declined', false, NULL,  'SECRET organiser reason', 'confirmed', 'agency-a', 'referral', 'cfo'),
    ('${EVENT}', 'A Gone',  'a4@x.com', 'Hooli',  'CEO', 'approved', false, NULL,  NULL, 'cancelled', 'agency-a', 'referral', 'cfo'),
    ('${EVENT}', 'A Paid',  'a5@x.com', 'Paidco', 'CFO', 'approved', false, NULL,  NULL, 'confirmed', 'agency-a', 'paid', 'cfo'),
    ('${EVENT}', 'B One',   'b1@x.com', 'Umbrella','CFO','approved', true,  now(), NULL, 'confirmed', 'agency-b', 'referral', 'cfo'),
    ('${EVENT}', 'B Two',   'b2@x.com', 'Wayne',  'CFO', 'approved', false, NULL,  NULL, 'confirmed', 'agency-b', 'referral', 'cfo'),
    ('${EVENT}', 'E One',   'e1@x.com', 'Stark',  'CFO', 'approved', false, NULL,  NULL, 'confirmed', 'email', 'broadcast', 'cfo'),
    ('${EVENT}', 'Direct',  'd1@x.com', 'Direct', 'CFO', 'approved', false, NULL,  NULL, 'confirmed', NULL, NULL, NULL);
  SELECT set_config('request.jwt.claim.sub', '${OUTSIDER}', false);
  INSERT INTO public.registrations (event_id, name, email, company, utm_source, utm_medium, utm_campaign) VALUES
    ('${OTHER_EVENT}', 'Other Lead', 'o1@x.com', 'OtherCo', 'agency-a', 'referral', 'cfo');
  SELECT set_config('request.jwt.claim.sub', '', false);`);

await db.exec(migration);

async function as(role, uid, sql, params) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false); SET ROLE ${role};`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec("RESET ROLE;"); }
}
const one = async (sql) => (await db.query(sql)).rows[0];
const count = async (sql) => Number((await one(sql)).n);
const call = async (uid, sql, params) => { const r = await as("authenticated", uid, sql, params); return r.error ? r : { v: Object.values(r.rows[0])[0] }; };
const share = (uid, event, s, m, c, email, perms = {}) =>
  call(uid, `SELECT public.utm_partner_share($1,$2,$3,$4,$5,$6::jsonb)`, [event, s, m, c, email, JSON.stringify(perms)]);
const grants = (uid) => call(uid, `SELECT public.partner_utm_grants()`);
const people = (uid, id, o = {}) => call(uid,
  `SELECT public.partner_utm_participants($1,$2,$3,$4,$5,$6,$7,$8)`,
  [id, o.search ?? null, o.approval ?? null, o.checkin ?? null, o.from ?? null, o.to ?? null, o.limit ?? 25, o.offset ?? 0]);
const register = (uid, id, person) => call(uid, `SELECT public.partner_utm_register($1,$2::jsonb)`, [id, JSON.stringify(person)]);
const person = (email, extra = {}) => ({ first_name: "New", last_name: "Person", email, company: "NewCo", designation: "CFO", mobile_country_code: "+91", mobile_number: "9876543210", ...extra });
const denied = (r) => /don't have access|Not authorised|permission denied/i.test(r.error ?? "");

let pass = 0, fail = 0;
const expect = (label, cond, detail) => {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label + "   → " + JSON.stringify(detail)); }
};
const names = (r) => (r.v?.rows ?? []).map((x) => x.name).sort().join(",");

console.log("\nOrganiser shares a link");
let r = await share(AGENCY_A, EVENT, "agency-a", "referral", "cfo", "ana@agencya.com");
expect("a non-organiser cannot share a link", denied(r), r);
r = await share(OUTSIDER, EVENT, "agency-a", "referral", "cfo", "x@x.com");
expect("an organiser of a different event cannot share this event's link", denied(r), r);
r = await as("anon", null, `SELECT public.utm_partner_share('${EVENT}','agency-a','referral','cfo','x@x.com','{}'::jsonb)`);
expect("anonymous cannot share", /permission denied/i.test(r.error ?? ""), r);
r = await share(OWNER, EVENT, "nope", "referral", "cfo", "x@x.com");
expect("a link that doesn't exist for the event is refused", /doesn't exist for this event/.test(r.error ?? ""), r);
r = await share(OWNER, EVENT, "agency-a", "referral", "open", "x@x.com");
expect("a link belonging to ANOTHER event is refused", /doesn't exist for this event/.test(r.error ?? ""), r);
r = await share(OWNER, EVENT, "(direct)", "", "", "x@x.com");
expect("'(direct)' cannot be shared", /not a tracked link/.test(r.error ?? ""), r);
r = await share(OWNER, EVENT, "agency-a", "referral", "cfo", "not-an-email");
expect("an invalid email is refused", /valid email/.test(r.error ?? ""), r);

r = await share(OWNER, EVENT, "agency-a", "referral", "cfo", "  ANA@agencya.com ", { can_register: true, can_export: true });
const GA = r.v?.id;
expect("owner shares agency-a link with Agency A (existing user) — pending, has account",
  r.v?.status === "pending" && r.v?.has_account === true && r.v?.invited_email === "ana@agencya.com" && r.v?.can_register === true && r.v?.created === true, r);
expect("organiser sees the link's performance (3 registrations: 1 approved, 1 pending, 1 declined, 1 checked in)",
  r.v?.stats?.total === 3 && r.v?.stats?.approved === 1 && r.v?.stats?.pending === 1 && r.v?.stats?.declined === 1 && r.v?.stats?.checked_in === 1, r.v?.stats);
r = await share(MEMBER, EVENT, "agency-b", "referral", "cfo", "bo@agencyb.com", { can_view_approval: false, can_view_checkin: false });
const GB = r.v?.id;
expect("an org member shares agency-b link with Agency B (limited permissions)", r.v?.status === "pending" && r.v?.can_view_approval === false && r.v?.can_register === false, r);
r = await share(OWNER, EVENT, "agency-a", "referral", "cfo", "ana@agencya.com", { can_export: true });
expect("sharing the same link with the same partner again doesn't duplicate", r.v?.id === GA && r.v?.created === false && (await count(`SELECT count(*) n FROM utm_partner_access`)) === 2, r);
r = await share(OWNER, EVENT, "email", "broadcast", "cfo", "late@x.com");
const GL = r.v?.id;
expect("inviting someone without a verified account works — pending, no account", r.v?.status === "pending" && r.v?.has_account === false, r);
expect("the partner with an account got an in-app notification", (await count(`SELECT count(*) n FROM app_notifications WHERE user_id='${AGENCY_A}' AND type='utm_partner_invite'`)) === 1, "");
expect("invitations are audited", (await count(`SELECT count(*) n FROM audit_logs WHERE action='utm_partner.invited'`)) === 3, "");

console.log("\nThe table itself is closed");
r = await as("authenticated", AGENCY_A, `SELECT * FROM public.utm_partner_access`);
expect("partners cannot read the access table directly", /permission denied/i.test(r.error ?? ""), r);
r = await as("authenticated", AGENCY_A, `UPDATE public.utm_partner_access SET can_export = true, utm_source = 'agency-b'`);
expect("partners cannot edit their own grant", /permission denied/i.test(r.error ?? ""), r);
r = await as("authenticated", AGENCY_A, `INSERT INTO public.utm_partner_access(event_id, utm_source, invited_email, partner_user_id, status) VALUES ('${EVENT}','agency-b','ana@agencya.com','${AGENCY_A}','accepted')`);
expect("partners cannot create a grant for themselves", /permission denied/i.test(r.error ?? ""), r);
for (const fn of ["_utm_partner_stats('" + EVENT + "','agency-b','referral','cfo')", "_utm_partner_grant('" + GB + "')", "_utm_partner_manages_event('" + EVENT + "')"]) {
  r = await as("authenticated", AGENCY_A, `SELECT public.${fn}`);
  expect(`internal helper ${fn.split("(")[0]} is not callable by clients`, /permission denied/i.test(r.error ?? ""), r);
}

console.log("\nBefore accepting");
r = await people(AGENCY_A, GA);
expect("a pending grant gives no access yet", denied(r), r);
r = await call(AGENCY_A, `SELECT public.partner_utm_has_access()`);
expect("the menu check sees the pending invitation", r.v === true, r);
r = await call(OUTSIDER, `SELECT public.partner_utm_has_access()`);
expect("…and is false for someone with no invitation", r.v === false, r);

console.log("\nPartner dashboard");
r = await grants(AGENCY_A);
expect("opening the dashboard accepts the invitation; Agency A sees exactly 1 link",
  r.v?.length === 1 && r.v[0].id === GA && r.v[0].utm_source === "agency-a" && r.v[0].event.title === "CFO Summit" && r.v[0].label === "Agency A link", r);
expect("its stats are for agency-a only (3), never the event total (9)", r.v?.[0]?.stats?.total === 3 && r.v[0].stats.checked_in === 1 && r.v[0].stats.pending === 1, r.v?.[0]?.stats);
expect("no other source, and no event id, appears anywhere in the response", !JSON.stringify(r.v).includes("agency-b") && !JSON.stringify(r.v).includes("email") && !JSON.stringify(r.v).includes(EVENT), JSON.stringify(r.v));
expect("the organiser was notified of acceptance", (await count(`SELECT count(*) n FROM app_notifications WHERE user_id='${OWNER}' AND type='utm_partner_accepted'`)) === 1, "");
r = await grants(AGENCY_B);
const statsB = r.v?.[0]?.stats;
expect("Agency B sees only its own link; approval + check-in counts are hidden by permission",
  r.v?.length === 1 && r.v[0].id === GB && statsB.total === 2 && statsB.approved === null && statsB.checked_in === null, r);
r = await grants(UNVERIFIED);
expect("an unverified email does NOT claim an invitation sent to that address", r.v?.length === 0 && (await one(`SELECT status FROM utm_partner_access WHERE id='${GL}'`)).status === "pending", r);
r = await as("anon", null, `SELECT public.partner_utm_grants()`);
expect("anonymous cannot call the partner dashboard", /permission denied/i.test(r.error ?? ""), r);

console.log("\nParticipants: strict isolation");
r = await people(AGENCY_A, GA);
expect("Agency A lists its 3 participants (cancelled excluded; other medium excluded)", r.v?.total === 3 && names(r) === "A One,A Three,A Two", r);
const dump = JSON.stringify(r.v);
expect("nothing organiser-private is returned (decline reason, QR, tokens, phone)", !/SECRET|decline_reason|qr_code|join_token|mobile/.test(dump), dump);
expect("approval + check-in status are present for Agency A", r.v.rows.find((x) => x.name === "A One").checked_in === true && r.v.rows.find((x) => x.name === "A Two").approval_status === "pending", "");
r = await people(AGENCY_A, GB);
expect("Agency A cannot open Agency B's link by its id", denied(r), r);
r = await people(AGENCY_B, GA);
expect("Agency B cannot open Agency A's link by its id", denied(r), r);
r = await people(AGENCY_A, "00000000-0000-4000-8000-000000000000");
expect("an unknown id gives the same refusal (no existence leak)", denied(r), r);
r = await people(OUTSIDER, GA);
expect("an unrelated user is refused", denied(r), r);
r = await people(AGENCY_A, GA, { search: "Umbrella" });
expect("searching for another agency's lead finds nothing", r.v?.total === 0, r);
r = await people(AGENCY_A, GA, { search: "b1@x.com" });
expect("searching another agency's email finds nothing", r.v?.total === 0, r);
r = await people(AGENCY_A, GA, { search: "%" });
expect("wildcard search can't widen the scope", r.v?.total === 0, r);
r = await people(AGENCY_A, GA, { search: "globex" });
expect("search works inside the scope", r.v?.total === 1 && names(r) === "A Two", r);
r = await people(AGENCY_A, GA, { approval: "pending" });
expect("approval filter: pending → 1", r.v?.total === 1 && names(r) === "A Two", r);
r = await people(AGENCY_A, GA, { checkin: "in" });
expect("check-in filter: checked in → 1", r.v?.total === 1 && names(r) === "A One", r);
r = await people(AGENCY_A, GA, { checkin: "out" });
expect("check-in filter: not checked in → 2", r.v?.total === 2, r);
r = await people(AGENCY_A, GA, { limit: 2, offset: 0 });
const p2 = await people(AGENCY_A, GA, { limit: 2, offset: 2 });
expect("pagination stays in scope (2 + 1 of 3)", r.v?.rows.length === 2 && r.v.total === 3 && p2.v?.rows.length === 1, [r, p2]);
r = await people(AGENCY_A, GA, { limit: 100000 });
expect("an oversized page size is capped and still scoped", r.v?.total === 3 && r.v.rows.length === 3, r);
r = await people(AGENCY_A, GA, { to: new Date(Date.now() - 86400000).toISOString() });
expect("date range filter works", r.v?.total === 0, r);

r = await people(AGENCY_B, GB);
expect("Agency B: approval + check-in fields are NULL (permission enforced by the database)",
  r.v?.total === 2 && r.v.rows.every((x) => x.approval_status === null && x.checked_in === null && x.checked_in_at === null && x.approved_at === null), r);
r = await people(AGENCY_B, GB, { checkin: "in" });
expect("Agency B can't infer check-ins by filtering — the filter is ignored", r.v?.total === 2, r);
r = await people(AGENCY_B, GB, { approval: "declined" });
expect("…nor approvals", r.v?.total === 2, r);

if (process.argv[3]) {
  console.log("\nAnalytics (042)");
  const an = (uid, id) => call(uid, `SELECT public.partner_utm_analytics($1)`, [id]);
  r = await an(AGENCY_A, GA);
  const sum = (k) => (r.v?.series ?? []).reduce((n, p) => n + Number(p[k] ?? 0), 0);
  expect("Agency A: clicks are for its own link only (3 — not the other medium, agency or event)", r.v?.clicks === 3 && sum("clicks") === 3, r);
  expect("the daily series adds up to its 3 registrations and 1 check-in, on 2 separate days", sum("registrations") === 3 && sum("check_ins") === 1 && r.v.series.length === 2, r.v?.series);
  expect("days use the event's timezone", r.v?.timezone === "Asia/Kolkata" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.v.series[0].day), r.v);
  expect("top companies list only its own participants' companies", r.v?.top_companies.length === 3 && !JSON.stringify(r.v).match(/Umbrella|Wayne|Stark|Hooli|Paidco/), r.v?.top_companies);
  const gl = (await grants(AGENCY_A)).v?.[0]?.event;
  expect("the event banner + description reach the partner's event list", gl?.image_url === "https://img/banner.png" && gl.description === "Finance 6.0", gl);
  r = await an(AGENCY_B, GB);
  expect("Agency B (no check-in permission): its 4 clicks, check-in series is NULL", r.v?.clicks === 4 && r.v.series.every((p) => p.check_ins === null) && r.v.top_companies.length === 2, r);
  r = await an(AGENCY_B, GA);
  expect("Agency B cannot read Agency A's analytics", denied(r), r);
  r = await an(OUTSIDER, GA);
  expect("an unrelated user cannot read analytics", denied(r), r);
  r = await as("anon", null, `SELECT public.partner_utm_analytics('${GA}')`);
  expect("anonymous cannot read analytics", /permission denied/i.test(r.error ?? ""), r);
}
console.log("\nDirect table access stays closed to partners");
r = await as("authenticated", AGENCY_A, `SELECT count(*)::int AS n FROM public.registrations`);
expect("a partner reading the registrations table directly gets nothing", r.rows?.[0]?.n === 0, r);
r = await as("authenticated", AGENCY_A, `SELECT count(*)::int AS n FROM public.utm_links`);
expect("…and no saved links", r.rows?.[0]?.n === 0, r);
r = await as("authenticated", AGENCY_A, `UPDATE public.registrations SET approval_status='approved', checked_in=true WHERE email='a2@x.com' RETURNING id`);
expect("a partner cannot approve or check in a participant", (r.rows?.length ?? 0) === 0 && (await one(`SELECT approval_status s FROM registrations WHERE email='a2@x.com'`)).s === "pending", r);

console.log("\nExport");
r = await call(AGENCY_A, `SELECT public.partner_utm_export($1)`, [GA]);
expect("Agency A (export allowed) exports its 3 rows only", r.v?.length === 3 && !JSON.stringify(r.v).includes("b1@x.com") && !/SECRET/.test(JSON.stringify(r.v)), r);
r = await call(AGENCY_B, `SELECT public.partner_utm_export($1)`, [GB]);
expect("Agency B (export not allowed) is refused by the database", /Export isn't enabled/.test(r.error ?? ""), r);
r = await call(AGENCY_B, `SELECT public.partner_utm_export($1)`, [GA]);
expect("Agency B cannot export Agency A's link", denied(r), r);
expect("exports are audited", (await count(`SELECT count(*) n FROM audit_logs WHERE action='utm_partner.exported'`)) === 1, "");

console.log("\nRegistering participants");
r = await register(AGENCY_B, GB, person("nb@x.com"));
expect("without the register permission, the database refuses", /isn't enabled/.test(r.error ?? ""), r);
r = await register(AGENCY_B, GA, person("nb@x.com"));
expect("a partner cannot register under someone else's link", denied(r), r);
r = await register(AGENCY_A, GA, person("New1@X.com", { event_id: OTHER_EVENT, utm_source: "agency-b", utm_medium: "x", utm_campaign: "y", approval_status: "approved", checked_in: true, created_by: OWNER }));
const newReg = await one(`SELECT * FROM registrations WHERE email='new1@x.com'`);
expect("Agency A registers a participant", !r.error && r.v?.email === "new1@x.com", r);
expect("event + UTM come from the grant — injected event_id / utm values are ignored",
  newReg?.event_id === EVENT && newReg.utm_source === "agency-a" && newReg.utm_medium === "referral" && newReg.utm_campaign === "cfo", newReg);
expect("approval-required event → the new registration is PENDING (partner can't self-approve), not checked in",
  newReg?.approval_status === "pending" && newReg.checked_in === false, newReg);
expect("who registered them is recorded", newReg?.created_by === AGENCY_A && (await count(`SELECT count(*) n FROM registrant_audit_log WHERE action='partner_registered' AND actor_id='${AGENCY_A}'`)) === 1, newReg?.created_by);
expect("a ticket code was generated by the existing trigger", !!newReg?.qr_code, "");
r = await people(AGENCY_A, GA);
expect("the dashboard now shows 4, flagged as added by the partner", r.v?.total === 4 && r.v.rows.find((x) => x.email === "new1@x.com")?.added_by_you === true, r);
r = await people(AGENCY_B, GB);
expect("Agency B's list is unchanged (2)", r.v?.total === 2, r);
r = await register(AGENCY_A, GA, person("NEW1@x.com"));
expect("duplicate email is refused (case-insensitive)", /already registered/.test(r.error ?? ""), r);
r = await register(AGENCY_A, GA, person("b1@x.com"));
expect("an email already registered through another source is refused, not re-attributed", /already registered/.test(r.error ?? "") && (await one(`SELECT utm_source s FROM registrations WHERE email='b1@x.com'`)).s === "agency-b", r);
r = await register(AGENCY_A, GA, person("a4@x.com"));
expect("someone who cancelled earlier can be registered again", !r.error, r);
r = await register(AGENCY_A, GA, person("bad"));
expect("invalid email is refused", /valid email/.test(r.error ?? ""), r);
r = await register(AGENCY_A, GA, person("ok@x.com", { first_name: " " }));
expect("missing name is refused", /name/.test(r.error ?? ""), r);
r = await register(AGENCY_A, GA, person("ok@x.com", { mobile_number: "12" }));
expect("invalid mobile is refused", /mobile/.test(r.error ?? ""), r);

// Capacity 12: 7 seeded seats count (declined + cancelled don't), +2 added above = 9.
r = await register(AGENCY_A, GA, person("cap1@x.com"));
const r2 = await register(AGENCY_A, GA, person("cap2@x.com"));
const r3x = await register(AGENCY_A, GA, person("cap3@x.com"));
const r3 = await register(AGENCY_A, GA, person("cap4@x.com"));
expect("capacity is respected — the 13th seat is refused", !r.error && !r2.error && !r3x.error && /full/.test(r3.error ?? ""), [r, r2, r3]);

// Other event states.
const mk = async (ev, c) => { const s = await share(OWNER, ev, "agency-a", "referral", c, "ana@agencya.com", { can_register: true }); await grants(AGENCY_A); return s.v.id; };
const G_OPEN = await mk(OPEN_EVENT, "open"), G_PAST = await mk(PAST_EVENT, "past"), G_PAID = await mk(PAID_EVENT, "paid"), G_DRAFT = await mk(DRAFT_EVENT, "draft");
r = await register(AGENCY_A, G_OPEN, person("open1@x.com"));
expect("event without approval → registration is approved straight away", !r.error && (await one(`SELECT approval_status s FROM registrations WHERE email='open1@x.com'`)).s === "approved", r);
r = await register(AGENCY_A, G_PAST, person("past1@x.com"));
expect("registration closed after the event ends", /closed/.test(r.error ?? ""), r);
r = await register(AGENCY_A, G_PAID, person("paid1@x.com"));
expect("paid events can't be registered for free by a partner", /paid event/.test(r.error ?? ""), r);
r = await register(AGENCY_A, G_DRAFT, person("draft1@x.com"));
expect("unpublished events can't be registered for", /isn't open/.test(r.error ?? ""), r);
if (process.argv[3]) {
  r = await call(AGENCY_A, `SELECT public.partner_utm_analytics($1)`, [G_OPEN]);
  expect("an invalid event timezone falls back to UTC instead of failing", r.v?.timezone === "UTC" && r.v.series.length === 1, r);
}
r = await grants(AGENCY_A);
expect("a partner with several links sees only the ones shared (5), each with its own count", r.v?.length === 5 && r.v.find((g) => g.id === G_OPEN).stats.total === 1, r.v?.map((g) => [g.utm_campaign, g.stats.total]));

console.log("\nLive status changes by the organiser");
await as("authenticated", OWNER, `UPDATE public.registrations SET approval_status='approved', approved_at=now(), checked_in=true, checked_in_at=now() WHERE email='new1@x.com'`);
r = await people(AGENCY_A, GA, { search: "new1@x.com" });
expect("organiser approves + checks in → the partner sees it on the next refresh", r.v?.rows[0]?.approval_status === "approved" && r.v.rows[0].checked_in === true && !!r.v.rows[0].checked_in_at, r);
await as("authenticated", OWNER, `UPDATE public.registrations SET utm_source='email', utm_medium='broadcast' WHERE email='a2@x.com'`);
r = await people(AGENCY_A, GA, { search: "a2@x.com" });
expect("a participant moved to another source disappears from the partner's view", r.v?.total === 0, r);

console.log("\nPermission changes and revocation");
r = await call(AGENCY_A, `SELECT public.utm_partner_update($1,$2::jsonb)`, [GA, JSON.stringify({ can_export: true, can_register: true })]);
expect("a partner cannot change their own permissions", denied(r), r);
r = await call(OUTSIDER, `SELECT public.utm_partner_revoke($1)`, [GA]);
expect("another organiser cannot revoke this event's shares", denied(r), r);
r = await call(AGENCY_B, `SELECT public.utm_partner_list($1)`, [EVENT]);
expect("a partner cannot list an event's partners", denied(r), r);
r = await call(OWNER, `SELECT public.utm_partner_update($1,$2::jsonb)`, [GA, JSON.stringify({ can_register: false, can_view_checkin: false })]);
expect("organiser changes permissions", r.v?.can_register === false && r.v?.can_view_checkin === false && r.v?.can_export === true, r);
r = await register(AGENCY_A, GA, person("after@x.com"));
expect("…register is refused immediately afterwards", /isn't enabled/.test(r.error ?? ""), r);
r = await people(AGENCY_A, GA);
expect("…check-in data is hidden immediately afterwards", r.v?.rows.every((x) => x.checked_in === null), r);
r = await call(OWNER, `SELECT public.utm_partner_list($1)`, [EVENT]);
const rowA = r.v?.find((x) => x.id === GA);
expect("organiser's partner list: status, partner name, link performance and partner-added count",
  r.v?.length === 3 && rowA.status === "accepted" && rowA.partner_name === "Ana Agency" && rowA.registered_by_partner === 5 && r.v.find((x) => x.id === GL).status === "pending", r.v);

r = await call(OWNER, `SELECT public.utm_partner_revoke($1)`, [GA]);
expect("organiser revokes Agency A", r.v?.status === "revoked" && !!r.v.revoked_at, r);
r = await people(AGENCY_A, GA);
expect("revoked → participants refused at once", denied(r), r);
r = await call(AGENCY_A, `SELECT public.partner_utm_export($1)`, [GA]);
expect("revoked → export refused", denied(r), r);
r = await register(AGENCY_A, GA, person("after2@x.com"));
expect("revoked → register refused", denied(r), r);
r = await grants(AGENCY_A);
expect("revoked → the link is gone from the partner's dashboard (4 left)", r.v?.length === 4 && !r.v.some((g) => g.id === GA), r.v?.length);
expect("revocation is audited and the partner notified", (await count(`SELECT count(*) n FROM audit_logs WHERE action='utm_partner.revoked'`)) === 1 && (await count(`SELECT count(*) n FROM app_notifications WHERE user_id='${AGENCY_A}' AND type='utm_partner_revoked'`)) === 1, "");
r = await share(OWNER, EVENT, "agency-a", "referral", "cfo", "ana@agencya.com");
expect("re-sharing after a revoke starts a fresh pending invitation (no access until re-opened)", r.v?.id === GA && r.v.status === "pending" && denied(await people(AGENCY_A, GA)), r);

console.log("\nBanned users and deleted events");
await share(OWNER, EVENT, "email", "broadcast", "cfo", "banned@x.com");
r = await grants(BANNED);
expect("a banned user gets no partner access", r.v?.length === 0, r);
await db.exec(`DELETE FROM public.events WHERE id='${OPEN_EVENT}'`);
r = await people(AGENCY_A, G_OPEN);
expect("deleting an event removes its shares", denied(r), r);

if (process.argv[4]) {
  console.log("\nRemoving shares (043)");
  const remove = (uid, id) => call(uid, `SELECT public.utm_partner_remove($1)`, [id]);
  const listed = async () => (await call(OWNER, `SELECT public.utm_partner_list($1)`, [EVENT])).v ?? [];
  const before = (await listed()).length;
  r = await remove(AGENCY_B, GB);
  expect("a partner cannot remove a share", denied(r), r);
  r = await remove(OUTSIDER, GB);
  expect("another organiser cannot remove this event's shares", denied(r), r);
  r = await as("anon", null, `SELECT public.utm_partner_remove('${GB}')`);
  expect("anonymous cannot remove a share", /permission denied/i.test(r.error ?? ""), r);
  expect("Agency B still has access before removal", !(await people(AGENCY_B, GB)).error, "");
  r = await remove(OWNER, GB);
  expect("organiser removes an ACTIVE share", r.v?.removed === true, r);
  expect("…the partner loses access immediately and is notified", denied(await people(AGENCY_B, GB)) && (await grants(AGENCY_B)).v?.length === 0 && (await count(`SELECT count(*) n FROM app_notifications WHERE user_id='${AGENCY_B}' AND type='utm_partner_revoked'`)) === 1, "");
  expect("…it is gone from the organiser's Partners list and audited", (await listed()).length === before - 1 && !(await listed()).some((x) => x.id === GB) && (await count(`SELECT count(*) n FROM audit_logs WHERE action='utm_partner.removed'`)) === 1, "");
  r = await remove(OWNER, GB);
  expect("removing it again is refused cleanly", denied(r), r);
  const regsBefore = await count(`SELECT count(*) n FROM registrations WHERE event_id='${EVENT}'`);
  r = await call(OWNER, `SELECT public.delete_utm_tracking($1,$2,$3,$4)`, [EVENT, "email", "broadcast", "cfo"]);
  expect("deleting a tracked link also removes its partner shares (2) — and reports it", r.v?.partners_removed === 2 && r.v.links_deleted === 1 && r.v.registrations_kept >= 1, r);
  const left = await listed();
  expect("shares of OTHER links are untouched", left.length === 1 && left[0].id === GA, left.map((x) => [x.utm_source, x.invited_email]));
  expect("no registration was deleted", (await count(`SELECT count(*) n FROM registrations WHERE event_id='${EVENT}'`)) === regsBefore, "");
  r = await call(AGENCY_A, `SELECT public.delete_utm_tracking($1,$2,$3,$4)`, [EVENT, "agency-a", "referral", "cfo"]);
  expect("a partner cannot delete a tracked link", denied(r), r);
}

console.log("\nExisting organiser behaviour is unchanged");
r = await as("authenticated", OWNER, `SELECT count(*)::int AS n FROM public.registrations WHERE event_id='${EVENT}'`);
expect("the organiser still sees every registration of the event", r.rows?.[0]?.n >= 12, r);
r = await as("authenticated", OWNER, `INSERT INTO public.registrations (event_id, name, email, approval_status) VALUES ('${DRAFT_EVENT}', 'Org Added', 'org@x.com', 'approved') RETURNING approval_status, created_by`);
expect("organiser-added registrations still work and are approved", r.rows?.[0]?.approval_status === "approved" && r.rows[0].created_by === null, r);

console.log("\nRe-running the migration");
try { await db.exec(migration); expect("second run succeeds and keeps data", (await count(`SELECT count(*) n FROM utm_partner_access`)) > 0); } catch (e) { expect("second run succeeds", false, String(e.message || e)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
