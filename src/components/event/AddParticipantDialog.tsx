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
    const { data, error } = await supabase.from("registrations").insert({
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
      ticket_type: isVirtual ? "webinar" : ticketType, status: "confirmed", approval_status: "approved",
    }).select("id, join_token, qr_code").single();
    if (error || !data) { setBusy(false); return toast.error(error?.message || "Failed to add"); }

    let speakerLink: string | undefined;
    if (isVirtual && role === "speaker") {
      const { data: sess } = await supabase.from("webinar_sessions").select("id").eq("event_id", eventId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (sess) {
        const { data: sp } = await supabase.from("webinar_speakers").insert({
          session_id: sess.id, email, display_name: fullName, role: "speaker",
        }).select("invite_token").single();
        if (sp) speakerLink = `${publicOrigin()}/e/${eventSlug || eventId}/live?speaker=${sp.invite_token}`;
      } else {
        toast.warning("No webinar session yet — speaker can join once you create one.");
      }
    }
    setCreated({ join_token: data.join_token, qr_code: data.qr_code || "", speakerLink });
    setBusy(false);
    onAdded?.();
    toast.success("Participant added");
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
            <p className="text-[13px] text-muted-foreground">Share this with <span className="font-medium text-foreground">{displayName(fields)}</span>. One link, one device — joining elsewhere signs them out.</p>
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