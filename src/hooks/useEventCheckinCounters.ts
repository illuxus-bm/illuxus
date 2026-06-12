import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CheckinCounters = {
  total: number;
  /** Legacy: registrations.checked_in = true. Kept for backwards compatibility. */
  checkedIn: number;
  /** registrations.attendance_state = 'inside' */
  currentlyInside: number;
  /** registrations.attendance_state = 'outside' */
  checkedOut: number;
  /** Derived: total - currentlyInside - checkedOut (registrations.attendance_state = 'never'). */
  notArrived: number;
};

const EMPTY_COUNTERS: CheckinCounters = {
  total: 0,
  checkedIn: 0,
  currentlyInside: 0,
  checkedOut: 0,
  notArrived: 0,
};

/**
 * Live counters for an event's registrations, kept fresh via Supabase realtime.
 * Returns total registrations, total checked-in attendees, and a partition of
 * `attendance_state` (`currentlyInside` / `checkedOut` / `notArrived`).
 */
export function useEventCheckinCounters(eventId: string | undefined) {
  const [counters, setCounters] = useState<CheckinCounters>(EMPTY_COUNTERS);

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    const load = async () => {
      const [totalRes, ciRes, insideRes, outsideRes] = await Promise.all([
        supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
        supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("checked_in", true),
        supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("attendance_state", "inside"),
        supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("attendance_state", "outside"),
      ]);
      if (!active) return;
      const total = totalRes.count ?? 0;
      const currentlyInside = insideRes.count ?? 0;
      const checkedOut = outsideRes.count ?? 0;
      // Derive `notArrived` (state='never') from the partition to avoid a 5th
      // round trip — `attendance_state` is one of 'never' | 'inside' | 'outside'.
      const notArrived = Math.max(0, total - currentlyInside - checkedOut);
      setCounters({
        total,
        checkedIn: ciRes.count ?? 0,
        currentlyInside,
        checkedOut,
        notArrived,
      });
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
