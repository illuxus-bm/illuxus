/**
 * Wraps an API route so every one behaves the same way and none can crash
 * the function: CORS for the web app and the native apps, the caller's
 * identity, input validation, consistent JSON errors that never leak
 * internals, a request id on every response and one structured log line.
 */
import { ZodError, type ZodType } from "zod";
import { AuthError, callerFromRequest } from "./auth/verify.js";
import type { Caller } from "./db/caller.js";

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = "error") {
    super(message);
  }
}

const APP_ORIGINS = new Set([
  "https://illuxus.com",
  "https://www.illuxus.com",
  "capacitor://localhost", // iOS app
  "https://localhost", // Android app
  "http://localhost:5173",
  "http://localhost:8080",
]);

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (APP_ORIGINS.has(origin)) return origin;
  const extra = (process.env.API_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  // BigInt (Postgres bigint / count) has no JSON form and would throw.
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(text, { ...init, headers });
}

/** Postgres / Prisma failures mapped to what the caller may know. */
export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof AuthError) return new HttpError(401, e.message, "unauthorized");
  if (e instanceof ZodError) {
    return new HttpError(400, e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), "invalid_input");
  }
  const code = (e as { code?: string })?.code;
  const message = String((e as { message?: string })?.message ?? "");
  if (code === "P2025") return new HttpError(404, "Not found", "not_found");
  if (code === "P2002") return new HttpError(409, "Already exists", "conflict");
  // 42501 insufficient_privilege, or a row security refusal.
  if (/\b42501\b/.test(message) || /row-level security|permission denied/i.test(message)) {
    return new HttpError(403, "Not allowed", "forbidden");
  }
  if (code === "P1001" || code === "P1002" || /ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) {
    return new HttpError(503, "Service temporarily unavailable", "unavailable");
  }
  return new HttpError(500, "Something went wrong", "internal");
}

export type RouteContext = { req: Request; url: URL; caller: Caller; requestId: string };

type Handler = (ctx: RouteContext) => Promise<Response | unknown>;

export function route(name: string, handlers: Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>) {
  return async function handle(req: Request): Promise<Response> {
    const started = Date.now();
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID();
    const cors = corsHeaders(req);
    let status = 500;
    try {
      if (req.method === "OPTIONS") {
        status = 204;
        return new Response(null, { status, headers: cors });
      }
      const handler = handlers[req.method as keyof typeof handlers];
      if (!handler) throw new HttpError(405, "Method not allowed", "method_not_allowed");
      const caller = await callerFromRequest(req.headers);
      const result = await handler({ req, url: new URL(req.url), caller, requestId });
      const res = result instanceof Response ? result : json({ data: result });
      status = res.status;
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (e) {
      const err = toHttpError(e);
      status = err.status;
      if (status >= 500) {
        // eslint-disable-next-line no-console -- stdout is the function's log sink
        console.error(JSON.stringify({ level: "error", route: name, requestId, error: String((e as Error)?.message ?? e).slice(0, 500) }));
      }
      return json({ error: { code: err.code, message: err.message, requestId } }, { status, headers: { ...cors, "X-Request-Id": requestId } });
    } finally {
      // eslint-disable-next-line no-console -- stdout is the function's log sink
      console.log(JSON.stringify({ level: "info", route: name, method: req.method, status, ms: Date.now() - started, requestId }));
    }
  };
}

/** Parses query or body input; a bad value becomes a 400, never a crash. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function requireUser(caller: Caller): Extract<Caller, { kind: "user" }> {
  if (caller.kind !== "user") throw new HttpError(401, "Sign in required", "unauthorized");
  return caller;
}
