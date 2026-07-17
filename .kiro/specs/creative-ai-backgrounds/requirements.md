# Requirements Document

## Introduction

The **Social Creative Generator** feature (spec:
`.kiro/specs/social-creative-generator/`, shipped) auto-produces branded social /
promotional graphics for speakers and sponsors on an event. Its original design
decision #3 explicitly deferred AI-generated background art out of scope:

> "AI-generated background art is out of scope for this spec. Only
> solid-color/gradient backgrounds and organizer-uploaded images are supported as
> template backgrounds in this phase. This may be revisited as a later
> enhancement."

**This spec is that later enhancement.** It adds an opt-in AI background source
that lets organizers generate a bespoke, event-themed background image for a
Creative using **Google Gemini** (Imagen / Gemini image generation models), while
keeping every other aspect of the existing Creative_Generator unchanged. The AI
touches only the background layer — speaker photos (`speakers.photo_url`) and
sponsor logos (`sponsors.logo_url`) MUST continue to render as unmodified direct
image composites, preserving the invariant already asserted by the base spec's
Requirement 2.4 / 3.3 and its Property 4 (unit-tested in `creative-renderer.ts`'s
plan builders).

The generated background is materialized as a PNG in Supabase Storage and plugged
into a Creative_Template as an ordinary `CreativeBgStyle.type: "image"` entry so
the existing `drawPlan` / `renderXCreative` pipeline in `src/lib/creatives/
creative-renderer.ts` renders it exactly as it would an organizer-uploaded
background — no changes to the rendering hot path.

### Default decisions made during requirements (per investigation)

These resolve the open questions in the feature request. Each is a reasonable
default given the existing codebase and the base spec's architecture; flag during
review if a different choice is wanted.

1. **AI generation is strictly additive.** For any organizer who does not select
   AI as the background source, the Creative_Generator SHALL produce byte-for-byte
   identical output to today's (base) implementation. The new background source is
   a new option alongside the existing template default / solid / gradient /
   uploaded-image sources, not a replacement.
2. **Backgrounds only — never AI-altered photos or logos.** The user's own note is
   authoritative: "headshots/logos should never be AI-altered — keep those as
   direct image composites." Requirements below forbid the AI pipeline from
   touching `speaker.photo_url` or `sponsor.logo_url` pixel data, mirroring the
   base spec's Requirements 2.4 and 3.3.
3. **Server-side Edge Function proxy.** The Gemini API key is a secret. The
   client SHALL NEVER call the Gemini endpoint directly. A new Supabase Edge
   Function (`generate-creative-background`) SHALL be introduced, following the
   convention already established by `agora-token`, `send-email`, and other
   functions under `supabase/functions/`. It reuses the shared CORS helper
   (`supabase/functions/_shared/cors.ts`) and edge logger
   (`supabase/functions/_shared/edge-logger.ts`).
4. **Backgrounds are materialized as `CreativeBgStyle.type: "image"` entries.**
   AI generation runs BEFORE canvas rendering: the Edge Function returns a PNG
   URL (backed by Supabase Storage `site-assets` under a new
   `ai-backgrounds/{event_id}/` prefix), and the dialog constructs a
   template-copy whose `background` field is that URL, so the existing
   `drawBackground` / `drawImage` code path in `creative-renderer.ts` handles it
   uniformly with organizer-uploaded backgrounds. No new `CreativeBgStyle`
   variant is introduced.
5. **Persistent cache keyed by (event, prompt, style_preset, aspect_ratio).**
   Gemini calls cost money and take seconds. A new
   `event_creative_backgrounds` table records each generated background with
   its prompt/style/aspect-ratio, so subsequent requests for the same tuple
   return the cached row instead of firing a new API call.
6. **One generation, reused across selected Platform_Formats within a single
   Generate action.** A single Creative export commonly targets multiple
   Platform_Formats (LinkedIn Post 1200×627, Instagram Post 1080×1080, etc.),
   with varied aspect ratios. Rather than firing 5 API calls per Creative, the
   organizer picks a target aspect ratio for the generation once, then the same
   generated PNG is reused as the background for every selected format via the
   existing renderer's `"cover"` fit logic (already handles cropping mismatched
   aspect ratios per base spec Property 9).
7. **Explicit organizer consent + cost visibility before generation.** The
   Generate-AI-Background action shows a confirmation panel with the resolved
   prompt, style preset, and target aspect ratio before invoking the Edge
   Function, so the organizer sees exactly what will be generated and can cancel
   without triggering an API charge.
