-- ═══════════════════════════════════════════════════════════════════════════════
-- 043_utm_partner_remove.sql
--
-- Partner shares can be removed, not only revoked.
--
--   • `utm_partner_remove(_access_id)` deletes one share. If it was still
--     active the partner loses access immediately (and is notified), exactly
--     as with a revoke — the row is then gone from the Partners list.
--   • `delete_utm_tracking` (039) now also deletes the shares of the link it
--     deletes: a link that no longer exists can't stay shared with anyone.
--     The count is returned as `partners_removed`.
--
-- Registrations are never touched by either function.
-- Requires 040. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.utm_partner_remove(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row   public.utm_partner_access;
  v_title text;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.utm_partner_access a WHERE a.id = _access_id;

  PERFORM public._utm_partner_audit('utm_partner.removed', v_row.id, jsonb_build_object(
    'email', v_row.invited_email, 'event_id', v_row.event_id, 'previous_status', v_row.status,
    'utm_source', v_row.utm_source, 'utm_medium', v_row.utm_medium, 'utm_campaign', v_row.utm_campaign));
  IF v_row.status = 'accepted' THEN
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
    PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
      'Access to a shared link was removed',
      'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'removed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.utm_partner_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_partner_remove(uuid) TO authenticated, service_role;

-- Deleting a tracked link also ends its partner shares.
CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_links    int := 0;
  v_clicks   int := 0;
  v_regs     int := 0;
  v_partners int := 0;
  r          record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.utm_links l
   WHERE l.event_id     = _event_id
     AND l.utm_source   = _utm_source
     AND l.utm_medium   = _utm_medium
     AND l.utm_campaign = _utm_campaign;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  DELETE FROM public.utm_clicks c
   WHERE c.event_id   = _event_id
     AND c.utm_source = _utm_source
     AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  FOR r IN
    DELETE FROM public.utm_partner_access a
     WHERE a.event_id     = _event_id
       AND a.utm_source   = _utm_source
       AND a.utm_medium   = coalesce(_utm_medium,   '(none)')
       AND a.utm_campaign = coalesce(_utm_campaign, '(none)')
    RETURNING a.id, a.invited_email, a.status
  LOOP
    v_partners := v_partners + 1;
    PERFORM public._utm_partner_audit('utm_partner.removed', r.id,
      jsonb_build_object('email', r.invited_email, 'previous_status', r.status, 'reason', 'link deleted'));
  END LOOP;

  SELECT count(*) INTO v_regs
    FROM public.registrations r2
   WHERE r2.event_id   = _event_id
     AND r2.status    <> 'cancelled'
     AND r2.utm_source = _utm_source
     AND coalesce(r2.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(r2.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');

  RETURN jsonb_build_object(
    'links_deleted',      v_links,
    'clicks_deleted',     v_clicks,
    'registrations_kept', v_regs,
    'partners_removed',   v_partners
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
