import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7). The schema lives in prisma/schema.prisma.
 *
 * DATABASE_URL is the connection string of the Postgres database the API
 * talks to: AWS RDS in production (docs/PRISMA_MIGRATION.md), the existing
 * Supabase database, or a local one. Never commit it; set it in Vercel and
 * in .env.local for development.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Only commands that touch a database need it; `prisma generate` (run on
  // install) works without one, so builds and CI need no database secret.
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
