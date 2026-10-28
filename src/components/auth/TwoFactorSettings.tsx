import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Enrolment = { factorId: string; qr: string; secret: string };

/**
 * Settings → Account: turn two-factor sign-in (authenticator app, through
 * Supabase MFA) on or off. Once on, every sign-in asks for the app's code,
 * and the database refuses a session that hasn't given it.
 */
export function TwoFactorSettings() {
  const { toast } = useToast();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp[0]?.id ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const start = async () => {
    setBusy(true);
    // A setup abandoned half way leaves an unverified factor behind; clear it first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) {
      toast({ title: "Couldn't start setup", description: error?.message, variant: "destructive" });
      return;
    }
    setCode("");
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enrolment || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code });
    setBusy(false);
    if (error) {
      setCode("");
      toast({ title: "That code didn't match", description: "Enter the current 6-digit code shown in your app.", variant: "destructive" });
      return;
    }
    setEnrolment(null);
    toast({ title: "Two-factor sign-in is on", description: "You'll be asked for a code from your app each time you sign in." });
    await load();
  };

  const cancelSetup = async () => {
    if (enrolment) await supabase.auth.mfa.unenroll({ factorId: enrolment.factorId });
    setEnrolment(null);
  };

  const turnOff = async () => {
    if (!factorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    setConfirmOff(false);
    if (error) {
      toast({ title: "Couldn't turn it off", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Two-factor sign-in is off" });
    await load();
  };

  return (
    <div className="border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
        {factorId ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />}
        Two-factor sign-in
      </h3>
      <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
        {factorId
          ? "On. Each sign-in asks for the 6-digit code from your authenticator app."
          : "Ask for a code from an authenticator app (Google Authenticator, Authy, 1Password…) as well as your password when you sign in."}
      </p>

      {loading ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
      ) : enrolment ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <p className="text-[12px]">1. Scan this code with your authenticator app.</p>
          <img src={enrolment.qr} alt="QR code to add Illuxus to your authenticator app" className="h-40 w-40 rounded-md bg-white p-2" />
          <p className="text-[11.5px] text-muted-foreground">
            Can't scan it? Enter this key instead: <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{enrolment.secret}</code>
          </p>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
            <Label htmlFor="mfa-code" className="text-[12px]">2. Enter the 6-digit code it shows</Label>
            <div className="flex gap-2">
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="h-8 w-32 text-center font-mono tracking-widest"
              />
              <Button type="submit" size="sm" className="h-8 text-[12px]" disabled={code.length !== 6 || busy}>
                {busy ? "Checking…" : "Turn on"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => { void cancelSetup(); }} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : factorId ? (
        <Button variant="outline" size="sm" className="mt-3 h-8 text-[12px]" onClick={() => setConfirmOff(true)} disabled={busy}>
          Turn off
        </Button>
      ) : (
        <Button size="sm" className="mt-3 h-8 text-[12px]" onClick={() => { void start(); }} disabled={busy}>
          {busy ? "Starting…" : "Set up two-factor sign-in"}
        </Button>
      )}

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off two-factor sign-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will be protected by your password alone. You can turn it back on at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void turnOff(); }}>Turn off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
