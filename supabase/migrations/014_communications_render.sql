-- ============================================================================
-- Phase 5.1 — Server-side variable substitution at fan-out
-- ----------------------------------------------------------------------------
-- The compose preview interpolates `{{user_name}}`, `{{event_name}}`, etc.
-- using sample data. Until now the actual fan-out left the raw tokens in the
-- persisted recipient rows, so any future provider integration would have to
-- duplicate the substitution logic.
--
-- This migration:
--   1. Adds `rendered_subject` / `rendered_body` columns on
--      `communication_recipients`.
--   2. Adds a private `_communications_render_text()` helper that mirrors
--      the client-side `applyVariables()` exactly.
--   3. Updates `_communications_dispatch_impl()` to fan out per-recipient
--      rendered text alongside the existing status columns.
-- ============================================================================

-- ── 1. New columns ─────────────────────────────────────────────────────────
ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS rendered_subject text,
  ADD COLUMN IF NOT EXISTS rendered_body    text;

-- ── 2. Render helper ───────────────────────────────────────────────────────
-- Single-purpose: substitute a small set of curly-brace variables in a string.
-- Tokens not present in the context map are left unchanged so the organizer
-- can spot mis-typed names.
CREATE OR REPLACE FUNCTION public._communications_render_text(
  _text text,
  _ctx  jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _key   text;
  _value text;
  _out   text := COALESCE(_text, '');
BEGIN
  IF _out = '' THEN RETURN _out; END IF;

  -- Iterate the keys of `_ctx` and replace every `{{key}}` occurrence.
  -- Using regexp_replace with a literal token keeps the substitution safe
  -- even if the value contains regex meta-chars (we use replace(), not regexp).
  FOR _key, _value IN SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v) LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    _out := replace(_out, '{{' || _key || '}}', _value);
    -- Tolerate inner whitespace ({{ user_name }}) the same way the JS regex does.
    _out := regexp_replace(_out, '\{\{\s*' || _key || '\s*\}\}', _value, 'g');
  END LOOP;

  RETURN _out;
END;
$$;

-- ── 3. Update dispatch impl to render at fan-out ───────────────────────────
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;   -- event / community fields shared by all recipients
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

  -- Build scope-level context once (event_name / event_date / event_location
  -- or community_name). Per-recipient pieces (`user_name`) get layered on
  -- inside the INSERT below.
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
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'community_name', c.name
    ))
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
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
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
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
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
