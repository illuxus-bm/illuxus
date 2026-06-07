import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CheckinCounters = {
  total: number;
  checkedIn: number;
};

/**
 * Live counters for an event's registrations, kept fresh via Supabase realtime.
 * Returns total registrations and total checked-in attendees.
 */
export function useEventCheckinCounters(eventId: string | undefined) {
  const [counters, setCounters] = useState<CheckinCounters>({ total: 0, checkedIn: 0 });

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    const load = async () => {
      const [totalRes, ciRes] = await Promise.all([
        supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("checked_in", true),
      ]);
      if (!active) return;
      setCounters({ total: totalRes.count ?? 0, checkedIn: ciRes.count ?? 0 });
    };
    load();

    const channel = supabase
      .channel(`reg-counters-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${eventId}` },
        () => { load(); }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return counters;
}
