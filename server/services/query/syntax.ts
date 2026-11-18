/**
 * Parsers for the two PostgREST mini-languages supabase-js sends:
 *   - select lists:  "id, name, org:organizations(name, slug), speakers!fk(id)"
 *   - logic trees:   "status.eq.published,and(date.gte.2026-01-01,price.is.null)"
 * Anything outside what's handled here throws Unsupported, and the browser
 * then runs the query on Supabase instead.
 */
export class Unsupported extends Error {}

export type SelectItem =
  | { kind: "star" }
  | { kind: "column"; column: string; alias?: string }
  | { kind: "embed"; relation: string; alias?: string; hint?: string; items: SelectItem[] };

/** Splits on commas that aren't inside parentheses or double quotes. */
export function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (depth < 0) throw new Unsupported("unbalanced parentheses");
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (depth !== 0 || quoted) throw new Unsupported("unbalanced parentheses or quotes");
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseSelect(text: string | undefined): SelectItem[] {
  const source = (text ?? "*").replace(/\s+/g, " ").trim() || "*";
  return splitTop(source).map(parseItem);
}

function parseItem(raw: string): SelectItem {
  if (raw === "*") return { kind: "star" };
  const open = raw.indexOf("(");
  if (open >= 0) {
    if (!raw.endsWith(")")) throw new Unsupported(`select item ${raw}`);
    const head = raw.slice(0, open).trim();
    const inner = raw.slice(open + 1, -1);
    const [alias, target] = head.includes(":") ? head.split(":").map((s) => s.trim()) : [undefined, head];
    const [relation, ...hints] = target.split("!").map((s) => s.trim());
    if (!NAME.test(relation) || (alias && !NAME.test(alias))) throw new Unsupported(`embed ${head}`);
    if (hints.length > 1 || hints.some((h) => h === "inner" || h === "left" || !NAME.test(h))) {
      throw new Unsupported(`embed hint ${head}`);
    }
    return { kind: "embed", relation, alias, hint: hints[0], items: parseSelect(inner || "*") };
  }
  if (raw.includes("::") || raw.includes("->") || raw.includes(".")) throw new Unsupported(`select item ${raw}`);
  const [alias, column] = raw.includes(":") ? raw.split(":").map((s) => s.trim()) : [undefined, raw];
  if (!NAME.test(column) || (alias && !NAME.test(alias))) throw new Unsupported(`select item ${raw}`);
  return { kind: "column", column, alias };
}

export type Condition =
  | { kind: "op"; column: string; op: string; value: string; negate: boolean }
  | { kind: "group"; join: "and" | "or"; items: Condition[]; negate: boolean };

/** One "col.op.value" or "and(...)"/"or(...)"/"not.and(...)" element of a logic tree. */
export function parseCondition(raw: string): Condition {
  let text = raw.trim();
  let negate = false;
  if (text.startsWith("not.and(") || text.startsWith("not.or(")) {
    negate = true;
    text = text.slice(4);
  }
  const group = /^(and|or)\((.*)\)$/s.exec(text);
  if (group) {
    return { kind: "group", join: group[1] as "and" | "or", items: splitTop(group[2]).map(parseCondition), negate };
  }
  const first = text.indexOf(".");
  if (first <= 0) throw new Unsupported(`condition ${raw}`);
  const column = text.slice(0, first);
  let rest = text.slice(first + 1);
  if (rest.startsWith("not.")) {
    negate = !negate;
    rest = rest.slice(4);
  }
  const second = rest.indexOf(".");
  if (second <= 0) throw new Unsupported(`condition ${raw}`);
  const op = rest.slice(0, second);
  let value = rest.slice(second + 1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
  if (!NAME.test(column)) throw new Unsupported(`condition column ${column}`);
  return { kind: "op", column, op, value, negate };
}

/** A PostgREST list literal "(a,b,"c,d")" as its values. */
export function parseList(value: string): string[] {
  const text = value.trim();
  if (!text.startsWith("(") || !text.endsWith(")")) throw new Unsupported(`list ${value}`);
  return splitTop(text.slice(1, -1)).map((v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v));
}
