-- ═══════════════════════════════════════════════════════════════════════════════
-- Rate limits that hold under concurrent requests (QA audit F-14).
--
-- The edge functions counted recent attempts in guest_rate_limits and then
-- inserted one, in two separate requests. Requests arriving together all saw
-- a count under the limit and all went through. take_rate_limit does both in
-- one transaction, holding a lock on the bucket and key, so the limit is exact.
--
-- Used by _shared/rate-limit.ts, guest-registration, team-invitation and
-- submit-support-ticket. Deploy those functions after running this.
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

/*
 * Records one use of `_bucket`/`_key_hash` and returns true, or returns false
 * when `_max` uses already happened in the last `_window_seconds`. Callers
 * waiting on the same bucket and key queue behind each other; other keys are
 * not held up. Rows a day older than the window are cleared for the key.
 */
CREATE OR REPLACE FUNCTION public.take_rate_limit(_bucket text, _key_hash text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _used integer;
BEGIN
  IF _bucket IS NULL OR _key_hash IS NULL OR _max IS NULL OR _max < 1 OR _window_seconds IS NULL OR _window_seconds < 1 THEN
    RAISE EXCEPTION 'take_rate_limit: bucket, key, max >= 1 and window >= 1 are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_bucket || ':' || _key_hash, 0));

  SELECT count(*) INTO _used FROM guest_rate_limits
   WHERE bucket = _bucket AND key_hash = _key_hash
     AND created_at > now() - make_interval(secs => _window_seconds);
  IF _used >= _max THEN
    RETURN false;
  END IF;

  INSERT INTO guest_rate_limits (bucket, key_hash) VALUES (_bucket, _key_hash);
  DELETE FROM guest_rate_limits
   WHERE bucket = _bucket AND key_hash = _key_hash
     AND created_at < now() - make_interval(secs => _window_seconds) - interval '1 day';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.take_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_rate_limit(text, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
