/**
 * Every database call in the app and the edge functions must match the
 * production schema (supabase/prod_schema.sql):
 *
 *   - rpc("fn", { … }) names a function that exists, with argument names it
 *     takes and every argument it requires. PostgREST matches functions by
 *     argument NAME, so a wrong name fails the whole call ("Could not find
 *     the function …"), and most callers swallow that error.
 *   - .from("table").select("a, b, c") with a literal column list names
 *     columns the table or view has.
 *
 * The generated Supabase types would catch these, but they are out of date
 * and many calls are cast to `never`, so this checks the source directly.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = fs.readFileSync(path.join(ROOT, "supabase/prod_schema.sql"), "utf8");

type Signature = { params: Set<string>; required: Set<string> };

/** Function signatures from the dump, keyed by name (overloads kept apart). */
function functionSignatures(): Map<string, Signature[]> {
  const out = new Map<string, Signature[]>();
  const re = /CREATE OR REPLACE FUNCTION "public"\."(\w+)"\(([\s\S]*?)\) RETURNS/g;
  for (const [, name, args] of SCHEMA.matchAll(re)) {
    const sig: Signature = { params: new Set(), required: new Set() };
    for (const raw of args.split(/,(?![^(]*\))/).map((a) => a.trim()).filter(Boolean)) {
      if (/^OUT\s/.test(raw)) continue;
      const m = raw.match(/^(?:(?:IN|INOUT|VARIADIC)\s+)?"(\w+)"/);
      if (!m) continue;
      sig.params.add(m[1]);
      if (!/\sDEFAULT\s/.test(raw)) sig.required.add(m[1]);
    }
    out.set(name, [...(out.get(name) ?? []), sig]);
  }
  return out;
}

/** Column names of every table and view in the dump. */
function relationColumns(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [, name, body] of SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g)) {
    out.set(name, new Set([...body.matchAll(/^\s+"(\w+)" /gm)].map((m) => m[1])));
  }
  for (const [, name, body] of SCHEMA.matchAll(/CREATE OR REPLACE VIEW "public"\."(\w+)" AS\s+SELECT ([\s\S]*?)\s+FROM /g)) {
    const cols = new Set<string>();
    for (const part of body.split(/,(?![^(]*\))/)) {
      const alias = part.match(/AS "(\w+)"\s*$/) ?? part.match(/"(\w+)"\s*$/);
      if (alias) cols.add(alias[1]);
    }
    out.set(name, cols);
  }
  return out;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "_vendor", "__tests__", "test"].includes(entry.name)) continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
        && entry.name !== "dashboard-inline.ts" && entry.name !== "types.ts") {
        files.push(p);
      }
    }
  };
  for (const d of ["src", "supabase/functions", "api"]) walk(path.join(ROOT, d));
  return files;
}

/** Strips `as X`, `satisfies X`, `!` and parentheses. */
function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    node = node.expression;
  }
  return node;
}

/** The literal argument objects a call may pass (both arms of a ternary), or null if not literal. */
function argumentObjects(node: ts.Expression | undefined): ts.ObjectLiteralExpression[] | null {
  if (!node) return [];
  const n = unwrap(node);
  if (ts.isObjectLiteralExpression(n)) return [n];
  if (ts.isConditionalExpression(n)) {
    const a = argumentObjects(n.whenTrue);
    const b = argumentObjects(n.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

function keysOf(obj: ts.ObjectLiteralExpression): Set<string> | null {
  const keys = new Set<string>();
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) return null;
    const name = p.name;
    if (!name) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
    else return null;
  }
  return keys;
}

const stringArg = (node: ts.Expression | undefined): string | null => {
  if (!node) return null;
  const n = unwrap(node);
  return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null;
};

/** Plain column names in a PostgREST select list (embeds, casts, aliases and json paths handled). */
function selectedColumns(select: string): string[] {
  let s = select;
  // Drop embedded resources: rel(...), rel!fk(...), alias:rel(...).
  let prev;
  do { prev = s; s = s.replace(/[\w!:]+\s*\([^()]*\)/g, ""); } while (s !== prev);
  return s.split(",").map((c) => c.trim()).filter(Boolean).flatMap((c) => {
    const col = c.replace(/::\w+$/, "").split(":").pop()!.replace(/->.*$/, "").trim();
    return col === "*" || col === "count" || !/^\w+$/.test(col) ? [] : [col];
  });
}

interface Problem { where: string; message: string }

function scan(): Problem[] {
  const fns = functionSignatures();
  const rels = relationColumns();
  const problems: Problem[] = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const where = (n: ts.Node) => `${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isRpc = (ts.isIdentifier(callee) && callee.text === "supabaseRpc")
          || (ts.isPropertyAccessExpression(callee) && callee.name.text === "rpc");
        if (isRpc) {
          const name = stringArg(node.arguments[0]);
          if (name) {
            const sigs = fns.get(name);
            if (!sigs) {
              problems.push({ where: where(node), message: `rpc("${name}"): no such function` });
            } else {
              for (const obj of argumentObjects(node.arguments[1]) ?? []) {
                const keys = keysOf(obj);
                if (!keys) continue;
                const ok = sigs.some((s) => [...keys].every((k) => s.params.has(k)) && [...s.required].every((r) => keys.has(r)));
                if (!ok) {
                  const expected = sigs.map((s) => `(${[...s.params].join(", ")})`).join(" or ");
                  problems.push({ where: where(obj), message: `rpc("${name}") called with (${[...keys].join(", ")}); it takes ${expected}` });
                }
              }
            }
          }
        }
        // .from("t").select("…")
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "select") {
          const from = unwrap(callee.expression);
          if (ts.isCallExpression(from) && ts.isPropertyAccessExpression(from.expression) && from.expression.name.text === "from") {
            const table = stringArg(from.arguments[0]);
            const select = stringArg(node.arguments[0]);
            const cols = table ? rels.get(table) : undefined;
            if (cols && select) {
              const missing = selectedColumns(select).filter((c) => !cols.has(c));
              if (missing.length) problems.push({ where: where(node), message: `${table} has no column ${missing.join(", ")}` });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return problems;
}

describe("database calls match the production schema", () => {
  it("reads the schema dump", () => {
    expect(functionSignatures().size).toBeGreaterThan(300);
    expect(relationColumns().get("registrations")?.has("join_token")).toBe(true);
  });

  it("selected columns are parsed like PostgREST reads them", () => {
    expect(selectedColumns("id, created_at:clicked_at, org:organizations(name, logo_url), price::text, meta->x"))
      .toEqual(["id", "clicked_at", "price", "meta"]);
  });

  it("every rpc call and literal select names real functions, arguments and columns", () => {
    const problems = scan().map((p) => `${p.where}  ${p.message}`);
    expect(problems).toEqual([]);
  });
});
