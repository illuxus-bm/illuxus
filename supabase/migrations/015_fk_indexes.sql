-- ═══════════════════════════════════════════════════════════════════════════════
-- 015_fk_indexes.sql
--
-- Adds indexes on every foreign-key column that's queried by `… WHERE fk = $1`
-- but doesn't already have one. Without these, Postgres falls back to
-- sequential scans on the parent — fine on a dev DB with a few rows, fatal at
-- 50k concurrent users where a single live event can produce hundreds of
-- thousands of webinar_chat rows.
--
-- All statements are `CREATE INDEX IF NOT EXISTS` so the migration is
-- idempotent: safe on a fresh DB, safe on a DB that already has a subset of
-- the indexes, safe to re-run.
--
-- A few columns already have indexes from 001_tables.sql:
--   - registrations(event_id, user_id)        — UNIQUE composite
--   - webinar_sessions.event_id               — covered by ws_event_idx in 003
--   - subscriptions.org_id                    — UNIQUE
--   - speaker_applications(event_id, status)
--   - sponsor_applications(event_id, status)
--   - attendance_events(registration_id, occurred_at)
-- They're skipped here.
--
-- Ordering of the WHERE clauses below mirrors the access patterns in the app:
-- single-FK lookups first, then composite (FK + status / FK + ordering)
-- where the app routinely scans by a secondary column too.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── events ────────────────────────────────────────────────────────────────────
-- "my events" list pages query by user_id; org admin pages by org_id.
CREATE INDEX IF NOT EXISTS idx_events_user_id      ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_org_id       ON public.events(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org_date     ON public.events(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_events_status_date  ON public.events(status, date DESC);

-- ── speakers / sponsors (top-level org-wide tables) ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_speakers_user_id    ON public.speakers(user_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_user_id    ON public.sponsors(user_id);

-- ── event_speakers ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_speakers_event_id   ON public.event_speakers(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_event_speakers_speaker_id ON public.event_speakers(speaker_id);

-- ── event_sponsors ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_sponsors_event_id   ON public.event_sponsors(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_event_sponsors_sponsor_id ON public.event_sponsors(sponsor_id);

-- ── sessions / session_speakers ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_event_id_start ON public.sessions(event_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_speakers_session_id ON public.session_speakers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_speakers_speaker_id ON public.session_speakers(speaker_id);

-- ── webinar_speakers (per-session) ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webinar_speakers_session_id ON public.webinar_speakers(session_id);
CREATE INDEX IF NOT EXISTS idx_webinar_speakers_email      ON public.webinar_speakers(session_id, email);

-- ── webinar live-event tables (the hottest at 50k users) ─────────────────────
-- Chat / Q&A / polls / reactions / announcements / lounge are all scanned by
-- session_id on every websocket subscribe and every cold load of the live page.
CREATE INDEX IF NOT EXISTS idx_webinar_chat_session_id          ON public.webinar_chat(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webinar_qa_session_id            ON public.webinar_qa(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_polls_session_id         ON public.webinar_polls(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_poll_votes_poll_id       ON public.webinar_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_webinar_reactions_session_id     ON public.webinar_reactions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_announcements_session_id ON public.webinar_announcements(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_lounge_session_id        ON public.webinar_lounge_tables(session_id);
CREATE INDEX IF NOT EXISTS idx_webinar_stage_requests_session_id ON public.webinar_stage_requests(session_id, status);

-- ── attendance_events: keep registration_id+occurred_at composite from 001,
--    add event_id for "all events at an event" lookups (heat maps, reports).
CREATE INDEX IF NOT EXISTS idx_attendance_events_event_id ON public.attendance_events(event_id, occurred_at DESC);

-- ── sponsor_members ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sponsor_members_sponsor_id ON public.sponsor_members(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_members_user_id    ON public.sponsor_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_members_email      ON public.sponsor_members(sponsor_id, email);

-- ── orgs ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_members_org_id       ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id      ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id   ON public.org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_followers_org_id     ON public.org_followers(org_id);
CREATE INDEX IF NOT EXISTS idx_org_followers_user_id    ON public.org_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_org_sponsor_tiers_org_id ON public.org_sponsor_tiers(org_id);

-- ── auth-adjacent ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_otp_codes_user_id ON public.email_otp_codes(user_id, expires_at);

-- ── user_roles ───────────────────────────────────────────────────────────────
-- has_role(user_id, role) is called from every protected RLS policy.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles(user_id, role);

-- Note: registrations(event_id, user_id) already has the UNIQUE composite
-- index from 001, which serves both `WHERE event_id=$1` (uses the index
-- left-prefix) and the uniqueness check. No additional index needed.

COMMENT ON INDEX public.idx_webinar_chat_session_id IS
  'Hot path: chat panel cold-load + every realtime postgres_changes filter.';
COMMENT ON INDEX public.idx_user_roles_user_id_role IS
  'Hot path: has_role() is called from every protected RLS policy.';
