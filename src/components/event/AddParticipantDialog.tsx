import { useState } from "react";
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
import { publicOrigin } from "@/lib/publicUrl";

/**
 * AddParticipantDialog — organiser-side single-participant add flow.
 *
 * Email contract (simplified — see migration 019 + the "one mail only" issue):
 *  • Exactly ONE email goes out to the participant: the ticket email
 *    (banner + QR + organiser block) via `send-ticket-email`.
 *  • No welcome-with-credentials email, no auto-signup, no phone-number-as-
 *    initial-password mechanic. If the participant already has an account
 *    they sign in normally; if not, they create one themselves via the
 *    standard signup flow. Either way, the `handle_new_user` trigger
 *    (migration 019) auto-links the existing registration to the new
 *    auth.users.id when the email matches, so the ticket is visible
 *    immediately.
 *
 * Duplicate guard:
 *  • App-level: pre-flight `SELECT … FROM registrations` blocks an add
 *    when the same email is already a registrant.
 *  • DB-level: partial unique index `registrations_event_email_unique`
 *    (migration 019) makes the constraint race-safe across multiple
 *    organisers and any retry storm.
 */
export default function AddParticipantDialog({ eventId, eventFormat, eventSlug, onAdded }: {
  eventId: string; eventFormat?: string | null; eventSlug?: string; onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<PersonFields>(() => emptyPersonFields());
  const [role, setRole] = useState<"" | "attendee" | "speaker" | "sponsor">("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ join_token: string; qr_code: string; speakerLink?: string } | null>(null);
  const isVirtual = eventFormat === "virtual";

  const reset = () => { setFields(emptyPersonFields()); setRole(""); setCreated(null); };

  const submit = async () => {
    const v = validatePersonFields(fields);
    if (!v.ok) return toast.error(v.error);
    if (!role) return toast.error("Pick a role for this participant (Attendee, Speaker, or Sponsor)");
    setBusy(true);
    const fullName = displayName(fields);
    const email = fields.email.trim().toLowerCase();

    // ── App-level duplicate guard ──────────────────────────────────────────
    // The DB has a unique index too (migration 019), but checking here gives
    // a clean message instead of a Postgres unique-violation toast.
    const { data: existing, error: existingErr } = await supabase
      .from("registrations")
      .select("id, name, status, approval_status, checked_in_at")
      .eq("event_id", eventId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (existingErr) {
      setBusy(false);
      return toast.error("Could not verify duplicates", { description: existingErr.message });
    }
    if (existing) {
      setBusy(false);
      const who = existing.name ? `${existing.name} (${email})` : email;
      const verb = existing.checked_in_at
        ? "has already checked in"
        : existing.approval_status === "approved" || existing.status === "confirmed"
          ? "has already been added"
          : "is already registered (pending approval)";
      return toast.error(`${who} ${verb} for this event.`);
    }

    const resolvedTicketType =
      role === "speaker" ? "speaker" :
      role === "sponsor" ? "sponsor" :
      isVirtual ? "webinar" : "general";

    // ── Create the registration row ────────────────────────────────────────
    // `user_id` stays NULL on purpose. The `handle_new_user` trigger
    // (migration 019) stamps it when the participant signs up using the
    // same email. Until then, the ticket email's "View your ticket" link
    // routes them through /login (where they can either sign in or create
    // a new account).
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
      ticket_type: resolvedTicketType,
      status: "confirmed",
      approval_status: "approved",
    }).select("id, join_token, qr_code").single();

    if (error || !reg) {
      setBusy(false);
      // Surface the DB unique-violation in a friendly way when the app-level
      // check raced against a concurrent add.
      if (error?.code === "23505" || error?.message?.includes("registrations_event_email_unique")) {
        return toast.error(`${email} has already been added or checked in for this event.`);
      }
      return toast.error(error?.message || "Failed to add");
    }

    setCreated({ join_token: reg.join_token, qr_code: reg.qr_code || "", speakerLink: undefined });
    setBusy(false);
    onAdded?.();
    toast.success("Participant added");

    // ── Background: speaker token (virtual only) + ticket email ───────────
    // Single email, fire-and-forget. Any failure is non-fatal because the
    // registration row already exists and is visible on the organiser's
    // dashboard.
    void (async () => {
      try {
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

        const { data: emailData, error: emailErr } = await supabase.functions.invoke(
          "send-ticket-email",
          { body: { registration_id: reg.id } },
        );
        if (emailErr) {
          toast.warning("Ticket email failed", {
            description: emailErr.message || "send-ticket-email is unreachable",
          });
          return;
        }
        type R = { ok?: boolean; delivered?: boolean; error?: string; note?: string };
        const r = (emailData ?? null) as R | null;
        if (r?.error) {
          toast.warning("Ticket email failed", { description: r.error });
          return;
        }
        if (r?.delivered === false) {
          toast.message("Ticket email skipped", {
            description: r.note || "SMTP not configured in Supabase secrets.",
          });
          return;
        }
        toast.message("Ticket email sent", { description: email });
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
            <div>
              <Label className="text-[12px]">Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendee">Attendee</SelectItem>
                  <SelectItem value="speaker">Speaker{isVirtual ? " (on-stage)" : ""}</SelectItem>
                  <SelectItem value="sponsor">Sponsor</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Used on the ticket and in the attendee list.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !role}>{busy ? "Adding…" : "Add"}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              The ticket email has been sent to <span className="font-medium text-foreground">{fields.email}</span>.
              They can view their ticket from the link in the email after signing in (or creating a new account if they
              don't have one — same email).
            </p>
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
