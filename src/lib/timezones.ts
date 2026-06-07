/**
 * Curated list of timezones for the event setup picker.
 * Covers the common business hubs; advanced users can still type any
 * valid IANA id by switching to the "Other" entry.
 */
export const COMMON_TIMEZONES: { id: string; label: string }[] = [
  { id: "Asia/Kolkata", label: "Mumbai / Delhi (IST)" },
  { id: "Asia/Dubai", label: "Dubai (GST)" },
  { id: "Asia/Singapore", label: "Singapore (SGT)" },
  { id: "Asia/Tokyo", label: "Tokyo (JST)" },
  { id: "Europe/London", label: "London (BST/GMT)" },
  { id: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { id: "Europe/Paris", label: "Paris (CET/CEST)" },
  { id: "America/New_York", label: "New York (ET)" },
  { id: "America/Chicago", label: "Chicago (CT)" },
  { id: "America/Denver", label: "Denver (MT)" },
  { id: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { id: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { id: "Australia/Sydney", label: "Sydney (AET)" },
  { id: "UTC", label: "UTC" },
];

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True if the string is a valid IANA timezone the runtime recognizes. */
export function isValidTimezone(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}