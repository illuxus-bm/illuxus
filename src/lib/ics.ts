/**
 * Build a single-event .ics calendar file payload (no external deps).
 * Returns an object URL caller is responsible for revoking.
 */
export function buildIcsBlobUrl(args: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: string | Date;
  end?: string | Date | null;
  url?: string;
}): string {
  const dt = (d: string | Date) => {
    const x = d instanceof Date ? d : new Date(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      x.getUTCFullYear().toString() +
      pad(x.getUTCMonth() + 1) +
      pad(x.getUTCDate()) +
      "T" +
      pad(x.getUTCHours()) +
      pad(x.getUTCMinutes()) +
      pad(x.getUTCSeconds()) +
      "Z"
    );
  };
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const end = args.end ?? new Date(new Date(args.start).getTime() + 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Illuxus//Events//EN",
    "BEGIN:VEVENT",
    `UID:${args.uid}@illuxus`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(args.start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${escape(args.title)}`,
    args.description ? `DESCRIPTION:${escape(args.description)}` : "",
    args.location ? `LOCATION:${escape(args.location)}` : "",
    args.url ? `URL:${args.url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  return URL.createObjectURL(blob);
}