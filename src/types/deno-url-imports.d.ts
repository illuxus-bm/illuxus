// Edge functions under supabase/functions run on Deno and import from URLs.
// These declarations let the same files be type-checked and tested here.
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare module "https://deno.land/x/denomailer@1.6.0/mod.ts" {
  export class SMTPClient {
    constructor(config: unknown);
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
  }
}
