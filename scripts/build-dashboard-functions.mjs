#!/usr/bin/env node
// Writes supabase/functions/<name>/dashboard-inline.ts for the functions that
// can be deployed by pasting into the Supabase Dashboard editor, which takes
// a single file. Each one is bundled from the function's own index.ts with
// the ../_shared modules inlined (remote https:// imports stay as imports),
// so the pasted copy is exactly the reviewed code — never a hand-kept twin.
//
//   npm run functions:inline
//
// Deploying with the Supabase CLI (`supabase functions deploy`) needs none of
// this: it bundles index.ts itself.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions");

export const DASHBOARD_FUNCTIONS = [
  "send-communication-email",
  "send-email",
  "send-event-email",
  "send-speaker-invite-email",
  "send-sponsor-invite-email",
  "notify-venue-selection",
  "notify-organizer-venue-response",
];

for (const name of DASHBOARD_FUNCTIONS) {
  const result = await build({
    entryPoints: [join(root, name, "index.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: ["https://*", "npm:*", "jsr:*", "node:*"],
    write: false,
    legalComments: "inline",
    logLevel: "error",
  });
  const banner =
    `// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.\n` +
    `// Paste this whole file into the Supabase Dashboard editor for \`${name}\` and Deploy.\n` +
    `// Re-generate after changing index.ts or ../_shared: npm run functions:inline\n\n`;
  writeFileSync(join(root, name, "dashboard-inline.ts"), banner + result.outputFiles[0].text);
  console.log(`wrote ${name}/dashboard-inline.ts`);
}
