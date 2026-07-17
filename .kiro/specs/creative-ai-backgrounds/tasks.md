# Implementation Plan: Creative AI Backgrounds

Convert the feature design into a series of prompts for a code-generation LLM
that will implement each step with incremental progress. Make sure that each
prompt builds on the previous prompts, and ends with wiring things together.
There should be no hanging or orphaned code that isn't integrated into a
previous step. Focus ONLY on tasks that involve writing, modifying, or
testing code.

## Overview

Implementation proceeds bottom-up on the same layering discipline as the base
Social Creative Generator spec: schema + typegen first, then the pure client
module (`creative-ai.ts`) with its property tests, then the storage helpers,
then the server-side Edge Function, then the two new UI components
(`AiBackgroundPanel`, `AiBackgroundLibrary`), then the additive extensions
to the three existing UI files, then wiring into `CreativesSection.tsx`, then
docs, then a final checkpoint that runs the full test/lint/build gate.

Every task cites the requirement sub-clauses it fulfills. Test sub-tasks are
marked with `*` per project convention and are strictly optional; core
implementation tasks are never optional.

## Tasks

- [x] 1. Add schema and regenerate types
  - [x] 1.1 Create migration `supabase/migrations/023_creative_ai_backgrounds.sql`
    - Write the new `public.event_creative_backgrounds` table (columns, `UNIQUE (event_id, cache_key)`, `event_creative_backgrounds_event_idx` on `(event_id, created_at DESC)`), enable RLS, add "Owner view" and "Owner manage" policies scoped to the event's `user_id` or `has_role(auth.uid(), 'admin')`, and `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` — mirroring migration `022_event_creatives.sql` exactly
    - Append `ALTER TABLE public.event_creatives ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb` to the same migration
    - _Requirements: 6.3, 11.2, 12.3_
  - [x] 1.2 Hand-edit `src/integrations/supabase/types.ts`
    - Add the new `event_creative_backgrounds` table entry under `Tables` (Row / Insert / Update / `Relationships` for `event_id → events`), following the shape of the existing `event_creatives` entry
    - Add `metadata: Json` to `event_creatives.Row` and `Update`, and `metadata?: Json` to `event_creatives.Insert` — matches the pattern the base spec used in its task 1.3 since there is no live-DB codegen in this workspace
    - _Requirements: 6.3, 11.1, 11.2_

- [x] 2. Implement the client-side `creative-ai.ts` module
  - [x] 2.1 Create `src/lib/creatives/creative-ai.ts` with types, style-preset descriptors, and pure helpers
    - Export `StylePreset`, `AspectRatio`, `AiBackgroundRequest`, `AiBackgroundResponse`, `AiBackgroundErrorCode`, `AiBackgroundError`
    - Export the five style preset descriptors (name, `descriptiveText`, `defaultPrimaryColor`, `defaultAccentColor`) as documented in the design's `STYLE_PRESETS` constant
    - Also export the descriptor map as `STYLE_PRESET_DESCRIPTORS_FOR_TEST` so property tests can reference the exact strings without hardcoding
    - Implement `buildResolvedPrompt(stylePreset, primaryColor?, accentColor?, eventTitle, customPromptText?)` per the design's specification (Property 22 clauses 1–4)
    - Implement `normalizePrompt(text)` — `text.trim().toLowerCase()`
    - Implement `computeCacheKey(eventId, normalizedPrompt, stylePreset, aspectRatio)` using `\x1f` unit-separator concatenation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 6.1_
  - [x] 2.2 Implement `callGenerateBackground(request)` in the same file
    - Wrap `supabase.functions.invoke("generate-creative-background", { body: request })`
    - On error, deserialize the Edge Function's `{ error, code }` body from `error.context.json()` and throw an `AiBackgroundError` with the propagated `code`
    - On error, log via `logger.error("ai background generation failed", { event_id, style_preset, aspect_ratio, code, message })` — no `console.*` calls
    - _Requirements: 3.1, 9.2, 9.4_

