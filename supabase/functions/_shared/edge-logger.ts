/**
 * Structured logger for Supabase edge functions.
 *
 * Replaces ad-hoc `console.error("[fn-name] …", err)` patterns with a
 * single, structured emitter that:
 *
 *   - Outputs one JSON object per log line (Supabase's edge-function
 *     log driver indexes these by field name).
 *   - Strips a small allowlist of high-risk fields before they leave
 *     the function (passwords, tokens, secrets, API keys, raw OTPs).
 *   - Tags every record with a function name + request id so the logs
 *     of a 50k-RPS surface stay searchable.
 *
 * Why we re-implemented redaction here instead of importing
 * `src/lib/observability/redaction.ts`:
 *   - The browser logger lives in the Vite bundle (typescript, ESM,
 *     module-resolution alias `@/...`).
 *   - Edge functions run on Deno with `npm:` / `https://esm.sh/...`
 *     specifiers; they can't dereference the Vite alias.
 *   - The browser redaction pipeline scrubs a much wider field set
 *     (regex on emails / phones / IPs across all string values).
 *     Edge functions deal with already-validated server input, so a
 *     deny-list on field names is enough; running the regex on every
 *     value would double the function's CPU per log line.
 *
 * Usage
 * -----
 *
 *   import { createEdgeLogger } from "../_shared/edge-logger.ts";
 *
 *   const log = createEdgeLogger("send-whatsapp");
 *
 *   Deno.serve(async (req) => {
 *     const correlationId = crypto.randomUUID();
 *     const reqLog = log.child({ correlation_id: correlationId });
 *
 *     reqLog.info("read-secrets", { hasApiKey: !!apiKey });
 *     // ...
 *     reqLog.error("send-failed", {
 *       step: "resend-fetch",
 *       error_message: err.message,
 *       error_name: err.name,
 *       error_stack: err.stack,
 *     });
 *   });
 *
 * The output is a single line of JSON per record:
 *
 *   {"ts":"2026-06-21T12:34:56.789Z","level":"error","fn":"send-whatsapp",
 *    "msg":"send-failed","correlation_id":"…","step":"resend-fetch",
 *    "error_message":"Network unreachable", …}
 */

export type EdgeLogLevel = "debug" | "info" | "warn" | "error";

const DENY_LIST_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "service_role_key",
  "service-role-key",
  "supabase_service_role_key",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "session_id",
  "session",
  "otp",
  "otp_code",
  "code_hash",
  "private_key",
  "credit_card",
  "card_number",
  "cvv",
  "ssn",
]);

function redactValue(key: string, value: unknown): unknown {
  if (DENY_LIST_KEYS.has(key.toLowerCase())) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => redactValue(`${key}[${i}]`, v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

export interface EdgeLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /**
   * Returns a logger that always carries the supplied fields. Useful for
   * binding a `correlation_id` or a route-specific `step` / `org_id`
   * once at the start of a request and getting it on every line.
   */
  child(extra: Record<string, unknown>): EdgeLogger;
}

function emit(
  level: EdgeLogLevel,
  fnName: string,
  bound: Record<string, unknown>,
  msg: string,
  fields: Record<string, unknown> | undefined,
): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    fn: fnName,
    msg,
    ...redactValue("__bound__", bound) as Record<string, unknown>,
  };
  if (fields) {
    Object.assign(record, redactValue("__fields__", fields) as Record<string, unknown>);
  }
  // Deno's log driver routes the corresponding console method to its
  // streaming sink; the level routing here matches the browser logger
  // so a future cross-cut (e.g. Sentry) can register a single handler.
  const line = JSON.stringify(record);
  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(line);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    case "info":
      // eslint-disable-next-line no-console
      console.info(line);
      break;
    case "debug":
    default:
      // eslint-disable-next-line no-console
      console.debug(line);
      break;
  }
}

export function createEdgeLogger(fnName: string): EdgeLogger {
  return makeLogger(fnName, {});
}

function makeLogger(fnName: string, bound: Record<string, unknown>): EdgeLogger {
  return {
    debug(msg, fields) { emit("debug", fnName, bound, msg, fields); },
    info(msg, fields) { emit("info", fnName, bound, msg, fields); },
    warn(msg, fields) { emit("warn", fnName, bound, msg, fields); },
    error(msg, fields) { emit("error", fnName, bound, msg, fields); },
    child(extra) {
      return makeLogger(fnName, { ...bound, ...extra });
    },
  };
}

/**
 * Convert any thrown value into a structured fields object suitable
 * for `log.error("…", toErrorFields(err))`. Consolidates the
 * `instanceof Error ? err.message : String(err)` pattern and adds
 * `error_name` + `error_stack` when available.
 */
export function toErrorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      error_name: err.name,
      error_message: err.message,
      error_stack: err.stack,
    };
  }
  return { error_message: String(err) };
}
