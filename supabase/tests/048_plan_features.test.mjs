// Tests migration 048 (plans and feature gating) on an in-memory Postgres.
// Run:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/048_plan_features.test.mjs
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const bundle = fs.readFileSync(new URL("../migrations/000_full_schema.sql", import.meta.url), "utf8");
const startMarker = "-- >>> BEGIN SOURCE MIGRATION: 048_plan_features.sql >>>\n";
const endMarker = "-- <<< END SOURCE MIGRATION: 048_plan_features.sql <<<";
const start = bundle.indexOf(startMarker);
const end = bundle.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0) throw new Error("Migration section not found: 048_plan_features.sql");
const migration = bundle.slice(start + startMarker.length, end);
const db = new PGlite();

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSONAL_EVENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role); $$;

  CREATE TABLE public.audit_logs (id serial, actor_id uuid, actor_email text, action text, target_type text, target_id text, details jsonb, created_at timestamptz DEFAULT now());
  CREATE FUNCTION public._record_audit(_action text, _target_type text, _target_id text, _details jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES(auth.uid(),_action,_target_type,_target_id,_details); END; $$;

  CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, owner_id uuid,
    plan text NOT NULL DEFAULT 'free',
    plan_limits jsonb NOT NULL DEFAULT '{"max_events":3,"max_attendees_per_event":50,"max_team_members":1,"features":["basic_analytics"]}',
    addons text[] NOT NULL DEFAULT '{}', updated_at timestamptz DEFAULT now());
  CREATE TABLE public.org_members (org_id uuid, user_id uuid, role text);
  CREATE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=_org_id AND user_id=_user_id); $$;
  CREATE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id=_org_id AND owner_id=_user_id); $$;
  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Auth create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
  CREATE POLICY "Owner update org" ON public.organizations FOR UPDATE TO authenticated USING(owner_id=auth.uid());
  CREATE POLICY "Members view org" ON public.organizations FOR SELECT TO authenticated USING(is_org_member(auth.uid(),id) OR owner_id=auth.uid());
  GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;

  CREATE TABLE public.subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid UNIQUE, plan text NOT NULL DEFAULT 'free', status text DEFAULT 'active', updated_at timestamptz DEFAULT now());
  ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Members view sub" ON public.subscriptions FOR SELECT TO authenticated USING(is_org_member(auth.uid(),org_id));
  CREATE POLICY "Owner manage sub" ON public.subscriptions FOR ALL TO authenticated USING(is_org_owner(auth.uid(),org_id)) WITH CHECK(is_org_owner(auth.uid(),org_id));
  GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;

  CREATE TABLE public.events (id uuid PRIMARY KEY, org_id uuid, user_id uuid);
  CREATE TABLE public.certificate_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, event_id uuid);
  CREATE TABLE public.certificates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, org_id uuid NOT NULL);
  CREATE TABLE public.event_creatives (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL);
  CREATE TABLE public.utm_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL);
  CREATE TABLE public.event_venue_selections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL);
  GRANT SELECT, INSERT ON public.events, public.certificate_templates, public.certificates, public.event_creatives, public.utm_links, public.event_venue_selections TO authenticated;
  GRANT ALL ON public.events, public.certificate_templates, public.certificates, public.event_creatives, public.utm_links, public.event_venue_selections TO service_role;

  INSERT INTO public.user_roles VALUES ('${ADMIN}', 'admin');
  INSERT INTO public.organizations (id, name, owner_id, plan) VALUES ('${ORG}', 'Acme', '${OWNER}', 'free');
  INSERT INTO public.org_members VALUES ('${ORG}', '${OWNER}', 'owner'), ('${ORG}', '${MEMBER}', 'member');
  INSERT INTO public.subscriptions (org_id, plan) VALUES ('${ORG}', 'free');
  INSERT INTO public.events VALUES ('${EVENT}', '${ORG}', '${OWNER}'), ('${PERSONAL_EVENT}', NULL, '${OUTSIDER}');
`);

await db.exec(migration);

let pass = 0, fail = 0;
function expect(name, ok, detail) {
  if (ok) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, detail === undefined ? "" : JSON.stringify(detail)); }
}
async function as(role, uid, sql, params) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false); SET ROLE ${role};`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);"); }
}
const one = async (sql) => (await db.query(sql)).rows[0];
const ent = async (uid) => { const r = await as("authenticated", uid, `SELECT public.org_entitlements('${ORG}') AS e`); return r.error ? r : r.rows[0].e; };
const blocked = (r) => /plan does not include/i.test(r.error ?? "");

console.log("Seeded plans");
const plans = (await db.query(`SELECT key, features FROM public.plans ORDER BY sort_order`)).rows;
expect("four plans are seeded in order", plans.map((p) => p.key).join() === "free,starter,pro,business", plans.map((p) => p.key));
expect("every plan includes certificates, creatives and brochures", plans.every((p) => ["certificates", "creatives", "brochure"].every((f) => p.features.includes(f))));
expect("no plan includes the webinar studio by default (it stays an add-on)", plans.every((p) => !p.features.includes("webinar")));

