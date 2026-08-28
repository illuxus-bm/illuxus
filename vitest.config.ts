import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // Edge-function shared modules are plain TypeScript with no Deno
      // globals and dependency-injected Supabase clients, so their
      // authorization logic is unit-testable here. This is the only
      // coverage the edge functions get — Deno files themselves are not
      // executed by vitest.
      "supabase/functions/**/__tests__/*.{test,spec}.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
