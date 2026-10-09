-- ═══════════════════════════════════════════════════════════════════════════════
-- 039_utm_delete_tracking.sql
--
-- Lets an organiser delete a tracked (UTM) link from the event's UTM page.
--
-- Why a function: a row in the UTM breakdown exists because of what was
-- recorded for that source + medium + campaign — a saved `utm_links` row,
-- `utm_clicks`, and/or registrations. Clients can delete `utm_links` rows but
-- have no DELETE policy on `utm_clicks` (only SELECT), so a link that had ever
-- been clicked could not be removed from the page: deleting its saved row
-- left the click history, and the row stayed. Links shared without being
-- saved (e.g. from the event share button) had nothing deletable at all.
--
-- `delete_utm_tracking` removes, for one event and one source/medium/campaign:
--   • the saved link (if any), and
--   • its recorded clicks.
-- Registrations are leads and are NEVER deleted or altered here; the function
-- reports how many remain attributed to the link so the UI can say so.
--
-- Matching mirrors `event_utm_summary` (NULL medium/campaign are shown as
-- '(none)'), so what is deleted is exactly the row the organiser clicked.
-- '(direct)' is not a link and is refused.
--
-- Authorisation matches the existing utm_links / utm_clicks policies: the
-- event's creator, a member of its organisation, or a platform admin.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_links  int := 0;
  v_clicks int := 0;
  v_regs   int := 0;
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

  SELECT count(*) INTO v_regs
    FROM public.registrations r
   WHERE r.event_id   = _event_id
     AND r.status    <> 'cancelled'
     AND r.utm_source = _utm_source
     AND coalesce(r.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(r.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');

  RETURN jsonb_build_object(
    'links_deleted',      v_links,
    'clicks_deleted',     v_clicks,
    'registrations_kept', v_regs
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) IS
  'Delete a tracked link for an event: its saved utm_links row and its recorded utm_clicks. Registrations are never touched; the count still attributed is returned. Caller must be the event creator, an org member, or a platform admin.';
