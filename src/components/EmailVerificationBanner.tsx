import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MailWarning, X } from "lucide-react";
import { SiteContainer } from "@/components/layout/SiteContainer";

/**
 * Slim banner that appears across the app while a signed-in user has not
 * verified their email. Doesn't block the UI; gating happens at the
 * registration call site (see EventRsvpCard).
 */
export default function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.email_confirmed_at || dismissed) return null;

  const resend = async () => {
    if (!user.email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      toast({ title: "Could not resend", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Verification email sent", description: `Check ${user.email}.` });
    }
  };

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-900 dark:text-amber-200">
      <SiteContainer className="py-2 flex items-center gap-3 text-[13px]">
        <MailWarning className="h-4 w-4 shrink-0" />
        <p className="flex-1 min-w-0">
          Verify your email to register for events. We sent a link to{" "}
          <span className="font-semibold">{user.email}</span>.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px] border-amber-500/40 hover:bg-amber-500/10"
          onClick={resend}
          disabled={sending}
        >
          {sending ? "Sending…" : "Resend"}
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-900/60 hover:text-amber-900 dark:text-amber-200/60 dark:hover:text-amber-200"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </SiteContainer>
    </div>
  );
}