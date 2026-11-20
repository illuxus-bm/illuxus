/**
 * Calling a ported edge function (server/functions/<name>/index.ts), over
 * HTTP (api/v1/fn/[name].ts) or in-process (createClient().functions.invoke).
 *
 * The gateway check mirrors Supabase's `verify_jwt`: unless a function opts
 * out in supabase/config.toml, a request must carry the project's
 * publishable/anon key, its service-role key, or a valid sign-in token.
 * Each function still makes its own authorization checks, as before.
 */
import { verifyAccessToken } from "../auth/verify.js";
import { FUNCTIONS } from "./registry.generated.js";
import type { EdgeHandler } from "../edge/deno.js";

/** Functions with verify_jwt = false in supabase/config.toml. */
export const PUBLIC_FUNCTIONS = new Set([
  "livekit-webhook", "fx-rates", "org-events", "og-event", "submit-support-ticket", "whatsapp-webhook",
]);

/**
 * Which ported functions this deployment serves: API_FUNCTIONS, a
 * comma-separated list of names, or "*" for all. Empty (the default) serves
 * none, so every function keeps running on Supabase, where its secrets
 * (SMTP, WhatsApp, Gemini, …) are. Add a name once its secrets are set in
 * Vercel; the browser then calls it here instead.
 */
export function enabledFunctions(env: string | undefined = process.env.API_FUNCTIONS): Set<string> | "all" {
  const raw = (env ?? "").trim();
  if (raw === "*") return "all";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isPorted(name: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) return false;
  const enabled = enabledFunctions();
  return enabled === "all" || enabled.has(name);
}

export async function loadHandler(name: string): Promise<EdgeHandler | null> {
  if (!isPorted(name)) return null;
  const mod = await FUNCTIONS[name]();
  return mod.default;
}

/** Supabase's gateway check, for functions that don't opt out of it. */
export async function gatewayAllows(name: string, headers: Headers): Promise<boolean> {
  if (PUBLIC_FUNCTIONS.has(name)) return true;
  const bearer = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const apikey = (headers.get("apikey") ?? "").trim();
  const projectKeys = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ].filter((k): k is string => Boolean(k));
  if (bearer && projectKeys.includes(bearer)) return true;
  if (!bearer && apikey && projectKeys.includes(apikey)) return true;
  if (!bearer) return false;
  try {
    await verifyAccessToken(bearer);
    return true;
  } catch {
    return false;
  }
}

type InvokeResult = { data: unknown; error: null | { name: string; message: string; context?: Response } };

/** In-process, with supabase-js's functions.invoke result shape. */
export async function invokeFunction(name: string, body: unknown, headers: Headers): Promise<InvokeResult> {
  const handler = await loadHandler(name);
  if (!handler) return { data: null, error: { name: "FunctionsRelayError", message: `Function ${name} is not ported` } };
  const isRaw = typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer || body instanceof Blob;
  if (body !== undefined && !isRaw && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await handler(new Request(`http://internal/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  }));
  if (!res.ok) {
    return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: res } };
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("application/json") ? await res.json() : type.startsWith("text/") ? await res.text() : await res.blob();
  return { data, error: null };
}
