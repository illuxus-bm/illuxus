/**
 * The bits of the Deno runtime the edge functions use, for their Node ports
 * (server/functions). `Deno.env.get` reads process.env, so a function's
 * secrets (SMTP_*, GEMINI_API_KEY, LIVEKIT_*, …) are set as Vercel
 * environment variables under the same names.
 */
export const Deno = {
  env: {
    get: (name: string): string | undefined => process.env[name],
    toObject: (): Record<string, string> =>
      Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
  },
};

/** A ported function: the handler its `Deno.serve(...)` was given. */
export type EdgeHandler = (req: Request) => Response | Promise<Response>;

/** Marks a module's default export as its request handler (was `Deno.serve(handler)`). */
export function defineHandler(handler: EdgeHandler): EdgeHandler {
  return handler;
}