console.log("\nReading entitlements");
let e = await ent(MEMBER);
expect("a member gets the org's plan and features", e.plan === "free" && e.features.includes("certificates"), e);
e = await ent(OUTSIDER);
expect("an outsider is refused", /Not allowed/.test(e.error ?? ""), e);
let r = await as("anon", null, `SELECT public.org_entitlements('${ORG}')`);
expect("anonymous callers can't call it", /permission denied/i.test(r.error ?? ""), r);
r = await as("authenticated", OUTSIDER, `SELECT public.org_entitlements(org_id) AS e FROM (SELECT '${ORG}'::uuid AS org_id) s`);
expect("event owners of other orgs are still refused", /Not allowed/.test(r.error ?? ""), r);

console.log("\nOnly super admins change plans");
r = await as("authenticated", OWNER, `UPDATE public.organizations SET plan='business', addons='{webinar}', name='Acme Ltd' WHERE id='${ORG}'`);
let org = await one(`SELECT plan, addons, name FROM public.organizations WHERE id='${ORG}'`);
expect("an owner can't change their own plan or add-ons", org.plan === "free" && org.addons.length === 0, org);
expect("…but other edits still save", org.name === "Acme Ltd", org);
r = await as("authenticated", OUTSIDER, `INSERT INTO public.organizations (name, owner_id, plan, addons) VALUES ('Mine', '${OUTSIDER}', 'business', '{webinar}') RETURNING plan, addons, plan_limits`);
expect("a new organisation created by a user starts on free", r.rows?.[0]?.plan === "free" && r.rows[0].addons.length === 0 && r.rows[0].plan_limits.max_events === 3, r);
r = await as("authenticated", OWNER, `UPDATE public.subscriptions SET plan='business' WHERE org_id='${ORG}'`);
expect("an owner can't change their subscription", (await one(`SELECT plan FROM public.subscriptions WHERE org_id='${ORG}'`)).plan === "free", r);
const newOrg = (await one(`SELECT id FROM public.organizations WHERE name='Mine'`)).id;
await db.exec(`INSERT INTO public.org_members VALUES ('${newOrg}', '${OUTSIDER}', 'owner')`);
r = await as("authenticated", OUTSIDER, `INSERT INTO public.subscriptions (org_id, plan) VALUES ('${newOrg}', 'business') RETURNING plan`);
expect("an owner's new subscription follows the organisation's plan", r.rows?.[0]?.plan === "free", r);
r = await as("authenticated", OWNER, `SELECT public.admin_save_plan('free','Free','',0,true,'{"max_events":1,"max_attendees_per_event":1,"max_team_members":1}','{}')`);
expect("a non-admin can't edit plans", /Unauthorized/.test(r.error ?? ""), r);
r = await as("authenticated", OWNER, `SELECT public.admin_set_org_features('${ORG}', '{"webinar":true}')`);
expect("a non-admin can't set overrides", /Unauthorized/.test(r.error ?? ""), r);

console.log("\nThe plan matrix is enforced on writes");
r = await as("authenticated", MEMBER, `INSERT INTO public.certificates (event_id, org_id) VALUES ('${EVENT}', '${ORG}')`);
expect("certificates can be issued while the plan includes them", !r.error, r);
r = await as("authenticated", ADMIN, `SELECT public.admin_save_plan('free','Free','For trying things out',0,true,'{"max_events":3,"max_attendees_per_event":50,"max_team_members":1}', ARRAY['creatives','brochure'])`);
expect("an admin can change what the free plan includes", !r.error, r);
org = await one(`SELECT plan_limits FROM public.organizations WHERE id='${ORG}'`);
expect("orgs on that plan get their limits snapshot refreshed", JSON.stringify(org.plan_limits.features) === JSON.stringify(["brochure", "creatives"]), org);
r = await as("authenticated", MEMBER, `INSERT INTO public.certificates (event_id, org_id) VALUES ('${EVENT}', '${ORG}')`);
expect("…then a member can no longer issue certificates", blocked(r), r);
r = await as("authenticated", MEMBER, `INSERT INTO public.certificate_templates (org_id) VALUES ('${ORG}')`);
expect("…or create certificate templates", blocked(r), r);
r = await as("authenticated", MEMBER, `INSERT INTO public.utm_links (event_id) VALUES ('${EVENT}')`);
expect("…or UTM links (feature resolved through the event)", blocked(r), r);
r = await as("authenticated", MEMBER, `INSERT INTO public.event_venue_selections (event_id) VALUES ('${EVENT}')`);
expect("…or venue selections", blocked(r), r);
r = await as("authenticated", MEMBER, `INSERT INTO public.event_creatives (event_id) VALUES ('${EVENT}')`);
expect("creatives still work because the plan includes them", !r.error, r);
r = await as("authenticated", ADMIN, `INSERT INTO public.certificates (event_id, org_id) VALUES ('${EVENT}', '${ORG}')`);
expect("super admins are not blocked", !r.error, r);
r = await as("service_role", null, `INSERT INTO public.certificates (event_id, org_id) VALUES ('${EVENT}', '${ORG}')`);
expect("the service role is not blocked", !r.error, r);
r = await as("authenticated", OUTSIDER, `INSERT INTO public.utm_links (event_id) VALUES ('${PERSONAL_EVENT}')`);
expect("events without an organisation are not blocked", !r.error, r);

