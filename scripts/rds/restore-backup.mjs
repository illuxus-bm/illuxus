#!/usr/bin/env node
/**
 * Loads an illuxus Supabase backup (illuxus-supabase-backup-<time>/, made
 * from the live project) into a database built with scripts/rds/bootstrap.sql
 * + supabase/install.rds.sql: AWS RDS, or any Postgres.
 *
 *   TARGET_DATABASE_URL=postgresql://<master>:<pw>@<host>:5432/illuxus?sslmode=verify-full \
 *     node scripts/rds/restore-backup.mjs <backup-dir> [--force]
 *
 * - Checks every file against the manifest's SHA-256 before touching the database.
 * - One transaction: it all loads or nothing does.
 * - Triggers and foreign-key checks paused while loading (session_replication_role
 *   = replica: needs the RDS master user), so audit rows and counters aren't
 *   recorded twice and table order doesn't matter.
 * - Empties the public tables first (install.sql's seed rows are replaced by
 *   production's own), refuses a target that already has users unless --force.
 * - Resets sequences, then checks every table's row count against the manifest.
 *
 * File storage objects are restored as records only (storage.objects); the files
 * themselves stay in Supabase Storage until they're copied to S3.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const url = process.env.TARGET_DATABASE_URL;
if (!dir || !url) {
  console.error("usage: TARGET_DATABASE_URL=... node scripts/rds/restore-backup.mjs <backup-dir> [--force]");
  process.exit(1);
}
const root = resolve(dir);
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.format !== "illuxus-supabase-backup/1") throw new Error(`unknown backup format ${manifest.format}`);

// 1. Integrity, before connecting.
const data = {};
for (const [rel, meta] of Object.entries(manifest.files)) {
  const path = join(root, rel);
  if (!existsSync(path)) throw new Error(`missing file ${rel}`);
  const text = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(text).digest("hex");
  if (sha !== meta.sha256) throw new Error(`${rel} is corrupt or changed (sha256 ${sha} ≠ ${meta.sha256})`);
  data[rel] = text;
}
console.log(`Backup from ${manifest.exported_at}: ${Object.keys(data).length} files, checksums OK.`);

const client = new pg.Client({ connectionString: url });
await client.connect();
const q = (sql, params) => client.query(sql, params);
const ident = (s) => `"${s.replace(/"/g, '""')}"`;

/** Columns of a target table that can take inserted values, with identity info. */
async function columns(schema, table) {
  const r = await q(
    `SELECT a.attname AS name, a.attidentity AS identity
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''`,
    [schema, table],
  );
  return r.rows;
}

async function load(schema, table, text) {
  const rows = JSON.parse(text);
  if (!rows.length) return 0;
  const target = await columns(schema, table);
  if (!target.length) throw new Error(`target has no table ${schema}.${table}: build it with bootstrap.sql + install.rds.sql first`);
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  const cols = target.filter((c) => keys.has(c.name));
  const missing = [...keys].filter((k) => !target.some((c) => c.name === k));
  if (missing.length && schema === "public") {
    throw new Error(`${schema}.${table}: the backup has columns the target lacks (${missing.join(", ")}): schema mismatch`);
  }
  const list = cols.map((c) => ident(c.name)).join(", ");
  const overriding = cols.some((c) => c.identity === "a") ? " OVERRIDING SYSTEM VALUE" : "";
  const res = await q(
    `INSERT INTO ${ident(schema)}.${ident(table)} (${list})${overriding}
     SELECT ${list} FROM jsonb_populate_recordset(NULL::${ident(schema)}.${ident(table)}, $1::jsonb)`,
    [text],
  );
  return res.rowCount;
}

try {
  const users = await q(`SELECT count(*)::int AS n FROM auth.users`);
  if (users.rows[0].n > 0 && !force) {
    throw new Error(`target already has ${users.rows[0].n} users; use an empty database, or --force to replace its data`);
  }

  await q("BEGIN");
  await q("SET LOCAL session_replication_role = replica");
  await q(`DO $$ DECLARE t text; BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t FROM pg_tables WHERE schemaname = 'public';
    IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' CASCADE'; END IF;
    TRUNCATE auth.mfa_factors, storage.objects;
    DELETE FROM auth.users; DELETE FROM storage.buckets;
  END $$`);

  const order = [
    ["auth", "users", "data/auth/users.json"],
    ["auth", "mfa_factors", "data/auth/mfa_factors.json"],
    ["storage", "buckets", "data/storage/buckets.json"],
    ["storage", "objects", "data/storage/objects.json"],
    ...Object.keys(data).filter((k) => k.startsWith("data/public/")).sort()
      .map((k) => ["public", k.slice("data/public/".length, -".json".length), k]),
  ];
  let total = 0;
  for (const [schema, table, rel] of order) {
    if (!data[rel]) continue;
    total += await load(schema, table, data[rel]);
  }

  // Sequences after the highest restored value.
  await q(`DO $$
  DECLARE s record;
  BEGIN
    FOR s IN
      SELECT format('%I.%I', n.nspname, c.relname) AS seq, format('%I.%I', tn.nspname, t.relname) AS tbl, a.attname AS col
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_depend d ON d.objid = c.oid AND d.deptype IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace tn ON tn.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE c.relkind = 'S' AND n.nspname IN ('public', 'auth')
    LOOP
      EXECUTE format('SELECT setval(%L, coalesce((SELECT max(%I) FROM %s), 0) + 1, false)', s.seq, s.col, s.tbl);
    END LOOP;
  END $$`);
  await q("COMMIT");
  console.log(`Loaded ${total} rows.`);

  // Verify against the manifest.
  const wrong = [];
  for (const [schema, table, rel] of order) {
    const expected = manifest.files[rel]?.rows;
    if (expected === undefined) continue;
    const r = await q(`SELECT count(*)::int AS n FROM ${ident(schema)}.${ident(table)}`);
    if (r.rows[0].n !== expected) wrong.push(`${schema}.${table}: ${r.rows[0].n} (backup has ${expected})`);
  }
  if (wrong.length) {
    console.error(`Row counts differ:\n  ${wrong.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${order.length} tables match the backup.`);
  }
} catch (e) {
  await q("ROLLBACK").catch(() => {});
  console.error(`Restore failed, nothing was changed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
