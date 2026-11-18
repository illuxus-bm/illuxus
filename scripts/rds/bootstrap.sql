-- ═══════════════════════════════════════════════════════════════════════════════
-- AWS RDS (or any plain Postgres 15+) bootstrap for illuxus.
--
-- Supabase provides a few things the schema relies on: the anon /
-- authenticated / service_role roles, the auth schema (auth.uid(),
-- auth.jwt(), auth.role(), auth.users), and stubs for its pg_net and
-- Storage schemas. This file creates them, then supabase/install.sql builds
-- the illuxus schema on top, unchanged. Run as the RDS master user:
--
--   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -v app_user=illuxus_api -f scripts/rds/bootstrap.sql
--   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -f supabase/install.sql
--
-- Safe to run more than once. See docs/PRISMA_MIGRATION.md.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Roles the row security policies are written for. NOLOGIN: nobody signs in
-- as them; the API's own login role switches to them per request
-- (server/db/caller.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  -- On RDS, BYPASSRLS needs rds_superuser; without it service_role still
  -- works for everything that doesn't depend on skipping row security.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE service_role NOLOGIN;
    END;
  END IF;
END $$;

-- The API's login role (psql variable app_user, default illuxus_api) may act
-- as each of them. Create the login role yourself first, with a strong
-- password: CREATE ROLE illuxus_api LOGIN PASSWORD '...';
\if :{?app_user}
\else
  \set app_user illuxus_api
\endif
SELECT format('GRANT anon, authenticated, service_role TO %I', :'app_user')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- What PostgREST sets per request, and what server/db/caller.ts sets on RDS.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                            current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT auth.jwt() ->> 'email' $$;

-- The people who can sign in. On Supabase this is Supabase Auth's table; on
-- RDS it is a copy kept by scripts/rds/copy-data.sh (and, once sign-in moves,
-- by the identity provider's sign-up hook). Only the columns illuxus reads.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  phone text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  banned_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  status text,
  factor_type text,
  created_at timestamptz DEFAULT now()
);

-- pg_net isn't available on RDS. Functions that queue an HTTP call (email
-- and webhook hand-offs) call this; it records the request so a worker can
-- send it, instead of failing the transaction.
CREATE TABLE IF NOT EXISTS net.http_request_queue (
  id bigserial PRIMARY KEY,
  url text NOT NULL,
  body jsonb,
  headers jsonb,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);
-- Sent by POST /api/v1/jobs/http-queue (server/services/jobs.ts).
ALTER TABLE net.http_request_queue
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS http_request_queue_unsent ON net.http_request_queue (id) WHERE sent_at IS NULL;
-- SECURITY DEFINER: whoever's transaction queues a call (often a trigger
-- fired by a signed-in person) needs no rights on the queue itself.
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
  headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 1000)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = net, pg_temp AS
  $$ INSERT INTO net.http_request_queue (url, body, headers) VALUES (url, body, headers) RETURNING id $$;
GRANT SELECT, UPDATE ON net.http_request_queue TO service_role;

-- Storage stays on Supabase Storage (or moves to S3) separately; these let
-- the schema's storage policies install. They hold no files.
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, allowed_mime_types text[],
  file_size_limit bigint, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
  owner uuid, owner_id text, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

GRANT USAGE ON SCHEMA auth, extensions, net, storage TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
