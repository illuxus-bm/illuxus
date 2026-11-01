/**
 * Sponsor team invite — /sponsor/accept?token=…
 *
 * Claims the invite for the signed-in account through
 * `accept_sponsor_invite` (migration 053), which runs on the server: team
 * members can't update their own sponsor_members row, so the old direct
 * UPDATE never worked for them. Each outcome is explained on the page, with
 * a way to switch account when the wrong one is signed in.
 *
 * Signed out, the invitee chooses: sign in to an existing account, or have a
 * set-up link emailed to the invited address (guest-registration
 * `start_invite`). That link opens a form with the details the organiser
 * already entered, and comes back here once the account exists.
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loginPath } from "@/lib/safe-redirect";
import { callGuestRegistration } from "@/lib/guest-registration";

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
  if (!user) return <SignedOutInvite token={token} />;

  const switchAccount = async () => {
    await signOut();
    navigate(loginPath(`/sponsor/accept?token=${token}`), { replace: true });
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

/** Signed out: sign in, or get a set-up link at the invited address. */
function SignedOutInvite({ token }: { token: string }) {
  const navigate = useNavigate();
  const signIn = loginPath(`/sponsor/accept?token=${token}`);
  const [state, setState] = useState<{ kind: "choose" | "busy" | "sent" | "invalid" | "accepted" | "error"; hint?: string }>({ kind: "choose" });

  const requestLink = async () => {
    setState({ kind: "busy" });
    const reply = await callGuestRegistration({ action: "start_invite", kind: "sponsor_contact", token });
    const b = reply.body;
    if (b.ok !== true) { setState({ kind: "error" }); return; }
    if (b.status === "sign_in") { navigate(signIn, { replace: true }); return; }
    if (b.status === "sent") { setState({ kind: "sent", hint: typeof b.email_hint === "string" ? b.email_hint : undefined }); return; }
    setState({ kind: b.status === "accepted" ? "accepted" : "invalid" });
  };

  const message =
    state.kind === "sent" ? `We've emailed a set-up link to ${state.hint ?? "the invited address"}. Your details are already filled in — open the link, check them and choose a password.`
    : state.kind === "invalid" ? COPY.invalid.body
    : state.kind === "accepted" ? "This invite has already been accepted. Sign in to open the sponsor portal."
    : state.kind === "error" ? "We couldn't send the link. Please try again."
    : "Join the sponsor's team on Illuxus. Already have an account? Sign in. New here? We'll email you a link to set one up — the details the organiser entered are filled in for you.";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">{state.kind === "sent" ? "Check your inbox" : "You've been invited to a sponsor team"}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {state.kind !== "sent" && state.kind !== "invalid" && (
          <div className="flex flex-wrap justify-center gap-2">
            {state.kind !== "accepted" && (
              <Button size="sm" onClick={() => void requestLink()} disabled={state.kind === "busy"}>
                {state.kind === "busy" ? "Sending…" : "Set up my account"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate(signIn)}>I already have an account</Button>
          </div>
        )}
      </div>
    </div>
  );
}
