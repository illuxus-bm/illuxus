-- ============================================================================
-- Phase 5.2 — Strip unresolved tokens at render time
-- ----------------------------------------------------------------------------
-- The earlier render helper (014) left `{{token}}` literally in place when a
-- value wasn't supplied for the key. That's nice for compose-time debugging
-- but ugly for recipients — they'd see "Welcome to {{community_name}}!" in
-- their inbox.
--
-- This migration replaces `_communications_render_text` so that:
--   1. Known tokens with values get substituted.
--   2. Any other `{{...}}` tokens are stripped along with one leading space
--      to avoid leaving double-gaps in the rendered text.
--   3. Excess whitespace + orphan punctuation (" ." / " ,") are tightened.
--
-- The behaviour mirrors `applyVariables()` in `src/lib/communications/substitute.ts`
-- so the preview matches what gets persisted byte-for-byte.
--
-- The compose dialog independently warns the organizer about out-of-scope
-- tokens at edit time so they can fix them before send.
-- ============================================================================

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

  -- 1. Substitute every key present in `_ctx`.
  FOR _key, _value IN
    SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v)
  LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    -- Tolerate inner whitespace: `{{ user_name }}` matches `{{user_name}}`.
    -- Use POSIX `[[:space:]]` instead of `\s` for max portability.
    _out := regexp_replace(_out, '\{\{[[:space:]]*' || _key || '[[:space:]]*\}\}', _value, 'gi');
  END LOOP;

  -- 2. Strip any tokens that didn't get substituted, eating one leading
  -- whitespace char so we don't leave gaps. Pattern mirrors the JS regex
  -- in `applyVariables()`.
  _out := regexp_replace(_out, '[[:space:]]?\{\{[[:space:]]*[a-z_][a-z_0-9]*[[:space:]]*\}\}', '', 'gi');

  -- 3. Collapse runs of whitespace + tighten orphaned punctuation.
  _out := regexp_replace(_out, '[[:space:]]{2,}', ' ', 'g');
  _out := regexp_replace(_out, '[[:space:]]+([.,!?;:])', '\1', 'g');
  _out := btrim(_out);

  RETURN _out;
END;
$$;
