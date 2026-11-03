import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  accountType: "attendee" | "organizer" | null;
  profileCompleted: boolean | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  accountType: null,
  profileCompleted: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountType, setAccountType] = useState<"attendee" | "organizer" | null>(null);
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);

  // A failed request says nothing about the account: keep what is known
  // rather than reading "no row" into it. Otherwise an attendee opening the
  // app offline would be taken for an organiser with an unfinished profile.
  const checkAdminRole = async (userId: string) => {
    const { data, error } = await withRetry(() => supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle());
    if (error) {
      logger.warn("admin role load failed", { error_message: error.message });
      return;
    }
    setIsAdmin(!!data);
  };

  const loadAccountType = async (userId: string) => {
    const { data, error } = await withRetry(() => supabase
      .from("profiles")
      .select("account_type, profile_completed")
      .eq("user_id", userId)
      .maybeSingle());
    if (error) {
      // `profileCompleted` stays null, so ProfileGate waits; it is asked
      // again when the device comes back online (below).
      logger.warn("account type load failed", { error_message: error.message });
      return;
    }
    const row = data as { account_type?: string; profile_completed?: boolean } | null;
    const t = row?.account_type;
    setAccountType(t === "attendee" ? "attendee" : "organizer");
    setProfileCompleted(row?.profile_completed ?? false);
  };

  const refreshProfile = async () => {
    if (user) {
      await Promise.all([checkAdminRole(user.id), loadAccountType(user.id)]);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1) Restore the persisted session FIRST so reloads don't flash signed-out.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await Promise.all([
            checkAdminRole(session.user.id),
            loadAccountType(session.user.id),
          ]);
        } catch (err) {
          logger.warn('auth profile fetch failed', { error_message: (err as Error)?.message });
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    // 2) Then subscribe to future auth changes (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        // Idempotent: bail out on no-op events (TOKEN_REFRESHED on tab focus,
        // INITIAL_SESSION echoes, etc.) so consumers don't see a new `user`
        // object reference and re-run their effects (which causes the live
        // webinar page to remount when switching tabs).
        setSession((prev) => {
          const prevToken = prev?.access_token ?? null;
          const nextToken = newSession?.access_token ?? null;
          const prevUid = prev?.user?.id ?? null;
          const nextUid = newSession?.user?.id ?? null;
          if (prevToken === nextToken && prevUid === nextUid) {
            return prev; // no change → no re-render
          }
          // User identity actually changed (sign-in / sign-out / switch user)
          if (prevUid !== nextUid) {
            setUser(newSession?.user ?? null);
            if (newSession?.user) {
              setLoading(true);
              Promise.all([
                checkAdminRole(newSession.user.id),
                loadAccountType(newSession.user.id),
              ]).catch((err) => {
                logger.warn('auth state change profile fetch failed', { error_message: (err as Error)?.message });
              }).finally(() => {
                if (mounted) setLoading(false);
              });
            } else {
              setIsAdmin(false);
              setAccountType(null);
              setProfileCompleted(null);
              setLoading(false);
            }
          }
          return newSession;
        });
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Still unknown after a failed load: try again once the connection is back.
  useEffect(() => {
    if (!user || profileCompleted !== null) return;
    const retry = () => {
      void Promise.all([checkAdminRole(user.id), loadAccountType(user.id)]);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [user, profileCompleted]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, accountType, profileCompleted, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

/** Runs a query up to three times, a second then two apart, until it returns without an error. */
async function withRetry<T extends { error: { message: string } | null }>(run: () => PromiseLike<T>): Promise<T> {
  let result = await run();
  for (let attempt = 0; result.error && attempt < 2; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    result = await run();
  }
  return result;
}
