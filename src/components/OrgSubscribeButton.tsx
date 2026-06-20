import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/observability";

/**
 * Lu.ma-style "Subscribe" pill for an organization page.
 * Wraps the existing `org_followers` table — subscribing is the same as
 * following, just with attendee-friendly copy and a single primary pill.
 *
 * Implementation notes:
 *   - INSERT goes through `upsert(..., { onConflict: "user_id,org_id" })`
 *     so a stale local state ("you think you're not subscribed but a row
 *     already exists") doesn't surface as a unique-violation error.
 *   - After every action we re-read the canonical state from the DB rather
 *     than trusting the in-memory toggle, so UI and persistence cannot drift.
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
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscribed(false);
      return;
    }
    const { data, error } = await supabase
      .from("org_followers")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logger.warn("org_followers lookup failed", {
        org_id: orgId,
        error_message: error.message,
      });
      return;
    }
    setSubscribed(!!data);
  }, [orgId, user]);

  // Initial state + re-fetch when org/user changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const toggle = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      if (subscribed) {
        const { error } = await supabase
          .from("org_followers")
          .delete()
          .eq("org_id", orgId)
          .eq("user_id", user.id);
        if (error) {
          logger.warn("unsubscribe failed", { org_id: orgId, error_message: error.message });
          toast({ title: "Could not unsubscribe", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Unsubscribed", description: "You'll stop getting updates from this organization." });
        }
      } else {
        // Idempotent: if a row already exists for (user_id, org_id), this is a no-op
        // rather than a unique-violation error. Avoids the "label flips but DB rejects" trap.
        const { error } = await supabase
          .from("org_followers")
          .upsert(
            { org_id: orgId, user_id: user.id },
            { onConflict: "user_id,org_id", ignoreDuplicates: true },
          );
        if (error) {
          logger.warn("subscribe failed", { org_id: orgId, error_message: error.message });
          toast({ title: "Could not subscribe", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Subscribed", description: "You'll get updates about new events." });
        }
      }
      // Always re-read canonical state from the DB so UI ↔ persistence cannot drift.
      await refresh();
    } finally {
      setBusy(false);
    }
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
