# Gemini setup — AI-generated Creative backgrounds

This guide walks through configuring Google Gemini as the image-generation
backend for the Creative_AI_Backgrounds feature. The
`generate-creative-background` Edge Function is the only code path in the
Illuxus codebase that calls Gemini (Imagen 4): it takes an organizer's
resolved prompt, style preset, and aspect ratio, generates a background PNG,
caches it in Supabase Storage, and returns a public URL that the Creative
Generator splices into a template's background — keeping `GEMINI_API_KEY`
server-side only. The browser never talks to Gemini directly.

> **Reference**: this integration calls Google's public Imagen 4 predict
> endpoint directly via `fetch` (no `@google/genai` npm dependency — matches
> the "minimal npm surface" convention of the other Edge Functions in this
> repo). See
> <https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict>
> and the family of docs it's part of under
> <https://ai.google.dev/gemini-api/docs/image-generation>.

---

## 1. Obtain a Gemini API key

1. Sign in at [Google AI Studio](https://aistudio.google.com/app/apikey) with
   the Google account that should own this project's Gemini usage.
2. Click **Create API key**, either in a new Google Cloud project or an
   existing one.
3. Copy the key. Treat it like any other server secret — it must never be
   committed, logged, or shipped to the browser bundle.

> **Billing and quota are separate from this app's quota.** Google AI
> Studio's free tier has its own rate limits and, once you attach billing,
> its own usage-based cost. That's independent of the *per-event* daily quota
> this feature enforces at the application layer (see §3 below) — the
> app-level quota exists to stop a single event from burning through your
> Google-side quota or budget, not the other way around. Check
> <https://ai.google.dev/gemini-api/docs/pricing> for current Imagen 4
> pricing before turning this on for production traffic.

---

## 2. Configure Supabase secrets

The `generate-creative-background` Edge Function reads the following from
`Deno.env`. In the Supabase dashboard → **Project Settings → Edge Functions →
Secrets**, add:

| Key                            | Required | Default | Notes                                                                 |
| ------------------------------- | -------- | ------- | ---------------------------------------------------------------------- |
| `GEMINI_API_KEY`                | Yes      | —       | The key from step 1. Server-side only — never add a `VITE_`-prefixed twin. |
| `GEMINI_PER_EVENT_DAILY_QUOTA`  | No       | `20`    | Max Gemini calls per event per rolling 24h. Only cache **misses** count against it — a `fromCache: true` response never calls Gemini and never counts. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already provided by the
Supabase Edge Functions runtime for every function — you don't need to add
them yourself. The function does check that both are present (as a defensive
`configuration` failure) but they're populated automatically in every
Supabase project.

After adding or changing secrets, redeploy the edge function (or push a no-op
change) so the new env is picked up:

```sh
supabase functions deploy generate-creative-background
```

> **Deploying from the Supabase Dashboard instead of the CLI?** Just paste
> `supabase/functions/generate-creative-background/index.ts` into the
> Dashboard's "Edit function" editor. The file is intentionally
> self-contained (CORS + structured-logging helpers are inlined rather than
> imported from `../_shared/*`) because the Dashboard bundler only ships
> the single file you paste — it can't resolve relative imports outside
> the function's own folder. Attempting to import from `_shared/` fails
> with `Module not found "file:///tmp/.../_shared/cors.ts"` at deploy time.

> **Don't put `GEMINI_API_KEY` in the Vite build env.** Unlike the Agora App
> ID, there is no client-side counterpart to this key — the browser never
> calls Gemini. If a `VITE_GEMINI_API_KEY` ever shows up anywhere in the
> codebase, that's a bug: it would ship the secret into the public bundle.

---

## 3. Apply the database migration

Migration `023_creative_ai_backgrounds.sql` adds the `event_creative_backgrounds`
table (the persistent cache + generation history the Edge Function reads and
writes) and an `event_creatives.metadata jsonb` column used to tag
AI-backed Creatives in the library.

```sh
supabase db push
```

---

## 4. Verify the function is deployed and callable

A representative manual `curl` invocation, once secrets are set and the
function is deployed:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/generate-creative-background" \
  -H "Authorization: Bearer $ORGANIZER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "00000000-0000-0000-0000-000000000000",
    "promptText": "smooth abstract gradient background, dominant color #4338ca, accent color #7c3aed, high resolution, no text",
    "stylePreset": "abstract-gradient",
    "aspectRatio": "1:1"
  }'
