
REVOKE EXECUTE ON FUNCTION public.is_event_approved_attendee(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_event_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_approved_attendee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_owner(uuid, uuid) TO authenticated;
