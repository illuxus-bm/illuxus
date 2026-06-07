#!/usr/bin/env node
/**
 * Slug health-check.
 *
 * For every published event, verify that:
 *   1. /events/:slug             resolves via the public RPC (`get_event_by_slug`)
 *   2. /org/:orgSlug/events/:slug resolves with the same RPC + org scope
 *
 * Run locally:
 *   node scripts/check-event-slugs.mjs
 *
 * Run against a deployed Supabase project by setting:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_ANON_KEY=<anon-key>
 *
 * Exits non-zero if any slug fails to resolve.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;
  try {
    const dotenv = readFileSync(resolve(here, "..", ".env"), "utf8");
    for (const line of dotenv.split("\n")) {
      const [k, ...rest] = line.split("=");
      if (!k || !rest.length) continue;
      const value = rest.join("=").trim().replace(/^"|"$/g, "");
      if (k === "VITE_SUPABASE_URL" && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = value;
      if (k === "VITE_SUPABASE_PUBLISHABLE_KEY" && !process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = value;
    }
  } catch {
    // ignore — env may already be set
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  process.exit(2);
}

const supabase = createClient(url, key);

const { data: events, error } = await supabase
  .from("events")
  .select("id, slug, org_id, status")
  .eq("status", "published");

if (error) {
  console.error("Failed to list events:", error.message);
  process.exit(2);
}

if (!events || events.length === 0) {
  console.log("No published events to check.");
  process.exit(0);
}

// Look up org slugs once
const orgIds = [...new Set(events.map((e) => e.org_id).filter(Boolean))];
const { data: orgs } = orgIds.length
  ? await supabase.from("organizations").select("id, slug, subdomain").in("id", orgIds)
  : { data: [] };
const orgById = new Map((orgs || []).map((o) => [o.id, o]));

let failures = 0;
let passed = 0;

for (const ev of events) {
  const org = ev.org_id ? orgById.get(ev.org_id) : null;
  // 1) /events/:slug
  const r1 = await supabase.rpc("get_event_by_slug", { _slug: ev.slug });
  const ok1 = Array.isArray(r1.data) && r1.data[0]?.id === ev.id;
  if (ok1) passed++;
  else {
    failures++;
    console.error(`✗ /events/${ev.slug} -> not found (event ${ev.id})`);
  }

  // 2) /org/:orgSlug/events/:slug — only when org has a public slug
  if (org?.slug) {
    const r2 = await supabase.rpc("get_event_by_slug", { _slug: ev.slug, _org_slug: org.slug });
    const ok2 = Array.isArray(r2.data) && r2.data[0]?.id === ev.id;
    if (ok2) passed++;
    else {
      failures++;
      console.error(`✗ /org/${org.slug}/events/${ev.slug} -> not found (event ${ev.id})`);
    }
  }
}

console.log(`\nChecked ${events.length} events — ${passed} OK, ${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);