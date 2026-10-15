/**
 * Sponsor team invite — /sponsor/accept?token=…
 *
 * Claims the invite for the signed-in account through
 * `accept_sponsor_invite` (migration 053), which runs on the server: team
 * members can't update their own sponsor_members row, so the old direct
 * UPDATE never worked for them. Each outcome is explained on the page, with
 * a way to switch account when the wrong one is signed in.
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Outcome = "working" | "invalid" | "claimed" | "organiser" | "update_needed" | "error";

const COPY: Record<Exclude<Outcome, "working">, { title: string; body: string }> = {
  invalid: {
    title: "This invite link isn't valid",
    body: "It may have been removed or replaced. Ask the event organiser for a new link.",
  },
  claimed: {
    title: "This invite was already accepted by another account",
    body: "If that wasn't you, ask the event organiser to remove that team member and send you a new link.",
  },
  organiser: {
    title: "You're signed in as the organiser",
    body: "Organisers share this link with the sponsor's team — it only adds the person who opens it. Send it to them, or sign in with the sponsor's account.",
  },
  update_needed: {
    title: "Invites can't be accepted just yet",
    body: "A system update is still being applied. Please try this link again a little later.",
  },
  error: {
    title: "We couldn't accept this invite",
    body: "Something went wrong. Please try again.",
  },
};

export default function AcceptInvitePage() {
  const { user, loading, signOut } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<Outcome>("working");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loading || !user || !token) return;
    let alive = true;
    setOutcome("working");
    (async () => {
      const { data, error } = await supabaseRpc("accept_sponsor_invite" as never, { _token: token } as never);
      if (!alive) return;
      if (error) {
        const msg = error.message ?? "";
        setOutcome(
          msg.includes("INVITE_INVALID") ? "invalid"
            : msg.includes("INVITE_CLAIMED") ? "claimed"
            : msg.includes("INVITE_ORGANISER") ? "organiser"
            : /accept_sponsor_invite|function .* does not exist|schema cache/i.test(msg) ? "update_needed"
            : "error",
        );
        return;
      }
      const row = ((data || []) as unknown as { sponsor_name: string | null; result: string }[])[0];
      toast.success(row?.result === "already_yours" ? "You're already on this sponsor's team" : `You're in${row?.sponsor_name ? ` — welcome to ${row.sponsor_name}` : ""}!`);
      navigate("/sponsor", { replace: true });
    })();
    return () => { alive = false; };
  }, [user, loading, token, navigate, attempt]);

  if (loading) return <FullPageLoader />;
  if (!token) return <Navigate to="/" replace />;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(`/sponsor/accept?token=${token}`)}`} replace />;

  const switchAccount = async () => {
    await signOut();
    navigate(`/login?redirect=${encodeURIComponent(`/sponsor/accept?token=${token}`)}`, { replace: true });
  };

  if (outcome === "working") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Activating your sponsor access…</p>
      </div>
    );
  }

  const copy = COPY[outcome];
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
          <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{user.email}</span></p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {(outcome === "claimed" || outcome === "organiser") && (
            <Button size="sm" onClick={() => void switchAccount()}>Sign in with another account</Button>
          )}
          {(outcome === "error" || outcome === "update_needed") && (
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate("/sponsor")}>Go to sponsor portal</Button>
        </div>
      </div>
    </div>
  );
}
