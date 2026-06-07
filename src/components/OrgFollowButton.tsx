import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Heart, HeartOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/** Lu.ma-style follow button that lives next to an organization's name. */
export default function OrgFollowButton({ orgId, primaryColor }: { orgId: string; primaryColor?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: c }, mine] = await Promise.all([
        supabase.from("org_followers").select("*", { count: "exact", head: true }).eq("org_id", orgId),
        user
          ? supabase.from("org_followers").select("id").eq("org_id", orgId).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null } as { data: null }),
      ]);
      if (cancelled) return;
      setCount(c ?? 0);
      setFollowing(!!mine.data);
    })();
    return () => { cancelled = true; };
  }, [orgId, user]);

  const toggle = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    if (following) {
      const { error } = await supabase.from("org_followers").delete().eq("org_id", orgId).eq("user_id", user.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { setFollowing(false); setCount((n) => Math.max(0, n - 1)); }
    } else {
      const { error } = await supabase.from("org_followers").insert({ org_id: orgId, user_id: user.id });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { setFollowing(true); setCount((n) => n + 1); toast({ title: "Following", description: "You'll see new events from this organization." }); }
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant={following ? "outline" : "default"}
        onClick={toggle}
        disabled={busy}
        className="h-8 text-[12px] gap-1.5"
        style={!following && primaryColor ? { backgroundColor: primaryColor, color: "#fff" } : undefined}
      >
        {following ? <HeartOff className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
        {following ? "Following" : "Follow"}
      </Button>
      <span className="text-[12px] text-muted-foreground">{count} {count === 1 ? "follower" : "followers"}</span>
    </div>
  );
}