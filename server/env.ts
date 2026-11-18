/**
 * Server configuration, read once and validated. A missing or malformed
 * value fails the first request with a clear message in the logs instead of
 * an obscure driver error later. Never import this from browser code.
 */
import { z } from "zod";

const schema = z.object({
  /** Postgres connection string: AWS RDS, Supabase, or local. */
  DATABASE_URL: z.string().url(),
  /**
   * Optional: a login that owns the tables, for server-side work that must
   * bypass row security (the ported edge functions' service-role client).
   * On Supabase, leave unset: service_role already bypasses row security.
   * On AWS RDS, service_role can't (BYPASSRLS needs a superuser), so set
   * this to the schema owner's connection string.
   */
  DATABASE_SERVICE_URL: z.string().url().optional(),
  /** Max connections per function instance. Serverless instances are many and short-lived: keep it small. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(3),
  /** PEM CA bundle for TLS to the database (AWS RDS: the regional bundle). Optional. */
  DATABASE_SSL_CA: z.string().optional(),
  /** Supabase project URL; used to find its signing keys when AUTH_JWKS_URL isn't set. */
  SUPABASE_URL: z.string().url().optional(),
  /** Where the identity provider publishes its public signing keys (JWKS). */
  AUTH_JWKS_URL: z.string().url().optional(),
  /** Expected `iss` of access tokens. Defaults to `<SUPABASE_URL>/auth/v1`. */
  AUTH_ISSUER: z.string().optional(),
  /** Expected `aud` of access tokens. */
  AUTH_AUDIENCE: z.string().default("authenticated"),
  /** Legacy HS256 secret, only while the project still signs tokens with one. */
  AUTH_JWT_SECRET: z.string().min(32).optional(),
});

export type ServerEnv = z.infer<typeof schema> & { AUTH_JWKS_URL?: string; AUTH_ISSUER?: string };

let cached: ServerEnv | null = null;

export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Server misconfigured: check ${names}`);
  }
  const env: ServerEnv = { ...parsed.data };
  const base = env.SUPABASE_URL?.replace(/\/+$/, "");
  env.AUTH_ISSUER ??= base ? `${base}/auth/v1` : undefined;
  env.AUTH_JWKS_URL ??= base ? `${base}/auth/v1/.well-known/jwks.json` : undefined;
  if (source === process.env) cached = env;
  return env;
}
