#!/usr/bin/env bash
# Copies illuxus data from Supabase into an AWS RDS database prepared with
# scripts/rds/bootstrap.sql + supabase/install.rds.sql, then checks every
# table's row count matches.
#
#   SOURCE_DATABASE_URL=postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres \
#   TARGET_DATABASE_URL=postgresql://<master>:<pw>@<rds-host>:5432/illuxus?sslmode=verify-full \
#   scripts/rds/copy-data.sh [--check-only]
#
# Needs pg_dump/psql at least as new as the source server (Supabase runs
# Postgres 17). Take the app offline (or read-only) while it runs, or rows
# written meanwhile are missed. Safe to re-run on an empty target; it refuses
# a target that already has data unless FORCE=1.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL (Supabase, direct or session pooler)}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL (RDS master user)}"
check_only=false
[[ "${1:-}" == "--check-only" ]] && check_only=true

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

tables() {
  psql "$1" -XAt -c "SELECT format('%I.%I', schemaname, tablename) FROM pg_tables
                     WHERE schemaname = 'public' ORDER BY 1"
}
counts() {
  local url="$1" out="$2"
  : > "$out"
  for t in $(tables "$url") auth.users; do
    printf '%s %s\n' "$t" "$(psql "$url" -XAt -c "SELECT count(*) FROM $t")" >> "$out"
  done
}

if ! $check_only; then
  existing="$(psql "$TARGET_DATABASE_URL" -XAt -c "SELECT count(*) FROM auth.users")"
  if [[ "$existing" != "0" && "${FORCE:-0}" != "1" ]]; then
    echo "Target already has $existing users. Use an empty database, or FORCE=1 to load anyway." >&2
    exit 1
  fi

  echo "1/3 Sign-in identities (auth.users)…"
  cols="id, email, phone, email_confirmed_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data, banned_until, created_at, updated_at"
  psql "$SOURCE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "\\copy (SELECT $cols FROM auth.users) TO '$work/users.csv' WITH (FORMAT csv)"
  psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -c "SET session_replication_role = replica" \
    -c "\\copy auth.users ($cols) FROM '$work/users.csv' WITH (FORMAT csv)"

  echo "2/3 Application data (public schema)…"
  # install.sql seeds reference rows (plans, site content, categories);
  # production's own copies replace them, so start the tables empty.
  psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "DO \$\$ DECLARE t text; BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t FROM pg_tables WHERE schemaname = 'public';
    IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' CASCADE'; END IF; END \$\$"
  pg_dump "$SOURCE_DATABASE_URL" --data-only --schema=public --no-owner --no-privileges \
    --exclude-table-data='public.spatial_ref_sys' -f "$work/public.sql"
  # replica mode: triggers and foreign-key checks are paused while loading,
  # so audit rows and counters aren't recorded twice and table order doesn't matter.
  { echo "SET session_replication_role = replica;"; cat "$work/public.sql"; echo "SET session_replication_role = DEFAULT;"; } \
    | psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1

  echo "   Resetting sequences…"
  psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT format('%I.%I', n.nspname, c.relname) AS seq,
           format('%I.%I', tn.nspname, t.relname) AS tbl, a.attname AS col
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_depend d ON d.objid = c.oid AND d.deptype IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE c.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format('SELECT setval(%L, coalesce((SELECT max(%I) FROM %s), 0) + 1, false)', s.seq, s.col, s.tbl);
  END LOOP;
END $$;
SQL
fi

echo "3/3 Comparing row counts…"
counts "$SOURCE_DATABASE_URL" "$work/source.txt"
counts "$TARGET_DATABASE_URL" "$work/target.txt"
if diff -u "$work/source.txt" "$work/target.txt" > "$work/diff.txt"; then
  echo "All $(wc -l < "$work/source.txt") tables match."
else
  echo "Row counts differ (source vs target):" >&2
  grep '^[-+][^-+]' "$work/diff.txt" >&2
  exit 1
fi
