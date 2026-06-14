import { useState } from "react";
import {
  useEventSpeakerApplications,
  useEventSponsorApplications,
  useApproveSpeakerApplication,
  useRejectSpeakerApplication,
  useApproveSponsorApplication,
  useRejectSponsorApplication,
} from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Mic, Building2, CheckCircle2, XCircle, Clock, Mail, Linkedin, Globe,
  Briefcase, ExternalLink,
} from "lucide-react";
import type {
  ApplicationStatus, SpeakerApplication, SponsorApplication,
} from "@/types/applications";

type Tab = "pending" | "approved" | "rejected" | "all";

export function ApplicationsSection({ eventId }: { eventId: string }) {
  const [type, setType] = useState<"speaker" | "sponsor">("speaker");
  const [tab, setTab] = useState<Tab>("pending");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Applications</h2>
        <p className="text-[13px] text-muted-foreground">
          Review speaker and sponsor applications for this event.
        </p>
      </div>

      {/* Type tabs */}
      <div className="inline-flex rounded-md border border-border overflow-hidden text-[13px]">
        <button
          onClick={() => setType("speaker")}
          className={`px-4 py-1.5 inline-flex items-center gap-1.5 ${
            type === "speaker" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          }`}
        >
          <Mic className="h-3.5 w-3.5" /> Speaker
        </button>
        <button
          onClick={() => setType("sponsor")}
          className={`px-4 py-1.5 inline-flex items-center gap-1.5 ${
            type === "sponsor" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" /> Sponsor
        </button>
      </div>

      {type === "speaker" ? (
        <SpeakerApplicationsList eventId={eventId} tab={tab} setTab={setTab} />
      ) : (
        <SponsorApplicationsList eventId={eventId} tab={tab} setTab={setTab} />
      )}
    </div>
  );
}

/**
 * Speaker-only applications panel — embedded inside the per-event Speakers
 * tab so organisers can review applicants alongside the speaker roster.
 */
export function SpeakerApplicationsPanel({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<Tab>("pending");
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">Speaker applications</h3>
        <p className="text-[12px] text-muted-foreground">
          Review and approve people who applied to speak at this event.
        </p>
      </div>
      <SpeakerApplicationsList eventId={eventId} tab={tab} setTab={setTab} />
    </div>
  );
}

/**
 * Sponsor-only applications panel — embedded inside the per-event Sponsors
 * tab so organisers can review applicants alongside the sponsor roster.
 */
export function SponsorApplicationsPanel({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<Tab>("pending");
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">Sponsor applications</h3>
        <p className="text-[12px] text-muted-foreground">
          Review and approve companies that applied to sponsor this event.
        </p>
      </div>
      <SponsorApplicationsList eventId={eventId} tab={tab} setTab={setTab} />
    </div>
  );
}

// ─── Speaker applications ─────────────────────────────────────────────────────

function SpeakerApplicationsList({
  eventId, tab, setTab,
}: { eventId: string; tab: Tab; setTab: (t: Tab) => void }) {
  const { data: apps = [], isLoading } = useEventSpeakerApplications(eventId);
  const approve = useApproveSpeakerApplication();
  const reject = useRejectSpeakerApplication();
  const [selected, setSelected] = useState<SpeakerApplication | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SpeakerApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filtered = apps.filter((a) => tab === "all" || a.status === tab);
  const counts = countByStatus(apps);

  const handleApprove = async (app: SpeakerApplication) => {
    try {
      await approve.mutateAsync(app.id);
      toast.success(`${app.full_name} approved as speaker`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({ appId: rejectTarget.id, reason: rejectReason || undefined });
      toast.success("Application rejected");
      setRejectTarget(null);
      setRejectReason("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <StatusTabs tab={tab} setTab={setTab} counts={counts} />
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[13px] text-muted-foreground py-12">
          No {tab === "all" ? "" : tab} applications.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <SpeakerApplicationRow
              key={app.id}
              app={app}
              onView={() => setSelected(app)}
              onApprove={() => handleApprove(app)}
              onReject={() => setRejectTarget(app)}
              busy={approve.isPending}
            />
          ))}
        </div>
      )}

      {selected && (
        <SpeakerApplicationDetailDialog
          app={selected}
          onClose={() => setSelected(null)}
          onApprove={() => { handleApprove(selected); setSelected(null); }}
          onReject={() => { setRejectTarget(selected); setSelected(null); }}
        />
      )}

      <RejectDialog
        target={rejectTarget?.full_name}
        open={!!rejectTarget}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => { setRejectTarget(null); setRejectReason(""); }}
        onConfirm={handleReject}
        busy={reject.isPending}
      />
    </>
  );
}

function SpeakerApplicationRow({
  app, onView, onApprove, onReject, busy,
}: {
  app: SpeakerApplication;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[14px]">{app.full_name}</p>
            <StatusPill status={app.status} />
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {app.job_title}{app.company ? ` · ${app.company}` : ""}
          </p>
          <p className="text-[13px] mt-2 line-clamp-2">
            <span className="font-medium">Proposed:</span> {app.session_title}
          </p>
          {app.expertise && (
            <p className="text-[12px] text-muted-foreground mt-1">
              Expertise: {app.expertise}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            Applied {new Date(app.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={onView}>
            View
          </Button>
          {app.status === "pending" && (
            <>
              <Button
                size="sm"
                className="h-8 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onApprove}
                disabled={busy}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px] text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={onReject}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeakerApplicationDetailDialog({
  app, onClose, onApprove, onReject,
}: {
  app: SpeakerApplication;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{app.full_name}</DialogTitle>
          <DialogDescription>{app.job_title}{app.company ? ` at ${app.company}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          <Section title="Contact">
            <div className="grid sm:grid-cols-2 gap-2">
              <Field icon={Mail} label="Email" value={app.email} />
              {app.mobile_number && <Field label="Mobile" value={`${app.mobile_country_code ?? ""} ${app.mobile_number}`} />}
              {app.linkedin_url && <Field icon={Linkedin} label="LinkedIn" value={app.linkedin_url} link />}
              {app.portfolio_url && <Field icon={Globe} label="Portfolio" value={app.portfolio_url} link />}
            </div>
          </Section>

          <Section title="Professional">
            <div className="grid sm:grid-cols-2 gap-2">
              {app.years_experience !== null && <Field label="Years experience" value={String(app.years_experience)} />}
              {app.industry && <Field label="Industry" value={app.industry} />}
            </div>
          </Section>

          {app.bio && <Section title="Bio"><p className="leading-relaxed">{app.bio}</p></Section>}
          {app.expertise && <Section title="Expertise"><p>{app.expertise}</p></Section>}
          {app.topics && <Section title="Topics"><p>{app.topics}</p></Section>}
          {app.past_experience && <Section title="Past speaking experience"><p>{app.past_experience}</p></Section>}

          <Section title="Session proposal">
            <p className="font-medium">{app.session_title}</p>
            <p className="text-muted-foreground mt-1.5">{app.session_description}</p>
            {app.key_takeaways && (
              <>
                <p className="font-medium mt-3 text-[12px]">Key takeaways</p>
                <p className="text-muted-foreground">{app.key_takeaways}</p>
              </>
            )}
            <div className="grid sm:grid-cols-3 gap-2 mt-3 text-[12px]">
              {app.target_audience && <Field label="Audience" value={app.target_audience} />}
              {app.session_category && <Field label="Category" value={app.session_category} />}
              {app.session_duration_minutes && <Field label="Duration" value={`${app.session_duration_minutes} min`} />}
            </div>
          </Section>

          {(app.past_videos_url || app.resume_url || app.notes) && (
            <Section title="Additional">
              <div className="space-y-1.5">
                {app.past_videos_url && <Field icon={ExternalLink} label="Past videos" value={app.past_videos_url} link />}
                {app.resume_url && <Field icon={Briefcase} label="Resume" value={app.resume_url} link />}
                {app.notes && <p className="text-muted-foreground">{app.notes}</p>}
              </div>
            </Section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {app.status === "pending" && (
            <>
              <Button variant="outline" className="text-destructive border-destructive/30" onClick={onReject}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApprove}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sponsor applications ─────────────────────────────────────────────────────

function SponsorApplicationsList({
  eventId, tab, setTab,
}: { eventId: string; tab: Tab; setTab: (t: Tab) => void }) {
  const { data: apps = [], isLoading } = useEventSponsorApplications(eventId);
  const approve = useApproveSponsorApplication();
  const reject = useRejectSponsorApplication();
  const [selected, setSelected] = useState<SponsorApplication | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SponsorApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filtered = apps.filter((a) => tab === "all" || a.status === tab);
  const counts = countByStatus(apps);

  const handleApprove = async (app: SponsorApplication) => {
    try {
      await approve.mutateAsync(app.id);
      toast.success(`${app.company_name} approved as sponsor`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({ appId: rejectTarget.id, reason: rejectReason || undefined });
      toast.success("Application rejected");
      setRejectTarget(null);
      setRejectReason("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <StatusTabs tab={tab} setTab={setTab} counts={counts} />
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[13px] text-muted-foreground py-12">
          No {tab === "all" ? "" : tab} applications.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <SponsorApplicationRow
              key={app.id}
              app={app}
              onView={() => setSelected(app)}
              onApprove={() => handleApprove(app)}
              onReject={() => setRejectTarget(app)}
              busy={approve.isPending}
            />
          ))}
        </div>
      )}

      {selected && (
        <SponsorApplicationDetailDialog
          app={selected}
          onClose={() => setSelected(null)}
          onApprove={() => { handleApprove(selected); setSelected(null); }}
          onReject={() => { setRejectTarget(selected); setSelected(null); }}
        />
      )}

      <RejectDialog
        target={rejectTarget?.company_name}
        open={!!rejectTarget}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => { setRejectTarget(null); setRejectReason(""); }}
        onConfirm={handleReject}
        busy={reject.isPending}
      />
    </>
  );
}

function SponsorApplicationRow({
  app, onView, onApprove, onReject, busy,
}: {
  app: SponsorApplication;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 flex gap-3">
          {app.logo_url && (
            <img src={app.logo_url} alt="" className="h-12 w-12 rounded object-contain bg-white border border-border shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[14px]">{app.company_name}</p>
              <StatusPill status={app.status} />
              {app.sponsorship_tier && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                  {app.sponsorship_tier}
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {app.contact_name} · {app.contact_email}
            </p>
            {app.budget_range && (
              <p className="text-[12px] text-muted-foreground mt-1">Budget: {app.budget_range}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Applied {new Date(app.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={onView}>View</Button>
          {app.status === "pending" && (
            <>
              <Button
                size="sm"
                className="h-8 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onApprove}
                disabled={busy}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px] text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={onReject}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SponsorApplicationDetailDialog({
  app, onClose, onApprove, onReject,
}: {
  app: SponsorApplication;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{app.company_name}</DialogTitle>
          <DialogDescription>
            {app.industry || "Sponsorship application"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          <Section title="Company">
            <div className="grid sm:grid-cols-2 gap-2">
              {app.company_website && <Field icon={Globe} label="Website" value={app.company_website} link />}
              {app.industry && <Field label="Industry" value={app.industry} />}
            </div>
            {app.company_description && (
              <p className="mt-2 text-muted-foreground leading-relaxed">{app.company_description}</p>
            )}
          </Section>

          <Section title="Contact">
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Name" value={app.contact_name} />
              <Field icon={Mail} label="Email" value={app.contact_email} />
              {app.contact_designation && <Field label="Designation" value={app.contact_designation} />}
              {app.contact_mobile_number && <Field label="Mobile" value={`${app.contact_mobile_country_code ?? ""} ${app.contact_mobile_number}`} />}
            </div>
          </Section>

          <Section title="Sponsorship">
            <div className="grid sm:grid-cols-2 gap-2">
              {app.sponsorship_tier && <Field label="Tier" value={app.sponsorship_tier} />}
              {app.budget_range && <Field label="Budget" value={app.budget_range} />}
            </div>
            {app.objectives && (
              <>
                <p className="font-medium mt-3 text-[12px]">Objectives</p>
                <p className="text-muted-foreground">{app.objectives}</p>
              </>
            )}
            {app.expected_outcomes && (
              <>
                <p className="font-medium mt-3 text-[12px]">Expected outcomes</p>
                <p className="text-muted-foreground">{app.expected_outcomes}</p>
              </>
            )}
          </Section>

          {(app.brochure_url || app.deck_url || app.promotional_url || app.notes) && (
            <Section title="Marketing assets">
              <div className="space-y-1.5">
                {app.brochure_url && <Field icon={ExternalLink} label="Brochure" value={app.brochure_url} link />}
                {app.deck_url && <Field icon={ExternalLink} label="Deck" value={app.deck_url} link />}
                {app.promotional_url && <Field icon={ExternalLink} label="Promotional" value={app.promotional_url} link />}
                {app.notes && <p className="text-muted-foreground">{app.notes}</p>}
              </div>
            </Section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {app.status === "pending" && (
            <>
              <Button variant="outline" className="text-destructive border-destructive/30" onClick={onReject}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApprove}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function StatusTabs({
  tab, setTab, counts,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  counts: Record<ApplicationStatus, number>;
}) {
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "rejected", label: "Rejected", count: counts.rejected },
    { key: "all", label: "All" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-3 py-1.5 ${
            tab === t.key
              ? "bg-secondary text-foreground"
              : "bg-background hover:bg-muted text-muted-foreground"
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="ml-1.5 text-[10px] bg-muted px-1 rounded">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function countByStatus<T extends { status: ApplicationStatus }>(apps: T[]): Record<ApplicationStatus, number> {
  return apps.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }),
    { pending: 0, under_review: 0, approved: 0, rejected: 0 } as Record<ApplicationStatus, number>
  );
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  const c: Record<ApplicationStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
    pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
    under_review: { label: "Under review", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Clock },
    approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive", icon: XCircle },
  };
  const x = c[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${x.cls}`}>
      <x.icon className="h-2.5 w-2.5" />
      {x.label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-3 last:border-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  icon: Icon, label, value, link,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-[13px] text-primary hover:underline truncate block">
          {value}
        </a>
      ) : (
        <p className="text-[13px] truncate">{value}</p>
      )}
    </div>
  );
}

function RejectDialog({
  target, open, reason, onReasonChange, onCancel, onConfirm, busy,
}: {
  target?: string;
  open: boolean;
  reason: string;
  onReasonChange: (r: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject application?</DialogTitle>
          <DialogDescription>
            {target ? <>Reject the application from <span className="font-medium text-foreground">{target}</span>?</> : "Reject this application?"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-[12px]">Reason (optional, sent to applicant)</Label>
          <Textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} rows={3} placeholder="Explain why this is being rejected…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
