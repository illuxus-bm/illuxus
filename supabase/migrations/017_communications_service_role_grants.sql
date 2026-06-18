-- ============================================================================
-- Phase 6 hotfix — service_role privileges on communications tables
-- ----------------------------------------------------------------------------
-- The `send-communication-email` edge function connects as `service_role`
-- (via `SUPABASE_SERVICE_ROLE_KEY`). The original 009 migration only
-- granted privileges to `authenticated`, so the edge function gets a
-- `permission denied for table communication_recipients` (SQLSTATE 42501)
-- when it tries to read pending rows.
--
-- This migration adds explicit grants for `service_role`. RLS still applies
-- if it were enforced for service_role — but service_role bypasses RLS by
-- default in Supabase, so the grants are the only thing in the way.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;

-- RPCs the edge function calls. EXECUTE on functions is typically default
-- but we grant explicitly so the migration is a complete reference.
GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_render_text(text, jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_dispatch_impl(uuid)                TO service_role;
