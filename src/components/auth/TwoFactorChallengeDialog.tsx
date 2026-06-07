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
  email: string;
  /** Called once a valid 6-digit OTP has been confirmed. */
  onVerified: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

/**
 * Email-OTP 2FA challenge. Used both at login (after a successful password
 * sign-in) and for sensitive actions (disabling 2FA, password change).
 * Uses Supabase's built-in OTP — no extra infra needed.
 */
export default function TwoFactorChallengeDialog({
  open, email, onVerified, onCancel, title, description,
}: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode("");
      setSentOnce(false);
      return;
    }
    // Auto-send the first code as soon as the dialog opens.
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sendCode = async () => {
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send code", description: error.message, variant: "destructive" });
    } else {
      setSentOnce(true);
      toast({ title: "Code sent", description: `Check ${email} for a 6-digit code.` });
    }
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      toast({ title: "Invalid code", description: error.message, variant: "destructive" });
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
            {description ?? `Enter the 6-digit code we just sent to ${email}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="otp" className="text-[12px]">Verification code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="h-10 text-center text-lg tracking-widest font-mono"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={sending}
            className="text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {sending ? "Sending…" : sentOnce ? "Resend code" : "Send code"}
          </button>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} className="h-9 text-[13px]">Cancel</Button>
          <Button onClick={verify} disabled={code.length !== 6 || verifying} className="h-9 text-[13px]">
            {verifying ? "Verifying…" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}