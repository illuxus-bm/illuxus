/**
 * Sponsor dashboard — /sponsor/data/:shareId
 *
 * Older links to one share: shared data now lives on the sponsor's event page,
 * so this sends people there. A share that isn't available says so.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useAuth } from "@/contexts/AuthContext";
import { dataSharing } from "@/lib/sponsors/data-sharing";
import { loginPath } from "@/lib/safe-redirect";

export default function SponsorSharedDataPage() {
  const { shareId = "" } = useParams();
  const { user, loading } = useAuth();
  const info = useQuery({ queryKey: ["shared-info", shareId], queryFn: () => dataSharing.info(shareId), enabled: !!user && !!shareId, retry: false });

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to={loginPath(`/sponsor/data/${shareId}`)} replace />;
  const eventId = (info.data as { event_id?: string } | undefined)?.event_id;
  if (eventId) return <Navigate to={`/sponsor/events/${eventId}#shared-data`} replace />;
  if (!info.isError) return <FullPageLoader />;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-lg space-y-2 px-4 py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This data isn't available to you</h1>
        <p className="text-sm text-muted-foreground">It may have been withdrawn by the organiser, or shared with a different team.</p>
        <Link to="/sponsor" className="inline-block pt-2 text-sm font-medium text-primary hover:underline">Back to sponsor dashboard</Link>
      </main>
    </div>
  );
}
