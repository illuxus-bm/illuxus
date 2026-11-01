-- ═══════════════════════════════════════════════════════════════════════════════
-- 049_admin_provisioned_organizations.sql
--
-- Super Admin can create an organization and invite its first user, who
-- becomes the owner when they accept (team-invitation edge function, action
-- `admin_create_org`).
--
-- An organization needs an owner from the moment it exists, but the first
-- user may not have an account yet. Until they accept, the organization's
-- `owner_id` is the Super Admin who created it (no `org_members` row). The
-- invitation carries `transfer_ownership`; when it is accepted, ownership
-- moves to the person who accepted it, in the same transaction.
--
--   1. `org_invitations.transfer_ownership` — accepting it makes the invitee
--      the organization's owner. Only server-side code can set it.
--   2. `org_invitations.prefill` — personal details the Super Admin entered
--      (first / last name, designation, mobile), shown pre-filled on the
--      invitation page. The invitee can change them.
--   3. Trigger: when a `transfer_ownership` invitation becomes accepted, the
--      organization's owner becomes the user who accepted it, and that user
--      gets the owner membership. Covers every path that accepts an
--      invitation (`complete_org_invitation`, `accept_org_invitation`).
--
-- No other role is ever granted here; global roles (`user_roles`) are not
-- touched. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1–2. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS transfer_ownership boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prefill jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_invitations.transfer_ownership IS
  'Accepting this invitation makes the invitee the organization''s owner (organizations created by Super Admin). Set only by server-side code.';
COMMENT ON COLUMN public.org_invitations.prefill IS
  'Personal details entered by whoever created the invitation, pre-filled on the invitation page.';

-- Browsers (signed-in callers) can never ask for an ownership handover.
CREATE OR REPLACE FUNCTION public.org_invitations_transfer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.transfer_ownership := false;
  ELSE
    NEW.transfer_ownership := OLD.transfer_ownership;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_transfer_guard ON public.org_invitations;
CREATE TRIGGER org_invitations_transfer_guard
  BEFORE INSERT OR UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_transfer_guard();

-- ── 3. Hand over ownership on acceptance ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_invitations_hand_over()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transfer_ownership
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND NEW.accepted_by IS NOT NULL THEN
    UPDATE public.organizations
       SET owner_id = NEW.accepted_by, updated_at = now()
     WHERE id = NEW.org_id;
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (NEW.org_id, NEW.accepted_by, 'owner')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_hand_over ON public.org_invitations;
CREATE TRIGGER org_invitations_hand_over
  AFTER UPDATE OF status ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_hand_over();

COMMENT ON FUNCTION public.org_invitations_hand_over() IS
  'When an ownership-handover invitation is accepted, the organization''s owner becomes the accepting user (with the owner membership), in the same transaction.';
