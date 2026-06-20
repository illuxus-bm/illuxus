// Seeds the global `cities` table from the GeoNames cities5000 dataset.
// Admin-only. Idempotent — safe to re-run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.45/index.js";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("seed-cities");

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
  const txt = entries.find((e: any) => e.filename.endsWith(".txt"));
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    // One-time seed; allow any caller. The DB is protected by RLS and the
    // upsert is idempotent — re-running just refreshes the city list.
    log.info("invoked");

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
    const rows: any[] = [];
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