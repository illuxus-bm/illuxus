/**
 * Runs a supabase-js query chain (recorded in the browser by
 * src/lib/data/db.ts) through Prisma, producing the same JSON Supabase's
 * REST API (PostgREST) would: same row and embed shapes, same value formats
 * (Postgres builds the JSON, as in PostgREST), same single/maybeSingle
 * errors, same 1000-row cap as the live project.
 *
 * Runs inside asCaller(), so grants and row security decide what each
 * person may read and write, exactly as today.
 *
 * Identifiers are only ever taken from the catalog; values are always bind
 * parameters. Anything not handled throws Unsupported before touching the
 * database; the browser then runs the same chain on Supabase.
 */
import type { Tx } from "../../db/caller.js";
import { ident, loadCatalog, type Catalog, type Column, type ForeignKey, type Relation } from "./catalog.js";
import { Unsupported, parseCondition, parseList, parseSelect, splitTop, type Condition, type SelectItem } from "./syntax.js";

export { Unsupported };

export type Op = { m: string; a: unknown[] };
export type QueryResult = { data: unknown; count: number | null; status: number; error?: { code: string; message: string; details?: string; hint?: string } };

/** The live project's PostgREST max_rows. */
export const MAX_ROWS = 1000;

const FILTER_OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

class Sql {
  readonly params: string[] = [];
  bind(value: unknown): string {
    this.params.push(typeof value === "string" ? value : JSON.stringify(value));
    return `$${this.params.length}`;
  }
}

type Plan = {
  write?: { kind: "insert" | "upsert" | "update" | "delete"; values?: unknown; options?: Record<string, unknown> };
  select?: { columns: string; options: Record<string, unknown> };
  where: string[];
  order: string[];
  limit?: number;
  offset?: number;
  single?: "single" | "maybe";
};

function relationOf(catalog: Catalog, name: string): Relation {
  const rel = catalog.relations.get(name);
  if (!rel) throw new Unsupported(`unknown table ${name}`);
  return rel;
}

function columnOf(rel: Relation, name: unknown): Column {
  if (typeof name !== "string") throw new Unsupported("column name");
  const col = rel.columns.get(name);
  if (!col) throw new Unsupported(`unknown column ${rel.name}.${name}`);
  return col;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) throw new Unsupported("null comparison (use is)");
  if (typeof value === "object") throw new Unsupported("object comparison");
  return String(value);
}

/** One comparison on a column of the base relation (alias t0). */
function compare(sql: Sql, rel: Relation, column: string, op: string, value: unknown, negate = false): string {
  const col = columnOf(rel, column);
  const ref = `t0.${ident(col.name)}`;
  let expr: string;
  if (op in FILTER_OPS) {
    if (col.isArray) throw new Unsupported("comparison on an array column");
    expr = `${ref} ${FILTER_OPS[op]} CAST(${sql.bind(scalar(value))} AS ${col.type})`;
  } else if (op === "like" || op === "ilike") {
    // PostgREST lets * stand for %.
    expr = `${ref}::text ${op === "like" ? "LIKE" : "ILIKE"} ${sql.bind(scalar(value).replace(/\*/g, "%"))}`;
  } else if (op === "is") {
    const v = value === null || value === "null" ? "NULL" : value === true || value === "true" ? "TRUE"
      : value === false || value === "false" ? "FALSE" : null;
    if (!v) throw new Unsupported(`is ${String(value)}`);
    expr = `${ref} IS ${v}`;
  } else if (op === "in") {
    if (col.isArray) throw new Unsupported("in on an array column");
    const list = Array.isArray(value) ? value : parseList(String(value));
    if (list.length === 0) return negate ? "TRUE" : "FALSE";
    expr = `${ref} = ANY(ARRAY(SELECT jsonb_array_elements_text(CAST(${sql.bind(JSON.stringify(list.map(scalar)))} AS jsonb)))::${col.type}[])`;
  } else {
    throw new Unsupported(`filter ${op}`);
  }
  return negate ? `NOT (${expr})` : expr;
}

