/**
 * Centralized date/time formatting for event-facing surfaces.
 *
 * Always use these helpers when rendering an event's date or time to an
 * attendee, so the value reflects the *event's* time zone (which the
 * organizer set), not the viewer's local zone.
 *
 * Admin/dashboard views that intentionally display the operator's local
 * time may keep using native `toLocaleString` directly.
 */

export const DEFAULT_TZ = "Asia/Kolkata";

type TZ = string | null | undefined;

function resolveTZ(tz: TZ): string {
  if (!tz) return DEFAULT_TZ;
  try {
    // Validate by attempting to build a formatter.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Short timezone abbreviation, e.g. "IST", "PST". */
export function tzAbbreviation(value: Date | string | number, tz: TZ = DEFAULT_TZ): string {
  const d = toDate(value);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTZ(tz),
    timeZoneName: "short",
  }).formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** "Mon, Jun 1" in the event's tz. */
export function formatEventDate(
  value: Date | string | number,
  tz: TZ = DEFAULT_TZ,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: resolveTZ(tz) }).format(d);
}

/** "7:30 PM" in the event's tz. */
export function formatEventTime(
  value: Date | string | number,
  tz: TZ = DEFAULT_TZ,
  opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true },
): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: resolveTZ(tz) }).format(d);
}

/** "Mon, Jun 1 · 7:30 PM IST" in the event's tz. */
export function formatEventDateTime(
  value: Date | string | number,
  tz: TZ = DEFAULT_TZ,
  opts?: { showTZ?: boolean },
): string {
  const d = toDate(value);
  if (!d) return "";
  const date = formatEventDate(d, tz);
  const time = formatEventTime(d, tz);
  const tag = opts?.showTZ === false ? "" : ` ${tzAbbreviation(d, tz)}`.trimEnd();
  return `${date} · ${time}${tag}`;
}

/** "7:30 PM – 9:00 PM IST" — when both fall on the same day, otherwise full range. */
export function formatEventRange(
  start: Date | string | number,
  end: Date | string | number | null | undefined,
  tz: TZ = DEFAULT_TZ,
): string {
  const s = toDate(start);
  if (!s) return "";
  if (!end) return formatEventDateTime(s, tz);
  const e = toDate(end);
  if (!e) return formatEventDateTime(s, tz);
  const tzId = resolveTZ(tz);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: tzId }).format(s) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: tzId }).format(e);
  if (sameDay) {
    return `${formatEventDate(s, tzId)} · ${formatEventTime(s, tzId)} – ${formatEventTime(e, tzId)} ${tzAbbreviation(s, tzId)}`.trim();
  }
  return `${formatEventDateTime(s, tzId)} → ${formatEventDateTime(e, tzId)}`;
}