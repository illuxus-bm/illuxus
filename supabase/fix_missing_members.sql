DO $$
DECLARE
  _reg RECORD;
BEGIN
  FOR _reg IN 
    SELECT r.event_id, r.user_id 
    FROM registrations r
    JOIN communities c ON c.event_id = r.event_id
    WHERE r.approval_status = 'approved' 
      AND r.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_members cm 
        WHERE cm.community_id = c.id AND cm.user_id = r.user_id
      )
  LOOP
    PERFORM _auto_join_event_community(_reg.event_id, _reg.user_id, 'member');
  END LOOP;
END;
$$;
