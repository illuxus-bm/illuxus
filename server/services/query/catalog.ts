/**
 * What the query endpoint may touch: the public schema's tables and views,
 * their columns (with Postgres types) and foreign keys, read from the
 * database itself so it can never disagree with it. Cached per function
 * instance; the schema only changes on deploys.
 */
import type { Tx } from "../../db/caller.js";

export type Column = { name: string; type: string; isArray: boolean };
export type ForeignKey = { name: string; from: string; fromCols: string[]; to: string; toCols: string[] };
export type Relation = { name: string; kind: "table" | "view"; columns: Map<string, Column>; primaryKey: string[] };
export type Catalog = { relations: Map<string, Relation>; foreignKeys: ForeignKey[] };

let cached: { at: number; catalog: Catalog } | null = null;
const TTL_MS = 5 * 60_000;

export async function loadCatalog(tx: Tx): Promise<Catalog> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.catalog;

  const cols = await tx.$queryRaw<{ rel: string; kind: string; col: string; type: string }[]>`
    SELECT c.relname::text AS rel, c.relkind::text AS kind, a.attname::text AS col, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY c.relname, a.attnum`;
  const pks = await tx.$queryRaw<{ rel: string; cols: string[] }[]>`
    SELECT c.relname::text AS rel, ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.i) AS cols
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'p' AND n.nspname = 'public'`;
  const fks = await tx.$queryRaw<{ name: string; from_rel: string; from_cols: string[]; to_rel: string; to_cols: string[] }[]>`
    SELECT con.conname::text AS name, c.relname::text AS from_rel, r.relname::text AS to_rel,
           ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.i) AS from_cols,
           ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n, i)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.i) AS to_cols
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class r ON r.oid = con.confrelid JOIN pg_namespace rn ON rn.oid = r.relnamespace
    WHERE con.contype = 'f' AND n.nspname = 'public' AND rn.nspname = 'public'`;

  const relations = new Map<string, Relation>();
  for (const c of cols) {
    let rel = relations.get(c.rel);
    if (!rel) {
      rel = { name: c.rel, kind: c.kind === "v" || c.kind === "m" ? "view" : "table", columns: new Map(), primaryKey: [] };
      relations.set(c.rel, rel);
    }
    rel.columns.set(c.col, { name: c.col, type: c.type, isArray: c.type.endsWith("[]") });
  }
  for (const pk of pks) {
    const rel = relations.get(pk.rel);
    if (rel) rel.primaryKey = pk.cols;
  }
  const foreignKeys = fks.map((f) => ({ name: f.name, from: f.from_rel, fromCols: f.from_cols, to: f.to_rel, toCols: f.to_cols }));

  const catalog = { relations, foreignKeys };
  cached = { at: Date.now(), catalog };
  return catalog;
}

/** Double-quoted identifier. Only ever called with names found in the catalog. */
export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
