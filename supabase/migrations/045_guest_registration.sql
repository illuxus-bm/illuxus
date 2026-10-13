-- ═══════════════════════════════════════════════════════════════════════════════
-- 045_guest_registration.sql
--
-- Supports registering for an event without an account, and setting a
-- password afterwards from a link in the confirmation email. Everything here
-- is used only by the `guest-registration` edge function, which runs as
-- service_role; browsers get no access to any of it.
--
--   1. `account_activation_tokens` — one row per emailed "set up your account"
--      link. Only the SHA-256 of the token is stored, so a copy of this table
--      cannot be used to activate anyone's account. A link works once
--      (`used_at`) and stops working at `expires_at`.
--   2. `guest_rate_limits` — a log of recent attempts, keyed by a hash of the
--      caller's address or email, used to slow down abuse of the public
--      registration, activation and resend endpoints.
--   3. `registrations.confirmation_email_sent_at` — when the confirmation
--      email went out, so a retried request does not send it twice.
--
-- Registrations themselves are unchanged: a guest registration is an ordinary
-- row with `user_id` NULL, exactly like a participant an organiser adds by
-- hand. The existing `handle_new_user` trigger attaches such rows to the
-- account when one is created for that email, and the existing unique index
-- on (event_id, lower(email)) keeps one registration per person per event.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  token_hash      text NOT NULL,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_activation_tokens_email_lower CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS account_activation_tokens_hash_idx
  ON public.account_activation_tokens (token_hash);
CREATE INDEX IF NOT EXISTS account_activation_tokens_email_idx
  ON public.account_activation_tokens (email, created_at DESC);

ALTER TABLE public.account_activation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_activation_tokens FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.account_activation_tokens TO service_role;

COMMENT ON TABLE public.account_activation_tokens IS
  'Single-use, expiring "set up your account" links sent after a guest registration. Stores only the SHA-256 of each token. service_role only (no RLS policies).';


CREATE TABLE IF NOT EXISTS public.guest_rate_limits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     text NOT NULL,
  key_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_rate_limits_lookup_idx
  ON public.guest_rate_limits (bucket, key_hash, created_at DESC);

ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_rate_limits FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.guest_rate_limits TO service_role;

COMMENT ON TABLE public.guest_rate_limits IS
  'Recent attempts against the public guest-registration endpoints, keyed by a hash of the caller address or email. service_role only. Rows older than a day can be deleted at any time.';


ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

COMMENT ON COLUMN public.registrations.confirmation_email_sent_at IS
  'When the guest-registration confirmation email was sent. NULL for registrations made before guest registration existed, or whose email could not be sent.';

NOTIFY pgrst, 'reload schema';
