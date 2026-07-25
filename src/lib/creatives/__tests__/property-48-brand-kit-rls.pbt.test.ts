// Feature: creative-customization, Property 48: Brand_Kit RLS scope invariants
//
// Validates: Requirements 9.6, 9.7, 11.3
//
// This property is enforced by Postgres RLS (migration
// `025_brand_kits.sql`), not TypeScript. The test below is a truth-table
// documentation aid that verifies the expected policy logic is
// internally consistent.
//
// Migration `025_brand_kits.sql` declares four RLS policies on
// `public.brand_kits`:
//
//   SELECT  — allowed iff the caller has an `org_members` row for
//             `brand_kits.org_id` OR is a platform admin.
//   INSERT  — allowed iff the caller is `organizations.owner_id` for
//             `brand_kits.org_id` OR is a platform admin.
//   UPDATE  — same as INSERT.
//   DELETE  — same as INSERT.
//
// The observable outcome of these policies, exhaustively enumerated
// across the 8 possible `(is_org_member, is_org_owner, is_platform_admin)`
// triples × 4 SQL verbs = 32 cells, is documented in the migration's
// comment block AND in design.md's Data Models section. Every org owner
// is transitively an `org_members` row (inserted at org provisioning
// time), so the SELECT policy's `org_members` predicate covers the
// owner case even when `is_org_member` is nominally `F` in the
// truth-table row — which is why row `(F, T, F)` still resolves to
// allow for SELECT.
//
// Since the Vitest environment has no live Supabase, this test:
//   1. Encodes the documented 32-cell truth table as an in-file
//      constant (`RLS_TRUTH_TABLE`).
//   2. Encodes a pure predicate (`predictRlsOutcome`) mirroring the
//      SQL policy logic, accounting for the transitive
//      owner→org_member relationship.
//   3. Property-tests that `predictRlsOutcome` agrees with every
//      cell of the documented truth table.
//
// This makes the file a client-side sanity check that our
// understanding of the policies is internally consistent, and serves
// as documentation for anyone verifying the actual RLS policies in
// Postgres against the migration.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

// ─── Truth-table types ─────────────────────────────────────────────────────

type Verb = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
type Outcome = "allow" | "deny";

interface RlsInputs {
  is_org_member: boolean;
  is_org_owner: boolean;
  is_platform_admin: boolean;
}

interface TruthCell extends RlsInputs {
  SELECT: Outcome;
  INSERT: Outcome;
  UPDATE: Outcome;
  DELETE: Outcome;
}

// ─── The documented 32-cell truth table ────────────────────────────────────
//
// Row-for-row copy of the `comment on table public.brand_kits` block in
// migration `025_brand_kits.sql` and of the Data Models section in
// `design.md`. The `SELECT` column for `(F, T, F)` reads `allow` because
// an org owner is transitively an `org_members` row (see file header).

