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
import { prisma, servicePrisma } from "./client.js";

export type Caller =
  | { kind: "anon" }
  | { kind: "user"; userId: string; claims: Record<string, unknown> }
  /** Server-side work with the service role (the ported edge functions). Never from a request. */
  | { kind: "service" };

export const ANONYMOUS: Caller = { kind: "anon" };
export const SERVICE: Caller = { kind: "service" };

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The role and claims Postgres sees for this caller. Exported for tests. */
export function sessionSettings(caller: Caller): { role: "anon" | "authenticated" | "service_role"; sub: string; claims: string } {
  if (caller.kind === "anon") return { role: "anon", sub: "", claims: JSON.stringify({ role: "anon" }) };
  if (caller.kind === "service") return { role: "service_role", sub: "", claims: JSON.stringify({ role: "service_role" }) };
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
  // Service work on RDS runs on the owner's connection, which bypasses row
  // security as owner; it keeps the service_role claims SQL functions check.
  const owner = caller.kind === "service" && !options.client ? servicePrisma() : null;
  const client = options.client ?? owner ?? prisma();
  return client.$transaction(
    async (tx) => {
      // is_local = true: these last only until the transaction ends, so a
      // pooled connection never carries one caller's identity to the next.
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${claims}, true),
                                  set_config('request.jwt.claim.sub', ${sub}, true),
                                  set_config('request.jwt.claim.role', ${role}, true)`;
      // `role` is one of three fixed strings (never request input), so it is
      // safe to place in the statement; SET can't take a bind parameter.
      if (!owner) await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      return work(tx);
    },
    { timeout: options.timeoutMs ?? 10_000, maxWait: 5_000 },
  );
}
