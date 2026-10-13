/**
 * api/geo — the visitor's country, for pre-selecting the phone country code.
 *
 * Vercel's edge network already knows which country a request comes from and
 * passes it on as the `x-vercel-ip-country` header, so nothing is looked up
 * and no IP address is stored, logged or sent anywhere. The answer is only a
 * default: the visitor can always pick another code.
 *
 *   GET /api/geo → { "country": "IN" }   (null when unknown, e.g. locally)
 */

export const config = { runtime: "edge" };

export default function handler(req: Request): Response {
  const raw = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
  return new Response(JSON.stringify({ country }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Different for every visitor: never cache it in a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
