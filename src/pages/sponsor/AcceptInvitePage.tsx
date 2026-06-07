import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AcceptInvitePage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (loading || !user || !token) return;
    setWorking(true);
    (async () => {
      const { data, error } = await supabase
        .from("sponsor_members")
        .update({ user_id: user.id, accepted_at: new Date().toISOString() })
        .eq("invite_token", token)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        // maybe already accepted by this same user
        const { data: mine } = await supabase
          .from("sponsor_members")
          .select("id")
          .eq("invite_token", token)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!mine) {
          toast.error("Invite is invalid or already claimed by another account");
          setWorking(false);
          return;
        }
      }
      toast.success("You're in!");
      navigate("/sponsor", { replace: true });
    })();
  }, [user, loading, token, navigate]);

  if (loading) return <FullPageLoader />;
  if (!token) return <Navigate to="/" replace />;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(`/sponsor/accept?token=${token}`)}`} replace />;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">{working ? "Activating your sponsor access…" : "One moment…"}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/sponsor")}>Go to sponsor portal</Button>
      </div>
    </div>
  );
}