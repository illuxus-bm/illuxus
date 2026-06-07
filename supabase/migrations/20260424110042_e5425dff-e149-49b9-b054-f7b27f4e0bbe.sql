-- Public-safe function to fetch the "going" count and a small sample of
-- attendee avatars/names for an event, used by the Lu.ma-style public page.
-- Only returns approved registrations and only profile fields that are
-- already publicly viewable via the profiles table policy.
CREATE OR REPLACE FUNCTION public.get_event_attendees_public(_event_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  going_count bigint,
  attendees jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH approved AS (
    SELECT r.user_id, r.name, r.created_at
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE r.event_id = _event_id
      AND r.approval_status = 'approved'
      AND e.status = 'published'
  ),
  sampled AS (
    SELECT a.user_id, a.name, a.created_at,
           p.display_name, p.avatar_url
    FROM approved a
    LEFT JOIN public.profiles p ON p.user_id = a.user_id
    ORDER BY a.created_at ASC
    LIMIT _limit
  )
  SELECT
    (SELECT count(*) FROM approved) AS going_count,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'name', COALESCE(s.display_name, s.name),
         'avatar_url', s.avatar_url
       ))
       FROM sampled s),
      '[]'::jsonb
    ) AS attendees;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_attendees_public(uuid, int) TO anon, authenticated;