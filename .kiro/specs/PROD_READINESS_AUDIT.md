# illuxus — Production Readiness Audit (10k Concurrent Users)

_Audit date: 2026, against `main` at the time of inspection (`supabase/migrations/000_full_schema.sql` consolidated; observability Phase A–E shipped; Agora migration in flight)._

---

## Executive summary

illuxus has a thoughtful foundation — structured observability (Logger + correlation ids + offline queue), a property-tested attendance state machine, RLS on every table, lazy-loaded route chunks, a working PWA — and a reasonable Supabase schema. Where it falls short of "10k DAU without surprises" is at the **edges**: a couple of permissive RLS policies that allow anonymous spam, several edge functions with O(n) auth lookups and zero rate limits, a missing `registrations(event_id)` index, a 290 KB-gzipped (≈1 MB raw) main bundle, unvirtualised tables that explicitly target the registrations surface, and a registration-blocking foot-gun in `create-participant-account`. None of these are deeply structural — most are 1–3-day fixes — but several are blockers that **will** surface as outages or spam events at 10k DAU. I would not push this to a 10k-DAU launch today; with the items in "Critical" addressed, you'd be in good shape.

---

## Critical issues (must fix before scaling)

### C1. `create-partic
---

## Critical issues (must fix before scaling)

### C1. Issue:** Looks up an existing user by paging through every auth.users row.
- **Location:** `supabase/functions/create-participant-account/index.ts:84-86`
  ```ts
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  ```
- **Impact:** `auth.admin.listUsers()` returns only the first page (default 50) — so at >50 users it **silently misses matches** and creates duplicates, or it pages and becomes O(N) per invocation. With 10k users, every "Add Participant" click does up to 100 paginated calls. Used inside `AddParticipantDialog` and `ImportRegistrationsDialog` (bulk import), this turns a 200-row CSV import into ≥20 000 admin API calls.
- **Fix:** Query `auth.users` directly by email (`supabase.from('auth.users')` via a SECURITY DEFINER RPC, or a dedicated helper table that mirrors `auth.users(email)`). Add `UNIQUE(lower(email))` enforcement at the auth layer and let the duplicate insert surface a 409.

### C2. `webinar_reactions` accepts anonymous inserts with no validation
- **Issue:** RLS allows ANY origin, authenticated or anonymous, to insert into `webinar_reactions` with no check.
- **Location:** `supabase/migrations/000_full_schema.sql:6845`
  ```sql
  CREATE POLICY "Post reactions" ON public.webinar_reactions
    FOR INSERT TO authenticated, anon WITH CHECK (true);
  ```
