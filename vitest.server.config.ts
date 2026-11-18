import { defineConfig } from "vitest/config";

// The Prisma API (server/, api/v1/). Node, not jsdom: it never runs in a browser.
// Database tests run only when TEST_DATABASE_URL is set (CI's prisma job).
export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The database tests share one database: one file at a time.
    fileParallelism: false,
  },
});
