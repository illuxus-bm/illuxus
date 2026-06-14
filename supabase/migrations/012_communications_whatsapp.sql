-- ============================================================================
-- Phase 3 — WhatsApp Business Cloud API integration
-- ----------------------------------------------------------------------------
-- WhatsApp's Cloud API forces template-based delivery for any message sent
-- outside an active 24-hour customer-care window. Event organizers are
-- almost always reaching out proactively, so we standardise on templates
-- across the platform.
--
-- This migration adds:
--   - whatsapp_templates       — local cache of approved templates per org
--   - communications.whatsapp_template_name / language / variables — what
--     to send when the comm's channel array includes 'whatsapp'.
--
-- The actual HTTP calls to Meta live in the `send-whatsapp` edge function;
-- delivery/read callbacks land at `whatsapp-webhook`. Both update the
-- communication_recipients row's whatsapp_* fields directly.
-- ============================================================================

-- ── 1. Cached registry of approved templates ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Meta's template identifiers
  name            text NOT NULL,
  language        text NOT NULL,           -- e.g. "en", "en_US", "hi"
  category        text,                    -- MARKETING / UTILITY / AUTHENTICATION
  status          text NOT NULL DEFAULT 'APPROVED'
                    CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED')),
  -- Raw `components` array from Meta. We don't try to model header/body/buttons
  -- in columns — the UI parses the JSON to render variable inputs.
  components      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Convenience: list of placeholder variable counts per component, derived
  -- from `components` at sync time. Lets the UI render variable inputs without
  -- re-parsing.
  variable_count  int NOT NULL DEFAULT 0,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, name, language)
);

CREATE INDEX IF NOT EXISTS whatsapp_templates_org_idx
  ON public.whatsapp_templates(org_id, status);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Org members view whatsapp templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = whatsapp_templates.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Inserts/updates happen via the sync edge function (service role) — no
-- client-side write policy. The user_facing read policy is enough.
GRANT SELECT ON public.whatsapp_templates TO authenticated;

-- ── 2. Add WhatsApp template fields to communications ──────────────────────
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS whatsapp_template_name     text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_language text DEFAULT 'en',
  -- jsonb array of { component: "body" | "header", values: ["v1","v2"] }
  -- — flexible enough to cover header substitutions when those are used.
  ADD COLUMN IF NOT EXISTS whatsapp_template_variables jsonb DEFAULT '{}'::jsonb;

-- Constraint: if 'whatsapp' is in the channels array, a template must be set.
-- We enforce this at the application layer rather than via CHECK so drafts
-- without templates can still exist while the user is composing.

-- ── 3. RPC: list approved templates for an org ─────────────────────────────
-- Convenience wrapper so the UI can pass an org_id without leaking other
-- columns from the table.
CREATE OR REPLACE FUNCTION public.whatsapp_templates_list(_org_id uuid)
RETURNS TABLE (
  name text,
  language text,
  category text,
  status text,
  variable_count int,
  components jsonb,
  synced_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, t.language, t.category, t.status, t.variable_count, t.components, t.synced_at
    FROM whatsapp_templates t
   WHERE t.org_id = _org_id
     AND t.status = 'APPROVED'
   ORDER BY t.name, t.language;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid) TO authenticated;

-- ── 4. Internal helper used by the edge function to mark recipient status ──
-- The edge function runs with service role so it could write directly, but
-- centralising the update in an RPC keeps the constraint logic in one place.
CREATE OR REPLACE FUNCTION public._whatsapp_recipient_update(
  _recipient_id uuid,
  _status       text,
  _error        text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('pending','sending','sent','delivered','read','failed') THEN
    RAISE EXCEPTION 'Invalid whatsapp status: %', _status;
  END IF;

  UPDATE communication_recipients
     SET whatsapp_status      = _status,
         whatsapp_sent_at     = CASE WHEN _status = 'sent'      AND whatsapp_sent_at      IS NULL THEN now() ELSE whatsapp_sent_at      END,
         whatsapp_delivered_at = CASE WHEN _status = 'delivered' AND whatsapp_delivered_at IS NULL THEN now() ELSE whatsapp_delivered_at END,
         whatsapp_read_at     = CASE WHEN _status = 'read'      AND whatsapp_read_at      IS NULL THEN now() ELSE whatsapp_read_at      END,
         error_message        = COALESCE(_error, error_message)
   WHERE id = _recipient_id;
END;
$$;

-- service-role-only; we don't grant to authenticated.

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_templates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates';
  END IF;
END $$;
