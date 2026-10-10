/**
 * UTM source / medium vocabulary shared by the link generator and the
 * analytics filters, so a value you can generate is always one you can
 * filter by. Custom values found in the data are merged in by `withExtras`.
 */

export const UTM_SOURCES = ["email", "whatsapp", "linkedin", "twitter", "instagram", "facebook", "sms", "qr", "manual"] as const;
export const UTM_MEDIUMS = ["transactional", "broadcast", "organic", "paid", "referral", "copy"] as const;

/** Labels the summary uses for registrations / clicks that carry no UTM values. */
export const DIRECT_SOURCE = "(direct)";
export const NO_VALUE = "(none)";

const SOURCE_COLORS: Record<string, string> = {
  email: "#6366f1",
  whatsapp: "#22c55e",
  linkedin: "#0ea5e9",
  twitter: "#1d9bf0",
  facebook: "#3b82f6",
  instagram: "#ec4899",
  sms: "#f59e0b",
  qr: "#8b5cf6",
  manual: "#64748b",
  [DIRECT_SOURCE]: "#94a3b8",
  [NO_VALUE]: "#cbd5e1",
};

export function sourceColor(src: string): string {
  return SOURCE_COLORS[(src || "").toLowerCase()] ?? "#6366f1";
}

/**
 * The standard options followed by any other values present in the data
 * (custom sources, "(direct)", "(none)"), de-duplicated case-insensitively.
 */
export function withExtras(standard: readonly string[], present: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [...standard];
  const seen = new Set(out.map((v) => v.toLowerCase()));
  for (const v of present) {
    const value = (v ?? "").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}
