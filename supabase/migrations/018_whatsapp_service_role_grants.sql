-- ============================================================================
-- Phase 7 hotfix — service_role privileges on WhatsApp tables / helpers
-- ----------------------------------------------------------------------------
-- The `send-whatsapp` and `whatsapp-sync-templates` edge functions connect
-- as `service_role`. The original 012 migration only granted privileges to
-- `authenticated`, which would make the edge functions hit
-- `permission denied for table whatsapp_templates` (SQLSTATE 42501) on the
-- first sync.
--
-- This mirrors migration 017 for the email side.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;

GRANT EXECUTE ON FUNCTION public._whatsapp_recipient_update(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid)                TO service_role;
