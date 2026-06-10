-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 3/3: Realtime publications + site content seed (run LAST)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['webinar_sessions','webinar_qa','webinar_polls','webinar_poll_votes','webinar_chat','webinar_stage_requests','webinar_reactions','webinar_announcements','webinar_lounge_tables','event_speakers','event_sponsors','sessions','events','speakers','sponsors','attendance_events','event_emails'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF;
  END LOOP;
END $$;

-- Registrations: non-PII columns only
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='registrations') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.registrations;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations
  (id,event_id,user_id,status,approval_status,checked_in,checked_in_at,attendance_state,active_session_id,active_session_started_at,last_in_at,last_out_at,total_minutes,created_at,updated_at);

-- ── Replica identity for realtime ─────────────────────────────────────────────
ALTER TABLE public.webinar_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_qa REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_polls REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_chat REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_stage_requests REPLICA IDENTITY FULL;

-- ── Site content seed ─────────────────────────────────────────────────────────
INSERT INTO public.site_content(section,content) VALUES
('navbar','{"brandName":"Illuxus","links":[{"label":"Features","href":"#features"},{"label":"Pricing","href":"#pricing"},{"label":"Testimonials","href":"#testimonials"}],"signInLabel":"Sign in","ctaLabel":"Get Started"}'::jsonb),
('hero','{"badge":"New: AI-powered event insights","title":"Run events your attendees won''t forget","subtitle":"All-in-one platform to plan, promote, and manage events of any size.","primaryCtaLabel":"Start free","primaryCtaHref":"/login","secondaryCtaLabel":"Browse events","secondaryCtaHref":"/events"}'::jsonb),
('features','{"eyebrow":"Features","title":"Everything you need to ship great events","subtitle":"Built for organizers who care about the details.","items":[{"title":"Event pages","description":"Beautiful, customizable landing pages for every event.","icon":"Sparkles"},{"title":"Registrations","description":"Sell tickets, collect RSVPs, manage waitlists.","icon":"Ticket"},{"title":"Check-in","description":"Fast door check-in with QR scanning and bulk actions.","icon":"ScanLine"},{"title":"Analytics","description":"Track sales, attendance, and engagement in real time.","icon":"BarChart3"},{"title":"Speakers & sponsors","description":"Centralized profiles, sessions, and tiered sponsor placement.","icon":"Users"},{"title":"Email & marketing","description":"Reach attendees with built-in campaigns and reminders.","icon":"Mail"}]}'::jsonb),
('pricing','{"eyebrow":"Pricing","title":"Simple plans that scale with you","subtitle":"Start free. Upgrade when you grow.","plans":[{"name":"Free","price":"$0","period":"forever","description":"For trying things out","highlight":false,"ctaLabel":"Start free","ctaHref":"/login","features":["3 events","50 attendees/event","Basic analytics"]},{"name":"Starter","price":"$29","period":"/month","description":"For growing organizers","highlight":false,"ctaLabel":"Choose Starter","ctaHref":"/login","features":["10 events","200 attendees/event","Custom branding","Email notifications"]},{"name":"Pro","price":"$79","period":"/month","description":"For serious teams","highlight":true,"ctaLabel":"Choose Pro","ctaHref":"/login","features":["50 events","1,000 attendees/event","Advanced analytics","Sponsor management","Custom domain"]},{"name":"Business","price":"$199","period":"/month","description":"For agencies & enterprises","highlight":false,"ctaLabel":"Contact sales","ctaHref":"/login","features":["Unlimited events","Unlimited attendees","API access","White label","Priority support"]}]}'::jsonb),
('testimonials','{"eyebrow":"Loved by organizers","title":"Trusted by teams running world-class events","items":[{"quote":"We replaced four tools with Illuxus. Setup took an afternoon.","author":"Aria Chen","role":"Head of Events, Lumen","avatarUrl":""},{"quote":"Door check-in went from chaos to calm. The QR scanner is excellent.","author":"Marcus Reyes","role":"Operations, NorthBeat","avatarUrl":""},{"quote":"Our sponsors finally get the visibility they pay for.","author":"Priya Shah","role":"Founder, DevHaus","avatarUrl":""}]}'::jsonb),
('cta','{"title":"Ready to host your next event?","subtitle":"Set up in minutes. No credit card required.","primaryCtaLabel":"Start free","primaryCtaHref":"/login","secondaryCtaLabel":"See pricing","secondaryCtaHref":"#pricing"}'::jsonb),
('footer','{"brandName":"Illuxus","tagline":"The modern event platform.","columns":[{"title":"Product","links":[{"label":"Features","href":"#features"},{"label":"Pricing","href":"#pricing"}]},{"title":"Company","links":[{"label":"About","href":"#"},{"label":"Contact","href":"mailto:hello@illuxus.com"}]},{"title":"Legal","links":[{"label":"Privacy","href":"#"},{"label":"Terms","href":"#"}]}],"copyright":"© 2026 Illuxus. All rights reserved."}'::jsonb)
ON CONFLICT(section) DO NOTHING;
