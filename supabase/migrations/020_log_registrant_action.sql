-- 020_log_registrant_action.sql
-- Audit-log RPC called by RegistrantQuickView when a registrant is
-- deleted or restored. Stores the action in a simple JSONB audit table
-- if it exists, otherwise falls back gracefully (no crash).
-- The frontend calls: supabaseRpc("log_registrant_action", { _action, _registration_id, _details })

CREATE TABLE IF NOT EXISTS public.registrant_audit_log (
  id          uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action      text          NOT NULL,
  reg_id      text          NOT NULL,  -- uuid stored as text to survive deleted rows
  actor_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  details     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.registrant_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit log" ON public.registrant_audit_log
  FOR SELECT TO authenticated
  USING(has_role(auth.uid(), 'admin'));

-- Grant: authenticated users can INSERT (own actions); read is admin-only.
GRANT INSERT ON public.registrant_audit_log TO authenticated;
GRANT SELECT ON public.registrant_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.log_registrant_action(
  _action          text,
  _registration_id uuid,
  _details         jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.registrant_audit_log(action, reg_id, actor_id, details)
  VALUES (_action, _registration_id::text, auth.uid(), COALESCE(_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- Audit failure must never break the calling operation.
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_registrant_action(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_registrant_action IS
'Records delete/restore actions on registrant rows for audit purposes.';
