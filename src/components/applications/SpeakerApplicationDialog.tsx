import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mic, Loader2 } from "lucide-react";

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

interface FormData {
  full_name: string;
  email: string;
  mobile_number: string;
  linkedin_url: string;
  portfolio_url: string;
  job_title: string;
  company: string;
  years_experience: string;
  industry: string;
  bio: string;
  expertise: string;
  topics: string;
  past_experience: string;
  session_title: string;
  session_description: string;
  key_takeaways: string;
  target_audience: string;
  session_category: string;
  session_duration_minutes: string;
  past_videos_url: string;
  resume_url: string;
  notes: string;
}

const initialForm = (defaults: Partial<FormData> = {}): FormData => ({
  full_name: "", email: "", mobile_number: "", linkedin_url: "", portfolio_url: "",
  job_title: "", company: "", years_experience: "", industry: "",
  bio: "", expertise: "", topics: "", past_experience: "",
  session_title: "", session_description: "", key_takeaways: "", target_audience: "",
  session_category: "", session_duration_minutes: "30",
  past_videos_url: "", resume_url: "", notes: "",
  ...defaults,
});

export function SpeakerApplicationDialog({ eventId, open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>(() =>
    initialForm({
      full_name: user?.user_metadata?.display_name ?? "",
      email: user?.email ?? "",
    })
  );

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validateStep1 = () => {
    if (!form.full_name.trim()) return "Full name is required";
    if (!form.email.trim()) return "Email is required";
    return null;
  };

  const validateStep3 = () => {
    if (!form.session_title.trim()) return "Session title is required";
    if (!form.session_description.trim()) return "Session description is required";
    return null;
  };

  const submit = async () => {
    if (!user) {
      toast.error("Please sign in to apply");
      return;
    }
    const err = validateStep1() || validateStep3();
    if (err) { toast.error(err); return; }

    setSubmitting(true);
    const { error } = await supabase.from("speaker_applications" as never).insert({
      event_id: eventId,
      user_id: user.id,
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      mobile_number: form.mobile_number.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      portfolio_url: form.portfolio_url.trim() || null,
      job_title: form.job_title.trim() || null,
      company: form.company.trim() || null,
      years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      industry: form.industry.trim() || null,
      bio: form.bio.trim() || null,
      expertise: form.expertise.trim() || null,
      topics: form.topics.trim() || null,
      past_experience: form.past_experience.trim() || null,
      session_title: form.session_title.trim(),
      session_description: form.session_description.trim(),
      key_takeaways: form.key_takeaways.trim() || null,
      target_audience: form.target_audience.trim() || null,
      session_category: form.session_category.trim() || null,
      session_duration_minutes: form.session_duration_minutes ? parseInt(form.session_duration_minutes) : null,
      past_videos_url: form.past_videos_url.trim() || null,
      resume_url: form.resume_url.trim() || null,
      notes: form.notes.trim() || null,
    } as never);

    setSubmitting(false);
    if (error) {
      if (error.message?.includes("duplicate")) {
        toast.error("You have already applied as a speaker for this event.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Speaker application submitted! The organizer will review it shortly.");
    qc.invalidateQueries({ queryKey: ["my-speaker-application", user.id, eventId] });
    qc.invalidateQueries({ queryKey: ["my-applications"] });
    onSubmitted?.();
    onOpenChange(false);
    setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" /> Apply as Speaker
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Personal & Professional info" : step === 2 ? "Speaker profile" : "Session proposal"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1.5 my-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {/* Step 1 — Personal & professional */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Full name *" value={form.full_name} onChange={(v) => update("full_name", v)} />
              <Field label="Email *" type="email" value={form.email} onChange={(v) => update("email", v)} />
              <Field label="Mobile number" value={form.mobile_number} onChange={(v) => update("mobile_number", v)} />
              <Field label="LinkedIn URL" value={form.linkedin_url} onChange={(v) => update("linkedin_url", v)} placeholder="https://linkedin.com/in/..." />
              <Field label="Portfolio website" value={form.portfolio_url} onChange={(v) => update("portfolio_url", v)} placeholder="https://..." />
              <Field label="Industry" value={form.industry} onChange={(v) => update("industry", v)} />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Current job title" value={form.job_title} onChange={(v) => update("job_title", v)} />
              <Field label="Company" value={form.company} onChange={(v) => update("company", v)} />
              <Field label="Years of experience" type="number" value={form.years_experience} onChange={(v) => update("years_experience", v)} />
            </div>
          </div>
        )}

        {/* Step 2 — Speaker profile */}
        {step === 2 && (
          <div className="space-y-4">
            <TextField label="Professional bio" value={form.bio} onChange={(v) => update("bio", v)} rows={3} placeholder="A short bio about you (max 500 chars)" />
            <Field label="Areas of expertise" value={form.expertise} onChange={(v) => update("expertise", v)} placeholder="e.g. Cloud Architecture, AI/ML, Product Management" />
            <Field label="Topics of interest" value={form.topics} onChange={(v) => update("topics", v)} placeholder="What you'd like to talk about" />
            <TextField label="Previous speaking experience" value={form.past_experience} onChange={(v) => update("past_experience", v)} rows={3} placeholder="Past conferences, talks, or events you've spoken at" />
          </div>
        )}

        {/* Step 3 — Session proposal */}
        {step === 3 && (
          <div className="space-y-4">
            <Field label="Proposed session title *" value={form.session_title} onChange={(v) => update("session_title", v)} />
            <TextField label="Session description *" value={form.session_description} onChange={(v) => update("session_description", v)} rows={4} placeholder="What is your session about?" />
            <TextField label="Key takeaways" value={form.key_takeaways} onChange={(v) => update("key_takeaways", v)} rows={2} placeholder="What will the audience learn?" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Target audience" value={form.target_audience} onChange={(v) => update("target_audience", v)} placeholder="e.g. Engineers, designers" />
              <Field label="Category / Track" value={form.session_category} onChange={(v) => update("session_category", v)} placeholder="e.g. Tech, Business" />
              <Field label="Session duration (min)" type="number" value={form.session_duration_minutes} onChange={(v) => update("session_duration_minutes", v)} />
              <Field label="Past videos URL" value={form.past_videos_url} onChange={(v) => update("past_videos_url", v)} placeholder="https://..." />
            </div>
            <Field label="Resume / CV URL" value={form.resume_url} onChange={(v) => update("resume_url", v)} placeholder="Link to a public PDF" />
            <TextField label="Additional notes" value={form.notes} onChange={(v) => update("notes", v)} rows={2} />
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
              }
              setStep((s) => Math.min(3, s + 1));
            }}>
              Next
            </Button>
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
