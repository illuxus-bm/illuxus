import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Copy, Ticket, Link2 } from "lucide-react";
import PersonFieldsForm, { emptyPersonFields, validatePersonFields, displayName, type PersonFields } from "@/components/people/PersonFieldsForm";
import { logger } from "@/lib/observability";

// Secondary Supabase client for creating participant accounts.
// Uses a separate storage key so it won't sign out the organizer.
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { storageKey: "sb-participant-signup", persistSession: false, autoRefreshToken: false } }
);

// Always build share links against the public production domain, never the
// in-editor preview/sandbox host (lovableproject.com / *.lovable.app preview).
const PUBLIC_ORIGIN = "https://illuxus.com";
function publicOrigin() {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  const h = window.location.hostname;
  if (h.endsWith("lovableproject.com") || h.includes("id-preview--") || h.endsWith("lovable.app")) {
    return PUBLIC_ORIGIN;
  }
  return window.location.origin;
}

export default function AddParticipantDialog({ eventId, eventFormat, eventSlug, onAdded }: {
  eventId: string; eventFormat?: string | null; eventSlug?: string; onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<PersonFields>(() => emptyPersonFields());
  const [ticketType, setTicketType] = useState("general");
  const [role, setRole] = useState<"attendee" | "speaker">("attendee");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ join_token: string; qr_code: string; speakerLink?: string } | null>(null);
  const isVirtual = eventFormat === "virtual";

  const reset = () => { setFields(emptyPersonFields()); setTicketType("general"); setRole("attendee"); setCreated(null); };

  const submit = async () => {
    const v = validatePersonFields(fields);
    if (!v.ok) return toast.error(v.error);
    setBusy(true);
    const fullName = displayName(fields);
    const email = fields.email.trim().toLowerCase();
    const mobileNum = fields.mobile_number.trim();

    // ── Step 1 (fast, await): Create the registration row ──────────────────
    // We hit `registrations` first so the organizer sees the success screen
    // (with join link, QR, credentials) in well under a second. Auth signup
    // takes several seconds because it sends the confirmation email server-
    // side; we run that AFTER showing the success state.
    const { data: reg, error } = await supabase.from("registrations").insert({
      event_id: eventId,
      name: fullName,
      email,
      title: fields.title,
      first_name: fields.first_name.trim(),
      last_name: fields.last_name.trim(),
      designation: fields.designation.trim(),
      company: fields.company.trim() || null,
      mobile_country_code: fields.mobile_country_code,
      mobile_number: fields.mobile_number.trim(),
      linkedin_url: fields.linkedin_url.trim() || null,
      company_website: fields.company_website.trim() || null,
      company_employee_count: fields.company_employee_count || null,
      industry: fields.industry || null,
      ticket_type: isVirtual ? "webinar" : ticketType,
      status: "confirmed",
      approval_status: "approved",
    }).select("id, join_token, qr_code").single();
    if (error || !reg) { setBusy(false); return toast.error(error?.message || "Failed to add"); }

    // ── Step 2: Reveal success state immediately ───────────────────────────
    // Speaker link starts undefined; it fills in below once the webinar
    // speaker row is created in the background.
    setCreated({ join_token: reg.join_token, qr_code: reg.qr_code || "", speakerLink: undefined });
    setBusy(false);
    onAdded?.();
    toast.success("Participant added");

    // ── Step 3 (background, fire-and-forget): auth signup, user_id linking,
    // and speaker token. None of this blocks the success screen. Errors
    // here are non-fatal — the registration already exists, the join link
    // already works, and the participant can always be linked to their auth
    // account when they sign in via the magic link or password reset flow.
    void (async () => {
      try {
        let userId: string | null = null;
        let accountAlreadyExists = false;

        if (mobileNum) {
          const { data: existingReg } = await supabase
            .from("registrations")
            .select("user_id")
            .eq("email", email)
            .not("user_id", "is", null)
            .limit(1)
            .maybeSingle();

          if (existingReg?.user_id) {
            userId = existingReg.user_id;
            accountAlreadyExists = true;
          } else {
            const { data: signUpResult, error: signUpErr } = await anonClient.auth.signUp({
              email,
              password: mobileNum,
              options: {
                emailRedirectTo: `${window.location.origin}/login`,
                data: {
                  must_change_password: true,
                  account_type: "attendee",
                  title: fields.title || "",
                  first_name: fields.first_name.trim(),
                  last_name: fields.last_name.trim(),
                  designation: fields.designation.trim(),
                  company: fields.company.trim() || "",
                  mobile_country_code: fields.mobile_country_code,
                  mobile_number: mobileNum,
                  linkedin_url: fields.linkedin_url.trim() || "",
                  company_website: fields.company_website.trim() || "",
                  company_employee_count: fields.company_employee_count || "",
                  industry: fields.industry || "",
                  display_name: fullName,
                },
              },
            });
            if (signUpErr) {
              if (signUpErr.message?.includes("already")) accountAlreadyExists = true;
              else logger.warn("signup error", {
                error_message: signUpErr instanceof Error ? signUpErr.message : String(signUpErr),
              });
            } else if (signUpResult?.user) {
              userId = signUpResult.user.id;
            }
          }
        }

        // Link this registration (and any other unlinked rows for the same
        // email) to the resolved user. Done after-the-fact so the join link
        // works regardless.
        if (userId) {
          await Promise.all([
            supabase.from("registrations").update({ user_id: userId }).eq("id", reg.id),
            supabase.from("registrations")
              .update({ user_id: userId })
              .eq("email", email)
              .is("user_id", null),
          ]);
        }

        // Webinar speaker token (only for virtual events when role === speaker).
        if (isVirtual && role === "speaker") {
          const { data: sess } = await supabase.from("webinar_sessions")
            .select("id").eq("event_id", eventId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (sess) {
            const { data: sp } = await supabase.from("webinar_speakers").insert({
              session_id: sess.id, email, display_name: fullName, role: "speaker",
            }).select("invite_token").single();
            if (sp) {
              const link = `${publicOrigin()}/e/${eventSlug || eventId}/live?speaker=${sp.invite_token}`;
              setCreated((prev) => prev ? { ...prev, speakerLink: link } : prev);
            }
          } else {
            toast.warning("No webinar session yet — speaker can join once you create one.");
          }
        }

        if (accountAlreadyExists) {
          toast.message("Existing account linked", { description: email });
        } else if (mobileNum) {
          toast.message("Confirmation email sent", { description: email });
        }
      } catch (bgErr) {
        logger.warn("add-participant background work failed", {
          error_message: bgErr instanceof Error ? bgErr.message : String(bgErr),
        });
      }
    })();
  };

  const joinUrl = created ? `${publicOrigin()}/e/${eventSlug || eventId}/live?join=${created.join_token}` : "";
  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success("Copied"); };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-[12px] gap-1.5"><UserPlus className="h-3 w-3" /> Add participant</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add participant</DialogTitle></DialogHeader>
        {!created ? (
          <div className="space-y-3">
            <PersonFieldsForm value={fields} onChange={setFields} />
            {isVirtual && (
              <div>
                <Label className="text-[12px]">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "attendee" | "speaker")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attendee">Attendee</SelectItem>
                    <SelectItem value="speaker">Speaker (on-stage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              A confirmation email has been sent to <span className="font-medium text-foreground">{fields.email}</span>.
              Once confirmed, they can sign in with their email and phone number as password.
            </p>
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-[12px] font-medium">Login credentials for participant:</p>
              <p className="text-[12px] text-muted-foreground">Email: <span className="font-mono text-foreground">{fields.email}</span></p>
              <p className="text-[12px] text-muted-foreground">Password: <span className="font-mono text-foreground">{fields.mobile_number}</span> (phone number)</p>
              <p className="text-[11px] text-muted-foreground italic mt-1">They'll be asked to change their password on first sign-in.</p>
            </div>
            <p className="text-[12px] text-muted-foreground">Share the details below with <span className="font-medium text-foreground">{displayName(fields)}</span>:</p>
            {isVirtual ? (
              <>
                <div className="space-y-1">
                  <Label className="text-[12px] flex items-center gap-1"><Link2 className="h-3 w-3" /> Unique join link</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={joinUrl} className="font-mono text-[12px]" />
                    <Button size="icon" variant="outline" onClick={() => copy(joinUrl)}><Copy className="h-3 w-3" /></Button>
                  </div>
                </div>
                {created.speakerLink && (
                  <div className="space-y-1">
                    <Label className="text-[12px]">Speaker link (publish on stage)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={created.speakerLink} className="font-mono text-[12px]" />
                      <Button size="icon" variant="outline" onClick={() => copy(created.speakerLink!)}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <Label className="text-[12px] flex items-center gap-1"><Ticket className="h-3 w-3" /> Ticket code</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.qr_code} className="font-mono text-[12px]" />
                  <Button size="icon" variant="outline" onClick={() => copy(created.qr_code)}><Copy className="h-3 w-3" /></Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Scan at the door using QR Scanner.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Add another</Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}