-- ============================================================================
-- Phase 6 — Real email delivery via Resend
-- ----------------------------------------------------------------------------
-- The earlier dispatch impl pre-stamped `email_status='sent'` because there
-- was no provider integration yet. Now that the `send-communication-email`
-- edge function actually ships emails, dispatch should mark recipients as
-- `pending` and let the worker advance them to `sent` / `failed`.
--
-- This migration replaces `_communications_dispatch_impl` only — schema and
-- RLS stay untouched. After applying, the dispatch flow is:
--
--   1. RPC `communications_dispatch(id)` validates auth + fans out recipient
--      rows with `email_status='pending'` and `whatsapp_status='pending'`
--      where applicable, marks the parent row `status='sent'` (the comm has
--      been queued — delivery happens off-thread).
--   2. The client immediately invokes `send-communication-email` which
--      batches pending email rows through Resend and updates statuses.
--
-- WhatsApp delivery is intentionally untouched in this migration. WhatsApp
-- rows are still inserted as `whatsapp_status='pending'` and wait for the
-- future phase to ship them.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  -- Build scope-level context once.
  IF _comm.event_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'event_name',     e.title,
      'event_date',     to_char(e.date, 'FMMonth FMDD, YYYY'),
      'event_location', COALESCE(e.venue, e.location)
    ))
      INTO _scope_ctx
      FROM events e
     WHERE e.id = _comm.event_id;
  ELSIF _comm.community_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object('community_name', c.name))
      INTO _scope_ctx
      FROM communities c
     WHERE c.id = _comm.community_id;
  END IF;

  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             -- Now using 'pending' so the worker is the source of truth
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  ELSE
    WITH resolved AS (
      SELECT * FROM communications_resolve_community_recipients(_comm.community_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  -- Parent row is "sent" in the sense that fan-out is complete. Per-recipient
  -- delivery state lives in `communication_recipients.email_status`.
  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = 0,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- ── Helper: roll up per-recipient email status into the parent's counts ─────
-- Called by the edge function after each batch flushes so the list view's
-- "5/342 delivered" copy stays in sync without polling every recipient row.
CREATE OR REPLACE FUNCTION public.communications_recompute_email_counts(
  _communication_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE communications
     SET sent_count   = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('sent','delivered','opened','clicked')),
         failed_count = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('bounced','failed')),
         updated_at   = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid) TO authenticated;