function condition(sql: Sql, rel: Relation, c: Condition): string {
  if (c.kind === "op") return compare(sql, rel, c.column, c.op, c.value, c.negate);
  const inner = c.items.map((i) => condition(sql, rel, i));
  const joined = `(${inner.join(c.join === "and" ? " AND " : " OR ")})`;
  return c.negate ? `NOT ${joined}` : joined;
}

function resolveEmbed(catalog: Catalog, parent: Relation, item: Extract<SelectItem, { kind: "embed" }>): { fk: ForeignKey; toOne: boolean; target: Relation } {
  const candidates: { fk: ForeignKey; toOne: boolean; target: string }[] = [];
  for (const fk of catalog.foreignKeys) {
    if (fk.from === parent.name && (fk.to === item.relation || (fk.fromCols.length === 1 && fk.fromCols[0] === item.relation))) {
      candidates.push({ fk, toOne: true, target: fk.to });
    }
    if (fk.to === parent.name && fk.from === item.relation) candidates.push({ fk, toOne: false, target: fk.from });
  }
  const matched = item.hint
    ? candidates.filter((c) => c.fk.name === item.hint || (c.fk.fromCols.length === 1 && c.fk.fromCols[0] === item.hint))
    : candidates;
  if (matched.length !== 1) throw new Unsupported(`embed ${item.relation} (${matched.length} relationships)`);
  return { ...matched[0], target: relationOf(catalog, matched[0].target) };
}

/** The select list for one relation at alias `t<depth>`. */
function projection(catalog: Catalog, rel: Relation, items: SelectItem[], depth: number): string {
  const alias = `t${depth}`;
  return items.map((item) => {
    if (item.kind === "star") return `${alias}.*`;
    if (item.kind === "column") {
      const col = columnOf(rel, item.column);
      return `${alias}.${ident(col.name)} AS ${ident(item.alias ?? col.name)}`;
    }
    const { fk, toOne, target } = resolveEmbed(catalog, rel, item);
    const child = `t${depth + 1}`;
    const inner = projection(catalog, target, item.items, depth + 1);
    const on = toOne
      ? fk.fromCols.map((c, i) => `${child}.${ident(fk.toCols[i])} = ${alias}.${ident(c)}`)
      : fk.fromCols.map((c, i) => `${child}.${ident(c)} = ${alias}.${ident(fk.toCols[i])}`);
    const from = `FROM public.${ident(target.name)} AS ${child} WHERE ${on.join(" AND ")}`;
    const name = ident(item.alias ?? item.relation);
    return toOne
      ? `(SELECT to_json(s) FROM (SELECT ${inner} ${from} LIMIT 1) AS s) AS ${name}`
      : `(SELECT coalesce(json_agg(s), '[]'::json) FROM (SELECT ${inner} ${from}) AS s) AS ${name}`;
  }).join(", ");
}