- **Impact:** Anyone with the public anon key (it's in every client bundle) can `POST /rest/v1/webinar_reactions` at line rate, flooding `REPLICA IDENTITY FULL`-backed Realtime, breaking `idx_webinar_reactions_session_id` cardinality, and racking up Realtime broadcast cost across every connected attendee. A single attacker can knock a live event off the air.
- **Fix:** Require `EXISTS(...registrations OR speakers...)` like every other webinar table. Add a per-session/per-IP rate limit at the DB (insert trigger that counts last-5-second inserts).

### C3. No index on `registrations(event_id)`
- **Issue:** `registrations` has no plain index on `event_id`, and the comment in the late-stage index migration is incorrect.
- **Location:** `supabase/migrations/000_full_schema.sql:301-323` (table definition; only `qr_code` and `join_token` get explicit indexes) and lines 6605, 6682 — the comment claims a `UNIQUE(event_id, user_id)` composite exists; the table never declares one.
- **Impact:** Every organizer "load registrations" query (`EventDetailPage.tsx:148`, `RegistrationsSection.tsx:180`) is a sequential scan. Every RLS check on `webinar_chat`, `webinar_qa`, `webinar_polls`, `attendance_events` etc. that calls `is_event_approved_attendee()` does `SELECT 1 FROM registrations WHERE event_id=$1 AND user_id=$2` — also a seq scan. At 10k attendees × 12 channels per live page, this fans out to millions of seq scans per minute.
- **Fix:** `CREATE INDEX idx_registrations_event_id ON public.registrations(event_id); CREATE UNIQUE INDEX uniq_registrations_event_user ON public.registrations(event_id, user_id) WHERE user_id IS NOT NULL;` Run with `CREATE INDEX CONCURRENTLY` against the live DB.

### C4. `site-assets` storage bucket is world-writable by any authenticated user
- **Issue:** The override migration drops the admin-only policies and replaces them with policies that any signed-in user can use to insert, update, or **delete** anything in the `site-assets` bucket.
- **Location:** `supabase/migrations/000_full_schema.sql:3723-3742`
  ```sql
  CREATE POLICY "Authenticated update site-assets"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'site-assets');
  CREATE POLICY "Authenticated delete site-assets"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'site-assets');
  ```
- **Impact:** Any free-tier signup can `DELETE` the platform's marketing imagery, logos, OG images. There is no `owner = auth.uid()::text` predicate.
- **Fix:** Restrict `UPDATE`/`DELETE` to `owner = auth.uid()` or `has_role(auth.uid(),'admin')`. Restrict `INSERT` to a per-user prefix path (mirroring the `avatars` policy at line 671).

### C5. Edge functions have **zero** rate limiting
- **Issue:** No edge function — including `send-event-email`, `send-communication-email`, `livekit-token`, `agora-token`, `recording-start`, `send-whatsapp`, `create-participant-account` — enforces a per-user or per-IP rate limit.
- **Location:** `supabase/functions/*/index.ts` — `grep -r "rate_limit" supabase/functions/` returns nothing other than a comment.
- **Impact:** A single authenticated user can:
  - Drain Resend/Gmail SMTP quota by spamming `send-event-email` (one call ships 1 envelope per recipient).
  - Burn LiveKit / Agora minutes by hammering `livekit-token` / `agora-token`.
  - Trigger the unbounded `listUsers()` path in C1 in a loop.
  - Send WhatsApp template messages until the Meta token's daily cap is hit.
- **Fix:** Add a shared `_shared/rate-limit.ts` with a Supabase-backed sliding window (table `edge_rate_limits(user_id, fn, window_start, count)` with a small `_check_rate(fn, ip, user_id)` RPC). Apply at minimum to: `send-event-email`, `send-communication-email`, `send-whatsapp`, `create-participant-account`, `livekit-token`, `agora-token`, `recording-start`.

### C6. Registrations table renders all rows unvirtualised
- **Issue:** `RegistrationsSection.tsx` calls `sorted.map((r) => <tr>…</tr>)` with `AttendanceControls` + `Select` + 3 buttons per row. No `react-virtual`, no pagination, no `IntersectionObserver`.
- **Location:** `src/components/event/RegistrationsSection.tsx:1199` (`sorted.map((r) => …`); fetched via `supabase.from("registrations").select("*").eq("event_id", eventId)` at line 180 with no `.limit()`.
- **Impact:** At 1 000 registrations, the page mounts ~5 000 interactive React nodes and freezes for several seconds on tab switch. At 10 000 it's effectively unusable.
- **Fix:** Adopt `@tanstack/react-virtual`, paginate via `range()`, or both. The schema already has the columns to support keyset pagination by `created_at DESC, id`.

### C7. Public anon key surface is not rate-limited at PostgREST
- **Issue:** Public Supabase REST endpoints (e.g., `GET /rest/v1/events?status=eq.published`, `POST /rest/v1/webinar_reactions`) are reachable from anywhere with the anon key, and there is no Cloudflare / WAF in front.
- **Location:** `src/integrations/supabase/client.ts` (anon key exposed by design); no observed network-layer protection.
- **Impact:** Scrapers, login enumeration, mass DoS of the public landing.
- **Fix:** Front Supabase with Cloudflare (or Vercel's WAF) and apply per-route rate limits — especially on `/rest/v1/webinar_reactions`, `/rest/v1/registrations`, and `/functions/v1/*`. Supabase Pro does not provide application-layer rate limits.

---

## High-priority issues (fix in first 30 days)

### H1. RLS policies use unindexed `EXISTS` joins inside hot paths
- **Issue:** Webinar tables' RLS policies (`Read chat`, `Read votes`, `Post reactions`, etc.) do `EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND (is_event_approved_attendee(...) OR is_event_owner(...) OR is_event_speaker(...)))`. Each of those helpers itself hits `registrations` / `events` / `event_speakers`.
- **Location:** `supabase/migrations/000_full_schema.sql:518-520`, `:6720-:6760`, etc.
- **Impact:** Every chat message INSERT runs ~3 functions, each of which without C3's index hits seq scans. At 10k attendees averaging 1 chat msg/min during a live event, that's 167 inserts/sec × 3 lookups = 500+ RLS checks/sec on unindexed tables.
- **Fix:** After C3 is in place, also add `idx_event_speakers_user_id ON public.event_speakers(user_id)` (currently only `speaker_id` is indexed). Then `EXPLAIN ANALYZE` the policies and ensure `is_event_approved_attendee` is using the index.

### H2. Main JS bundle is 976 KB (290 KB gzipped) — heavy first paint
- **Issue:** No `manualChunks` in `vite.config.ts`; all the eager landing/auth code plus the supabase client plus framer-motion plus sonner plus radix lives in `index.js`.
- **Location:** `vite.config.ts` has no `build.rollupOptions.output.manualChunks`. Built bundles confirm: `dist/assets/index-*.js` = 976 KB raw / 290 KB gzipped.
- **Impact:** First contentful paint on a 4G connection is ≈3 s. Discoverability + SEO score impact, especially on the public landing / discovery feed.
- **Fix:** Split vendor chunks explicitly:
  ```ts
  build: { rollupOptions: { output: { manualChunks: {
    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
    'supabase':    ['@supabase/supabase-js'],
    'radix':       Object.keys(pkg.dependencies).filter(d => d.startsWith('@radix-ui/')),
    'observability': ['@sentry/browser'],
  }}}}
  ```
  Replace `framer-motion` with `motion/react` (smaller) on the landing if you don't use complex orchestration there.

### H3. Heavy webinar chunks loaded on the public event page
- **Issue:** `AgoraWebinarStage` = 1.5 MB raw / 438 KB gzipped. `WebinarStage` (LiveKit) = 576 KB raw. `excel-D1YGsoZ0.js` (ExcelJS) = 920 KB raw. `jspdf` = 408 KB.
- **Location:** `src/components/webinar/AgoraWebinarStage.tsx`, `src/lib/reports/excel.ts`, ticket/badge PDF generators.
- **Impact:** Already code-split (good), but anyone hitting `/e/:id/live` pulls ≈600 KB gzipped just for the stage. ExcelJS + jspdf are pulled in via the reports section — they're correctly lazy, but the imports inside `ReportsSection.tsx` and `ticket-pdf.ts` should be dynamic (`await import("exceljs")`) so that they don't drag into `ReportsPage`'s initial chunk.
- **Fix:** Convert the exceljs and jspdf imports to dynamic imports inside the export handlers, not module-top imports.

### H4. Images not lazy-loaded on listings and discover feed
- **Issue:** `EventCardLuma.tsx:84-86` and the discovery feed render `<img src={...} />` without `loading="lazy"` or `decoding="async"`. Only 3 places use `loading="lazy"`: `TicketDetailPage.tsx:120`, `PublicEventRenderer.tsx:425/863`.
- **Location:** `src/components/EventCardLuma.tsx:84`; same pattern in `EventsListingPage.tsx`, `DiscoverFeed.tsx`, `PublicOrgPage.tsx` event grid.
- **Impact:** A discovery feed with 50 events kicks off 50 banner downloads on render. At 10k DAU hitting the discovery feed, this is the single biggest egress cost.
- **Fix:** Add `loading="lazy" decoding="async"` to every `<img>` not above the fold. Consider `<img sizes="..." srcset="...">` via Supabase Storage image transforms (`?width=...&quality=...`).

### H5. Public RPCs / functions are unbounded-cost queries
- **Issue:** `get_event_attendees_public(_event_id, _limit)`, `get_public_org_brief`, `get_event_by_slug`, and `org-events` edge function are called from anonymous public pages. `org-events` does `landing_published=true` lookup + event scan with `LIMIT 50` (good) but applies it after RLS — no problem here, but `get_public_org_brief` is unprofiled.
- **Location:** `supabase/migrations/000_full_schema.sql` — search for `CREATE FUNCTION public.get_event_attendees_public`. `supabase/functions/org-events/index.ts`.
- **Impact:** Scrapers can hammer these on any public event/org page.
- **Fix:** Cap every public RPC at `LIMIT 100`, add `STABLE` and `PARALLEL SAFE`. Front with Cloudflare cache for org/event public RPCs (`get_event_by_slug` is a clear cache target — invalidate via a `Last-Modified` header from `events.updated_at`).

### H6. 12 channels × 10 000 attendees on a live event page
- **Issue:** A single attendee on `EventLivePage` + `WebinarSidebar` subscribes to ~12 Realtime channels: session, reg, my-stage-request, reactions-live, announce-live, sidebar-counts, chat, qa, polls, reqs, req-user, branding, site-header-profile.
- **Location:** `src/pages/EventLivePage.tsx:88, 205, 221, 474, 496`; `src/components/webinar/WebinarSidebar.tsx:100, 220, 327, 481, 674, 720`; `src/components/webinar/StageOverlays.tsx:20`; `src/components/SiteHeader.tsx:82`.
- **Impact:** Supabase clients open one WebSocket per browser tab but the channel count drives broadcast traffic and per-channel filter cost. At 10k attendees the cost is dominated by reactions/chat broadcast: 10k subscribers × 1 reaction per attendee per second = 100M deliveries/min.
- **Fix:**
  - Consolidate `sidebar-counts` into `chat` and `qa` channels (don't subscribe twice to the same table).
  - Use Agora RTM (already a dependency) for reactions and announcements — they're broadcast-shaped, not persistence-shaped. Persist a once-per-minute aggregate to `webinar_reactions_summary` for analytics, not every emoji.
  - Throttle client-side reaction emit to ≤2/s/attendee.

### H7. `REPLICA IDENTITY FULL` on 12 tables doubles Realtime WAL volume
- **Issue:** 12 tables set to `REPLICA IDENTITY FULL` so the entire old row is included in every UPDATE/DELETE Realtime payload.
- **Location:** `supabase/migrations/000_full_schema.sql:1230-1237`, `:2571-:2573`, `:3302-:3304`.
- **Impact:** Doubles to triples Realtime egress on `community_messages`, `webinar_chat`, etc. Most callers only need the new row — `FULL` is required only when you need pre-image columns inside the postgres_changes payload (e.g., for diffing old vs new). Most channels in the code subscribe to a single column or `*` and use only `payload.new`.
- **Fix:** Audit each `REPLICA IDENTITY FULL`. If only `payload.new` is used (the case for `webinar_chat`, `webinar_reactions`, `webinar_qa`, `community_messages`), drop it back to `DEFAULT` and rely on the primary key. Keep `FULL` only where a payload consumer actually reads `payload.old`.

### H8. `livekit-token` does N synchronous Supabase calls and a LiveKit ListParticipants per token
- **Issue:** Each `livekit-token` invocation does: 1) `auth.getUser`, 2) profile lookup, 3) webinar_speakers lookup, 4) registrations lookup, 5) `webinar_sessions` lookup, 6) `events` lookup, 7) `webinar_speakers` second lookup if userId, 8) LiveKit ListParticipants HTTP call to count publishers.
- **Location:** `supabase/functions/livekit-token/index.ts:40-150` and `getPublisherCount` at the bottom.
- **Impact:** ~600 ms cold start + 200 ms warm. At 10k attendees joining within 60 s of an event going live = 167 RPS → backed-up function queue, slow joins.
- **Fix:** Collapse the lookups into one Postgres function `webinar_resolve_join(_session_id, _user_id, _join_token, _speaker_token)` that returns `{role, can_publish, display_name, registration_id}` in a single query. Move `getPublisherCount` to a 30 s in-memory cache per session (Deno's edge runtime persists per region for a short period).

### H9. `livekit-webhook` has TOCTOU race on peak counters and never returns 4xx
- **Issue:** On `participant_joined`, the function reads `viewer_peak`, increments locally, and writes back. With 1000+ joins/sec this race-loses many updates. The function also returns `"ok"` on every error path, hiding webhook failures from LiveKit.
- **Location:** `supabase/functions/livekit-webhook/index.ts:55-70`.
- **Impact:** Inaccurate peak counts in analytics + silent failures.
- **Fix:** Use a single SQL `UPDATE webinar_sessions SET viewer_peak = GREATEST(viewer_peak, viewer_peak+1) WHERE id=$1` — better, use an atomic `UPDATE … SET viewer_peak = (SELECT count(*) FROM webinar_attendance WHERE session_id=$1 AND left_at IS NULL)`. Return non-200 only when LiveKit should retry (idempotent flow).

### H10. EventDetailPage loads every registration into memory
- **Issue:** `await supabase.from("registrations").select("*").eq("event_id", eventId)` with no limit.
- **Location:** `src/pages/dashboard/EventDetailPage.tsx:148`.
- **Impact:** 10 000-row payload (~5 MB JSON) on every event-page navigation for a big event.
- **Fix:** Compute counters server-side via an RPC `event_summary(_event_id)` returning `{registrations, speakers, sessions, sponsors}`. Lazy-load full rows only when the Registrations tab opens.

### H11. Default global query staleTime is 30s but realtime channels also drive updates
- **Issue:** Many pages combine TanStack Query with a postgres_changes subscription. Both pathways fire on the same data, with no `queryClient.invalidateQueries` coupling — instead local `setState` runs in parallel with the query cache.
- **Location:** `src/components/event/RegistrationsSection.tsx:249-323`, `src/pages/dashboard/EventDetailPage.tsx:165-186`, `src/pages/PublicEventPage.tsx:102-122`.
- **Impact:** Duplicate state, occasional UI flicker, and double the network traffic.
- **Fix:** Pick one model per surface — either TanStack Query (with `staleTime: Infinity` + manual `queryClient.invalidateQueries` from a channel handler), or `useState` + realtime. Don't run both.

### H12. `org-events` accepts `org` / `subdomain` query params with a `lower()` only
- **Issue:** The URL param is fed unsanitised into a PostgREST `or()` filter.
- **Location:** `supabase/functions/org-events/index.ts:38-46`:
  ```ts
  const handle = (orgSlug || subdomain || "").toLowerCase();
  .or(`subdomain.eq.${handle},slug.eq.${handle}`)
  ```
- **Impact:** A `?org=a),subdomain.eq.b,or(true.eq.true` style payload could subvert the filter and let an attacker enumerate unpublished orgs. Supabase PostgREST does some validation but the `or()` filter parser is permissive.
- **Fix:** Validate handle with `/^[a-z0-9-]{1,64}$/` before use; reject otherwise. Or use two `.eq()` calls inside a `Promise.all` and merge results.

---

## Medium-priority issues (fix in first 90 days)

### M1. No backups documentation
- **Issue:** `README.md` and `ROADMAP.md` don't mention point-in-time recovery configuration, backup retention, or restore drill cadence.
- **Fix:** Add a `docs/operations.md` covering: Supabase PITR setting, weekly export of `auth.users`, manual restore drill, who has the Supabase project owner credentials.

### M2. No documented runbook for hotfix deploys
- **Issue:** Vercel + Supabase combo supports zero-downtime, but there's no playbook documenting how to push a migration without locking tables (the consolidated `000_full_schema.sql` is fine on a fresh DB but rerunning it would `CREATE TABLE IF NOT EXISTS` — the new indexes from the bottom use `IF NOT EXISTS` so they're idempotent, but most `ALTER TABLE … ADD COLUMN` calls are not).
- **Location:** `supabase/migrations/000_full_schema.sql` — search for `ALTER TABLE public.events ADD COLUMN`.
- **Fix:** Split the file into `000_baseline.sql` (fresh-DB schema) and small dated migrations going forward. Document that all new indexes use `CREATE INDEX CONCURRENTLY` and column adds use `IF NOT EXISTS`.

