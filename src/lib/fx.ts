import { useEffect, useState } from "react";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/currency";

export type FxRates = { base: string; rates: Record<string, number>; fetched_at: string };

const STORAGE_KEY = "fx:rates:v1";
const STORAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let memo: Promise<FxRates | null> | null = null;

async function loadRates(): Promise<FxRates | null> {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as FxRates & { _saved: number };
      if (parsed?._saved && parsed?.rates && Object.keys(parsed.rates).length > 10 && Date.now() - parsed._saved < STORAGE_TTL_MS) {
        return { base: parsed.base, rates: parsed.rates, fetched_at: parsed.fetched_at };
      }
    }
  } catch {}
  // Try direct fetch first (most reliable, no SDK overhead), then fall back to invoke.
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fx-rates`;
  const anon = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  try {
    const res = await fetch(url, {
      headers: anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.rates && Object.keys(json.rates).length > 10) {
        const value = json as FxRates;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, _saved: Date.now() })); } catch {}
        return value;
      }
    }
    // Non-2xx (404/CORS/etc): edge function not deployed. Silently fail —
    // amounts will display in their original currency, which is acceptable.
    return null;
  } catch {
    // Network/CORS error: edge function unavailable. Silently fail.
    return null;
  }
}

export function useFxRates() {
  const [rates, setRates] = useState<FxRates | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const refresh = (force = false) => {
      if (force) memo = null;
      if (!memo) memo = loadRates();
      memo.then((r) => {
        if (!alive) return;
        setRates(r);
        setLoading(false);
      });
    };
    refresh();
    const interval = setInterval(() => refresh(true), STORAGE_TTL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return { rates, loading };
}

/** Convert amount from -> to using USD-based rate map. Returns null when rates unavailable. */
export function convert(amount: number, from: string, to: string, rates: FxRates | null): number | null {
  if (!amount || !Number.isFinite(amount)) return 0;
  const f = (from || "USD").toUpperCase();
  const t = (to || "USD").toUpperCase();
  if (f === t) return amount;
  if (!rates) return null;
  const rFrom = f === rates.base ? 1 : rates.rates[f];
  const rTo = t === rates.base ? 1 : rates.rates[t];
  if (!rFrom || !rTo) return null;
  // amount in base = amount / rFrom; then * rTo
  return (amount / rFrom) * rTo;
}

export function formatConverted(
  amount: number,
  from: string,
  to: string,
  rates: FxRates | null,
): string | null {
  const v = convert(amount, from, to, rates);
  if (v === null) return null;
  return formatMoney(v, to);
}

/** Build the union of platform-supported + any extra codes seen in data. */
export function buildCurrencyList(extra: string[] = []): { code: string; label: string }[] {
  const map = new Map<string, string>();
  for (const c of SUPPORTED_CURRENCIES) map.set(c.code, c.label);
  for (const code of extra) {
    const up = (code || "").toUpperCase();
    if (up && !map.has(up)) map.set(up, up);
  }
  return Array.from(map.entries()).map(([code, label]) => ({ code, label }));
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}