- [x]* 3. Unit and property tests for `creative-ai.ts`
  - [x]* 3.1 Write `src/lib/creatives/__tests__/creative-ai.test.ts`
    - Cover `buildResolvedPrompt` happy-path, both-colors-undefined fallback, only-accent-undefined fallback, empty-title omission, custom-prompt appended (not replacing), and empty custom prompt no-op
    - Cover `normalizePrompt` trim + lowercase, empty-string, whitespace-only
    - Cover `computeCacheKey` distinctness across all four component variations
    - Cover `callGenerateBackground` (mocked `@/integrations/supabase/client`): success (cache-miss and cache-hit), each failure category (`network`, `rate_limit`, `content_policy`, `service_outage`, `configuration`, `auth`) — assert `AiBackgroundError.code` matches and `logger.error` is called
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 6.1, 9.2, 9.4, 10.1_
  - [x]* 3.2 Write `src/lib/creatives/__tests__/property-20-cache-key-deterministic.pbt.test.ts`
    - **Property 20: Cache key is deterministic and normalization-invariant**
    - **Validates: Requirements 6.1, 2.5**
    - Include a locally-transcribed mirror of the Edge Function's `computeCacheKey` so client/server drift breaks this test
    - `fc.assert(..., { numRuns: 100 })`; header comment `// Feature: creative-ai-backgrounds, Property 20: ...`
  - [x]* 3.3 Write `src/lib/creatives/__tests__/property-22-resolved-prompt-composition.pbt.test.ts`
    - **Property 22: Resolved prompt composition includes all required parts**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - Assert all four content clauses from the property definition: descriptive text substring, at least one color reference (theme value or preset default), event-title substring when non-empty, custom-prompt substring when non-empty

- [x] 4. Extend `creative-storage.ts` with AI background helpers
  - [x] 4.1 Add `EventCreativeBackgroundRow` interface and `fetchEventCreativeBackgrounds(eventId)`
    - Mirror `fetchEventCreatives` exactly (select `*`, `.eq("event_id", eventId)`, `.order("created_at", { ascending: false })`), targeting `event_creative_backgrounds`
    - Log errors via `logger.error("ai background library fetch failed", { event_id, error_message })`
    - _Requirements: 7.1_
  - [x] 4.2 Add `deleteEventCreativeBackground(id, storagePath)` with the same `Promise.allSettled` pattern as `deleteCreativeAsset`
    - Return `{ storageDeleted, recordDeleted }` and log partial failure via `logger.error("ai background delete partial failure", { id, storage_deleted, record_deleted })`
    - _Requirements: 6.4_
  - [x] 4.3 Extend `buildCreativeAssetRecord` to accept an optional `metadata` parameter
    - Add `metadata?: Record<string, unknown>` to `CreativeAssetInput`; add `metadata: Record<string, unknown>` (non-optional, defaulted to `{}`) to `CreativeAssetRecord`
    - When the input's `metadata` is omitted, return `{}` — so existing (non-AI) callers stay unchanged and always persist `metadata: {}`
    - _Requirements: 11.1, 11.3_

- [x]* 5. Integration tests for the new storage helpers
  - [x]* 5.1 Write `src/lib/creatives/__tests__/creative-storage-ai-backgrounds.integration.test.ts`
    - Follow the hoisted-mock pattern from `creative-storage.integration.test.ts`
    - Verify `fetchEventCreativeBackgrounds` calls `.from("event_creative_backgrounds").select("*").eq("event_id", ...).order("created_at", { ascending: false })`
    - Verify `deleteEventCreativeBackground` runs both `storage.remove([...])` and `.from("event_creative_backgrounds").delete().eq("id", ...)` in parallel, and reports partial failure correctly across the four (success/failure × success/failure) combinations
    - _Requirements: 6.4, 7.1_