### M3. Vercel CORS allowlist is regex-based and accepts any `*.vercel.app`
- **Issue:** `_shared/cors.ts:138-141` echoes the Origin header back for any `https://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$`.
- **Impact:** Any Vercel deploy on the platform (including someone else's) can call your edge functions with a user's cookies attached. Not exploitable without a stolen JWT, but it widens the CSRF blast radius.
- **Fix:** Allowlist only `*.illuxus.vercel.app` (your project's preview suffix) or scrap the regex once `ALLOWED_ORIGINS` is consistently set in CI.

### M4. `send-event-email` is not idempotent at the recipient level
- **Issue:** On partial failure (some recipients fail SMTP), the function flips `event_emails.status='sent'` if any succeeded, and `'draft'` only if all failed. A retry then either skips (already 'sent') or resends everyone (status reset to 'draft').
- **Location:** `supabase/functions/send-event-email/index.ts:166-180`.
- **Fix:** Add a `event_email_recipients` join table with per-recipient status and only retry the failed rows. Pattern matches the existing `communication_recipients`.

### M5. SMTP path is one envelope per recipient with no batching
- **Issue:** Sends one SMTP envelope per recipient inside the edge function.
- **Location:** `supabase/functions/send-event-email/index.ts:152-165`.
- **Impact:** At 5 000 recipients × ~200 ms per SMTP submission = 17 minutes inside an edge function. Supabase edge functions have a 150 s wall clock.
- **Fix:** Move to Resend's batch API (`POST /emails/batch`, up to 100 per call) and chunk inside a dispatcher RPC. Or use a queue (`pg_cron` + `pg_net`).

### M6. No retention policy on `webinar_chat`, `webinar_reactions`, `community_messages`
- **Issue:** Tables grow forever, with `REPLICA IDENTITY FULL` doubling storage.
- **Fix:** `pg_cron` cleanup: delete `webinar_chat` older than 90 days. Archive to Storage if you need long-term retention.

### M7. Observability remote sink + offline queue are wired but DSN is empty
- **Issue:** `.kiro/specs/observability-foundation/tasks.md` marks Phase F (production DSN + canary) as open. `VITE_OBSERVABILITY_DSN` defaults to `""` (`.env.example`).
- **Impact:** No remote error visibility today. Critical for a 10k-user rollout.
- **Fix:** Wire the DSN per environment, complete Phase F. The plumbing is already in place.

### M8. Many `useEffect` dependency arrays disabled via eslint-disable comments
- **Issue:** Multiple `// eslint-disable-next-line react-hooks/exhaustive-deps` (e.g., `PublicEventPage.tsx:122`, several places in `EventLivePage.tsx`). Each is a latent stale-closure bug.
- **Fix:** Audit each one. Many can be fixed by extracting the dependency or `useCallback`-wrapping the handler.

### M9. `EventCardLuma` builds a `mapsUrlFor` and click handler per render
- **Issue:** Fresh `mapsUrlFor()` and an arrow `onClick` are created on every render. Multiplied across ~50 cards in `DiscoverFeed`, no `React.memo`, no card-level memoization.
- **Location:** `src/components/EventCardLuma.tsx:35-65`.
- **Fix:** Wrap `EventCardLuma` in `React.memo`. Compute `mapsUrl` once on mount via `useMemo`.

### M10. `fingerprint` in `EventLivePage` is a 32-bit hash of UA + screen + timezone
- **Issue:** Easy to spoof — defeats the "self-kick across devices" intent.
- **Location:** `src/pages/EventLivePage.tsx:78-84`.
- **Impact:** Not a critical bug because the comment acknowledges it ("Not for tracking"), but the linked single-active-session enforcement loses to a determined attacker.
- **Fix:** Either lean fully on `browser_session_id` (random UUID per tab) or sign the fingerprint server-side.

### M11. `webinar_reactions` `REPLICA IDENTITY FULL` not set despite chat
- **Issue:** Inconsistent — chat is `FULL`, reactions are not. Reactions are the highest-volume table; chat is lower volume.
- **Fix:** Audit `REPLICA IDENTITY FULL` choices once H7 is being addressed.

### M12. `useEventCheckinCounters` subscribes a fresh realtime channel per mount
- **Location:** `src/hooks/useEventCheckinCounters.ts:76`.
- **Impact:** Two open tabs of the same event = two channels for the same counter.
- **Fix:** Use a singleton shared subscription pattern keyed by `eventId`.

### M13. `whatsapp-webhook` is wide-open
- **Issue:** Allow-any-origin (correctly), but the function does not verify Meta's `X-Hub-Signature-256` HMAC.
- **Location:** `supabase/functions/whatsapp-webhook/index.ts`.
- **Fix:** Verify the HMAC against `WHATSAPP_APP_SECRET` per Meta's docs.

---

## What's working well

- **Observability layer.** `src/lib/observability/` is genuinely production-grade: correlation IDs threaded through every RPC, PII redaction in the redact pipeline, IndexedDB-backed offline queue with sliding-window rate limit (≤20 dispatches/5 s), `pagehide` durability backup, `sendBeacon`-only flush, deterministic injectable clock for tests. Phase A–E are done; just wire the DSN.
- **Attendance state machine.** `src/lib/attendance/applyAttendance.ts` plus 13 property-based fast-check tests is exemplary. The TS port mirrors the SQL helper, and the PBTs lock in invariants that would otherwise drift.
- **RLS coverage.** Every public table has RLS enabled, and the helpers (`is_org_member`, `is_org_owner`, `is_event_owner`, `is_event_approved_attendee`) are `SECURITY DEFINER STABLE SET search_path = public` — the right pattern.
- **Route-level code splitting.** `lazyWithLog` + `RouteErrorBoundary` per route is clean.
- **CORS allowlist.** `_shared/cors.ts` correctly enforces origin allowlist (with `allowAny: true` only for webhooks and the public `org-events` / `fx-rates`).
- **Edge logger.** `_shared/edge-logger.ts` is structured JSON, with deny-list redaction of high-risk fields and `correlation_id` threading.
- **SECURITY DEFINER functions** with `SET search_path = public` everywhere — no `quote_ident`/`quote_literal` needed because the only dynamic SQL (`EXECUTE format(...)`) operates over a hard-coded array of table names.
- **PWA strategy.** Cache-first for Supabase Storage public bucket, network-first w/ 3 s timeout for REST, network-only for realtime/edge/auth, manual update prompt rather than silent reload. Sensible.
- **TanStack Query defaults.** Reasonable: `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1` with exponential backoff. Most hooks override with stricter `staleTime` where freshness matters.

---

## Cost estimate (10 000 DAU, monthly)

These are order-of-magnitude estimates assuming a mid-funnel mix: ~6 events/day produced, ~1 webinar/day with 1 000 live attendees, average event has 200 registrations.

| Line item | Service | Estimate (USD/mo) | Notes |
|-----------|---------|-------------------|-------|
| Database & Realtime | Supabase Pro + add-ons | $400–$800 | $25 base + $10/100 GB egress + $10/500 concurrent realtime, RLS query CPU is the dominant variable. Add ≈$100 for Postgres add-on storage at the rate things grow without retention (M6). |
| Frontend hosting | Vercel Pro | $20 + bandwidth | $20/seat + ~$0.15/GB egress. With 290 KB gzip × 10k DAU × 5 page loads = ≈14 GB/day = 420 GB/mo ≈ $63. PWA caching cuts this ~40 %, so call it $50. **$70/mo total**. |
| Live webinars (RTC) | Agora | $300–$2 000 | $0.99/1 000 mins host audio; $3.99/1 000 mins HD video. 1 000 attendees × 60 min × 1 event/day × 30 d = 1.8M minutes/mo. At $1.99/1 000 mixed mins ≈ **$3 600** worst case; realistic with audio-only fallback and partial uptake **$800**. |
| Live webinars (LiveKit fallback) | LiveKit Cloud | $200–$1 000 | Same minute model on top of egress. If you migrate fully to Agora as the spec plans, this goes to ~$0. |
| Recording storage | Supabase Storage | $30–$100 | 30 recordings/mo × ~2 GB each = 60 GB; $0.021/GB ≈ $1.30 storage + egress. The bigger number kicks in if you retain longer. |
| Email (Resend) | Resend Pro | $20–$200 | $20 for 50k emails/mo. At 200 attendees × 6 events/day × 5 emails/registration lifecycle = 180k emails/mo → **$80** (next tier). |
| WhatsApp templates | Meta Cloud | $50–$400 | $0.005–$0.0535 per delivered marketing/auth message depending on country. 50k messages × $0.02 avg = **$1 000**. Country-mix sensitive. |
| Observability | Sentry/Better Stack | $50–$200 | At warn+ in prod with the 20-record batch, expect ~1M events/mo. |
| Cloudflare (added in C7) | Pro plan | $20 | Recommended addition. |
| **Total monthly (realistic)** | | **$1 100–$3 500** | Webinar minutes dominate. The cheap end assumes audio-mostly events; the high end assumes everyone runs HD video. |

**Cost levers to pull first** (biggest savings per hour of engineering):
1. Drop unused `REPLICA IDENTITY FULL` (H7) → halves Realtime egress on chat/messages.
2. Migrate reactions to Agora RTM (H6) → kills the highest-volume Postgres write path.
3. Switch fully to Agora; retire LiveKit (already in the roadmap).
4. Cloudflare in front of Supabase + Vercel (C7).
5. Image lazy-load + transform query params (H4) → trims Vercel + Supabase Storage egress 30–50 %.

---

## Recommended next steps (ordered)

1. **Index `registrations(event_id)`** + drop the wrong comment (C3). Confirm with `EXPLAIN ANALYZE` on the policies in H1.
2. **Lock down `webinar_reactions` and `site-assets`** (C2, C4). Both are one-policy fixes — 30 minutes of effort, days of latent risk removed.
3. **Replace `auth.admin.listUsers()`** in `create-participant-account` (C1). Write a small `find_user_id_by_email` RPC.
4. **Add edge function rate limiting** (C5). A single `_shared/rate-limit.ts` plus a `rate_limits` table works for all functions.
5. **Front everything with Cloudflare** (C7). Cheap insurance, fixes a class of issues at once.
6. **Virtualise `RegistrationsSection`** (C6). Use `@tanstack/react-virtual`; pattern after the existing TanStack Query layout.
7. **Wire `VITE_OBSERVABILITY_DSN`** for prod (M7 / observability Phase F). Don't roll to 10k without remote error visibility.
8. **Bundle splitting + lazy heavy deps** (H2, H3, H4). Cut FCP to <2 s on 4G.
9. **Consolidate webinar Realtime channels and move reactions to RTM** (H6, H7). Either alone halves Realtime cost.
10. **Plan the migration split** (M2). Replace the monolithic `000_full_schema.sql` with `000_baseline.sql` + per-feature dated files. Document PITR config and a restore drill (M1).

---

_Audit produced by inspecting code at the time of the request; cite line numbers refer to that snapshot. Any item without a code citation is a process/strategy observation rather than a defect call._
