import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProfile, profileFullName } from "@/hooks/useMyProfile";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { isValidEmailFormat } from "@/lib/email-format";
import { notifyOrganiserOfApplication } from "@/lib/application-notify";
import { loadStoredUtm } from "@/lib/utm";

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

interface FormData {
  company_name: string;
  company_website: string;
  industry: string;
  company_description: string;
  logo_url: string;
  contact_name: string;
  contact_email: string;
  contact_mobile_number: string;
  contact_designation: string;
  sponsorship_tier: string;
  budget_range: string;
  objectives: string;
  expected_outcomes: string;
  brochure_url: string;
  deck_url: string;
  promotional_url: string;
  notes: string;
}

const TIERS = ["bronze", "silver", "gold", "platinum", "custom"];
const BUDGETS = ["< $1,000", "$1,000 - $5,000", "$5,000 - $10,000", "$10,000 - $25,000", "$25,000+"];

const initialForm = (defaults: Partial<FormData> = {}): FormData => ({
  company_name: "", company_website: "", industry: "", company_description: "", logo_url: "",
  contact_name: "", contact_email: "", contact_mobile_number: "", contact_designation: "",
  sponsorship_tier: "", budget_range: "", objectives: "", expected_outcomes: "",
  brochure_url: "", deck_url: "", promotional_url: "", notes: "",
  ...defaults,
});

