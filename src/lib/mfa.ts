import { supabase } from "@/integrations/supabase/client";

/**
 * Two-factor sign-in (Supabase MFA, authenticator app / TOTP).
 *
 * A session made with the password alone is `aal1`. For anyone who has
 * two-factor on, the database and the edge functions refuse `aal1`, so the
 * app asks for the authenticator code (which upgrades the session to `aal2`)
 * before doing anything else.
 */

/** True when this session still has to pass the authenticator code. */
export async function needsSecondFactor(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
