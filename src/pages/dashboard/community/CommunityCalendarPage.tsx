import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useCommunityCalendar } from "@/hooks/community/useCommunityExtras";
import { Calendar, MapPin, Mic2 } from "lucide-react";
import { format } from "date-fns";

export default function CommunityCalendarPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const cal = useCommunityCalendar(data?.community?.id);
  const [filter, setFilter] = useState<"all" | "event" | "session">("all");

  const items = useMemo(() => {
    const list = cal.data ?? [];
    return filter === "all" ? list : list.filter((i) => i.kind === filter);
  }, [cal.data, filter]);

  // Group by month for a clean rail
  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    items.forEach((i) => {
      const key = format(new Date(i.starts_at), "yyyy-MM");
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <CommunityLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {(["all", "event", "session"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                filter === f
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "event" ? "Events" : "Sessions"}
            </button>
          ))}
        </div>

        {cal.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading calendar…</p>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <Calendar className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming events or sessions.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([month, list]) => (
              <section key={month}>
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {format(new Date(month + "-01"), "MMMM yyyy")}
                </h2>
                <ul className="border border-border rounded-xl bg-card divide-y divide-border overflow-hidden">
                  {list.map((i) => (
                    <li key={`${i.kind}:${i.item_id}`} className="p-3 flex items-start gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold uppercase">{format(new Date(i.starts_at), "MMM")}</span>
                        <span className="text-[14px] font-bold leading-none">{format(new Date(i.starts_at), "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-[14px] font-medium truncate">{i.title}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${i.kind === "event" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {i.kind}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {format(new Date(i.starts_at), "EEE, MMM d · h:mm a")}
                          {" – "}
                          {format(new Date(i.ends_at), "h:mm a")}
                        </p>
                        {i.location && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {i.location}
                          </p>
                        )}
                      </div>
                      {i.kind === "session" && (
                        <Mic2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </CommunityLayout>
  );
}