8. **Fall back to the template's non-AI background on any AI failure.** If the
   Edge Function returns an error (rate limit, network, service outage, content
   policy rejection), the Creative render SHALL continue using the template's
   original solid/gradient background and the organizer SHALL see a toast
   explaining the failure. AI failure MUST NEVER block the Creative export
   itself — the organizer always gets a usable creative.
9. **Metadata persisted on the resulting `event_creatives` row.** When a
   Creative is generated using an AI background, its `event_creatives` row
   SHALL record which prompt / style preset / background asset produced it, so
   the Creative_Library UI can show provenance and organizers can re-generate a
   similar Creative later. A new `metadata` JSONB column is added to
   `event_creatives` via a new migration.
10. **Per-event rate limiting.** To prevent runaway costs from a single event
    (accidental or malicious), a per-event daily quota SHALL be enforced by the
    Edge Function (soft cap; configurable via env var). Exceeding the quota
    returns a distinct error so the UI can show an actionable message.

## Glossary

- **AI_Background_Source**: A new selectable background source for a Creative,
  alongside the existing template-default / solid / gradient / uploaded-image
  sources, that produces a bespoke background image via Google Gemini.
- **Gemini_Provider**: Google Gemini's image-generation API (Imagen / Gemini
  image models). Called only from the server-side Edge Function, never from
  the browser bundle.
- **Background_Generator_Function**: The new `generate-creative-background`
  Supabase Edge Function that accepts a prompt + style preset + aspect ratio
  and returns a stored PNG URL — the only code path allowed to call
  Gemini_Provider.
- **Style_Preset**: A named theme option ("abstract gradient", "minimal
  geometric", "elegant floral", "corporate", "tech mesh") that expands to a
  longer prompt template and is combined with the organizer's optional custom
  prompt text to form the final Gemini_Provider prompt.
- **Prompt_Source**: The inputs used to build the Gemini_Provider prompt —
  the selected Style_Preset, the event's `page_config.theme` colors, the
  event's title, and an optional organizer-typed custom-prompt override.
- **AI_Background_Asset**: The generated PNG file (stored in the existing
  `site-assets` bucket under `ai-backgrounds/{event_id}/`) plus its
  `event_creative_backgrounds` row recording the (event, prompt,
  style_preset, aspect_ratio) tuple and its Storage path/URL.
- **Background_Cache_Key**: The deterministic tuple used to look up an
  existing AI_Background_Asset before firing a new Gemini_Provider call: the
  4-tuple (`event_id`, `prompt_text` after normalization, `style_preset`,
  `aspect_ratio`). Two requests with identical `Background_Cache_Key`s
  resolve to the same cached AI_Background_Asset.
- **Aspect_Ratio_Selection**: The single aspect ratio the organizer picks for
  a Gemini_Provider generation (`1:1`, `16:9`, `9:16`, or `4:3`). One
  generation is reused across every selected Platform_Format for that
  Creative export.
- **Background_Library**: The UI surface listing an event's previous
  AI_Background_Assets so an organizer can reuse a past background instead of
  generating a new one.
- **Per_Event_Daily_Quota**: The maximum number of Gemini_Provider generation
  calls allowed for a single event within a rolling 24-hour window,
  configured via the Edge Function's environment variables.
- **Creative_Generator** *(existing)*: The base feature (spec
  `.kiro/specs/social-creative-generator/`), including its templates,
  renderer, storage, and UI dialogs.
- **Creative_Template** *(existing)*: A code-defined layout in
  `src/lib/creatives/creative-templates.ts` (speaker / sponsor / combo
  presets); its `background` field of type `CreativeBgStyle` is what AI
  generation replaces (with a `type: "image"` entry) when the AI_Background_Source
  is selected.
- **Platform_Format** *(existing)*: A named output size (LinkedIn Post
  1200×627, Instagram Post 1080×1080, Instagram Story 1080×1920, Twitter/X
  Post 1600×900, Email Banner 600×200).

## Requirements

### Requirement 1: Opt-In AI Background Source (Backward Compatibility)

**User Story:** As an event organizer who has not opted in to AI backgrounds, I
want the existing creative generator to continue producing the same output it
does today, so that this new feature does not disrupt my established workflow.

#### Acceptance Criteria

1. THE Creative_Generator SHALL offer AI_Background_Source as an option
   alongside the existing template-default / solid / gradient / uploaded-image
   background sources, not as a replacement for any of them.
2. WHEN an organizer does not select AI_Background_Source for a Creative, THE
   Creative_Generator SHALL produce Creative output identical to the output
   produced before this feature was introduced.
3. WHEN an organizer generates a Creative, IF AI_Background_Source is not
   selected, THEN THE Background_Generator_Function SHALL NOT be invoked and
   the Gemini_Provider SHALL NOT be called.
4. WHEN AI_Background_Source is selected and later deselected within the same
   Creative_Generator session, THE Creative_Generator SHALL revert the
   Creative_Template's `background` field to the template's original value.

### Requirement 2: Prompt Composition from Event Context and Style Preset

**User Story:** As an event organizer, I want the AI-generated background to
match my event's theme without writing a detailed prompt every time, so that I
can produce on-brand creatives quickly.

#### Acceptance Criteria

1. WHEN an organizer selects AI_Background_Source for a Creative, THE
   Creative_Generator SHALL offer a Style_Preset selector containing at
   minimum the presets `abstract-gradient`, `minimal-geometric`,
   `elegant-floral`, `corporate`, and `tech-mesh`.
2. WHEN an organizer selects a Style_Preset, THE Background_Generator_Function
   SHALL build the Gemini_Provider prompt by combining that Style_Preset's
   prompt template with the event's `page_config.theme.primaryColor` value,
   the event's `page_config.theme.accentColor` value, and the event's title.
3. WHERE the organizer provides a custom-prompt override text, THE
   Background_Generator_Function SHALL append that custom-prompt text to the
   Style_Preset-derived prompt rather than replacing the Style_Preset prompt.
4. WHERE the event's Event_Theme (`page_config.theme.primaryColor` or
   `page_config.theme.accentColor`) is not defined, THE
   Background_Generator_Function SHALL substitute a Style_Preset-supplied
   default color for the undefined color field rather than sending an empty
   value.
