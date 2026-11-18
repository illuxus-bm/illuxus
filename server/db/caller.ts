/**
 * Runs database work as the person making the request.
 *
 * Today the browser talks to Postgres through Supabase's API, which runs each
 * request as the `anon` or `authenticated` role with the caller's token
 * claims set, so row security policies, triggers and SQL functions that call
 * auth.uid() decide what each person may see and do. The Prisma API keeps
 * exactly that: every request is one transaction that switches to the same
 * role and sets the same claims, so the existing policies keep enforcing
 * access. There is no second copy of the rules to drift out of step, and the
 * same code works on Supabase and on AWS RDS (scripts/rds/bootstrap.sql
 * provides the roles and auth.uid() there).
 */
import type { Prisma, PrismaClient } from "./generated/client.js";
import { prisma } from "./client.js";

export type Caller =
  | { kind: "anon" }
  | { kind: "user"; userId: string; claims: Record<string, unknown> };

export const ANONYMOUS: Caller = { kind: "anon" };

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The role and claims Postgres sees for this caller. Exported for tests. */
export function sessionSettings(caller: Caller): { role: "anon" | "authenticated"; sub: string; claims: string } {
  if (caller.kind === "anon") return { role: "anon", sub: "", claims: JSON.stringify({ role: "anon" }) };
  if (!UUID.test(caller.userId)) throw new Error("caller userId is not a UUID");
  return {
    role: "authenticated",
    sub: caller.userId,
    claims: JSON.stringify({ ...caller.claims, role: "authenticated", sub: caller.userId }),
  };
}

export async function asCaller<T>(
  caller: Caller,
  work: (tx: Tx) => Promise<T>,
  options: { client?: PrismaClient; timeoutMs?: number } = {},
): Promise<T> {
  const { role, sub, claims } = sessionSettings(caller);
  const client = options.client ?? prisma();
  return client.$transaction(
    async (tx) => {
      // is_local = true: these last only until the transaction ends, so a
      // pooled connection never carries one caller's identity to the next.
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${claims}, true),
                                  set_config('request.jwt.claim.sub', ${sub}, true),
                                  set_config('request.jwt.claim.role', ${role}, true)`;
      // `role` is one of two fixed strings (never request input), so it is
      // safe to place in the statement; SET can't take a bind parameter.
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      return work(tx);
    },
    { timeout: options.timeoutMs ?? 10_000, maxWait: 5_000 },
  );
}
