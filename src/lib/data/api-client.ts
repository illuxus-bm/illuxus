/**
 * The browser's client for the Prisma API (api/v1, docs/PRISMA_MIGRATION.md).
 *
 * The move from direct Supabase queries to the API happens screen by screen.
 * `VITE_DATA_BACKEND=api` turns it on; it's off by default, so the app keeps
 * running exactly as today until each screen is switched and verified. A
 * screen that uses the API keeps its Supabase query as the fallback, so an
 * API outage degrades to today's behaviour instead of an error page.
 */
import { supabase } from "@/integrations/supabase/client";
import { SITE_ORIGIN, isNativeApp } from "@/lib/native/platform";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string) {
    super(message);
  }
}

export function apiEnabled(): boolean {
  return import.meta.env.VITE_DATA_BACKEND === "api";
}

/** Same origin on the web; the site's address inside the native apps. */
function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, "");
  return isNativeApp() ? SITE_ORIGIN : "";
}

export async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 10_000, ...rest } = init;
  const headers = new Headers(rest.headers);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (rest.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/v1${path}`, { ...rest, headers, signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body?.error ?? {};
      throw new ApiError(res.status, err.code ?? "error", err.message ?? `Request failed (${res.status})`, err.requestId);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "network", (e as Error)?.name === "AbortError" ? "Request timed out" : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uses the API when it's enabled and falls back to `legacy` (today's
 * Supabase query) if the API is off or fails for a reason other than the
 * caller's own input.
 */
export async function viaApi<T>(api: () => Promise<T>, legacy: () => Promise<T>): Promise<T> {
  if (!apiEnabled()) return legacy();
  try {
    return await api();
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) throw e;
    return legacy();
  }
}
