import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Database, Mail, Phone, Users } from "lucide-react";
import { dataSharing, type ReceivedShare } from "@/lib/sponsors/data-sharing";

const titleOf = (tier: string | null, label: string | null) =>
  tier === "custom" ? label || "" : tier ? tier[0].toUpperCase() + tier.slice(1) : "";

/** Participant data organisers have shared with this account's sponsor teams. Shows nothing when there is none. */
export function ReceivedShares() {
  const { data = [] } = useQuery<ReceivedShare[]>({
    queryKey: ["sponsor-received-shares"],
    // Before the database update this simply finds nothing.
    queryFn: () => dataSharing.received().catch(() => []),
    staleTime: 30_000,
  });
  if (data.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="shared-event-data">
      <div>
        <h2 id="shared-event-data" className="text-lg font-semibold tracking-tight">Shared Event Data</h2>
        <p className="text-sm text-muted-foreground">Participant lists organisers have shared with you</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((d) => (
          <Link key={d.id} to={`/sponsor/events/${d.event_id}#shared-data`} className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{d.event}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[d.event_date ? new Date(d.event_date).toLocaleDateString() : null, titleOf(d.title, d.title_label), d.sponsor].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Database className="h-4 w-4" /></span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" /><b className="tabular-nums">{d.record_count.toLocaleString()}</b> participants</span>
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><b className="tabular-nums">{d.with_email.toLocaleString()}</b> email</span>
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><b className="tabular-nums">{d.with_mobile.toLocaleString()}</b> mobile</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11.5px] text-muted-foreground">
              <span>Shared {new Date(d.shared_at).toLocaleDateString()}{d.shared_by ? ` by ${d.shared_by}` : ""}{d.version > 1 ? ` · updated (v${d.version})` : ""}</span>
              <span className="inline-flex items-center gap-1 font-medium text-primary">View database <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default ReceivedShares;