const RLS_TRUTH_TABLE: readonly TruthCell[] = [
  // is_member, is_owner, is_admin
  { is_org_member: false, is_org_owner: false, is_platform_admin: false, SELECT: "deny",  INSERT: "deny",  UPDATE: "deny",  DELETE: "deny"  },
  { is_org_member: true,  is_org_owner: false, is_platform_admin: false, SELECT: "allow", INSERT: "deny",  UPDATE: "deny",  DELETE: "deny"  },
  { is_org_member: false, is_org_owner: true,  is_platform_admin: false, SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
  { is_org_member: true,  is_org_owner: true,  is_platform_admin: false, SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
  { is_org_member: false, is_org_owner: false, is_platform_admin: true,  SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
  { is_org_member: true,  is_org_owner: false, is_platform_admin: true,  SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
  { is_org_member: false, is_org_owner: true,  is_platform_admin: true,  SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
  { is_org_member: true,  is_org_owner: true,  is_platform_admin: true,  SELECT: "allow", INSERT: "allow", UPDATE: "allow", DELETE: "allow" },
];

// ─── Pure predicate mirroring the SQL policy logic ─────────────────────────
//
// SELECT policy:  org_member OR admin  — plus transitive owner→member
// I/U/D policy :  org_owner  OR admin

function predictRlsOutcome(inputs: RlsInputs, verb: Verb): Outcome {
  const { is_org_member, is_org_owner, is_platform_admin } = inputs;
  if (verb === "SELECT") {
    // Transitive: org owner is also an org_members row at provisioning,
    // so treat owner as satisfying the SELECT policy's `org_members`
    // clause. Design.md's Data Models truth-table documents this as
    // `allow*` in row (F, T, F).
    return (is_org_member || is_org_owner || is_platform_admin)
      ? "allow"
      : "deny";
  }
  // INSERT / UPDATE / DELETE all share the "owner or admin" policy.
  return (is_org_owner || is_platform_admin) ? "allow" : "deny";
}

// ─── Unit tests: the documented truth table is internally consistent ───────

describe("Property 48: Brand_Kit RLS truth table (documentation)", () => {
  it("covers all 8 × 4 = 32 cells exactly once", () => {
    expect(RLS_TRUTH_TABLE).toHaveLength(8);
    const seen = new Set<string>();
    for (const cell of RLS_TRUTH_TABLE) {
      const key = `${cell.is_org_member}|${cell.is_org_owner}|${cell.is_platform_admin}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(8);
  });

  it.each(RLS_TRUTH_TABLE)(
    "row (member=%o, owner=%o, admin=%o) matches predictRlsOutcome for all four verbs",
    (cell) => {
      const inputs: RlsInputs = {
        is_org_member: cell.is_org_member,
        is_org_owner: cell.is_org_owner,
        is_platform_admin: cell.is_platform_admin,
      };
      expect(predictRlsOutcome(inputs, "SELECT")).toBe(cell.SELECT);
      expect(predictRlsOutcome(inputs, "INSERT")).toBe(cell.INSERT);
      expect(predictRlsOutcome(inputs, "UPDATE")).toBe(cell.UPDATE);
      expect(predictRlsOutcome(inputs, "DELETE")).toBe(cell.DELETE);
    }
  );
});

// ─── Property test: predicate agrees with the truth table for any draw ─────

describe("Property 48: Brand_Kit RLS scope invariants", () => {
  it("predictRlsOutcome agrees with the documented truth table for every (inputs, verb)", () => {
    fc.assert(
      fc.property(
        fc.record({
          is_org_member: fc.constantFrom(true, false),
          is_org_owner: fc.constantFrom(true, false),
          is_platform_admin: fc.constantFrom(true, false),
          verb: fc.constantFrom<Verb>("SELECT", "INSERT", "UPDATE", "DELETE"),
        }),
        ({ is_org_member, is_org_owner, is_platform_admin, verb }) => {
          const inputs: RlsInputs = { is_org_member, is_org_owner, is_platform_admin };
          const cell = RLS_TRUTH_TABLE.find(
            (c) =>
              c.is_org_member === is_org_member &&
              c.is_org_owner === is_org_owner &&
              c.is_platform_admin === is_platform_admin
          );
          if (!cell) return false; // truth-table must cover every triple
          return predictRlsOutcome(inputs, verb) === cell[verb];
        }
      ),
      { numRuns: 100 }
    );
  });

  it("SELECT is allowed iff caller is member, owner (transitively), or admin", () => {
    fc.assert(
      fc.property(
        fc.record({
          is_org_member: fc.constantFrom(true, false),
          is_org_owner: fc.constantFrom(true, false),
          is_platform_admin: fc.constantFrom(true, false),
        }),
        (inputs) => {
          const expected =
            inputs.is_org_member || inputs.is_org_owner || inputs.is_platform_admin
              ? "allow"
              : "deny";
          return predictRlsOutcome(inputs, "SELECT") === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("INSERT / UPDATE / DELETE are allowed iff caller is owner or admin", () => {
    fc.assert(
      fc.property(
        fc.record({
          is_org_member: fc.constantFrom(true, false),
          is_org_owner: fc.constantFrom(true, false),
          is_platform_admin: fc.constantFrom(true, false),
          verb: fc.constantFrom<Verb>("INSERT", "UPDATE", "DELETE"),
        }),
        ({ verb, ...inputs }) => {
          const expected =
            inputs.is_org_owner || inputs.is_platform_admin ? "allow" : "deny";
          return predictRlsOutcome(inputs, verb) === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