- [x] 6. Implement the `generate-creative-background` Edge Function
  - [x] 6.1 Create `supabase/functions/generate-creative-background/index.ts`
    - Import `buildCorsHeaders`, `handlePreflight`, `corsJson` from `../_shared/cors.ts`; `createEdgeLogger`, `toErrorFields` from `../_shared/edge-logger.ts`; `createClient` from `https://esm.sh/@supabase/supabase-js@2` (matches other functions' import URL)
    - Wire CORS + preflight; enforce POST-only
    - Validate the request body: `eventId`, `promptText`, `stylePreset` (against the five-preset allowlist), `aspectRatio` (against the four-ratio allowlist); return `400 { code: "bad_request" }` on any failure
    - _Requirements: 3.5, 5.1_
  - [x] 6.2 Add configuration and authentication guards
    - Read `GEMINI_API_KEY`, `GEMINI_PER_EVENT_DAILY_QUOTA` (default 20), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`
    - When `GEMINI_API_KEY` is missing, return `500 { code: "configuration" }` without calling Gemini — log via `rlog.error("missing configuration", { ... })`
    - Extract the Bearer JWT from the `Authorization` header; call `supabase.auth.getUser(jwt)`; return `403 { code: "auth" }` when the user is missing
    - Query `events.user_id` for the target event; when it matches, mark `isOwner = true`; otherwise call `supabase.rpc("has_role", { _user_id: userId, _role: "admin" })` and set `isAdmin` from its result
    - When neither owner nor admin, return `403 { code: "auth" }`
    - _Requirements: 3.3, 3.4, 3.6, 12.1, 12.2_
  - [x] 6.3 Add cache lookup and quota enforcement
    - Normalize the prompt (`.trim().toLowerCase()`); compute `cache_key` via the same `\x1f`-joined concatenation as the client
    - Query `event_creative_backgrounds` for `event_id + cache_key`; on hit, return `200 { assetUrl, storagePath, cacheKey, fromCache: true }` without calling Gemini
    - On cache miss, count `event_creative_backgrounds` rows for this event where `created_at >= now() - 24h`; when `count >= quota`, return `429 { code: "rate_limit" }`
    - _Requirements: 6.1, 6.2, 8.1, 8.2, 8.4_
  - [x] 6.4 Call the Gemini Imagen API and handle its failure categories
    - `fetch` `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}` with `{ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio } }`
    - When the response is 400 with `safety` or `policy` in the body text, return `422 { code: "content_policy" }` — do NOT upload the PNG or insert the row (Requirement 10.3)
    - When the response is any other non-2xx, return `500 { code: "service_outage" }`
    - When `fetch` throws (network layer), return `500 { code: "network" }` — log via `rlog.error("gemini network error", toErrorFields(err))`
    - Log every failure category via `rlog.error` or `rlog.warn` with `correlation_id`
    - _Requirements: 3.1, 3.2, 5.2, 9.2, 9.4, 10.1, 10.3_
  - [x] 6.5 Decode, upload, and persist on success
    - Decode `predictions[0].bytesBase64Encoded` to `Uint8Array`
    - `supabase.storage.from("site-assets").upload("ai-backgrounds/{eventId}/{cacheKey}.png", bytes, { contentType: "image/png", upsert: true, cacheControl: "3600" })`
    - Get `publicUrl` via `storage.getPublicUrl(...)`
    - Insert `{ event_id, cache_key, prompt_normalized, style_preset, aspect_ratio, asset_url, storage_path, created_by }` into `event_creative_backgrounds`
    - Return `200 { assetUrl, storagePath, cacheKey, fromCache: false }`
    - When either the upload OR the insert fails, log and return `500 { code: "service_outage" }` — the `upsert: true` upload guarantees the PNG isn't orphan-duplicated on retry
    - _Requirements: 6.3_

- [x] 7. Implement `AiBackgroundPanel`
  - [x] 7.1 Create `src/components/event/creatives/AiBackgroundPanel.tsx`
    - Props: `{ eventId, eventTitle, theme, onBackgroundSelected }` per the design's Components section
    - Local state: `stylePreset`, `aspectRatio`, `customPrompt`, `preview | null`, `isGenerating`, `confirmationOpen`
    - Style_Preset selector (5 presets), Aspect_Ratio_Selection selector (4 ratios), custom-prompt textarea, live resolved-prompt display driven by `buildResolvedPrompt`
    - "Preview" button → opens inline confirmation showing resolved prompt + preset + aspect ratio (Requirement 8.3)
    - Confirmation → calls `callGenerateBackground` → on success stores `preview` and shows the thumbnail; on error shows a category-specific toast and preserves `stylePreset`/`aspectRatio` (Requirement 10.2)
    - "Use this background" toggle → calls `onBackgroundSelected({ assetUrl, stylePreset, promptText, backgroundId })` when on, `null` when off (Requirement 9.1)
    - "Open library" button → mounts `AiBackgroundLibrary` in `variant="picker"` mode in a Dialog / Drawer; on select, hydrates `preview` from the library row and turns the toggle on
    - _Requirements: 2.1, 2.2, 2.3, 5.1, 7.2, 8.3, 9.1, 9.2, 10.2_

- [x] 8. Implement `AiBackgroundLibrary`
  - [x] 8.1 Create `src/components/event/creatives/AiBackgroundLibrary.tsx`
    - Props: `{ eventId, onSelect?, variant: "peer" | "picker" }` per the design's Components section
    - Fetch via `fetchEventCreativeBackgrounds(eventId)` on mount, sort defensively with a `sortByCreatedAtDesc`-style client-side re-sort, expose a "Refresh" button (same pattern as `CreativeLibrarySection`)
    - Render each row as a card with thumbnail, style-preset chip, prompt (truncated), timestamp, delete button (calls `deleteEventCreativeBackground` and handles partial failure with a targeted toast), and — when `variant === "picker"` — a "Use this" button that calls `onSelect(row)`
    - _Requirements: 6.4, 7.1, 7.3_

- [x] 9. Extend `CreativeGeneratorDialog`
  - [x] 9.1 Add background-source radio + AI panel mount
    - Add `type BackgroundSource = "template" | "ai"` and state `backgroundSource`, `aiBackground` per the design
    - Insert a new "Background source" `<section>` between the existing "Template" and "Entity" sections with a `<RadioGroup>` for `template` / `ai`
    - When `backgroundSource === "ai"`, render `<AiBackgroundPanel eventId={eventId} eventTitle={eventPageConfig.seo?.metaTitle ?? ""} theme={theme} onBackgroundSelected={setAiBackground} />`
    - _Requirements: 1.1, 1.4_
  - [x] 9.2 Splice the AI URL into a template copy inside `handleGenerate`
    - Inside the per-format loop, compute `templateForRender = backgroundSource === "ai" && aiBackground ? { ...template, background: { type: "image", url: aiBackground.assetUrl, fit: "cover" } } : template`
    - Pass `templateForRender` (not `template`) into `renderSpeakerCreative` / `renderSponsorCreative` / `renderComboCreative`
    - Do NOT mutate `template` or the static preset registry
    - _Requirements: 1.1, 1.2, 4.3, 5.3, 5.4_
  - [x] 9.3 Persist AI metadata on the `event_creatives` insert
    - Compute `metadata = backgroundSource === "ai" && aiBackground ? { aiBackgroundId, stylePreset, promptText } : {}`
    - Pass `metadata` to `buildCreativeAssetRecord` (accepting the new optional parameter added in 4.3)
    - Guarantees Requirement 11.3 (`{}` in the AI-off path) and Requirement 11.1 (populated in the AI-on path) — via the same code
    - _Requirements: 11.1, 11.3_
  - [x] 9.4 Add fallback wiring for AI failures
    - When the organizer had selected AI but `aiBackground` is `null` (preview never succeeded), `templateForRender === template` and `metadata === {}` — the Creative export still succeeds using the template's original background (Requirement 9.1, 9.3)
    - _Requirements: 1.3, 9.1, 9.3_

- [x]* 10. Property tests for the plan-level guarantees
  - [x]* 10.1 Write `src/lib/creatives/__tests__/property-21-ai-background-photo-logo-isolation.pbt.test.ts`
    - **Property 21: AI asset URL never appears in a photo or logo element**
    - **Validates: Requirements 4.3, 4.1**
    - Generate arbitrary entities (union of speaker / sponsor / combo pair), templates (from the shipped preset registry), formats, themes, and a distinctive `aiUrl`; assert that after splicing the URL into a template copy and passing through `buildXPlan`, the URL only appears in a `kind: "background"` element and never in any `kind: "image"` element
  - [x]* 10.2 Write `src/lib/creatives/__tests__/property-23-ai-fallback-preservation.pbt.test.ts`
    - **Property 23: Fallback preserves the base spec's plan exactly**
    - **Validates: Requirements 1.2, 9.1**
    - Generate arbitrary entity + template + format + theme; assert that the plan produced by the AI-off branch (template unchanged) is `toStrictEqual` to the base spec's direct call — locking in the strictly-additive nature of this feature

- [x] 11. Extend `BatchCreativeGeneratorDialog`
  - [x] 11.1 Add the same background-source radio and AI panel mount above the "Template" section
    - Same state + JSX as `CreativeGeneratorDialog`
    - Below the panel, render an informational note: *"The same AI-generated background is reused across every {batchType} in this batch run. To use a different background per entity, run the generator individually per entity."*
    - _Requirements: 1.1, 1.4_
  - [x] 11.2 Apply the AI URL splice + metadata to every batch outcome
    - Compute `templateForRender` and `metadata` per 9.2/9.3 ONCE per run (not per outcome); pass `templateForRender` to the `render` callback and `metadata` to `buildCreativeAssetRecord` in the post-render persistence loop
    - _Requirements: 1.2, 4.3, 5.3, 11.1, 11.3_

- [x] 12. Extend `CreativeLibrarySection` with the "AI" badge
  - [x] 12.1 Update `EventCreativeRow` to include `metadata: Json`
    - In `creative-storage.ts`, add `metadata: Json` (imported from `@/integrations/supabase/types`) to `EventCreativeRow`
    - _Requirements: 11.4_
  - [x] 12.2 Add the "AI" badge to `CreativeCard`
    - Compute `isAiBacked = row.metadata && typeof row.metadata === "object" && "aiBackgroundId" in row.metadata && !!(row.metadata as { aiBackgroundId?: unknown }).aiBackgroundId`
    - When true, render a `<Badge>` with a Sparkles icon and a `<Tooltip>` exposing `stylePreset` and `promptText` from `row.metadata`
    - _Requirements: 11.4_

- [x] 13. Wire `AiBackgroundLibrary` into `CreativesSection`
  - [x] 13.1 Mount `<AiBackgroundLibrary eventId={eventId} variant="peer" />` below the existing `<CreativeLibrarySection ... />` in `src/pages/dashboard/event/CreativesSection.tsx`
    - No other changes to this file; the AI library becomes visible on the dashboard as a peer of the creative library
    - _Requirements: 7.1_

- [x] 14. Documentation
  - [x] 14.1 Create `docs/gemini-setup.md`
    - Mirror `docs/agora-setup.md`'s numbered-section structure
    - Cover: obtaining a Gemini API key from Google AI Studio, setting `GEMINI_API_KEY` and `GEMINI_PER_EVENT_DAILY_QUOTA` in Supabase Edge Function secrets, verifying the function is deployed and callable, and troubleshooting the six failure categories (`network`, `rate_limit`, `content_policy`, `service_outage`, `configuration`, `auth`)
    - Include the manual `curl` verification example from the design's Testing Strategy section
    - _Requirements: 3.3, 8.4_

- [x] 15. Final checkpoint
  - Run `bun run test --run`, `bun run lint`, and `bun run build` and confirm all pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit / property / integration / component
  tests) and can be skipped for a faster MVP; core implementation tasks are
  never marked optional.
- Every property test task cites the exact property number and title from
  `design.md`'s Correctness Properties section, and every task cites the
  granular requirement sub-clauses it implements.
- The dependency graph below is intentionally near-linear because each layer
  builds on the previous: schema before types-driven code, `creative-ai.ts`
  before UI that imports it, the Edge Function's `computeCacheKey` mirror
  before the property test that pins client/server drift, and so on. The one
  parallel branch is that Tasks 10 (plan-level property tests) can run in
  parallel with Task 11 (batch dialog) after Task 9 lands, since neither
  depends on the other.
- Once `tasks.md` is created, open this file and click "Start task" next to
  any task item to begin implementation. This workflow does not implement
  the feature itself.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4"] },
    { "wave": 4, "tasks": ["5", "6"] },
    { "wave": 5, "tasks": ["7", "8"] },
    { "wave": 6, "tasks": ["9"] },
    { "wave": 7, "tasks": ["10", "11"] },
    { "wave": 8, "tasks": ["12"] },
    { "wave": 9, "tasks": ["13"] },
    { "wave": 10, "tasks": ["14"] },
    { "wave": 11, "tasks": ["15"] }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": ["1"],
    "5": ["4"],
    "6": ["1", "2"],
    "7": ["2", "6"],
    "8": ["4"],
    "9": ["2", "4", "7"],
    "10": ["9"],
    "11": ["9"],
    "12": ["4"],
    "13": ["8", "12"],
    "14": ["6"],
    "15": ["3", "5", "10", "11", "13", "14"]
  }
}
```
