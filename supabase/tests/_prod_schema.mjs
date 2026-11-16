// Loads the production schema dump (supabase/prod_schema.sql) into an
// in-memory Postgres (PGlite), with small stand-ins for the parts of Supabase
// a dump leaves out: the auth schema, pg_net, pg_cron and realtime. Tests can
// then exercise the real policies, grants, triggers and functions.
//
//   const db = await loadProdSchema();
//   await db.exec(migrationSection("087_security_hardening.sql"));
//   await asUser(db, someUuid, () => db.query("select ..."));
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

export async function loadProdSchema() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto, uuid_ossp } });
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA extensions; CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA net;
    CREATE EXTENSION pg_trgm WITH SCHEMA public;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
    -- What PostgREST sets per request: request.jwt.claims (JSON) and, for
    -- older code, request.jwt.claim.sub / .role.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
    CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
      headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 1000)
      RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    GRANT USAGE ON SCHEMA auth, extensions, net TO anon, authenticated, service_role;
    SET check_function_bodies = false;
  `);
  const schema = read("../prod_schema.sql")
    .replace(/^CREATE EXTENSION .*$/gm, "")
    .replace(/^COMMENT ON EXTENSION .*$/gm, "")
    .replace(/^(ALTER|CREATE) PUBLICATION [\s\S]*?;$/gm, "")
    .replace(/^SET transaction_timeout = 0;$/gm, "")
    .replace(/^SELECT pg_catalog\.set_config\('search_path', '', false\);$/gm, "")
    .replace(/^SET row_security = off;$/gm, "");
  await db.exec(schema);
  await db.exec("SET search_path = public, extensions;");
  return db;
}

/** One `-- >>> BEGIN SOURCE MIGRATION: <name> >>>` section of 000_full_schema.sql. */
export function migrationSection(name) {
  const bundle = read("../migrations/000_full_schema.sql");
  const startMarker = `-- >>> BEGIN SOURCE MIGRATION: ${name} >>>\n`;
  const endMarker = `-- <<< END SOURCE MIGRATION: ${name} <<<`;
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Migration section not found: ${name}`);
  return bundle.slice(start + startMarker.length, end).replace(/NOTIFY pgrst, 'reload schema';/g, "");
}

async function asRole(db, role, sub, fn) {
  const claims = JSON.stringify(sub ? { role, sub, aal: "aal1" } : { role });
  await db.query("SELECT set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('request.jwt.claim.role', $3, false)", [claims, sub ?? "", role]);
  await db.exec(`SET ROLE ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE;");
    await db.query("SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)");
  }
}

/** Runs fn as an anonymous API caller (the public anon key). */
export const asAnon = (db, fn) => asRole(db, "anon", null, fn);
/** Runs fn as a signed-in API caller. */
export const asUser = (db, uid, fn) => asRole(db, "authenticated", uid, fn);
/** Runs fn as the service role (edge functions, the database's own jobs). */
export const asService = (db, fn) => asRole(db, "service_role", null, fn);

/** A tiny check runner shared by the tests. */
export function checker() {
  let passed = 0;
  const failures = [];
  return {
    async check(name, fn) {
      try { await fn(); passed++; } catch (err) { failures.push(`${name}: ${err.message}`); }
    },
    finish(title) {
      if (failures.length) {
        console.error(`${title}: ${failures.length} failed, ${passed} passed`);
        for (const f of failures) console.error("  ✗ " + f);
        process.exit(1);
      }
      console.log(`${title}: all ${passed} checks passed`);
    },
  };
}

export function eq(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function rejects(fn, pattern, what) {
  try { await fn(); } catch (err) {
    if (pattern.test(err.message)) return;
    throw new Error(`${what}: wrong error "${err.message}"`);
  }
  throw new Error(`${what}: expected an error`);
}
