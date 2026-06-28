-- ═════════════════════════════════════════════════════════════════════════════
-- 005_support_tickets.sql — comprehensive ticket-based support system.
--
-- Replaces the simulated contact-form submission with a real, numbered,
-- trackable ticketing workflow:
--
--   • Anonymous visitors (and logged-in users) submit tickets via the contact
--     form. The edge function `submit-support-ticket` inserts via the service
--     role, generates a human-readable ID (ILX-YYYY-XXXXXX), and emails both
--     the submitter and the support inbox.
--   • Users track their tickets at /support/ticket/:ticketNumber by supplying
--     the email they used to submit; the `get_my_ticket` SECURITY DEFINER
--     RPC matches on (ticket_number, lower(email)) — no auth required.
--   • Super admins (`user_roles.role = 'admin'`) read and manage everything
--     via direct table access (RLS-gated) and the `admin_ticket_stats` RPC.
--
-- Idempotent-safe: every DDL statement uses IF NOT EXISTS / DROP-and-recreate
-- where possible. Re-running the migration on a partially-applied DB will not
-- error out.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Postgres doesn't support `CREATE TYPE … IF NOT EXISTS` directly, so wrap
-- each in a DO block that checks pg_type. This makes the migration safe to
-- re-run when ticketing has been partially applied (or applied via squash).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status') THEN
    CREATE TYPE public.support_ticket_status AS ENUM
      ('open', 'pending', 'awaiting_user', 'resolved', 'closed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_priority') THEN
    CREATE TYPE public.support_ticket_priority AS ENUM
      ('low', 'normal', 'high', 'urgent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_category') THEN
    CREATE TYPE public.support_ticket_category AS ENUM
      ('general', 'sales', 'support', 'billing', 'privacy',
       'grievance', 'press', 'legal', 'feature_request', 'bug_report', 'other');
  END IF;
