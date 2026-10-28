import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { needsSecondFactor } from "@/lib/mfa";
import TwoFactorChallengeDialog from "@/components/auth/TwoFactorChallengeDialog";

/**
 * Holds the whole app back while the signed-in session still owes its
 * authenticator code — a password reset link, an email-code sign-in, or a
 * tab closed half way through signing in all leave such a session. The
 * database refuses it anyway; this asks for the code instead of showing a
 * broken, empty app. The login page asks on its own, so it passes through.
 */
export function SecondFactorGate({ children }: { children: ReactNode }) {
  const { session, signOut, refreshProfile } = useAuth();
  const { pathname } = useLocation();
  const [state, setState] = useState<"checking" | "pending" | "ok">("checking");
  const token = session?.access_token ?? null;

  useEffect(() => {
    let live = true;
    if (!token) { setState("ok"); return; }
    setState("checking");
    needsSecondFactor()
      .then((pending) => { if (live) setState(pending ? "pending" : "ok"); })
      .catch(() => { if (live) setState("ok"); });
    return () => { live = false; };
  }, [token]);

  if (pathname === "/login" || state === "ok") return <>{children}</>;
  if (state === "checking") return null;
  return (
    <div className="min-h-screen bg-background">
      <TwoFactorChallengeDialog
        open
        onCancel={() => { void signOut(); }}
        onVerified={async () => {
          // The profile reads made before the code were refused; load them now.
          await refreshProfile();
          setState("ok");
        }}
        title="Verify it's you"
        description="Enter the 6-digit code from your authenticator app to continue."
      />
    </div>
  );
}
