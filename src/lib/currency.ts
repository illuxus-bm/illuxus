/**
 * Centralized currency formatting.
 *
 * - Event/ticket prices default to INR (the platform's primary market today).
 * - Platform SaaS billing is in USD.
 *
 * Use `formatMoney` everywhere a monetary amount is rendered so the symbol,
 * grouping, and decimal handling stay consistent.
 */

export const DEFAULT_EVENT_CURRENCY = "INR";
export const PLATFORM_BILLING_CURRENCY = "USD";

const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
};

/** Picker list for the event setup UI. Keep short and ordered by popularity. */
export const SUPPORTED_CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
];

export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = DEFAULT_EVENT_CURRENCY,
  opts: Intl.NumberFormatOptions = {},
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const safe = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const code = (currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
    ...opts,
  }).format(safe);
}

/** Convenience for places that just want the price-or-Free pill. */
export function formatPriceOrFree(
  amount: number | string | null | undefined,
  currency: string = DEFAULT_EVENT_CURRENCY,
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!n || !Number.isFinite(n) || n <= 0) return "Free";
  return formatMoney(n, currency);
}