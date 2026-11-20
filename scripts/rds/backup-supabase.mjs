#!/usr/bin/env node
/**
 * Backs up the live Supabase database into illuxus-supabase-backup-<time>/,
 * the format scripts/rds/restore-backup.mjs loads into AWS RDS.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/rds/backup-supabase.mjs [--project <ref>] [--out <dir>]
 *
 * Uses the Supabase Management API (read-only SQL), so it needs no database
 * password or direct connection. Every table comes from ONE SQL statement,
 * so the backup is a single consistent snapshot. Afterwards every table's
 * row count is checked against the live database.
 *
 * Contents: all public tables; auth.users without password hashes (sign-in
 * stays on Supabase Auth); auth.mfa_factors without secrets; storage bucket
 * and object records (not the files). The result is CONFIDENTIAL: personal
 * data, bank details, live invitation tokens. Never commit it (.gitignore).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const project = opt("--project", "xhjdcimginceibzcwzlk");
const outDir = resolve(opt("--out", "."));
const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, read_only: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const tables = (await sql(`SELECT json_agg(tablename ORDER BY tablename) AS t FROM pg_tables WHERE schemaname = 'public'`))[0].t;
const quote = (t) => `"${t.replace(/"/g, '""')}"`;
// json_build_object takes at most 100 arguments: groups of 40 tables.
const groups = [];
for (let i = 0; i < tables.length; i += 40) groups.push(tables.slice(i, i + 40));
const group = (g) => `json_build_object(${g.map((t) => `'${t}', (SELECT coalesce(json_agg(t), '[]'::json) FROM public.${quote(t)} t)`).join(", ")})`;

console.log(`Exporting ${tables.length} tables from ${project} in one snapshot…`);
const snapshot = (await sql(`SELECT json_build_object(
  'exported_at', now(), 'server_version', current_setting('server_version'),
  'auth_users', (SELECT coalesce(json_agg(u), '[]'::json) FROM (SELECT id, email, phone, email_confirmed_at, last_sign_in_at,
      raw_user_meta_data, raw_app_meta_data, banned_until, created_at, updated_at FROM auth.users ORDER BY created_at) u),
  'auth_mfa_factors', (SELECT coalesce(json_agg(f), '[]'::json) FROM (SELECT id, user_id, status::text AS status,
      factor_type::text AS factor_type, created_at FROM auth.mfa_factors) f),
  'storage_buckets', (SELECT coalesce(json_agg(b), '[]'::json) FROM (SELECT id, name, public, allowed_mime_types,
      file_size_limit, created_at FROM storage.buckets) b),
  'storage_objects', (SELECT coalesce(json_agg(o), '[]'::json) FROM (SELECT id, bucket_id, name, owner, owner_id,
      metadata, created_at FROM storage.objects) o),
  'table_groups', json_build_array(${groups.map(group).join(", ")})
) AS backup`))[0].backup;

const stamp = snapshot.exported_at.slice(0, 19).replace(/[-:]/g, "");
const dir = join(outDir, `illuxus-supabase-backup-${stamp}`);
for (const sub of ["data/public", "data/auth", "data/storage"]) mkdirSync(join(dir, sub), { recursive: true });

const files = {};
const write = (rel, rows) => {
  const text = JSON.stringify(rows);
  writeFileSync(join(dir, rel), text);
  files[rel] = { rows: rows.length, sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
};
const byTable = Object.assign({}, ...snapshot.table_groups);
for (const t of Object.keys(byTable).sort()) write(`data/public/${t}.json`, byTable[t]);
write("data/auth/users.json", snapshot.auth_users);
write("data/auth/mfa_factors.json", snapshot.auth_mfa_factors);
write("data/storage/buckets.json", snapshot.storage_buckets);
write("data/storage/objects.json", snapshot.storage_objects);

const postDump = JSON.parse(readFileSync(join(ROOT, "supabase/post-dump-migrations.json"), "utf8")).migrations;
writeFileSync(join(dir, "manifest.json"), JSON.stringify({
  format: "illuxus-supabase-backup/1",
  source: { project_ref: project, postgres: snapshot.server_version },
  exported_at: snapshot.exported_at,
  consistency: "single statement: every table is from the same snapshot",
  schema: { base: "supabase/prod_schema.sql", post_dump_migrations: postDump, restore_target: "scripts/rds/bootstrap.sql + supabase/install.rds.sql" },
  files,
}, null, 2));

// Completeness: every table's count, live, against what was written.
const counts = await sql([
  ...tables.map((t) => `SELECT '${t}' AS t, count(*)::int AS n FROM public.${quote(t)}`),
  `SELECT 'auth.users', count(*)::int FROM auth.users`,
].join(" UNION ALL "));
const live = Object.fromEntries(counts.map((r) => [r.t, r.n]));
const changed = tables.filter((t) => live[t] !== files[`data/public/${t}.json`].rows);
if (live["auth.users"] !== files["data/auth/users.json"].rows) changed.push("auth.users");

const rows = Object.entries(files).filter(([k]) => k.startsWith("data/public/")).reduce((n, [, v]) => n + v.rows, 0);
console.log(`Wrote ${dir}`);
console.log(`  ${tables.length} tables, ${rows} rows, ${files["data/auth/users.json"].rows} users, ${files["data/storage/objects.json"].rows} file records`);
console.log(changed.length
  ? `  Note: since the snapshot, these changed on the live database: ${changed.join(", ")} (normal if the app is in use; the snapshot itself is consistent).`
  : `  Every table's row count matches the live database.`);