export function SponsorApplicationDialog({ eventId, open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>(() =>
    initialForm({
      contact_name: user?.user_metadata?.display_name ?? "",
      contact_email: user?.email ?? "",
    })
  );

  // Prefill empty form fields from the user's profile once it loads.
  // Only fills fields the user has not yet typed into so manual edits
  // are never clobbered.
  useEffect(() => {
    if (!open || !profile) return;
    const composedMobile = [profile.mobile_country_code, profile.mobile_number]
      .filter(Boolean)
      .join(" ")
      .trim();
    setForm((prev) => ({
      ...prev,
      contact_name: prev.contact_name || profileFullName(profile),
      contact_email: prev.contact_email || user?.email || "",
      contact_mobile_number: prev.contact_mobile_number || composedMobile,
      contact_designation: prev.contact_designation || profile.designation || "",
      company_name: prev.company_name || profile.company || "",
      company_website: prev.company_website || profile.company_website || "",
      industry: prev.industry || profile.industry || "",
    }));
  }, [open, profile, user?.email]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validateStep1 = () => {
    if (!form.company_name.trim()) return "Company name is required";
    return null;
  };
  const validateStep2 = () => {
    if (!form.contact_name.trim()) return "Contact name is required";
    if (!form.contact_email.trim()) return "Contact email is required";
    if (!isValidEmailFormat(form.contact_email)) return "Enter a valid contact email (name@domain.tld)";
    return null;
  };

  const submit = async () => {
    if (!user) {
      toast.error("Please sign in to apply");
      return;
    }
    const err = validateStep1() || validateStep2();
    if (err) { toast.error(err); return; }

    setSubmitting(true);

    // First-touch UTM attribution (Requirement 4.1-4.4). Read whatever the
    // tab captured on its Marketing_Landing_Surface entry and stamp the
    // five UTM_Fields onto the row in the same insert. A read failure or
    // unparseable storage collapses to Absent_UTM per Requirement 4.4;
    // storage is NEVER cleared here (Requirement 4.3).
    let utm: ReturnType<typeof loadStoredUtm> = {};
    try {
      utm = loadStoredUtm() ?? {};
    } catch {
      utm = {};
    }

    const { error } = await supabase.from("sponsor_applications" as never).insert({
      event_id: eventId,
      user_id: user.id,
      company_name: form.company_name.trim(),
      company_website: form.company_website.trim() || null,
      industry: form.industry.trim() || null,
      company_description: form.company_description.trim() || null,
      logo_url: form.logo_url.trim() || null,
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim().toLowerCase(),
      contact_mobile_number: form.contact_mobile_number.trim() || null,
      contact_designation: form.contact_designation.trim() || null,
      sponsorship_tier: form.sponsorship_tier || null,
      budget_range: form.budget_range || null,
      objectives: form.objectives.trim() || null,
      expected_outcomes: form.expected_outcomes.trim() || null,
      brochure_url: form.brochure_url.trim() || null,
      deck_url: form.deck_url.trim() || null,
      promotional_url: form.promotional_url.trim() || null,
      notes: form.notes.trim() || null,
      utm_source:   utm.utm_source   ?? null,
      utm_medium:   utm.utm_medium   ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      utm_content:  utm.utm_content  ?? null,
      utm_term:     utm.utm_term     ?? null,
    } as never);

    setSubmitting(false);
    if (error) {
      if (error.message?.includes("duplicate")) {
        toast.error("You have already applied as a sponsor for this event.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Sponsor application submitted! The organizer will review it shortly.");
    qc.invalidateQueries({ queryKey: ["my-sponsor-application", user.id, eventId] });
    qc.invalidateQueries({ queryKey: ["my-applications"] });

    // Fire-and-forget heads-up to the organiser. The applicant's contact
    // email is used in the "Applicant" line so the organiser can reply
    // straight from their inbox; the company name and objectives are the
    // headline + summary, giving them enough to decide whether to deep
    // link into the Applications tab via the link in the body.
    void notifyOrganiserOfApplication({
      eventId,
      kind: "sponsor",
      applicantName: form.contact_name.trim(),
      applicantEmail: form.contact_email.trim().toLowerCase(),
      headline: form.company_name.trim() || null,
      summary: form.objectives.trim() || null,
    });

    onSubmitted?.();
    onOpenChange(false);
    setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Become a Sponsor
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Company info" : step === 2 ? "Contact & Sponsorship" : "Marketing assets"}
          </DialogDescription>
        </DialogHeader>

        {profile && (
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            We've pre-filled fields from your profile — tweak anything before
            submitting.
          </div>
        )}

        <div className="flex gap-1.5 my-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Company name *" value={form.company_name} onChange={(v) => update("company_name", v)} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Company website" value={form.company_website} onChange={(v) => update("company_website", v)} placeholder="https://..." />
              <Field label="Industry" value={form.industry} onChange={(v) => update("industry", v)} />
            </div>
            <TextField label="Company description" value={form.company_description} onChange={(v) => update("company_description", v)} rows={3} />
            <Field label="Logo URL" value={form.logo_url} onChange={(v) => update("logo_url", v)} placeholder="Public URL of your company logo" />
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">Contact person</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name *" value={form.contact_name} onChange={(v) => update("contact_name", v)} />
              <Field label="Email *" type="email" value={form.contact_email} onChange={(v) => update("contact_email", v)} />
              <Field label="Mobile" value={form.contact_mobile_number} onChange={(v) => update("contact_mobile_number", v)} />
              <Field label="Designation" value={form.contact_designation} onChange={(v) => update("contact_designation", v)} />
            </div>

            <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium pt-2">Sponsorship interest</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[12px]">Tier interested in</Label>
                <Select value={form.sponsorship_tier} onValueChange={(v) => update("sponsorship_tier", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select tier…" /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Budget range</Label>
                <Select value={form.budget_range} onValueChange={(v) => update("budget_range", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {BUDGETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <TextField label="Sponsorship objectives" value={form.objectives} onChange={(v) => update("objectives", v)} rows={2} placeholder="What are you hoping to achieve?" />
            <TextField label="Expected outcomes" value={form.expected_outcomes} onChange={(v) => update("expected_outcomes", v)} rows={2} />
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-[12px] text-muted-foreground">Optional — link to public URLs for your marketing assets.</p>
            <Field label="Brochure URL" value={form.brochure_url} onChange={(v) => update("brochure_url", v)} placeholder="https://..." />
            <Field label="Sponsorship deck URL" value={form.deck_url} onChange={(v) => update("deck_url", v)} placeholder="https://..." />
            <Field label="Promotional material URL" value={form.promotional_url} onChange={(v) => update("promotional_url", v)} placeholder="https://..." />
            <TextField label="Additional notes" value={form.notes} onChange={(v) => update("notes", v)} rows={3} />
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
          )}
          {step < 3 ? (
            <Button onClick={() => {
              if (step === 1) {
                const e = validateStep1();
                if (e) { toast.error(e); return; }
              } else if (step === 2) {
                const e = validateStep2();
                if (e) { toast.error(e); return; }
              }
              setStep((s) => Math.min(3, s + 1));
            }}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting…</> : "Submit application"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px]">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-[13px]" />
    </div>
  );
}

function TextField({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px]">{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="text-[13px]" />
    </div>
  );
}
