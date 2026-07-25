import { logger } from "@/lib/observability";

/**
 * Escapes a single CSV cell per RFC 4180. Values containing a comma, a
 * double-quote, a carriage return, or a line feed are wrapped in double
 * quotes with any interior double-quote character doubled.
 *
 * `null` and `undefined` values are emitted as zero characters (empty
 * cell) per Requirements 10.7, 11.4, and 14.4 — never as the literal
 * text "null" / "NULL" / "None" / "n/a".
 *
 * `throwOnUnserializable` controls the failure mode when the value is
 * neither a primitive nor coercible to a plain string (e.g. a symbol
 * or a bigint that could lose precision on toString). When true
 * (production use), throws `CsvEscapeError` so the calling export
 * aborts before delivering any bytes (Requirements 10.6, 11.3). When
 * false (defensive/tolerant callers), returns the empty string and
 * logs via `logger.warn`.
 *
 * Pure.
 */
export function escapeCsvCell(
  value: unknown,
  opts?: { throwOnUnserializable?: boolean }
): string {
  const throwOnFail = opts?.throwOnUnserializable ?? true;

  // Absent values → empty cell
  if (value === null || value === undefined) return "";

  // Coerce to string; guard against symbols and bigints
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else if (typeof value === "symbol" || typeof value === "bigint") {
    if (throwOnFail) throw new CsvEscapeError(`Cannot serialize ${typeof value} to CSV cell`);
    logger.warn("csv escape unserializable value dropped", { type: typeof value });
    return "";
  } else if (typeof value === "object") {
    // Objects/arrays are not expected in UTM columns; serialize
    // defensively as JSON. This preserves round-trip fidelity in the
    // extremely unlikely case a caller passes an object.
    try { s = JSON.stringify(value); }
    catch (err) {
      if (throwOnFail) throw new CsvEscapeError(
        `JSON.stringify failed on CSV cell: ${err instanceof Error ? err.message : String(err)}`
      );
      logger.warn("csv escape json failed", { error_message: err instanceof Error ? err.message : String(err) });
      return "";
    }
  } else {
    if (throwOnFail) throw new CsvEscapeError(`Unknown value type ${typeof value}`);
    logger.warn("csv escape unknown value type", { type: typeof value });
    return "";
  }

  // RFC 4180 escape: wrap in double-quotes when the cell contains
  // any of these characters, doubling interior quotes.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Thrown by `escapeCsvCell(..., { throwOnUnserializable: true })`
 *  when a cell value cannot be safely serialized. Callers catch this
 *  to satisfy Requirements 10.6 / 11.3 (abort before delivering any
 *  bytes to the user). */
export class CsvEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvEscapeError";
  }
}

/**
 * Assembles a full CSV document from a header row and a matrix of data
 * rows. Every cell is escaped via `escapeCsvCell(cell, { throwOnUnserializable: true })`.
 * On any `CsvEscapeError`, this function rethrows without emitting any
 * partial output — the caller aborts the download and surfaces a toast
 * (Requirements 10.6 and 11.3). UTF-8, CRLF line terminators, no BOM
 * (Requirement 10.9).
 *
 * Pure.
 */
export function buildCsvDocument(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[]
): string {
  const escapeRow = (row: readonly unknown[]) => row.map((c) => escapeCsvCell(c)).join(",");
  return [escapeRow(headers), ...rows.map(escapeRow)].join("\r\n");
}