5. THE Background_Generator_Function SHALL normalize the resolved prompt
   text (trim whitespace, lower-case) before computing Background_Cache_Key
   so that two requests differing only in trailing whitespace or letter case
   resolve to the same Background_Cache_Key.

### Requirement 3: Server-Side Gemini Integration

**User Story:** As a platform operator, I want the Gemini API key stored as a
server-side secret and never exposed to the browser, so that the key cannot be
extracted from the client bundle and misused.

#### Acceptance Criteria

1. THE Background_Generator_Function SHALL be the only code path in the
   Illuxus codebase that calls the Gemini_Provider.
2. THE client bundle SHALL NOT contain the Gemini API key or any secret
   value required to authenticate with the Gemini_Provider.
3. THE Background_Generator_Function SHALL read its Gemini API key from the
   Supabase Edge Function secret named `GEMINI_API_KEY`.
4. IF the `GEMINI_API_KEY` secret is not configured on the Edge Function
   environment, THEN THE Background_Generator_Function SHALL return an HTTP
   500 response with a body identifying the missing configuration and SHALL
   NOT attempt to call the Gemini_Provider.
5. THE Background_Generator_Function SHALL apply the same origin-aware CORS
   policy as other Illuxus Edge Functions by using
   `buildCorsHeaders`/`handlePreflight` from `supabase/functions/_shared/
   cors.ts`.
6. THE Background_Generator_Function SHALL require an authenticated Supabase
   caller and SHALL reject requests whose caller's `auth.uid()` does not own
   the target event or hold the platform `admin` role.

### Requirement 4: Preservation of Photo and Logo Pixel Fidelity

**User Story:** As an event organizer, I want speaker headshots and sponsor
logos to render as unmodified image composites even when I use AI backgrounds,
so that faces and brand marks are never altered, distorted, or hallucinated by
the AI.

#### Acceptance Criteria

1. WHEN a Creative is rendered using an AI_Background_Source, THE
   Creative_Canvas_Renderer SHALL render the speaker's `photo_url` and the
   sponsor's `logo_url` as unmodified direct image composites, without
   applying any Gemini_Provider-generated or generative alteration to those
   images' pixels.
2. THE Background_Generator_Function SHALL NOT receive `speaker.photo_url`
   or `sponsor.logo_url` values as inputs to the Gemini_Provider prompt.
3. THE AI_Background_Asset produced by the Background_Generator_Function
   SHALL be used only as the value of a `PlanElement` whose `kind` is
   `background`, and SHALL NOT be used as the value of any `PlanElement`
   whose `kind` is `image`.
