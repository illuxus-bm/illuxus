/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** "api" routes migrated screens through the Prisma API (api/v1); anything else keeps Supabase. */
  readonly VITE_DATA_BACKEND?: "supabase" | "api";
  /** Overrides where the API lives (defaults to this site, or illuxus.com in the native apps). */
  readonly VITE_API_BASE_URL?: string;
}
