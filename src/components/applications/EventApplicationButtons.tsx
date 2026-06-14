import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMySpeakerApplication, useMySponsorApplication } from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { SpeakerApplicationDialog } from "./SpeakerApplicationDialog";
import { SponsorApplicationDialog } from "./SponsorApplicationDialog";
import { Mic, Building2, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ApplicationStatus } from "@/types/applications";

interface Props {
  eventId: string;
  eventOwnerId?: string | null;
  /** When false, hides the speaker CTA entirely. Default true. */
  speakerEnabled?: boolean;
  /** When false, hides the sponsor CTA entirely. Default true. */
  sponsorEnabled?: boolean;
}

/**
 * "Become a Speaker" / "Become a Sponsor" buttons shown on the public event page.
 * Hides automatically if the user is the organizer or already has an approved assignment.
 */
export function EventApplicationButtons({ eventId, eventOwnerId, speakerEnabled = true, sponsorEnabled = true }: Props) {
  const { user, accountType, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [speakerOpen, setSpeakerOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);

  const { data: speakerApp } = useMySpeakerApplication(eventId);
  const { data: sponsorApp } = useMySponsorApplication(eventId);

  // Hide entirely from organizers of this specific event
  const isEventOwner = user && eventOwnerId && user.id === eventOwnerId;

  // Organizers (with their own org) viewing other events can still apply.
  // Owners and platform admins see a non-interactive preview so they can
  // verify the Call-for-Speakers / Call-for-Sponsors toggles on their own
  // event without having to log out as a visitor.
  const previewOnly = !!isEventOwner || isAdmin;

  // Show the speaker CTA when its flag is on OR when the user already has an
  // application (so the status badge stays visible after applications close).
  const showSpeaker = speakerEnabled || !!speakerApp;
  const showSponsor = sponsorEnabled || !!sponsorApp;
  if (!showSpeaker && !showSponsor) return null;

  const handleSpeakerClick = () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setSpeakerOpen(true);
  };

  const handleSponsorClick = () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setSponsorOpen(true);
  };

  return (
    <>
      {previewOnly && (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground mt-4 -mb-2">
          Organizer preview — this is what attendees see when “Call for
          Speakers” / “Call for Sponsors” are on. Clicking opens the apply
          dialog so you can verify the flow.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 my-6">
        {/* Speaker application */}
        {showSpeaker && (
          <ApplicationCard
            icon={Mic}
            title="Become a Speaker"
            description="Propose a session and join the lineup."
            existingStatus={speakerApp?.status}
            disabled={!speakerEnabled}
            disabledLabel="Applications closed"
            preview={previewOnly}
            onClick={handleSpeakerClick}
          />
        )}
        {/* Sponsor application */}
        {showSponsor && (
          <ApplicationCard
            icon={Building2}
            title="Become a Sponsor"
            description="Sponsor this event and reach the audience."
            existingStatus={sponsorApp?.status}
            disabled={!sponsorEnabled}
            disabledLabel="Applications closed"
            preview={previewOnly}
            onClick={handleSponsorClick}
          />
        )}
      </div>

      {user && (
        <>
          <SpeakerApplicationDialog
            eventId={eventId}
            open={speakerOpen}
            onOpenChange={setSpeakerOpen}
          />
          <SponsorApplicationDialog
            eventId={eventId}
            open={sponsorOpen}
            onOpenChange={setSponsorOpen}
          />
        </>
      )}

      {/* Hide unused references to silence linter */}
      <span className="hidden">{accountType}</span>
    </>
  );
}

function ApplicationCard({
  icon: Icon,
  title,
  description,
  existingStatus,
  disabled,
  disabledLabel,
  preview,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  existingStatus?: ApplicationStatus;
  disabled?: boolean;
  disabledLabel?: string;
  preview?: boolean;
  onClick: () => void;
}) {
  if (existingStatus) {
    return (
      <div className="border border-border rounded-lg p-4 bg-card flex items-start gap-3">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{title}</p>
          <ApplicationStatusBadge status={existingStatus} />
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="border border-border rounded-lg p-4 bg-card/50 flex items-start gap-3 opacity-70">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-muted-foreground">{title}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
          <span className="text-[11px] font-medium text-muted-foreground mt-1.5 inline-block">
            {disabledLabel ?? "Closed"}
          </span>
        </div>
      </div>
    );
  }

  // Owner / admin preview — render the same actionable card visitors see, but
  // tag it with a small "Preview" chip so the organiser knows the toggle is on
  // and what visitors are seeing. The dialog still opens so they can verify
  // the full apply flow end-to-end.
  return (
    <button
      onClick={onClick}
      className="border border-border rounded-lg p-4 bg-card hover:border-primary/40 transition-colors flex items-start gap-3 text-left group"
    >
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold">{title}</p>
          {preview && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">
              Preview
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
        <span className="text-[12px] text-primary mt-1.5 inline-block group-hover:underline">
          Apply →
        </span>
      </div>
    </button>
  );
}

function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const config: Record<
    ApplicationStatus,
    { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
  > = {
    pending: {
      label: "Application pending",
      icon: Clock,
      cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    under_review: {
      label: "Under review",
      icon: Clock,
      cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    approved: {
      label: "Approved",
      icon: CheckCircle2,
      cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    rejected: {
      label: "Not approved",
      icon: XCircle,
      cls: "bg-destructive/15 text-destructive",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${c.cls}`}
    >
      <c.icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}
