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
      // Edge functions import from URLs (Deno). Map them to local equivalents so
      // their logic can be imported and tested here.
      { find: /^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/, replacement: "@supabase/supabase-js" },
      { find: /^https:\/\/deno\.land\/x\/denomailer@[^/]+\/mod\.ts$/, replacement: path.resolve(__dirname, "./src/test/stubs/denomailer.ts") },
    ],
  },
});