4. THE Creative_Generator SHALL keep the base spec's speaker-photo shape
   rendering (`circle` / `rounded-rect` / `rect`), placeholder-initial
   fallback for missing photos, and native-size logo box behavior
   (`nativeSizedLogoBox` in `creative-renderer.ts`) unchanged when an
   AI_Background_Source is selected.

### Requirement 5: Aspect-Ratio Handling for Platform Formats

**User Story:** As an event organizer, I want the AI-generated background to
look correct at every platform size I export, so that a background generated
once can be reused across LinkedIn, Instagram, Twitter, and Email Banner
formats without regenerating.

#### Acceptance Criteria

1. THE Creative_Generator SHALL offer an Aspect_Ratio_Selection of at
   minimum `1:1`, `16:9`, `9:16`, and `4:3` for a Gemini_Provider
   generation.
2. WHEN an organizer confirms a generation, THE
   Background_Generator_Function SHALL request the AI_Background_Asset from
   the Gemini_Provider at the selected Aspect_Ratio_Selection.
3. WHEN a Creative export selects multiple Platform_Formats and uses a
   single AI_Background_Asset, THE Creative_Canvas_Renderer SHALL render
   that AI_Background_Asset into each Platform_Format's canvas using the
   existing `CreativeBgStyle.type: "image"` with `fit: "cover"` behavior
   defined in `creative-renderer.ts`'s `drawBackground`.
4. WHEN the Aspect_Ratio_Selection differs from a Platform_Format's aspect
   ratio, THE Creative_Canvas_Renderer SHALL crop the AI_Background_Asset
   symmetrically (centered `"cover"` crop) rather than distorting it
   non-uniformly.

### Requirement 6: Background Caching and Reuse

**User Story:** As a platform operator, I want previously generated AI
backgrounds reused instead of regenerated when the same inputs are requested
again, so that Gemini API costs and generation latency are minimized.

#### Acceptance Criteria

1. THE Background_Generator_Function SHALL compute a Background_Cache_Key
   from the tuple (`event_id`, normalized prompt text, `style_preset`,
   `aspect_ratio`) before invoking the Gemini_Provider.
2. WHEN a Background_Generator_Function request has a Background_Cache_Key
   matching an existing AI_Background_Asset in the
   `event_creative_backgrounds` table, THE Background_Generator_Function
   SHALL return that cached AI_Background_Asset's Storage URL and SHALL
   NOT invoke the Gemini_Provider.
3. WHEN the Background_Generator_Function invokes the Gemini_Provider and
   receives a successful response, THE Background_Generator_Function SHALL
   persist the resulting PNG to the `site-assets` Storage bucket under
   `ai-backgrounds/{event_id}/` and SHALL insert a new
   `event_creative_backgrounds` row recording the Background_Cache_Key and
   the Storage path.
4. WHEN an organizer deletes an AI_Background_Asset from the
   Background_Library, THE Creative_Generator SHALL remove both the stored
   PNG file and its `event_creative_backgrounds` row.

### Requirement 7: AI Background Library

**User Story:** As an event organizer, I want to browse and reuse the AI
backgrounds I've previously generated for an event, so that I don't lose track
of backgrounds I like and don't pay to regenerate them.

#### Acceptance Criteria

1. WHEN an organizer opens the Background_Library for an event, THE
   Creative_Generator SHALL list that event's AI_Background_Assets ordered
   from most to least recently created.
2. WHEN an organizer selects an existing AI_Background_Asset from the
   Background_Library, THE Creative_Generator SHALL use that
   AI_Background_Asset as the Creative's background without invoking the
   Background_Generator_Function.
3. THE Background_Library SHALL display, for each AI_Background_Asset,
   both a thumbnail of the background image and the Style_Preset and
   custom-prompt text used to produce it.

### Requirement 8: Rate Limiting and Cost Visibility

**User Story:** As a platform operator, I want AI background generation
throttled per event and each generation confirmed by the organizer before it
fires, so that runaway API costs are prevented.

#### Acceptance Criteria

1. THE Background_Generator_Function SHALL enforce a
   Per_Event_Daily_Quota on Gemini_Provider invocations, counting only
   invocations that were not resolved from the cache.
2. IF a Background_Generator_Function request would exceed the
   Per_Event_Daily_Quota, THEN THE Background_Generator_Function SHALL
   return an HTTP 429 response identifying the quota and SHALL NOT invoke
   the Gemini_Provider.
3. WHEN an organizer initiates a Gemini_Provider generation from the
   Creative_Generator, THE Creative_Generator SHALL display a
   confirmation panel showing the resolved prompt text, Style_Preset,
   and Aspect_Ratio_Selection, and SHALL invoke the
   Background_Generator_Function only after the organizer confirms.