console.log("\nPer-organisation overrides and add-ons");
r = await as("authenticated", ADMIN, `SELECT public.admin_set_org_features('${ORG}', '{"certificates":true,"creatives":false}')`);
expect("an admin can set overrides", !r.error, r);
e = await ent(MEMBER);
expect("an override can grant a feature the plan lacks", e.features.includes("certificates"), e);
expect("…and remove one the plan has", !e.features.includes("creatives"), e);
r = await as("authenticated", MEMBER, `INSERT INTO public.certificates (event_id, org_id) VALUES ('${EVENT}', '${ORG}')`);
expect("granted override lets certificates through", !r.error, r);
r = await as("authenticated", MEMBER, `INSERT INTO public.event_creatives (event_id) VALUES ('${EVENT}')`);
expect("removed override blocks creatives", blocked(r), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_set_org_features('${ORG}', '{"webinar":"yes"}')`);
expect("override values must be true or false", /true or false/.test(r.error ?? ""), r);
await db.exec(`UPDATE public.organizations SET addons='{webinar}' WHERE id='${ORG}'`);
e = await ent(MEMBER);
expect("a legacy webinar add-on still grants the webinar studio", e.features.includes("webinar"), e);
r = await as("authenticated", MEMBER, `SELECT public.org_has_feature('${ORG}', 'webinar') AS v`);
expect("org_has_feature agrees", r.rows?.[0]?.v === true, r);
r = await as("authenticated", MEMBER, `SELECT public.org_has_feature('99999999-9999-4999-8999-999999999999', 'brochure') AS v`);
expect("an unknown organisation gets the free plan", r.rows?.[0]?.v === true, r);

console.log("\nChanging an organisation's plan");
r = await as("authenticated", ADMIN, `SELECT public.admin_update_org_plan('${ORG}', 'platinum')`);
expect("an unknown plan is refused", /Unknown plan/.test(r.error ?? ""), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_update_org_plan('${ORG}', 'pro')`);
org = await one(`SELECT o.plan, o.plan_limits, s.plan AS sub FROM public.organizations o JOIN public.subscriptions s ON s.org_id=o.id WHERE o.id='${ORG}'`);
expect("an admin moves the org to pro, subscription included", !r.error && org.plan === "pro" && org.sub === "pro" && org.plan_limits.max_events === 50, { r, org });
r = await as("authenticated", ADMIN, `SELECT public.admin_update_org('${ORG}', _plan => 'nope')`);
expect("admin_update_org also refuses unknown plans", /Unknown plan/.test(r.error ?? ""), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_delete_plan('free')`);
expect("the free plan can't be deleted", /cannot be deleted/.test(r.error ?? ""), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_delete_plan('pro')`);
expect("a plan in use can't be deleted", /Move them/.test(r.error ?? ""), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_save_plan('agency','Agency','',4,false,'{"max_events":-1,"max_attendees_per_event":-1,"max_team_members":25}', ARRAY['brochure','brochure'])`);
const agency = await one(`SELECT features, limits FROM public.plans WHERE key='agency'`);
expect("an admin can add a plan; features are de-duplicated", !r.error && agency.features.length === 1 && agency.limits.max_team_members === 25, { r, agency });
r = await as("authenticated", ADMIN, `SELECT public.admin_save_plan('agency','Agency','',4,false,'{"max_events":"lots","max_attendees_per_event":-1,"max_team_members":25}', '{}')`);
expect("limits must be numbers", /must be a number/.test(r.error ?? ""), r);
r = await as("authenticated", ADMIN, `SELECT public.admin_delete_plan('agency')`);
expect("an unused plan can be deleted", !r.error && !(await one(`SELECT 1 AS x FROM public.plans WHERE key='agency'`)), r);
const audits = Number((await one(`SELECT count(*) n FROM public.audit_logs`)).n);
expect("admin changes are written to the audit log", audits >= 5, audits);

console.log("\nRe-running the migration");
try {
  await db.exec(migration);
  const free = await one(`SELECT features FROM public.plans WHERE key='free'`);
  expect("second run succeeds and keeps admin edits", JSON.stringify(free.features) === JSON.stringify(["brochure", "creatives"]), free);
} catch (err) { expect("second run succeeds", false, String(err.message || err)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
