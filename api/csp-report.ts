/**
 * api/csp-report — receives the browser's Content-Security-Policy violation
 * reports (vercel.json: `report-uri /api/csp-report` and the `csp` entry in
 * `Reporting-Endpoints`) and writes one short line per report to the Vercel
 * function logs, so a blocked script or frame shows up there.
 *
 * Accepts both formats: the classic `application/csp-report` body and the
 * Reporting API's `application/reports+json` array. Bodies are capped and
 * fields truncated, so the endpoint can't be used to flood the logs with
 * large payloads. Nothing is stored and the reply is always 204.
 */

export const config = { runtime: "edge" };

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS = 10;

const field = (v: unknown, max = 300): string | undefined =>
  typeof v === "string" && v ? v.slice(0, max) : undefined;

/** Path only: query strings can carry personal data. */
const pathOf = (v: unknown): string | undefined => {
  const s = field(v, 1000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return s.slice(0, 100);
  }
};

function summarise(r: Record<string, unknown>) {
  return {
    directive: field(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"], 60),
    blocked: pathOf(r["blocked-uri"] ?? r.blockedURL),
    page: pathOf(r["document-uri"] ?? r.documentURL),
    source: pathOf(r["source-file"] ?? r.sourceFile),
    line: typeof (r["line-number"] ?? r.lineNumber) === "number" ? (r["line-number"] ?? r.lineNumber) : undefined,
    disposition: field(r.disposition, 20),
  };
}

export default async function handler(req: Request): Promise<Response> {
  const done = new Response(null, { status: 204 });
  if (req.method !== "POST") return done;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return done;
    const parsed: unknown = JSON.parse(text);
    const reports: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
          .filter((x) => x && typeof x === "object" && (x as { type?: unknown }).type === "csp-violation")
          .map((x) => ((x as { body?: unknown }).body ?? {}) as Record<string, unknown>)
      : [((parsed as { "csp-report"?: unknown })["csp-report"] ?? {}) as Record<string, unknown>];
    for (const r of reports.slice(0, MAX_REPORTS)) {
      console.warn(JSON.stringify({ level: "warn", fn: "csp-report", msg: "csp violation", ...summarise(r) }));
    }
  } catch {
    // Malformed report: nothing to log.
  }
  return done;
}
