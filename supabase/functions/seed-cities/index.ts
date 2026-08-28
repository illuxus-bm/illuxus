// Seeds the global `cities` table from the GeoNames cities5000 dataset.
// Platform-admin only, enforced in-function (see the authorization block in
// the handler). Idempotent — safe to re-run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.45/index.js";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import { requirePlatformAdmin, requireUser } from "../_shared/auth.ts";

const log = createEdgeLogger("seed-cities");

/**
 * A row as upserted into `public.cities`. Typed explicitly rather than `any[]`
 * so a column rename in the migration surfaces here at author time instead of
 * as a silent PostgREST rejection mid-import.
 */
interface CityRow {
  geoname_id: number;
  name: string;
  ascii_name: string;
  region: string | null;
  region_code: string | null;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  population: number;
  timezone: string | null;
}

/**
 * The parts of a zip.js entry this function touches. `getEntries()` returns a
 * loosely-typed array from the remote `zipjs` module, which is why the
 * predicate was previously `(e: any)`.
 */
interface ZipEntryLike {
  filename: string;
  getData?: (writer: unknown) => Promise<unknown>;
}

const GEONAMES_URL = "https://download.geonames.org/export/dump/cities5000.zip";
const COUNTRIES_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
const ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";

async function fetchCountries(): Promise<Record<string, string>> {
  const res = await fetch(COUNTRIES_URL);
  const text = await res.text();
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    // ISO,ISO3,ISO-Numeric,fips,Country,Capital,...
    if (cols.length > 4) out[cols[0]] = cols[4];
  }
  return out;
}

async function fetchAdmin1(): Promise<Record<string, string>> {
  const res = await fetch(ADMIN1_URL);
  const text = await res.text();
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line) continue;
    const cols = line.split("\t");
    // code (e.g. "IN.16"), name, asciiName, geonameId
    if (cols.length >= 2) out[cols[0]] = cols[1];
  }
  return out;
}

async function fetchCitiesText(): Promise<string> {
  const res = await fetch(GEONAMES_URL);
  const blob = await res.blob();
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  const txt = (entries as ZipEntryLike[]).find((e) => e.filename.endsWith(".txt"));
  if (!txt || !txt.getData) {
    await reader.close();
    throw new Error("cities5000.txt not found in zip");
  }
  const text = await txt.getData(new TextWriter());
  await reader.close();
  return text as string;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Authorization — platform admin only ──────────────────────────────
    // This used to allow any caller with the comment "the DB is protected by
    // RLS". That reasoning was wrong: the client below is service-role, so
    // RLS does not apply at all. Unauthenticated, the endpoint was a cost /
    // compute DoS — every hit downloads a ~10MB GeoNames archive and bulk
    // upserts thousands of rows.
    const caller = await requireUser(req, admin);
    if (!caller.ok) {
      log.warn("unauthenticated seed rejected", { status: caller.status });
      return json({ error: caller.error }, caller.status);
    }
    const authz = await requirePlatformAdmin(admin, caller.user.id);
    if (!authz.ok) {
      log.warn("non-admin seed rejected", { actor_id: caller.user.id });
      return json({ error: authz.error }, authz.status);
    }

    log.info("invoked", { actor_id: caller.user.id });

    log.info("fetching reference data");
    const [countries, admin1] = await Promise.all([
      fetchCountries(),
      fetchAdmin1(),
    ]);

    log.info("downloading cities zip");
    const text = await fetchCitiesText();
    const lines = text.split("\n");
    log.info("downloaded", { line_count: lines.length });

    // GeoNames format (tab-separated):
    // 0 geonameid 1 name 2 asciiname 3 alternatenames 4 lat 5 lng
    // 6 feature class 7 feature code 8 country code 9 cc2 10 admin1 code
    // 11 admin2 12 admin3 13 admin4 14 population 15 elevation 16 dem
    // 17 timezone 18 modification date
    const rows: CityRow[] = [];
    for (const line of lines) {
      if (!line) continue;
      const c = line.split("\t");
      if (c.length < 19) continue;
      const cc = c[8];
      const admin1Code = c[10];
      const region = admin1[`${cc}.${admin1Code}`] ?? null;
      const country = countries[cc] ?? cc;
      rows.push({
        geoname_id: parseInt(c[0], 10),
        name: c[1],
        ascii_name: c[2],
        region,
        region_code: admin1Code || null,
        country,
        country_code: cc,
        latitude: parseFloat(c[4]) || null,
        longitude: parseFloat(c[5]) || null,
        population: parseInt(c[14] || "0", 10) || 0,
        timezone: c[17] || null,
      });
    }

    log.info("upserting cities", { row_count: rows.length });
    const batchSize = 1000;
    let inserted = 0;
    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      const { error } = await admin
        .from("cities")
        .upsert(batch, { onConflict: "geoname_id" });
      if (error) {
        log.error("batch upsert failed", { error_message: error.message, offset: b });
        return new Response(
          JSON.stringify({ error: error.message, inserted }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      inserted += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, count: inserted }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    log.error("unhandled error", toErrorFields(e));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});