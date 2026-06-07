// Public FX rates proxy. Fetches USD-based exchange rates from open.er-api.com
// (free, no API key) and caches them in memory per cold start (6h TTL).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: { base: string; rates: Record<string, number>; fetched_at: string; expires: number } | null = null;

async function fetchRates() {
  if (cache && cache.expires > Date.now()) return cache;
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`Upstream FX provider returned ${res.status}`);
  const json = await res.json();
  if (!json?.rates || typeof json.rates !== "object") throw new Error("Invalid FX payload");
  cache = {
    base: "USD",
    rates: json.rates,
    fetched_at: new Date().toISOString(),
    expires: Date.now() + TTL_MS,
  };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const data = await fetchRates();
    return new Response(
      JSON.stringify({ base: data.base, rates: data.rates, fetched_at: data.fetched_at }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});