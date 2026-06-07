#!/usr/bin/env node
/**
 * Token-usage audit for the shared quick-view dialogs.
 *
 * Fails (exit 1) if any of the audited files contain raw color values, raw
 * Tailwind palette utilities, or inline font-size styles. Quick views must use
 * only semantic tokens (`bg-background`, `text-foreground`, `border-border`,
 * `bg-accent`, etc.) so light/dark parity is guaranteed.
 *
 * Run manually: `node scripts/audit-quickview-tokens.mjs`
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "src/components/event/page-form/sections/QuickViewDialog.tsx",
  "src/components/event/page-form/sections/SponsorQuickViewDialog.tsx",
  "src/components/event/page-form/sections/SpeakerQuickViewDialog.tsx",
];

const RAW_COLOR_PALETTES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];
const PALETTE_RE = new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:${RAW_COLOR_PALETTES.join("|")})-\\d{2,3}\\b`, "g");
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FN_COLOR_RE = /\b(?:rgb|rgba|hsl|hsla)\(/g;
const INLINE_FONT_SIZE_RE = /style=\{[^}]*fontSize\s*:/g;

let failures = 0;
for (const rel of FILES) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  const findings = [];
  for (const [name, re] of [
    ["palette utility", PALETTE_RE],
    ["hex color", HEX_RE],
    ["color function", FN_COLOR_RE],
    ["inline fontSize", INLINE_FONT_SIZE_RE],
  ]) {
    const matches = src.match(re);
    if (matches) findings.push(`  - ${name}: ${[...new Set(matches)].join(", ")}`);
  }
  if (findings.length) {
    failures++;
    console.error(`✗ ${rel}`);
    for (const f of findings) console.error(f);
  } else {
    console.log(`✓ ${rel}`);
  }
}

if (failures) {
  console.error(`\n${failures} file(s) contain non-semantic styling. Use design tokens only.`);
  process.exit(1);
}
console.log("\nAll quick-view files use semantic tokens only.");