/**
 * Variable substitution for the communications module.
 *
 * Used in two places:
 *   - The compose preview, so the organizer sees what one recipient gets.
 *   - The server-side dispatch (mirrored in SQL — see `_communications_render_text`
 *     in migration 014), so the persisted per-recipient body matches the preview
 *     byte-for-byte.
 *
 * Render policy: tokens that don't have a value in `ctx` are stripped from
 * the output (and any leading whitespace immediately before them is
 * collapsed to a single space) so recipients never see raw `{{token}}`.
 * The compose dialog separately validates tokens at edit time so the
 * organizer can spot typos / out-of-scope tokens before sending.
 */

export interface SubstitutionContext {
  user_name?: string | null;
  event_name?: string | null;
  event_date?: string | null;
  event_location?: string | null;
  community_name?: string | null;
}

/** Token names recognised by the substitution layer. Keep in sync with SQL. */
export const KNOWN_TOKENS = [
  "user_name",
  "event_name",
  "event_date",
  "event_location",
  "community_name",
] as const;
export type KnownToken = (typeof KNOWN_TOKENS)[number];

/** Token names valid for an event-scoped send. */
export const EVENT_SCOPE_TOKENS: ReadonlySet<KnownToken> = new Set([
  "user_name", "event_name", "event_date", "event_location",
]);

/** Token names valid for a community-scoped send. */
export const COMMUNITY_SCOPE_TOKENS: ReadonlySet<KnownToken> = new Set([
  "user_name", "community_name",
]);

const TOKEN_RE = /\{\{\s*([a-z_][a-z_0-9]*)\s*\}\}/gi;

/**
 * Render `text` using values from `ctx`. Unknown / unresolved tokens are
 * stripped from the output along with one leading space so the result reads
 * naturally (e.g. "Welcome to {{community_name}}!" with no community
 * becomes "Welcome to!", then trimmed to "Welcome to!").
 */
export function applyVariables(text: string, ctx: SubstitutionContext): string {
  if (!text) return text;
  // Collapse whitespace + token in one pass so we don't leave double-spaces
  // when the value is empty.
  return text
    .replace(/(\s)?\{\{\s*([a-z_][a-z_0-9]*)\s*\}\}/gi, (_match, leading: string | undefined, key: string) => {
      const v = (ctx as Record<string, string | null | undefined>)[key];
      const sub = v == null || v === "" ? "" : String(v);
      // If the token had a leading space and the substitution is empty, drop
      // the space too so we don't leave a gap. Otherwise preserve it.
      if (sub === "") return "";
      return (leading ?? "") + sub;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1") // tighten orphaned punctuation
    .trim();
}

/**
 * Find every token reference in `text`. Returns the unique set, lower-cased.
 * Used by the compose dialog to flag out-of-scope tokens before send.
 */
export function tokensIn(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

/**
 * Return the subset of token names referenced in `text` that aren't valid
 * for the given scope. Empty array means everything is fine.
 */
export function invalidTokensForScope(
  text: string,
  scope: "event" | "community",
): string[] {
  const valid = scope === "community" ? COMMUNITY_SCOPE_TOKENS : EVENT_SCOPE_TOKENS;
  return tokensIn(text).filter((t) => !valid.has(t as KnownToken));
}