function plan(ops: Op[], rel: Relation, sql: Sql): Plan {
  const p: Plan = { where: [], order: [] };
  for (const { m, a } of ops) {
    switch (m) {
      case "select":
        p.select = { columns: typeof a[0] === "string" ? a[0] : "*", options: (a[1] as Record<string, unknown>) ?? {} };
        break;
      case "insert": case "upsert": case "update": case "delete":
        if (p.write) throw new Unsupported("two writes");
        p.write = { kind: m, values: a[0], options: ((m === "delete" ? a[0] : a[1]) as Record<string, unknown>) ?? {} };
        if (m === "delete") p.write.values = undefined;
        break;
      case "eq": case "neq": case "gt": case "gte": case "lt": case "lte": case "like": case "ilike": case "is": case "in":
        p.where.push(compare(sql, rel, a[0] as string, m, a[1]));
        break;
      case "not":
        p.where.push(compare(sql, rel, a[0] as string, String(a[1]), a[2], true));
        break;
      case "filter": {
        const op = String(a[1]);
        p.where.push(op.startsWith("not.")
          ? compare(sql, rel, a[0] as string, op.slice(4), a[2], true)
          : compare(sql, rel, a[0] as string, op, a[2]));
        break;
      }
      case "match":
        for (const [k, v] of Object.entries((a[0] as Record<string, unknown>) ?? {})) p.where.push(compare(sql, rel, k, "eq", v));
        break;
      case "or": {
        const opts = (a[1] as Record<string, unknown>) ?? {};
        if (opts.referencedTable || opts.foreignTable) throw new Unsupported("or on an embedded table");
        const parts = splitTop(String(a[0])).map(parseCondition);
        p.where.push(`(${parts.map((c) => condition(sql, rel, c)).join(" OR ")})`);
        break;
      }
      case "order": {
        const opts = (a[1] as Record<string, unknown>) ?? {};
        if (opts.referencedTable || opts.foreignTable) throw new Unsupported("order on an embedded table");
        const col = columnOf(rel, a[0]);
        const dir = opts.ascending === false ? "DESC" : "ASC";
        const nulls = opts.nullsFirst === true ? " NULLS FIRST" : opts.nullsFirst === false ? " NULLS LAST" : "";
        p.order.push(`t0.${ident(col.name)} ${dir}${nulls}`);
        break;
      }
      case "limit": {
        const opts = (a[1] as Record<string, unknown>) ?? {};
        if (opts.referencedTable || opts.foreignTable) throw new Unsupported("limit on an embedded table");
        p.limit = Math.max(0, Math.floor(Number(a[0])));
        break;
      }
      case "range": {
        const opts = (a[2] as Record<string, unknown>) ?? {};
        if (opts.referencedTable || opts.foreignTable) throw new Unsupported("range on an embedded table");
        const from = Math.max(0, Math.floor(Number(a[0])));
        const to = Math.floor(Number(a[1]));
        p.offset = from;
        p.limit = Math.max(0, to - from + 1);
        break;
      }
      case "single": p.single = "single"; break;
      case "maybeSingle": p.single = "maybe"; break;
      default:
        throw new Unsupported(`method ${m}`);
    }
  }
  if (!p.write && !p.select) throw new Unsupported("nothing to do");
  if (p.write && (p.order.length || p.limit !== undefined || p.offset !== undefined)) throw new Unsupported("order/limit on a write");
  if (p.write && Object.keys(p.write.options ?? {}).some((k) => k === "count")) throw new Unsupported("count on a write");
  if (p.select?.options.count && p.write) throw new Unsupported("count on a write");
  return p;
}

const WRITE_STATUS = { insert: 201, upsert: 201, update: 204, delete: 204 } as const;

