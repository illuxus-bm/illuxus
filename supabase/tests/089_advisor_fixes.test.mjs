// Tests migration 089 (Supabase advisor fixes) against the production schema.
// Run:  node supabase/tests/089_advisor_fixes.test.mjs
//       node supabase/tests/089_advisor_fixes.test.mjs --before   (089 skipped: its checks fail)
import {
  loadProdSchema, migrationSection, asAnon, asUser, asService, checker, eq, rejects,
} from "./_prod_schema.mjs";

const before = process.argv.includes("--before");
const db = await loadProdSchema();

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

await db.exec(migrationSection("087_security_hardening.sql"));
await db.exec(migrationSection("088_audit_followups.sql"));
if (!before) await db.exec(migrationSection("089_advisor_fixes.sql"));
const { check, finish } = checker();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [ALICE, BOB]);
await db.query(`INSERT INTO public.profiles (user_id, display_name, company) VALUES ($1, 'Alice', 'Acme'), ($2, 'Bob', 'Initech')
  ON CONFLICT (user_id) DO NOTHING`, [ALICE, BOB]);
await db.query(`INSERT INTO public.community_badges (id, label, icon, description, rule_kind, threshold) VALUES ('first_post', 'First post', 'star', 'Wrote a post', 'posts_gte', 1)
  ON CONFLICT DO NOTHING`);

// ── 1. Badge catalogue ───────────────────────────────────────────────────────
await check("community_badges has row security on", async () => {
  eq((await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.community_badges'::regclass`)).relrowsecurity, true, "rls");
});
await check("anyone can still read the badge catalogue", async () => {
  const r = await asAnon(db, () => db.query(`SELECT id FROM public.community_badges WHERE id = 'first_post'`));
  eq(r.rows.length, 1, "anon rows");
});
await check("nobody can write the badge catalogue through the API", async () => {
  await rejects(() => asUser(db, ALICE, () => db.query(`INSERT INTO public.community_badges (id, label, icon, description) VALUES ('x', 'x', 'x', 'x')`)),
    /permission denied|row-level security/, "insert");
});

// ── 2. search_path ───────────────────────────────────────────────────────────
await check("every function of ours has a fixed search_path", async () => {
  const r = await db.query(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`);
  eq(r.rows.map((x) => x.proname), [], "functions without search_path");
});

// ── 3. Trigger functions ─────────────────────────────────────────────────────
await check("API roles can't call SECURITY DEFINER trigger functions", async () => {
  const r = await db.query(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))`);
  eq(r.rows.map((x) => x.proname), [], "callable trigger functions");
});
await check("their triggers still fire: editing your profile is audited", async () => {
  const beforeCount = Number((await one(`SELECT count(*) AS n FROM public.audit_logs`)).n);
  const r = await asUser(db, ALICE, () => db.query(`UPDATE public.profiles SET company = 'Acme Ltd', onboarding_completed = true WHERE user_id = $1 RETURNING company`, [ALICE]));
  eq(r.rows.map((x) => x.company), ["Acme Ltd"], "updated");
  const afterCount = Number((await one(`SELECT count(*) AS n FROM public.audit_logs`)).n);
  eq(afterCount > beforeCount, true, "audit row written by audit_log_row_change");
});

// ── 4. Admin functions ───────────────────────────────────────────────────────
await check("anonymous callers can't run admin functions", async () => {
  await rejects(() => asAnon(db, () => db.query(`SELECT public.admin_list_users()`)), /permission denied/, "admin_list_users");
});
await check("signed-in callers still reach them, and non-admins are refused inside", async () => {
  const r0 = await asUser(db, BOB, () => db.query(`SELECT * FROM public.admin_list_users()`));
  eq(r0.rows.length, 0, "a non-admin gets no users");
  const r = await db.query(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname LIKE 'admin\\_%' AND p.prosrc ~ 'has_role'
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
  eq(r.rows.map((x) => x.proname), [], "admin functions signed-in users lost");
});

// ── 5. Policies call auth.*() once per query ─────────────────────────────────
await check("no public policy calls auth.*() per row", async () => {
  const r = await db.query(`
    SELECT tablename || '.' || policyname AS p FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ '(?<!SELECT )auth\\.(uid|jwt|role|email)\\(\\)' OR with_check ~ '(?<!SELECT )auth\\.(uid|jwt|role|email)\\(\\)')`);
  eq(r.rows.map((x) => x.p), [], "unwrapped policies");
});
await check("rewritten policies decide the same: you see and edit only your own profile", async () => {
  const mine = await asUser(db, ALICE, () => db.query(`SELECT user_id FROM public.profiles`));
  eq(mine.rows.map((x) => x.user_id), [ALICE], "alice sees");
  const r = await asUser(db, ALICE, () => db.query(`UPDATE public.profiles SET bio = 'hi' WHERE user_id = $1 RETURNING 1`, [BOB]));
  eq(r.rows.length, 0, "alice can't edit bob");
  const nobody = await asAnon(db, () => db.query(`SELECT user_id FROM public.profiles`).catch(() => ({ rows: [] })));
  eq(nobody.rows.length, 0, "anon sees no profiles");
});

// ── 6. Foreign key indexes ───────────────────────────────────────────────────
await check("every foreign key in public has a covering index", async () => {
  const r = await db.query(`
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE con.contype = 'f' AND n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = con.conrelid
        AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(con.conkey)] @> con.conkey
        AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(con.conkey)] <@ con.conkey)`);
  eq(r.rows.map((x) => x.conname), [], "unindexed foreign keys");
});

if (!before) {
  await check("running 089 a second time changes nothing", async () => {
    const count = async () => Number((await one(`SELECT count(*) AS n FROM pg_indexes WHERE schemaname = 'public'`)).n);
    const n = await count();
    await db.exec(migrationSection("089_advisor_fixes.sql"));
    eq(await count(), n, "index count");
    const r = await db.query(`SELECT count(*) AS n FROM pg_policies WHERE qual ~ 'SELECT \\( SELECT auth'`);
    eq(Number(r.rows[0].n), 0, "no double-wrapped calls");
  });
}

await asService(db, async () => {});
finish(before ? "089 (before the migration)" : "089_advisor_fixes");
