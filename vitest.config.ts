import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Edge functions import Deno builds kept in supabase/functions/_vendor.
      // Map them to Node equivalents so their logic can be tested here.
      { find: /^(?:\.\.\/)+_vendor\/esm\.sh\/@supabase\/supabase-js@[^/]+\/_entry\.mjs$/, replacement: "@supabase/supabase-js" },
      { find: /^(?:\.\.\/)+_vendor\/deno\.land\/x\/denomailer@[^/]+\/mod\.ts$/, replacement: path.resolve(__dirname, "./src/test/stubs/denomailer.ts") },
    ],
  },
});