```

`$ORGANIZER_JWT` is a valid Supabase auth JWT for a user who owns
`eventId` (or has the `admin` role) — grab one from `supabase.auth.getSession()`
in a browser dev console while signed in, or from the Supabase dashboard's
auth debugger.

Expected response, `200`:

```json
{
  "assetUrl": "https://<project>.supabase.co/storage/v1/object/public/site-assets/ai-backgrounds/<eventId>/<hash>.png",
  "storagePath": "ai-backgrounds/<eventId>/<hash>.png",
  "cacheKey": "<eventId>\u001f<normalized-prompt>\u001fabstract-gradient\u001f1:1",
  "fromCache": false
}
```

Repeating the exact same request returns the same body with `fromCache:
true` — no second Gemini call is made. Repeating with `GEMINI_PER_EVENT_DAILY_QUOTA + 1`
distinct prompts (each a cache miss) within 24h should eventually return
`429 { "code": "rate_limit" }` once the quota is exhausted.

---

## 5. Troubleshooting

| Symptom                                                    | Cause                                                                  | Fix |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | --- |
| `500 { "code": "configuration" }`                          | `GEMINI_API_KEY` (or, less commonly, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) missing from Edge Function secrets | Add the missing secret in Supabase dashboard → Edge Functions → Secrets, then `supabase functions deploy generate-creative-background`. |
| `403 { "code": "auth" }`                                   | Missing/expired/invalid `Authorization: Bearer` JWT, the event doesn't exist, or the caller is neither the event's owner nor an admin | Confirm the JWT is fresh (re-authenticate), confirm `eventId` is correct, and confirm the calling user owns the event or has the `admin` role. |
| `400 { "code": "bad_request" }`                             | Malformed JSON body, a missing field, an unknown `stylePreset`, or an unsupported `aspectRatio` | Confirm the body has all four fields and that `stylePreset` / `aspectRatio` match one of the five presets / four ratios the client module exports. |
| `429 { "code": "rate_limit" }`                              | Either the per-event daily quota (`GEMINI_PER_EVENT_DAILY_QUOTA`, default 20) was hit, or Gemini itself returned a 429 | For the app-level quota: wait for the rolling 24h window to clear, or raise `GEMINI_PER_EVENT_DAILY_QUOTA`. For a Gemini-side 429: check your Google AI Studio / Cloud project's own rate limits and billing, then retry after a short backoff. |
| `422 { "code": "content_policy" }`                          | Gemini's safety filters rejected the prompt (either an explicit 400 with a `safety`/`policy` body marker, or a 200 with an empty `predictions` array / `raiFilteredReason`) | This is expected behavior, not a bug — have the organizer revise the custom-prompt text. No PNG is uploaded and no row is inserted for this outcome. |
| `503 { "code": "service_outage" }`                          | Gemini returned a non-2xx status Illuxus doesn't otherwise recognize, returned an empty/malformed response, or the Storage upload / Postgres insert failed after a successful generation | Check the Edge Function logs (`rlog.error` records include a `body_excerpt` for Gemini failures) for the underlying status/message. Transient Gemini outages usually resolve on retry; Storage/DB failures point at a Supabase-side issue. |
| Function returns `503 { "code": "service_outage" }` on *every* call from the moment you deploy | The function isn't reaching Gemini at all — usually a typo'd endpoint or DNS/network issue in the Deno runtime | Check the `body_excerpt` in the error log; if it's empty and no HTTP status was ever returned, this is really a `fetch` throw the Gemini API layer never got to. |
| Duplicate PNGs never appear even under a load-test          | Not a bug — `storage.upload(..., { upsert: true })` intentionally reuses the same content-addressed path for a given cache key so retries and lost insert races don't orphan files | No action needed. |

> All seven codes the client's `AiBackgroundError.code` can take —
> `network`, `rate_limit`, `content_policy`, `service_outage`,
> `configuration`, `auth`, `bad_request` — are covered above. `network`
> specifically means the Edge Function's own `fetch` to Gemini threw
> (DNS/TCP/TLS-level failure), as distinct from Gemini responding with a
> non-2xx status (which falls under `service_outage`, `content_policy`, or
> `rate_limit` depending on the status and body).

---

## 6. Reference: relevant files

| Path                                                              | Role |
| ------------------------------------------------------------------ | ---- |
| `supabase/migrations/023_creative_ai_backgrounds.sql`               | `event_creative_backgrounds` table + `event_creatives.metadata` column |
| `supabase/functions/generate-creative-background/index.ts`         | Server-side Gemini call, cache lookup, quota enforcement, Storage upload |
| `src/lib/creatives/creative-ai.ts`                                  | Client-side types, prompt composition, cache-key mirror, `callGenerateBackground` |
| `src/components/event/creatives/AiBackgroundPanel.tsx`              | Style/aspect-ratio picker + confirmation UI mounted in the Creative Generator dialogs |
| `src/components/event/creatives/AiBackgroundLibrary.tsx`            | Per-event list of previously generated AI backgrounds |

External:

- [Gemini API — image generation overview](https://ai.google.dev/gemini-api/docs/image-generation)
- [Imagen 4 model reference](https://ai.google.dev/gemini-api/docs/imagen)
- [Google AI Studio — API keys](https://aistudio.google.com/app/apikey)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
