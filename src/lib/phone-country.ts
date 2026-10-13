// Lightweight country dial-code list + locale-based default detection.
// No network calls, no dependencies.

export type Country = { code: string; name: string; dial: string };

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", dial: "+91" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "NO", name: "Norway", dial: "+47" },
  { code: "DK", name: "Denmark", dial: "+45" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "HK", name: "Hong Kong", dial: "+852" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "VN", name: "Vietnam", dial: "+84" },
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "LK", name: "Sri Lanka", dial: "+94" },
  { code: "NP", name: "Nepal", dial: "+977" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "KW", name: "Kuwait", dial: "+965" },
  { code: "BH", name: "Bahrain", dial: "+973" },
  { code: "OM", name: "Oman", dial: "+968" },
  { code: "EG", name: "Egypt", dial: "+20" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "KE", name: "Kenya", dial: "+254" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "TR", name: "Turkey", dial: "+90" },
  { code: "RU", name: "Russia", dial: "+7" },
  { code: "PL", name: "Poland", dial: "+48" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "BE", name: "Belgium", dial: "+32" },
  { code: "AT", name: "Austria", dial: "+43" },
  { code: "FI", name: "Finland", dial: "+358" },
  { code: "GR", name: "Greece", dial: "+30" },
  { code: "IL", name: "Israel", dial: "+972" },
];

/** Returns a default dial code based on the browser locale, falling back to +91. */
export function detectDefaultDial(): string {
  if (typeof navigator === "undefined") return "+91";
  const lang = navigator.language || navigator.languages?.[0] || "";
  const region = lang.includes("-") ? lang.split("-")[1].toUpperCase() : "";
  const match = COUNTRIES.find((c) => c.code === region);
  return match?.dial || "+91";
}

/** The dial code for an ISO country code, or null if it isn't in the list. */
export function dialForCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.dial ?? null;
}

const GEO_CACHE_KEY = "illuxus:geo-country";
let geoRequest: Promise<string | null> | null = null;

/**
 * The visitor's country from their IP address (via `/api/geo`, which reads
 * the country Vercel's edge already attaches to the request). Asked once per
 * tab and shared by every form; null when it can't be told, e.g. locally.
 */
export function detectCountryFromIp(): Promise<string | null> {
  if (geoRequest) return geoRequest;
  geoRequest = (async () => {
    try {
      const cached = window.sessionStorage.getItem(GEO_CACHE_KEY);
      if (cached !== null) return cached || null;
    } catch { /* storage unavailable */ }
    try {
      const res = await fetch("/api/geo", { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
      const body = res.ok ? ((await res.json()) as { country?: unknown }) : null;
      const country = typeof body?.country === "string" && /^[A-Z]{2}$/.test(body.country) ? body.country : null;
      try { window.sessionStorage.setItem(GEO_CACHE_KEY, country ?? ""); } catch { /* ignore */ }
      return country;
    } catch {
      return null;
    }
  })();
  return geoRequest;
}

/**
 * Best default dial code: the visitor's country from their IP, then their
 * browser language, then +91.
 */
export async function detectCountryDial(): Promise<string> {
  return dialForCountry(await detectCountryFromIp()) ?? detectDefaultDial();
}

export const TITLE_OPTIONS = ["Mr", "Ms", "Mrs", "Prefer not to say"] as const;
export type TitleOption = (typeof TITLE_OPTIONS)[number];

export const EMPLOYEE_COUNT_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;

export const INDUSTRY_OPTIONS = [
  "Technology",
  "Financial Services",
  "Healthcare",
  "Education",
  "Manufacturing",
  "Retail & E-commerce",
  "Media & Entertainment",
  "Consulting",
  "Government / Non-profit",
  "Real Estate",
  "Energy",
  "Other",
] as const;