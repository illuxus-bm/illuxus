// Tests migration 092 (sponsor shares carry everyone's contact details again) on an in-memory Postgres,
// on top of the real share-building functions from migrations 071, 072, 075 and 079.
// Run:  node supabase/tests/092_sponsor_share_all_contacts.test.mjs
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const bundle = fs.readFileSync(new URL("../migrations/000_full_schema.sql", import.meta.url), "utf8");
function section(name) {
  const startMarker = `-- >>> BEGIN SOURCE MIGRATION: ${name} >>>\n`;
  const endMarker = `-- <<< END SOURCE MIGRATION: ${name} <<<`;
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Migration section not found: ${name}`);
  return bundle.slice(start + startMarker.length, end).replace(/NOTIFY pgrst, 'reload schema';/g, "");
}

const db = new PGlite();
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failures.push(`${name}: ${err.message}`); }
}
function eq(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
/** Run as a signed-in user (or the server, with uid null) the way PostgREST would. */
async function as(role, uid, fn) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return await fn(); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);"); }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

const ORGANISER = "11111111-1111-4111-8111-111111111111";
const ASHA = "22222222-2222-4222-8222-222222222222";  // attendee, agrees
const BEN = "33333333-3333-4333-8333-333333333333";   // attendee, doesn't
const RIA = "44444444-4444-4444-8444-444444444444";   // registered speaker, doesn't
const EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPONSOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPEAKER_RIA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SPEAKER_SAM = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"; // listed speaker, never registered

await db.exec(`
  SET check_function_bodies = off;
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  CREATE TABLE public.events (id uuid PRIMARY KEY, title text, date timestamptz, end_date timestamptz);
  CREATE TABLE public.registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, user_id uuid, email text NOT NULL, name text,
    title text, first_name text, last_name text, designation text, company text,
    mobile_country_code text, mobile_number text, linkedin_url text,
    company_website text, company_employee_count text, industry text,
    ticket_type text DEFAULT 'general', approval_status text DEFAULT 'approved', status text DEFAULT 'confirmed',
    checked_in boolean NOT NULL DEFAULT false, checked_in_at timestamptz, attendance_state text NOT NULL DEFAULT 'never',
    total_minutes integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.speakers (
    id uuid PRIMARY KEY, name text, title text, first_name text, last_name text, designation text, company text, email text,
    mobile_country_code text, mobile_number text, linkedin_url text, company_website text, company_employee_count text,
    industry text, updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.event_speakers (event_id uuid, speaker_id uuid);
  CREATE TABLE public.companies (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.sponsors (id uuid PRIMARY KEY, name text, email text, company_id uuid);
  CREATE TABLE public.event_sponsors (id uuid PRIMARY KEY, event_id uuid, sponsor_id uuid, tier text, tier_label text);
  CREATE TABLE public.sponsor_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sponsor_id uuid, email text, user_id uuid, accepted_at timestamptz, role text);
  CREATE TABLE public.event_sponsor_contacts (event_sponsor_id uuid, member_id uuid);
  CREATE TABLE public.sponsor_data_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_sponsor_id uuid, event_id uuid, sponsor_id uuid, company_id uuid,
    version integer, status text NOT NULL DEFAULT 'active', allow_export boolean, includes_without_permission boolean,
    fields jsonb, record_count integer, with_email integer, with_mobile integer, with_both integer, without_contact integer,
    without_permission integer, shared_before_end boolean, shared_by uuid, shared_at timestamptz NOT NULL DEFAULT now(),
    revoked_by uuid, revoked_at timestamptz, revoke_reason text);
  CREATE TABLE public.sponsor_data_share_rows (
    share_id uuid NOT NULL REFERENCES public.sponsor_data_shares(id) ON DELETE CASCADE,
    registration_id uuid, data jsonb NOT NULL, PRIMARY KEY (share_id, registration_id));
  CREATE TABLE public.app_notifications (user_id uuid, type text, title text, body text, link text);
  CREATE TABLE public.audit_logs (actor_id uuid, action text, target_type text, target_id text, details jsonb);
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

  -- From migration 069, simplified: the organiser may share; the event ended yesterday.
  CREATE FUNCTION public._require_share_access(_event uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF auth.uid() IS DISTINCT FROM '${ORGANISER}'::uuid THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
    RETURN auth.uid();
  END $$;
  CREATE FUNCTION public._event_has_ended(_event uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT COALESCE((SELECT COALESCE(end_date, date) < now() FROM public.events WHERE id = _event), false) $$;
  CREATE FUNCTION public._canonical_company(_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT _id $$;
`);

// The share-building functions as they are before 079 (071, 072, 075).
for (const m of ["071_sponsor_data_sharing_people.sql", "072_sponsor_data_sharing_speakers.sql", "075_sponsor_share_speaker_details.sql"]) {
  await db.exec(section(m));
}
// 069 added the consent columns; 070 dropped its trigger.
await db.exec(`
  ALTER TABLE public.registrations ADD COLUMN sponsor_share_consent boolean NOT NULL DEFAULT false;
  ALTER TABLE public.registrations ADD COLUMN sponsor_share_consent_at timestamptz;
  INSERT INTO public.events VALUES ('${EVENT}', 'CFO Connect', now() - interval '2 days', now() - interval '1 day');
  INSERT INTO public.companies VALUES ('${SPONSOR}', 'ABC Technologies');
  INSERT INTO public.sponsors VALUES ('${SPONSOR}', 'ABC Technologies', 'team@abc.test', '${SPONSOR}');
  INSERT INTO public.event_sponsors VALUES ('${LINK}', '${EVENT}', '${SPONSOR}', 'gold', null);
  INSERT INTO public.sponsor_members (sponsor_id, email, user_id, accepted_at, role) VALUES ('${SPONSOR}', 'rep@abc.test', gen_random_uuid(), now(), 'admin');
  INSERT INTO public.speakers (id, name, first_name, last_name, company, email, mobile_country_code, mobile_number, linkedin_url) VALUES
    ('${SPEAKER_RIA}', 'Ria Sen', 'Ria', 'Sen', 'Sen Labs', 'ria@sen.test', '+91', '9000000003', 'https://linkedin.com/in/ria'),
    ('${SPEAKER_SAM}', 'Sam Iyer', 'Sam', 'Iyer', 'Iyer & Co', 'sam@iyer.test', '+91', '9000000004', 'https://linkedin.com/in/sam');
  INSERT INTO public.event_speakers VALUES ('${EVENT}', '${SPEAKER_RIA}'), ('${EVENT}', '${SPEAKER_SAM}');
`);

// A share made before 079, then replaced: its copy should go when 079 runs.
await as("authenticated", ORGANISER, async () => {
  await db.query(`INSERT INTO public.registrations (event_id, user_id, email, name, first_name, last_name, company, mobile_country_code, mobile_number)
                  VALUES ($1, $2, 'old@x.test', 'Old Timer', 'Old', 'Timer', 'Legacy Ltd', '+91', '9000000009')`, [EVENT, null]);
  await db.query("SELECT public.organizer_share_sponsor_data($1, false, true, true)", [LINK]);
  await db.query("SELECT public.organizer_share_sponsor_data($1, false, true, true)", [LINK]);
});
const preRows = await one("SELECT count(*)::int AS superseded FROM public.sponsor_data_share_rows d JOIN public.sponsor_data_shares x ON x.id = d.share_id WHERE x.status = 'superseded'");
await db.exec("DELETE FROM public.registrations WHERE email = 'old@x.test'");
await db.exec(`DELETE FROM public.sponsor_data_share_rows WHERE share_id IN (SELECT id FROM public.sponsor_data_shares WHERE status = 'active');
               DELETE FROM public.sponsor_data_shares WHERE status = 'active';`);

await db.exec(section("079_sponsor_share_consent.sql"));

await db.exec(section("092_sponsor_share_all_contacts.sql"));
// Running it twice must be harmless.
await db.exec(section("092_sponsor_share_all_contacts.sql"));

const register = (uid, who, email, consent, extra = {}) => db.query(
  `INSERT INTO public.registrations (event_id, user_id, email, name, first_name, last_name, company, designation,
                                     mobile_country_code, mobile_number, linkedin_url, ticket_type, sponsor_share_consent)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '+91', $9, $10, $11, $12) RETURNING id, sponsor_share_notice`,
  [EVENT, uid, email, who, who.split(" ")[0], who.split(" ")[1], extra.company ?? "Acme", extra.designation ?? "CFO",
   extra.mobile ?? "9000000001", extra.linkedin ?? null, extra.ticket ?? "general", consent]);

const asha = (await as("authenticated", ASHA, () => register(ASHA, "Asha Rao", "asha@x.test", true, { linkedin: "https://linkedin.com/in/asha" }))).rows[0];
const ben = (await as("authenticated", BEN, () => register(BEN, "Ben Das", "ben@x.test", false, { mobile: "9000000002" }))).rows[0];
const imported = (await as("authenticated", ORGANISER, () => register(null, "Ivan Import", "ivan@x.test", false))).rows[0];

const shareNow = () => as("authenticated", ORGANISER, () => one("SELECT public.organizer_share_sponsor_data($1, false, true, true) AS id", [LINK]));
const rowsOf = async (share) => Object.fromEntries((await db.query(
  "SELECT registration_id, data FROM public.sponsor_data_share_rows WHERE share_id = $1", [share])).rows.map((r) => [r.registration_id, r.data]));
const CONTACT = ["email", "mobile", "mobile_country_code", "mobile_number", "linkedin_url"];
const contactKeys = (data) => CONTACT.filter((k) => k in data);

let share;
await check("every registrant's contact details are shared, whatever the old setting said", async () => {
  share = (await shareNow()).id;
  const rows = await rowsOf(share);
  eq(contactKeys(rows[asha.id]), CONTACT, "Asha (had agreed)");
  eq(contactKeys(rows[ben.id]), ["email", "mobile", "mobile_country_code", "mobile_number"], "Ben (had not agreed, no LinkedIn given)");
  eq(contactKeys(rows[imported.id]), ["email", "mobile", "mobile_country_code", "mobile_number"], "Ivan (imported)");
  eq(rows[ben.id].email, "ben@x.test", "Ben's email");
});

await check("listed speakers who never registered are shared with their contact details", async () => {
  const rows = await rowsOf(share);
  eq(contactKeys(rows[SPEAKER_SAM]), CONTACT, "Sam");
  eq(rows[SPEAKER_SAM].email, "sam@iyer.test", "Sam's email");
});

await check("nobody counts as without permission", async () => {
  const p = await as("authenticated", ORGANISER, () => one("SELECT public.organizer_sponsor_share_preview($1) AS p", [LINK]));
  eq(p.p.without_permission, 0, "preview");
});

await check("new registrations record the new wording", async () => {
  eq(asha.sponsor_share_notice, "2026-11-26", "Asha's recorded wording");
});

await check("switching the old setting off no longer strips shared details", async () => {
  await db.exec(`UPDATE public.registrations SET sponsor_share_consent = false WHERE id = '${asha.id}'`);
  eq(contactKeys((await rowsOf(share))[asha.id]), CONTACT, "Asha's row");
});

await check("the ticket-page opt-out can't be called any more", async () => {
  let denied = false;
  try { await as("authenticated", ASHA, () => db.query("SELECT public.set_my_sponsor_share_consent($1, false)", [asha.id])); } catch (err) { denied = /permission denied/.test(err.message); }
  eq(denied, true, "set_my_sponsor_share_consent");
});

await check("the people builder still can't be called directly", async () => {
  let denied = false;
  try { await as("authenticated", ORGANISER, () => db.query("SELECT * FROM public._sponsor_share_people($1, true)", [EVENT])); } catch (err) { denied = /permission denied/.test(err.message); }
  eq(denied, true, "_sponsor_share_people");
});

console.log(`092_sponsor_share_all_contacts: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
