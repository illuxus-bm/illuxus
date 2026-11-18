/**
 * The Prisma client, one per function instance. Prisma 7 talks to Postgres
 * through a driver adapter; this one is node-postgres, which works with AWS
 * RDS, Supabase (direct or pooled connection) and any other Postgres.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import { serverEnv } from "../env.js";

const globalForPrisma = globalThis as unknown as { __illuxusPrisma?: PrismaClient };

export function prisma(): PrismaClient {
  if (globalForPrisma.__illuxusPrisma) return globalForPrisma.__illuxusPrisma;
  const env = serverEnv();
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    // Fail fast rather than hang a request when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    // Stop a runaway query before the function's own time limit does.
    statement_timeout: 15_000,
    ...(env.DATABASE_SSL_CA ? { ssl: { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true } } : {}),
  });
  const client = new PrismaClient({ adapter });
  globalForPrisma.__illuxusPrisma = client;
  return client;
}

export type { PrismaClient };