function shapeSingle(rows: unknown[], mode: Plan["single"], status: number): QueryResult {
  if (!mode) return { data: rows, count: null, status };
  if (rows.length === 1) return { data: rows[0], count: null, status: status === 204 ? 200 : status };
  if (rows.length === 0 && mode === "maybe") return { data: null, count: null, status: 200 };
  return {
    data: null, count: null, status: 406,
    error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` },
  };
}

function writeSql(sql: Sql, rel: Relation, p: Plan): string {
  if (rel.kind !== "table") throw new Unsupported("write to a view");
  const w = p.write!;
  const opts = w.options ?? {};
  if (w.kind === "delete") {
    if (!p.where.length) throw new Unsupported("delete without a filter");
    return `DELETE FROM public.${ident(rel.name)} AS t0 WHERE ${p.where.join(" AND ")} RETURNING t0.*`;
  }
  if (w.kind === "update") {
    if (!p.where.length) throw new Unsupported("update without a filter");
    if (!w.values || typeof w.values !== "object" || Array.isArray(w.values)) throw new Unsupported("update values");
    const cols = Object.keys(w.values).map((k) => columnOf(rel, k));
    if (!cols.length) throw new Unsupported("empty update");
    const set = cols.map((c) => `${ident(c.name)} = r.${ident(c.name)}`).join(", ");
    return `UPDATE public.${ident(rel.name)} AS t0 SET ${set}
      FROM jsonb_populate_record(NULL::public.${ident(rel.name)}, CAST(${sql.bind(JSON.stringify(w.values))} AS jsonb)) AS r
      WHERE ${p.where.join(" AND ")} RETURNING t0.*`;
  }
  // insert / upsert
  if (opts.defaultToNull === false) throw new Unsupported("defaultToNull: false");
  const rows = Array.isArray(w.values) ? w.values : [w.values];
  if (!rows.length || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new Unsupported("insert values");
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
  const cols = keys.map((k) => columnOf(rel, k));
  const list = cols.map((c) => ident(c.name)).join(", ");
  let stmt = `INSERT INTO public.${ident(rel.name)} (${list})
    SELECT ${list} FROM jsonb_populate_recordset(NULL::public.${ident(rel.name)}, CAST(${sql.bind(JSON.stringify(rows))} AS jsonb))`;
  if (w.kind === "upsert") {
    const target = typeof opts.onConflict === "string"
      ? opts.onConflict.split(",").map((s) => columnOf(rel, s.trim()).name)
      : rel.primaryKey;
    if (!target.length) throw new Unsupported("upsert without a conflict target");
    const updates = cols.filter((c) => !target.includes(c.name)).map((c) => `${ident(c.name)} = EXCLUDED.${ident(c.name)}`);
    stmt += ` ON CONFLICT (${target.map(ident).join(", ")}) `
      + (opts.ignoreDuplicates || !updates.length ? "DO NOTHING" : `DO UPDATE SET ${updates.join(", ")}`);
  }
  return `${stmt} RETURNING *`;
}

export async function runQuery(tx: Tx, table: string, ops: Op[]): Promise<QueryResult> {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 100) throw new Unsupported("operations");
  const catalog = await loadCatalog(tx);
  const rel = relationOf(catalog, table);
  const sql = new Sql();
  const p = plan(ops, rel, sql);
  const items = p.select ? parseSelect(p.select.columns) : [];

  if (p.write) {
    const write = writeSql(sql, rel, p);
    const status = WRITE_STATUS[p.write.kind];
    if (!p.select) {
      await tx.$executeRawUnsafe(write, ...sql.params);
      return { data: null, count: null, status };
    }
    const proj = projection(catalog, rel, items, 0);
    const rows = await tx.$queryRawUnsafe<{ data: unknown[] }[]>(
      `WITH w AS (${write}) SELECT coalesce(json_agg(q), '[]'::json) AS data FROM (SELECT ${proj} FROM w AS t0) AS q`,
      ...sql.params,
    );
    return shapeSingle(rows[0]?.data ?? [], p.single, status === 204 ? 200 : status);
  }

  const where = p.where.length ? `WHERE ${p.where.join(" AND ")}` : "";
  const from = `FROM public.${ident(rel.name)} AS t0 ${where}`;
  let count: number | null = null;
  if (p.select?.options.count) {
    const r = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n ${from}`, ...sql.params);
    count = Number(r[0]?.n ?? 0);
  }
  if (p.select?.options.head) return { data: null, count, status: 200 };

  const limit = Math.min(p.limit ?? MAX_ROWS, MAX_ROWS);
  const orderBy = p.order.length ? `ORDER BY ${p.order.join(", ")}` : "";
  const proj = projection(catalog, rel, items, 0);
  // As PostgREST builds it: json (not jsonb) keeps the columns in table
  // order, and json_agg over the ordered, limited subquery keeps row order.
  const rows = await tx.$queryRawUnsafe<{ data: unknown[] }[]>(
    `SELECT coalesce(json_agg(q), '[]'::json) AS data
     FROM (SELECT ${proj} ${from} ${orderBy} LIMIT ${limit} OFFSET ${p.offset ?? 0}) AS q`,
    ...sql.params,
  );
  const result = shapeSingle(rows[0]?.data ?? [], p.single, 200);
  return { ...result, count };
}