4. THE Per_Event_Daily_Quota SHALL be configurable through an Edge
   Function environment variable named
   `GEMINI_PER_EVENT_DAILY_QUOTA`.

### Requirement 9: Failure Handling and Fallback

**User Story:** As an event organizer, I want a usable creative even when the
AI generation fails, so that a temporary Gemini outage or error does not block
my ability to publish a speaker announcement.

#### Acceptance Criteria

1. IF the Background_Generator_Function returns an error response, THEN
   THE Creative_Generator SHALL render the Creative using the
   Creative_Template's original non-AI background.
2. IF the Background_Generator_Function returns an error response, THEN
   THE Creative_Generator SHALL display a toast message identifying the
   failure category (network / rate limit / content policy / service
   outage / configuration) to the organizer.
3. WHEN the Creative_Generator falls back to the Creative_Template's
   original non-AI background due to a Background_Generator_Function
   failure, THE Creative_Generator SHALL still upload the rendered
   Creative to Storage and insert an `event_creatives` row, so the
   Creative export itself succeeds.
4. THE Background_Generator_Function SHALL log every failure using the
   Illuxus edge logger (`supabase/functions/_shared/edge-logger.ts`) with
   the failure category and the request's correlation identifier, and
   SHALL NOT log the failure using `console.*`.

### Requirement 10: Content Policy Rejection

**User Story:** As an event organizer, I want a clear message when my prompt
is rejected by content policy, so that I understand why and can revise it.

#### Acceptance Criteria

1. IF the Gemini_Provider rejects a prompt due to its content policy,
   THEN THE Background_Generator_Function SHALL return an HTTP 422
   response whose body identifies the rejection as a content-policy
   rejection.
2. WHEN the Background_Generator_Function returns a content-policy
   rejection, THE Creative_Generator SHALL display a toast message
   distinguishing content-policy rejection from other failure categories
   and SHALL keep the Aspect_Ratio_Selection and Style_Preset selections
   intact so the organizer can revise the custom-prompt text and retry.
3. THE Background_Generator_Function SHALL NOT persist an
   `event_creative_backgrounds` row or upload a PNG to Storage for a
   request that resulted in a content-policy rejection.

### Requirement 11: Prompt Metadata Persistence

**User Story:** As an event organizer, I want the Creative_Library to show
which prompt produced each AI-backed creative, so that I can identify past
successes and recreate similar creatives later.

#### Acceptance Criteria

1. WHEN a Creative is rendered using an AI_Background_Source and its
   `event_creatives` row is inserted, THE Creative_Generator SHALL
   record the AI_Background_Asset's identifier, the Style_Preset used,
   and the custom-prompt text used in a `metadata` JSONB column on that
   `event_creatives` row.
2. THE `metadata` column SHALL be added to `public.event_creatives` via
   a new Supabase migration, SHALL default to `'{}'::jsonb`, and SHALL
   NOT be `NOT NULL` so existing (non-AI) `event_creatives` rows remain
   valid without backfill.
3. WHEN a Creative was generated without an AI_Background_Source, THE
   Creative_Generator SHALL persist an empty JSON object (`{}`) in the
   Creative's `event_creatives.metadata` column.
4. WHEN an organizer opens the Creative_Library for an event, IF an
   `event_creatives` row has a non-empty `metadata` object identifying
   an AI_Background_Asset, THEN THE Creative_Library UI SHALL display an
   indicator identifying that Creative as AI-backed and SHALL expose
   the recorded Style_Preset and custom-prompt text.

### Requirement 12: Access Control

**User Story:** As a platform operator, I want AI background generation
restricted to authorized organizers, so that unauthorized users cannot
consume Gemini quota against events they don't own.

#### Acceptance Criteria

1. THE Background_Generator_Function SHALL restrict Gemini_Provider
   invocations for an event to that event's owning organizer and users
   with the platform `admin` role, applying the same organizer/admin
   scoping already used by the base Creative_Generator (base spec
   Requirement 9).
2. IF a user without organizer or admin access to an event submits a
   Background_Generator_Function request for that event, THEN THE
   Background_Generator_Function SHALL return an HTTP 403 response and
   SHALL NOT invoke the Gemini_Provider.
3. THE `event_creative_backgrounds` table SHALL enforce row-level
   security scoped to the event's owning organizer and platform admins,
   matching the existing RLS pattern used by `public.event_creatives`
   (migration `022_event_creatives.sql`).
