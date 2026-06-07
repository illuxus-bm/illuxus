import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Lu.ma-style "Subscribe" pill for an organization page.
 * Wraps the existing `org_followers` table — subscribing is the same as
 * following, just with attendee-friendly copy and a single primary pill.
 */
export default function OrgSubscribeButton({
  orgId,
  accentColor,
  textColor,
}: {
  orgId: string;
  accentColor: string;
  textColor: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("org_followers")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setSubscribed(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, user]);

  const toggle = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    if (subscribed) {
      const { error } = await supabase
        .from("org_followers")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", user.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else setSubscribed(false);
    } else {
      const { error } = await supabase.from("org_followers").insert({ org_id: orgId, user_id: user.id });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else {
        setSubscribed(true);
        toast({ title: "Subscribed", description: "You'll get updates about new events." });
      }
    }
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="h-10 px-6 rounded-full text-[14px] font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
      style={
        subscribed
          ? { backgroundColor: "transparent", color: textColor, border: `1px solid ${textColor}25` }
          : { backgroundColor: accentColor, color: "#fff" }
      }
    >
      {subscribed ? "Subscribed" : "Subscribe"}
    </button>
  );
}