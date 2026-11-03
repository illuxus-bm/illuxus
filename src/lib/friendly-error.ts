/**
 * Text to show a person for an error, without database internals.
 *
 * Messages the app's own database functions raise on purpose ("Not a
 * moderator", "Your request is already waiting for a decision") are written
 * for people and pass through. Messages Postgres or PostgREST generate
 * themselves ("duplicate key value violates unique constraint …", "column …
 * does not exist", "new row violates row-level security policy …") name
 * tables, columns and policies, so they are replaced with plain language.
 *
 * Display only: code that branches on `error.code` / `error.message` keeps
 * reading the original error.
 */

const MAX_LENGTH = 300;

/** Shapes of text Postgres / PostgREST / the network produce themselves. */
const INTERNAL: Array<[RegExp, string]> = [
  [/duplicate key value|violates unique constraint/i, "This already exists."],
  [/violates foreign key constraint/i, "This refers to something that no longer exists."],
  [/null value in column|violates not-null constraint/i, "A required field is missing."],
  [/violates check constraint|value too long for type|out of range/i, "Some of the values entered aren't allowed."],
  [/row-level security|permission denied for/i, "You don't have permission to do that."],
  [/invalid input syntax|invalid input value|malformed/i, "Some of the values entered aren't valid."],
  [/JWT|token (is )?expired|invalid claim/i, "Your session has expired. Please sign in again."],
  [/failed to fetch|network ?error|load failed|fetch failed/i, "Network problem. Check your connection and try again."],
  [
    /does not exist|could not find the|schema cache|syntax error|PGRST\d+|relation "|operator does not exist|stack depth|deadlock|statement timeout|canceling statement/i,
    "Something went wrong on our side. Please try again.",
  ],
];

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const message = messageOf(err).trim();
  if (!message) return fallback;
  for (const [pattern, text] of INTERNAL) {
    if (pattern.test(message)) return text;
  }
  // Written for people (our own RAISE EXCEPTION messages, auth messages):
  // show it, without any stack-trace-looking tail.
  const firstLine = message.split("\n")[0];
  return firstLine.length > MAX_LENGTH ? `${firstLine.slice(0, MAX_LENGTH - 1)}…` : firstLine;
}
