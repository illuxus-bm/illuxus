import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, FileText, AlertCircle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { isValidEmailFormat } from "@/lib/email-format";

/** Columns accepted by the importer. Header matching is case-insensitive and
 *  ignores spaces, dashes and underscores, so `Full Name`, `full_name`,
 *  `FULL-NAME` all map to `name`. */
const COLUMN_ALIASES: Record<string, string> = {
  name: "name", fullname: "name", attendee: "name", participant: "name",
  email: "email", emailaddress: "email", mail: "email",
  title: "title", honorific: "title", salutation: "title",
  firstname: "first_name", givenname: "first_name", fname: "first_name",
  lastname: "last_name", surname: "last_name", familyname: "last_name", lname: "last_name",
  designation: "designation", jobtitle: "designation", position: "designation",
  company: "company", organization: "company", organisation: "company", employer: "company",
  mobilecountrycode: "mobile_country_code", countrycode: "mobile_country_code",
  dialcode: "mobile_country_code", code: "mobile_country_code",
  mobile: "mobile_number", mobilenumber: "mobile_number", phone: "mobile_number",
  phonenumber: "mobile_number", contact: "mobile_number",
  linkedin: "linkedin_url", linkedinurl: "linkedin_url",
  website: "company_website", companywebsite: "company_website",
  industry: "industry",
  // `role` is the friendlier alias the organiser is asked to use in the CSV.
  // Internally it maps to ticket_type and accepts: attendee, speaker, sponsor.
  role: "ticket_type", tickettype: "ticket_type", ticket: "ticket_type",
};

type ImportRow = {
  rowIndex: number;
  name: string;
  email: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  designation?: string;
  company?: string;
  mobile_country_code?: string;
  mobile_number?: string;
  linkedin_url?: string;
  company_website?: string;
  industry?: string;
  ticket_type?: string;
  errors: string[];
};

/** Required CSV columns — mirrors the Add Participant form's starred fields.
 *  `name` is derived from first_name + last_name, so it isn't required as a
 *  separate column. `title` stays optional. `ticket_type` (a.k.a. `role`)
 *  is now required because the welcome email tells the participant what
 *  they've been registered as. */
const REQUIRED = [
  "first_name", "last_name", "designation", "company",
  "email", "mobile_country_code", "mobile_number", "ticket_type",
] as const;

