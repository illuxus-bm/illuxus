import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataSharing, type ReceivedShare } from "@/lib/sponsors/data-sharing";
import { SharedDataTable } from "./SharedDataTable";

/**
 * The participant data an organiser shared for this event, on the sponsor's own
 * event page. Shows nothing until something is shared, or once it is withdrawn.
 */
export function EventSharedData({ eventId }: { eventId: string }) {
  const { data } = useQuery<ReceivedShare[]>({
    queryKey: ["sponsor-received-shares"],
    // Before the database update this simply finds nothing.
    queryFn: () => dataSharing.received().catch(() => []),
    staleTime: 30_000,
  });
  const shares = (data ?? []).filter((d) => d.event_id === eventId);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (shares.length && window.location.hash === "#shared-data") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [shares.length]);
  if (shares.length === 0) return null;

  return (
    <section ref={ref} id="shared-data" className="mt-7 scroll-mt-20 space-y-5 md:mt-9">
      {shares.map((d) => (
        <div key={d.id} className="space-y-3">
          <div>
            <h2 className="text-[19px] font-bold tracking-tight md:text-[22px]">Shared participant data</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {d.sponsor} · {d.record_count.toLocaleString()} participants · {d.with_email.toLocaleString()} with email · {d.with_mobile.toLocaleString()} with mobile
              · shared {new Date(d.shared_at).toLocaleDateString()}{d.shared_by ? ` by ${d.shared_by}` : ""}{d.version > 1 ? ` · updated (v${d.version})` : ""}
            </p>
          </div>
          <SharedDataTable shareId={d.id} canExport={d.allow_export} fileName={`${d.event} - ${d.sponsor}`.replace(/[^\w -]+/g, "")} />
        </div>
      ))}
    </section>
  );
}

export default EventSharedData;
