/**
 * Opens every email with the recipient's own first name ("Hi Sarvesh,").
 *
 * Kept free of imports so the same code runs in the browser (compose
 * previews) and in the edge functions. Copies, keep them identical:
 *   supabase/functions/_shared/greeting.ts
 *   the "Greeting" block of each mail-sending function's dashboard-inline.ts
 */

const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|shri|smt)\.?$/i;
const GREETING_LINE = /^(\s*)(hi|hello|hey|dear|greetings|namaste|good (?:morning|afternoon|evening))\b(.*)$/i;
/** What may follow the greeting word on a line that names nobody: "Hi,", "Hello there!". */
const NAMELESS_REST = /^[\s,.!:;-]*(?:there|all|everyone|everybody|folks|team)?[\s,.!:;-]*$/i;

/**
 * The first name to greet someone by, or null when there is no real name —
 * an address, or the part of one before "@", which is what a nameless
 * registration falls back to.
 */
export function greetingName(name: string | null | undefined, email?: string | null): string | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  const first = words[0];
  if (!first || first.includes("@")) return null;
  const local = email?.split("@")[0]?.trim().toLowerCase();
  if (local && (name ?? "").trim().toLowerCase() === local) return null;
  return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}

/**
 * The plain-text body opening with a greeting for this recipient.
 *   • Already greets someone by name ("Hi {{user_name}}," once rendered,
 *     "Dear Aman,") → left exactly as written.
 *   • Greets nobody in particular ("Hi,", "Hello there!") → the name goes in.
 *   • No greeting → "Hi <first name>," on its own line above the body.
 * Without a real name the recipient is greeted as "there".
 */
export function withGreeting(body: string, name: string | null | undefined, email?: string | null): string {
  const first = greetingName(name, email);
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.trim().length > 0);
  if (at === -1) return body;

  const match = GREETING_LINE.exec(lines[at]);
  if (match) {
    const [, indent, word, rest] = match;
    if (!first || !NAMELESS_REST.test(rest)) return body;
    lines[at] = `${indent}${word} ${first},`;
    return lines.join("\n");
  }
  return `Hi ${first ?? "there"},\n\n${body.replace(/^\s*\n/, "")}`;
}