const VALID_ROLES = new Set(["attendee", "speaker", "sponsor"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
void EMAIL_RE; // retained for the CSV preview regex baseline; format check now delegates to isValidEmailFormat()
// Accept country codes with or without a leading `+`. Plain `91` is valid;
// `+91` is too. We normalise to the canonical `+91` form before insert.
const COUNTRY_CODE_RE = /^\+?\d{1,4}$/;
const MOBILE_RE = /^\d{6,15}$/;

/**
 * Minimal RFC-4180-style CSV parser. Handles quoted fields, embedded commas,
 * doubled quotes (`""` → `"`), and `\r\n` line endings. Designed to fit a
 * single page of code; if the import use-case grows, swap in `papaparse`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      // Always close the current field. CRLF: skip the LF after CR.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      // Skip rows that are completely empty.
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = []; field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-]/g, "");
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  /** Existing registration emails (lower-cased) so we can flag duplicates upfront. */
  existingEmails: Set<string>;
  /** Called after a successful import so the parent reloads its list. */
  onImported?: () => void;
}

export default function ImportRegistrationsDialog({
  open, onOpenChange, eventId, existingEmails, onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const valid = parsed.filter((r) => r.errors.length === 0).length;
    const duplicate = parsed.filter((r) =>
      r.errors.length === 0 && existingEmails.has(r.email.toLowerCase())
    ).length;
    return { total: parsed.length, valid, invalid: parsed.length - valid, duplicate };
  }, [parsed, existingEmails]);

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setUnmapped([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { // 5 MB sanity cap
      toast.error("CSV is too large", { description: "Max 5 MB" });
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("CSV is empty");
      return;
    }
    const rawHeaders = rows[0];
    const headerMap: Record<number, string> = {};
    const seenColumns = new Set<string>();
    const ignored: string[] = [];
    rawHeaders.forEach((h, idx) => {
      const norm = normalizeHeader(h);
      const dbCol = COLUMN_ALIASES[norm];
      if (dbCol && !seenColumns.has(dbCol)) {
        headerMap[idx] = dbCol;
        seenColumns.add(dbCol);
      } else if (h.trim()) {
        ignored.push(h.trim());
      }
    });

    const missing = REQUIRED.filter((r) => !seenColumns.has(r));
    if (missing.length > 0) {
      toast.error("CSV is missing required columns", {
        description: `Expected: ${missing.join(", ")}`,
      });
      setParsed([]);
      setUnmapped(ignored);
      return;
    }

    const out: ImportRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      // Skip rows where every cell is empty/whitespace.
      if (cells.every((c) => !c.trim())) continue;
      const obj: ImportRow = { rowIndex: r + 1, name: "", email: "", errors: [] };
      Object.entries(headerMap).forEach(([colIdx, dbCol]) => {
        const v = (cells[Number(colIdx)] ?? "").trim();
        (obj as unknown as Record<string, string>)[dbCol] = v;
      });

      // Derive `name` from first_name + last_name if not supplied directly.
      // Mirrors `displayName(...)` used by the Add Participant form.
      if (!obj.name) {
        obj.name = [obj.first_name, obj.last_name].filter(Boolean).join(" ").trim();
      }

      // Mirror the form's starred-field validation, with friendly messages.
      if (!(obj.first_name || "").trim()) obj.errors.push("First name required");
      if (!(obj.last_name  || "").trim()) obj.errors.push("Last name required");
      if (!(obj.designation || "").trim()) obj.errors.push("Designation required");
      if (!(obj.company || "").trim())    obj.errors.push("Company required");
      if (!obj.email)                      obj.errors.push("Email required");
      else if (!isValidEmailFormat(obj.email))
        obj.errors.push("Invalid email — use name@domain.tld (e.g. user@gmail.com)");

      const ccRaw = (obj.mobile_country_code || "").trim();
      if (!ccRaw) obj.errors.push("Country code required");
      else if (!COUNTRY_CODE_RE.test(ccRaw)) obj.errors.push("Country code must be 1–4 digits (e.g. 1, 91, or +44)");
      // Normalise: ensure leading `+`. Spreadsheet apps sometimes drop the
      // plus sign on numeric cells like `+91` → `91`. We accept both.
      obj.mobile_country_code = ccRaw.startsWith("+") ? ccRaw : (ccRaw ? `+${ccRaw}` : ccRaw);

      const mob = (obj.mobile_number || "").replace(/[^\d]/g, "");
      if (!mob)                       obj.errors.push("Mobile number required");
      else if (!MOBILE_RE.test(mob))  obj.errors.push("Mobile number must be 6–15 digits");
      obj.mobile_number = mob;

      // Role / ticket_type validation. We expose the column to organisers as
      // `role` (with `ticket_type` as a backwards-compatible alias) and only
      // accept the three options the dashboard surfaces.
      const rawRole = (obj.ticket_type || "").trim().toLowerCase();
      if (!rawRole) {
        obj.errors.push("Role required (attendee, speaker, or sponsor)");
      } else if (!VALID_ROLES.has(rawRole)) {
        obj.errors.push(`Role must be attendee, speaker, or sponsor (got "${rawRole}")`);
      }
      obj.ticket_type = rawRole;

      out.push(obj);
    }
    setParsed(out);
    setUnmapped(ignored);
  };

  const handleImport = async () => {
    if (!parsed || stats === null) return;
    const validRows = parsed.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("Nothing to import — fix the errors and try again");
      return;
    }
    setBusy(true);

    // Re-fetch the live duplicate set right before insert. The
    // `existingEmails` prop snapshots at dialog-open time; if another
    // organiser added someone between then and now, that row would slip
    // through and create a second registration. A quick re-query keeps the
    // check accurate without needing a server-side unique constraint.
    const { data: liveRows } = await supabase
      .from("registrations")
      .select("email")
      .eq("event_id", eventId);
    const liveExisting = new Set<string>(
      (liveRows ?? [])
        .map((r) => (r.email || "").toLowerCase())
        .filter(Boolean),
    );
    // Union with the prop-supplied set so we never accept an email the
    // parent already showed as duplicate.
    for (const e of existingEmails) liveExisting.add(e);

    // Deduplicate within the file by email (case-insensitive); keep first.
    const dedupedByEmail = new Map<string, ImportRow>();
    for (const r of validRows) {
      const key = r.email.toLowerCase();
      if (!dedupedByEmail.has(key)) dedupedByEmail.set(key, r);
    }
    // Drop rows whose email already exists for this event.
    const toInsert = Array.from(dedupedByEmail.values())
      .filter((r) => !liveExisting.has(r.email.toLowerCase()));

    const skippedDuplicates = dedupedByEmail.size - toInsert.length;
    if (toInsert.length === 0) {
      setBusy(false);
      toast.info("Everyone is already added or checked in", {
        description: skippedDuplicates > 0
          ? `${skippedDuplicates} email${skippedDuplicates === 1 ? "" : "s"} already exist for this event.`
          : "Nothing new to add.",
      });
      return;
    }

    const payload = toInsert.map((r) => ({
      event_id: eventId,
      name: r.name,
      email: r.email.toLowerCase(),
      title: r.title || null,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      designation: r.designation || null,
      company: r.company || null,
      mobile_country_code: r.mobile_country_code || null,
      mobile_number: r.mobile_number || null,
      linkedin_url: r.linkedin_url || null,
      company_website: r.company_website || null,
      industry: r.industry || null,
      // Map the row's validated role to the DB column. "attendee" is stored
      // as the default "general" ticket category so existing reporting +
      // badge templates that key off `general` keep working.
      ticket_type: r.ticket_type === "attendee" ? "general" : r.ticket_type || "general",
      status: "confirmed",
      approval_status: "approved",
    }));

    const { data, error } = await supabase
      .from("registrations")
      .insert(payload)
      .select("id, name, email, join_token, ticket_type");

    setBusy(false);
    if (error) {
      logger.error("import-registrations failed", {
        error_message: error.message, attempted: payload.length,
      });
      toast.error("Import failed", { description: error.message });
      return;
    }

    const inserted = data?.length ?? 0;
    const skipped = validRows.length - inserted;
    toast.success(`Imported ${inserted} registration${inserted === 1 ? "" : "s"}`, {
      description: skipped > 0
        ? `${skipped} skipped — email already added or checked in for this event.`
        : undefined,
    });
    onImported?.();
    onOpenChange(false);
    reset();

    // Fire ticket emails in the background. Only ONE email per imported
    // participant — the ticket card with banner + QR + organiser block
    // delivered by the dedicated `send-ticket-email` edge function. No
    // separate welcome email, no temporary-password mechanic; the
    // `handle_new_user` trigger (migration 019) auto-links existing
    // registrations to the freshly-created auth.users row when the
    // participant signs up using the same email, so they see their ticket
    // immediately after their first sign-in.
    //
    // Failures are non-fatal — the registration row already exists and the
    // organiser can resend from the dashboard.
    if (data && data.length > 0) {
      void (async () => {
        let sent = 0;
        let failed = 0;
        const failureReasons = new Set<string>();
        const CONCURRENCY = 5;
        for (let i = 0; i < data.length; i += CONCURRENCY) {
          const slice = data.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            slice.map(async (row) => {
              try {
                const { data: tData, error: tErr } = await supabase.functions.invoke(
                  "send-ticket-email",
                  { body: { registration_id: row.id } },
                );
                if (tErr) {
                  return { ok: false as const, error: tErr.message || "Edge function error" };
                }
                type R = { ok?: boolean; delivered?: boolean; error?: string; note?: string };
                const result = (tData ?? null) as R | null;
                if (result?.error) return { ok: false as const, error: result.error };
                if (result?.delivered === false) {
                  return { ok: false as const, error: result.note || "Ticket email not delivered" };
                }
                return { ok: true as const };
              } catch (err) {
                return {
                  ok: false as const,
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            }),
          );
          for (const r of results) {
            if (r.ok) sent += 1;
            else { failed += 1; failureReasons.add(r.error); }
          }
        }
        if (sent > 0) {
          toast.success(`Ticket emails sent (${sent})`, {
            description: failed > 0
              ? `${failed} failed: ${[...failureReasons].slice(0, 2).join("; ")}`
              : undefined,
          });
        } else if (failed > 0) {
          toast.warning(`Ticket emails failed (${failed})`, {
            description: [...failureReasons].slice(0, 2).join("; ")
              || "Deploy send-ticket-email and check SMTP credentials.",
          });
        }
      })();
    }
  };

  const downloadTemplate = () => {
    // Headers match the Add Participant form's starred fields, plus the
    // common optional ones. The asterisks aren't included in the header
    // names themselves — the documentation below the upload area explains
    // which are required.
    const headers = [
      "first_name", "last_name", "title", "designation", "company",
      "mobile_country_code", "mobile_number", "email", "role",
      "linkedin_url", "company_website", "industry",
    ];
    const sample = [
      "Jane", "Doe", "Ms", "CEO", "Acme Inc.",
      "+1", "5551234567", "jane@example.com", "attendee",
      "https://linkedin.com/in/janedoe", "https://acme.com", "Technology",
    ];
    const csv = headers.join(",") + "\n" + sample.map(csvEscape).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registrations-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Import registrations from CSV
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            CSV columns must mirror the Add Participant form's starred fields:
            {" "}<code>first_name</code>, <code>last_name</code>, <code>designation</code>,
            {" "}<code>company</code>, <code>mobile_country_code</code>, <code>mobile_number</code>,
            {" "}<code>email</code>, and <code>role</code>{" "}
            (<code>attendee</code>, <code>speaker</code>, or <code>sponsor</code>).
            Rows whose email is already registered for this event are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-1.5 text-[12px] cursor-pointer hover:bg-muted/40">
              <Upload className="h-3.5 w-3.5" />
              {fileName ? "Replace CSV" : "Choose CSV"}
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button size="sm" variant="ghost" className="gap-1.5 text-[12px] h-8" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground ml-auto">
                <FileText className="h-3.5 w-3.5" /> {fileName}
                <button onClick={reset} className="opacity-50 hover:opacity-100" aria-label="Clear file">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          {unmapped.length > 0 && (
            <div className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
              <span className="font-medium text-foreground">Ignored columns:</span>{" "}
              {unmapped.join(", ")}
            </div>
          )}

          {stats && parsed && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-[12px]">
                <StatTile label="Rows" value={stats.total} />
                <StatTile label="Valid" value={stats.valid} tone="success" />
                <StatTile label="Duplicate" value={stats.duplicate} tone="warn" />
                <StatTile label="Errors" value={stats.invalid} tone={stats.invalid > 0 ? "error" : undefined} />
              </div>

              <PreviewTable rows={parsed} existingEmails={existingEmails} />
            </div>
          )}

          {!parsed && (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-[12px] text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Supported columns</p>
              <p>
                <span className="text-foreground font-medium">Required *</span>:{" "}
                <code>first_name</code>, <code>last_name</code>, <code>designation</code>,
                {" "}<code>company</code>, <code>mobile_country_code</code>{" "}
                (e.g. <code>1</code>, <code>91</code>, or <code>+44</code> — the
                {" "}<code>+</code> is added automatically if missing),
                {" "}<code>mobile_number</code> (6–15 digits),
                {" "}<code>email</code>,
                {" "}<code>role</code> (<code>attendee</code>, <code>speaker</code>, or <code>sponsor</code>)
              </p>
              <p>
                Optional: <code>title</code>, <code>linkedin_url</code>,
                {" "}<code>company_website</code>, <code>industry</code>
              </p>
              <p>
                Header matching is forgiving — <code>First Name</code>, <code>first_name</code>,
                {" "}<code>FName</code> all map to the same column. The display name shown in the
                Registrations list is built automatically from <code>first_name</code>
                {" "}+ <code>last_name</code>.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3 sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            {stats
              ? `${stats.valid - stats.duplicate} new · ${stats.duplicate} already registered · ${stats.invalid} with errors`
              : "Pick a file to preview"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={busy || !stats || stats.valid - stats.duplicate <= 0}
              className="gap-1.5"
            >
              {busy ? "Importing…" : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Import {stats ? `${stats.valid - stats.duplicate}` : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, value, tone }: {
  label: string; value: number; tone?: "success" | "warn" | "error";
}) {
  const toneCls =
    tone === "success" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" :
    tone === "warn"    ? "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400" :
    tone === "error"   ? "border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400" :
                         "border-border bg-muted/30 text-foreground";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PreviewTable({ rows, existingEmails }: { rows: ImportRow[]; existingEmails: Set<string> }) {
  const display = rows.slice(0, 50);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="text-left text-muted-foreground">
              <th className="py-1.5 px-2 w-10">#</th>
              <th className="py-1.5 px-2">Name</th>
              <th className="py-1.5 px-2">Email</th>
              <th className="py-1.5 px-2">Company</th>
              <th className="py-1.5 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {display.map((r) => {
              const isError = r.errors.length > 0;
              const isDup = !isError && existingEmails.has(r.email.toLowerCase());
              return (
                <tr key={r.rowIndex} className="border-t border-border">
                  <td className="py-1.5 px-2 text-muted-foreground tabular-nums">{r.rowIndex}</td>
                  <td className="py-1.5 px-2 truncate max-w-[160px]">{r.name || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="py-1.5 px-2 truncate max-w-[180px]">{r.email || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="py-1.5 px-2 truncate max-w-[140px] text-muted-foreground">{r.company || ""}</td>
                  <td className="py-1.5 px-2">
                    {isError ? (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" /> {r.errors.join("; ")}
                      </span>
                    ) : isDup ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        Already added or checked in
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > display.length && (
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground bg-muted/20 border-t border-border">
          Showing first {display.length} of {rows.length} rows. All rows will be processed on import.
        </div>
      )}
    </div>
  );
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