END $$;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  -- Submitter info (may not have an account)
  name text NOT NULL,
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Ticket details
  subject text NOT NULL,
  category public.support_ticket_category NOT NULL DEFAULT 'general',
  message text NOT NULL,
  -- Workflow
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Provenance
  source text NOT NULL DEFAULT 'contact_form',
  user_agent text,
  ip_hash text,
  page_url text,
  -- Internal admin notes (free-form, hidden from user)
  internal_notes text,
  -- Tracking
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_email    ON public.support_tickets(lower(email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created  ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to);

-- Message thread (replies, both user and staff, plus system audit messages)
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('user', 'staff', 'system')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  email_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON public.support_ticket_messages(ticket_id, created_at);

-- ── Helper functions ─────────────────────────────────────────────────────────

-- Generate a human-readable ticket number: ILX-2026-A1B2C3.
-- Uses gen_random_bytes (pgcrypto, already loaded in 000_full_schema.sql).
-- Retries on the (astronomically unlikely) collision.
CREATE OR REPLACE FUNCTION public.generate_ticket_number() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_suffix text;
  v_candidate text;
  v_exists boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_suffix := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    v_candidate := 'ILX-' || v_year || '-' || v_suffix;
    SELECT EXISTS(SELECT 1 FROM public.support_tickets WHERE ticket_number = v_candidate)
      INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_tries := v_tries + 1;
    IF v_tries > 16 THEN
      -- Should never happen with 16^6 = 16.7M values per year; raise rather
      -- than loop forever so the caller sees a real error.
      RAISE EXCEPTION 'Could not generate unique ticket number after % tries', v_tries;
    END IF;
  END LOOP;
  RETURN v_candidate;
END $$;

-- BEFORE INSERT trigger: fill ticket_number if missing, normalise email.
CREATE OR REPLACE FUNCTION public.support_tickets_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_insert
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_insert();

-- BEFORE UPDATE trigger: bump updated_at, stamp resolved_at / closed_at on
-- the first transition into each terminal state.
CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch_updated ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies are dropped/recreated to keep the migration idempotent.

DROP POLICY IF EXISTS "Authenticated can insert ticket"          ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins read all tickets"            ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins update all tickets"          ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins delete tickets"              ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins read all messages"           ON public.support_ticket_messages;
DROP POLICY IF EXISTS "Super admins insert messages"             ON public.support_ticket_messages;

-- Authenticated users can submit their own ticket directly (the contact form
-- normally goes via the service-role edge function, but the policy keeps the
-- in-app "Contact support" surfaces working too).
CREATE POLICY "Authenticated can insert ticket"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Super admins read and update every ticket. `has_role` was defined in
-- 000_full_schema.sql and is the canonical admin check across the platform.
CREATE POLICY "Super admins read all tickets"
  ON public.support_tickets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins update all tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins delete tickets"
  ON public.support_tickets FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Messages: admins read + write. The public tracking flow uses SECURITY DEFINER
-- RPCs that bypass RLS, so anonymous users never need direct table access.
CREATE POLICY "Super admins read all messages"
  ON public.support_ticket_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins insert messages"
  ON public.support_ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Public tracking RPCs ─────────────────────────────────────────────────────

-- Anyone (anon or authenticated) can look up a ticket by (number, email).
-- Returns 0 rows when either value is wrong — same shape either way, so a
-- bad email can't be distinguished from a bad number.
CREATE OR REPLACE FUNCTION public.get_my_ticket(p_ticket_number text, p_email text)
RETURNS TABLE (
  id uuid,
  ticket_number text,
  name text,
  email text,
  subject text,
  category public.support_ticket_category,
  message text,
  status public.support_ticket_status,
  priority public.support_ticket_priority,
  created_at timestamptz,
  updated_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.ticket_number, t.name, t.email, t.subject, t.category,
         t.message, t.status, t.priority, t.created_at, t.updated_at,
         t.first_response_at, t.resolved_at
  FROM public.support_tickets t
  WHERE t.ticket_number = trim(p_ticket_number)
    AND lower(t.email) = lower(trim(p_email));
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_ticket(text, text) TO anon, authenticated;

-- Returns the (non-internal) message thread for a ticket, gated by the same
-- (number, email) match as the ticket lookup. Internal notes / system audit
-- rows are filtered out before they leave the database.
CREATE OR REPLACE FUNCTION public.get_my_ticket_messages(p_ticket_number text, p_email text)
RETURNS TABLE (
  id uuid,
  author_type text,
  author_name text,
  body text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.author_type, m.author_name, m.body, m.created_at
  FROM public.support_ticket_messages m
  JOIN public.support_tickets t ON t.id = m.ticket_id
  WHERE t.ticket_number = trim(p_ticket_number)
    AND lower(t.email) = lower(trim(p_email))
    AND m.is_internal = false
    AND m.author_type IN ('user', 'staff')
  ORDER BY m.created_at ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_ticket_messages(text, text) TO anon, authenticated;

-- ── Admin stats RPC ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_ticket_stats()
RETURNS TABLE (
  total bigint,
  open_count bigint,
  pending_count bigint,
  awaiting_user_count bigint,
  resolved_count bigint,
  closed_count bigint,
  urgent_count bigint,
  high_count bigint,
  last_24h_count bigint,
  avg_resolution_hours numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE status = 'open')::bigint,
    count(*) FILTER (WHERE status = 'pending')::bigint,
    count(*) FILTER (WHERE status = 'awaiting_user')::bigint,
    count(*) FILTER (WHERE status = 'resolved')::bigint,
    count(*) FILTER (WHERE status = 'closed')::bigint,
    count(*) FILTER (WHERE priority = 'urgent')::bigint,
    count(*) FILTER (WHERE priority = 'high')::bigint,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::bigint,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
        FILTER (WHERE resolved_at IS NOT NULL),
      0
    )::numeric
  FROM public.support_tickets;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_ticket_stats() TO authenticated;

-- ── Admin list-of-admins RPC (for the "Assign to" dropdown) ──────────────────
-- Lists every super admin so the admin panel can populate the assignee
-- selector without exposing the full users table.
CREATE OR REPLACE FUNCTION public.admin_list_super_admins()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.display_name, '') AS display_name,
         COALESCE(u.email, '') AS email
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY display_name NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_super_admins() TO authenticated;
