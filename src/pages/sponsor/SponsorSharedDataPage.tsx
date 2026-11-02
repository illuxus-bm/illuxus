/**
 * Sponsor dashboard — /sponsor/data/:shareId
 *
 * One participant list an organiser shared with this account's sponsor team:
 * searchable, sortable, paged and, where the organiser allowed it, downloadable.
 * The server decides who may open it (migration 069); a guessed link shows
 * nothing.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Lock } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { FullPageLoader } from "@/components/FullPageLoader";
import { SharedDataTable } from "@/components/sponsor-data/SharedDataTable";
import { useAuth } from "@/contexts/AuthContext";
import { dataSharing } from "@/lib/sponsors/data-sharing";
import { loginPath } from "@/lib/safe-redirect";

const titleOf = (tier: string | null, label: string | null) =>
  tier === "custom" ? label || "" : tier ? tier[0].toUpperCase() + tier.slice(1) : "";

export default function SponsorSharedDataPage() {
  const { shareId = "" } = useParams();
  const { user, loading } = useAuth();
  const info = useQuery({ queryKey: ["shared-info", shareId], queryFn: () => dataSharing.info(shareId), enabled: !!user && !!shareId, retry: false });

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to={loginPath(`/sponsor/data/${shareId}`)} replace />;
  const d = info.data;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/sponsor" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Back to sponsor dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Building2 className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">Sponsor dashboard</span>
        </div>
      </header>
      <main className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
        {info.isError ? (
          <div className="mx-auto max-w-lg space-y-2 rounded-2xl border border-border bg-card p-8 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="text-lg font-semibold">This data isn't available to you</h1>
            <p className="text-sm text-muted-foreground">It may have been withdrawn by the organiser, or shared with a different team.</p>
          </div>
        ) : !d ? (
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight">{d.event}</h1>
              <p className="text-sm text-muted-foreground">
                {[d.event_date ? new Date(d.event_date).toLocaleDateString() : null, titleOf(d.title, d.title_label), d.sponsor].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {d.record_count.toLocaleString()} participants · {d.with_email.toLocaleString()} with email · {d.with_mobile.toLocaleString()} with mobile · shared {new Date(d.shared_at).toLocaleString()}
                {d.version > 1 ? ` · version ${d.version}` : ""}
              </p>
            </div>
            <SharedDataTable shareId={shareId} canExport={d.reader === "organiser" || d.allow_export}
                             fileName={`${d.event} - ${d.sponsor}`.replace(/[^\w -]+/g, "")} />
            <p className="text-[11.5px] text-muted-foreground">
              Contact details appear only for participants who agreed to share them with sponsors. Use them for this event's follow-up, as agreed with the organiser.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
