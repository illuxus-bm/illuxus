export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Extract the date portion (YYYY-MM-DD) from an ISO string without applying
 * any timezone conversion. This prevents a UTC-midnight timestamp like
 * "2025-07-04T00:00:00Z" from rolling back to "2025-07-03" in timezones east
 * of UTC or rolling forward in timezones west of UTC.
 */
function isoToDateStr(iso: string): string {
  // Fast path: already a bare date string
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  // Take only the date portion before the T
  return iso.split("T")[0];
}

export function computeEventDays(startIso: string | null | undefined, endIso?: string | null): string[] {
  if (!startIso) return [];
  const startStr = isoToDateStr(startIso);
  const endStr   = endIso ? isoToDateStr(endIso) : startStr;
  // Build dates using local constructor so no UTC conversion occurs
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  if (!sy || !sm || !sd) return [];
  const cur  = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  const days: string[] = [];
  let i = 0;
  while (cur <= last && i < 366) {
    days.push(toDayKey(cur));
    cur.setDate(cur.getDate() + 1);
    i++;
  }
  return days;
}

export function isDayInRange(day: string, eventDays: string[]): boolean {
  if (eventDays.length === 0) return true;
  return eventDays.includes(day);
}

export interface SessionFormInput {
  title: string;
  description?: string | null;
  session_type: string;
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
  location?: string | null;
  speaker_ids: string[];
  date?: string;      // "YYYY-MM-DD"
}

export interface SessionPayload {
  event_id: string;
  title: string;
  description: string | null;
  session_type: string;
  start_time: string;
  end_time: string;
  location: string | null;
  speaker_id: string | null;
}

export interface BuildPayloadResult {
  ok: boolean;
  error?: "missing_required" | "out_of_range";
  payload?: SessionPayload;
  sessionDate?: string;
}

export function buildSessionPayload(args: {
  form: SessionFormInput;
  eventId: string;
  eventDays: string[];
}): BuildPayloadResult {
  const { form, eventId, eventDays } = args;
  if (!form.title.trim() || !form.start_time || !form.end_time) {
    return { ok: false, error: "missing_required" };
  }
  // Normalise the date: strip any time/timezone suffix so "2025-07-04T00:00:00Z"
  // becomes "2025-07-04" and doesn't shift under local timezone conversion.
  const rawDate = form.date || eventDays[0] || "";
  const sessionDate = rawDate ? rawDate.split("T")[0] : "";
  if (!sessionDate) return { ok: false, error: "missing_required" };
  if (!isDayInRange(sessionDate, eventDays)) {
    return { ok: false, error: "out_of_range" };
  }
  return {
    ok: true,
    sessionDate,
    payload: {
      event_id: eventId,
      title: form.title,
      description: form.description || null,
      session_type: form.session_type,
      start_time: `${sessionDate}T${form.start_time}:00`,
      end_time: `${sessionDate}T${form.end_time}:00`,
      location: form.location || null,
      speaker_id: form.speaker_ids[0] || null,
    },
  };
}