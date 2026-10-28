import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  /** Called once the code is accepted and the session is upgraded to aal2. */
  onVerified: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

/**
 * Authenticator-app (TOTP) challenge, through Supabase MFA. Passing it
 * upgrades the session to `aal2`; the database and the edge functions refuse
 * an `aal1` session of anyone who has two-factor on, so skipping this dialog
 * gets nothing.
 */
export default function TwoFactorChallengeDialog({
  open, onVerified, onCancel, title, description,
}: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) setCode("");
  }, [open]);

  const verify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp[0];
    if (listError || !factor) {
      setVerifying(false);
      toast({ title: "Couldn't verify", description: listError?.message ?? "No authenticator is set up for this account.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setVerifying(false);
    if (error) {
      setCode("");
      toast({ title: "Invalid code", description: "Check your authenticator app and try the current code.", variant: "destructive" });
      return;
    }
    onVerified();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" />
          </div>
          <DialogTitle>{title ?? "Two-factor verification"}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {description ?? "Enter the 6-digit code from your authenticator app."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <Label htmlFor="otp" className="text-[12px]">Authenticator code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="h-10 text-center text-lg tracking-widest font-mono"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="h-9 text-[13px]">Cancel</Button>
            <Button type="submit" disabled={code.length !== 6 || verifying} className="h-9 text-[13px]">
              {verifying ? "Verifying…" : "Verify"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
