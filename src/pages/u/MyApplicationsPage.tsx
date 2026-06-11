import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyApplications } from "@/hooks/useApplications";
import SiteHeader from "@/components/SiteHeader";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mic, Building2, Calendar, ClipboardList, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ApplicationStatus, MyApplicationsSpeaker, MyApplicationsSponsor } from "@/types/applications";

export default function MyApplicationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useMyApplications();
  const [tab, setTab] = useState<"speaker" | "sponsor">("speaker");

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login?redirect=/u/me/applications" replace />;

  const speakerApps = data?.speaker ?? [];
  const sponsorApps = data?.sponsor ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My applications</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Track the status of your speaker and sponsor applications.
            </p>
          </div>
          <Link
            to="/u/me/events"
            className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to my events
          </Link>
        </div>

        {/* Tabs */}
        <div className="inline-flex rounded-md border border-border overflow-hidden text-[13px] mb-6">
          <button
            onClick={() => setTab("speaker")}
            className={`px-4 py-1.5 inline-flex items-center gap-1.5 ${
              tab === "speaker"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
          >
            <Mic className="h-3.5 w-3.5" /> Speaker ({speakerApps.length})
          </button>
          <button
            onClick={() => setTab("sponsor")}
            className={`px-4 py-1.5 inline-flex items-center gap-1.5 ${
              tab === "sponsor"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" /> Sponsor ({sponsorApps.length})
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        )}

        {/* Speaker tab */}
        {!isLoading && tab === "speaker" && (
          <>
            {speakerApps.length === 0 ? (
              <EmptyState
                icon={Mic}
                title="No speaker applications yet"
                description="Apply to speak at an event from the event's public page."
              />
            ) : (
              <div className="space-y-3">
                {speakerApps.map((app) => <SpeakerApplicationRow key={app.id} app={app} />)}
              </div>
            )}
          </>
        )}

        {/* Sponsor tab */}
        {!isLoading && tab === "sponsor" && (
          <>
            {sponsorApps.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No sponsor applications yet"
                description="Apply to sponsor an event from the event's public page."
              />
            ) : (
              <div className="space-y-3">
                {sponsorApps.map((app) => <SponsorApplicationRow key={app.id} app={app} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-border rounded-lg py-16 px-4 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-[12px] text-muted-foreground mt-1">{description}</p>
      <Link to="/events" className="inline-block mt-4 text-[12px] text-primary hover:underline">
        Browse events →
      </Link>
    </div>
  );
}

function SpeakerApplicationRow({ app }: { app: MyApplicationsSpeaker }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card flex gap-4">
      {app.image_url && (
        <img src={app.image_url} alt="" className="h-20 w-20 rounded object-cover shrink-0 hidden sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="h-3 w-3" />
              <Link
                to={`/events/${app.event_id}`}
                className="hover:text-foreground hover:underline"
              >
                {app.event_title}
              </Link>
            </p>
            <p className="font-semibold text-[14px] truncate mt-0.5">{app.session_title}</p>
            {app.expertise && (
              <p className="text-[12px] text-muted-foreground mt-0.5">{app.expertise}</p>
            )}
          </div>
          <StatusBadge status={app.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground mt-2">
          {app.event_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(app.event_date).toLocaleDateString()}
            </span>
          )}
          <span>Applied {new Date(app.created_at).toLocaleDateString()}</span>
          <span>Last updated {new Date(app.updated_at).toLocaleDateString()}</span>
        </div>
        {app.status === "rejected" && app.rejection_reason && (
          <p className="text-[12px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2 mt-2">
            <span className="font-medium">Reason:</span> {app.rejection_reason}
          </p>
        )}
      </div>
    </div>
  );
}

function SponsorApplicationRow({ app }: { app: MyApplicationsSponsor }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card flex gap-4">
      {app.image_url && (
        <img src={app.image_url} alt="" className="h-20 w-20 rounded object-cover shrink-0 hidden sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              <Link
                to={`/events/${app.event_id}`}
                className="hover:text-foreground hover:underline"
              >
                {app.event_title}
              </Link>
            </p>
            <p className="font-semibold text-[14px] truncate mt-0.5">{app.company_name}</p>
            {app.sponsorship_tier && (
              <p className="text-[12px] text-muted-foreground capitalize mt-0.5">
                {app.sponsorship_tier} tier
              </p>
            )}
          </div>
          <StatusBadge status={app.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground mt-2">
          {app.event_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(app.event_date).toLocaleDateString()}
            </span>
          )}
          <span>Applied {new Date(app.created_at).toLocaleDateString()}</span>
          <span>Last updated {new Date(app.updated_at).toLocaleDateString()}</span>
        </div>
        {app.status === "rejected" && app.rejection_reason && (
          <p className="text-[12px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2 mt-2">
            <span className="font-medium">Reason:</span> {app.rejection_reason}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const config: Record<
    ApplicationStatus,
    { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
  > = {
    pending: { label: "Pending", icon: Clock, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    under_review: { label: "Under review", icon: Clock, cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    approved: { label: "Approved", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    rejected: { label: "Not approved", icon: XCircle, cls: "bg-destructive/15 text-destructive" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${c.cls}`}>
      <c.icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}
