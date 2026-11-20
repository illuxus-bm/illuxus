// Tests migration 090 (the Prisma API's login role) against the production schema.
// Run:  node supabase/tests/090_api_login_role.test.mjs
//       node supabase/tests/090_api_login_role.test.mjs --before   (090 skipped: its checks fail)
import { loadProdSchema, migrationSection, checker, eq } from "./_prod_schema.mjs";

const before = process.argv.includes("--before");
const db = await loadProdSchema();
for (const m of ["087_security_hardening.sql", "088_audit_followups.sql", "089_advisor_fixes.sql"]) await db.exec(migrationSection(m));
if (!before) await db.exec(migrationSection("090_api_login_role.sql"));
const { check, finish } = checker();
const one = async (sql) => (await db.query(sql)).rows[0];

await check("illuxus_api exists, can log in, and inherits nothing", async () => {
  const r = await one(`SELECT rolcanlogin, rolinherit, rolsuper, rolbypassrls, rolcreaterole, rolpassword IS NULL AS no_password
                       FROM pg_authid WHERE rolname = 'illuxus_api'`);
  eq(r, { rolcanlogin: true, rolinherit: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false, no_password: true }, "role");
});

await check("it may become anon or authenticated, never service_role", async () => {
  const r = await db.query(`SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
                            JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = 'illuxus_api' ORDER BY 1`);
  eq(r.rows.map((x) => x.rolname), ["anon", "authenticated"], "memberships");
});

await check("on its own it can read nothing; it can switch to anon or authenticated, not service_role", async () => {
  const r = await one(`SELECT
      has_table_privilege('illuxus_api', 'public.events', 'SELECT') AS own_read,
      has_table_privilege('illuxus_api', 'public.profiles', 'UPDATE') AS own_write,
      pg_has_role('illuxus_api', 'anon', 'MEMBER') AS anon,
      pg_has_role('illuxus_api', 'authenticated', 'MEMBER') AS authenticated,
      pg_has_role('illuxus_api', 'service_role', 'MEMBER') AS service_role`);
  eq(r, { own_read: false, own_write: false, anon: true, authenticated: true, service_role: false }, "rights");
});

if (!before) {
  await check("running 090 a second time changes nothing", async () => {
    await db.exec(migrationSection("090_api_login_role.sql"));
    eq(Number((await one(`SELECT count(*) AS n FROM pg_roles WHERE rolname = 'illuxus_api'`)).n), 1, "one role");
  });
}

finish(before ? "090 (before the migration)" : "090_api_login_role");
