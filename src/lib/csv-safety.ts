/**
 * Spreadsheet formula injection ("CSV injection"): a cell that Excel, Numbers,
 * LibreOffice or Google Sheets would run as a formula when the file is opened.
 * Anyone who can put text into an export (a registrant's name or company, say)
 * could otherwise make it run in the reader's spreadsheet.
 *
 * A cell is treated as a formula when it starts with = + - or @, with a tab,
 * carriage return, line feed or NUL (spreadsheets skip these and read what
 * follows), or with the full-width ＝ ＋ － ＠ that some locales accept.
 * See https://owasp.org/www-community/attacks/CSV_Injection.
 */
const FORMULA_START = /^[=+\-@\t\r\n\0＝＋－＠]/;

/** A phone number (+ then digits and spaces only) can't run, and stays as typed. */
const PHONE_NUMBER = /^\+[\d ]+$/;

/** True when a spreadsheet would read `value` as a formula. */
export function startsLikeFormula(value: string): boolean {
  return FORMULA_START.test(value) && !PHONE_NUMBER.test(value);
}

/** `value` marked as text (a leading apostrophe) when it would otherwise run as a formula. */
export function neutralizeFormula(value: string): string {
  return startsLikeFormula(value) ? `'${value}` : value;
}

/**
 * One CSV cell, safe to open in a spreadsheet: formula-like values marked as
 * text, and quoted (with inner quotes doubled) when the value holds a quote,
 * comma, tab or line break, or was marked.
 */
export function safeCsvCell(value: string): string {
  const marked = neutralizeFormula(value);
  return marked !== value || /[",\t\r\n]/.test(marked) ? `"${marked.replace(/"/g, '""')}"` : marked;
}
