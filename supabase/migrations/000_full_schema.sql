-- ==============================================================
-- Illuxus — complete database schema
-- Combined from 001–021 migrations on 2026-06-23
-- Apply to a FRESH Supabase project via the SQL Editor.
-- If you are using supabase CLI, run: supabase db push
-- ==============================================================


-- ────────────────────────────────────────────────────────────
-- 001_tables.sql
-- ────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 1/3: All tables, indexes, triggers, storage buckets, base RLS
-- Run this FIRST on a fresh Supabase project.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Shared trigger function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLES (ordered by foreign-key dependencies)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── user_roles ────────────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text, avatar_url text, bio text,
  account_type text NOT NULL DEFAULT 'attendee' CHECK(account_type IN('attendee','organizer')),
  username text, headline text, title text, first_name text, last_name text,
  department text, designation text, company text,
  mobile_country_code text, mobile_number text, mobile_verified boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false, linkedin_url text,
  company_website text, company_employee_count text, industry text,
  city_id uuid, two_factor_enabled boolean NOT NULL DEFAULT false,
  profile_completed boolean NOT NULL DEFAULT false, onboarding_completed boolean NOT NULL DEFAULT false,
  video_fx_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles(lower(username)) WHERE username IS NOT NULL;
CREATE INDEX idx_profiles_account_type ON public.profiles(account_type);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can view profiles" ON public.profiles FOR SELECT TO authenticated USING(true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING(auth.uid()=user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK(auth.uid()=user_id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── organizations ─────────────────────────────────────────────────────────────
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE,
  subdomain text, custom_domain text, custom_domain_verified boolean NOT NULL DEFAULT false,
  logo_url text, owner_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  plan_limits jsonb NOT NULL DEFAULT '{"max_events":3,"max_attendees_per_event":50,"max_team_members":1,"features":["basic_analytics"]}'::jsonb,
  addons text[] NOT NULL DEFAULT '{}', billing_email text,
  landing_config jsonb NOT NULL DEFAULT '{}'::jsonb, landing_published boolean NOT NULL DEFAULT false,
  webinar_branding_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_subdomain_unique ON public.organizations(lower(subdomain)) WHERE subdomain IS NOT NULL;
CREATE UNIQUE INDEX organizations_custom_domain_unique ON public.organizations(lower(custom_domain)) WHERE custom_domain IS NOT NULL;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
CREATE POLICY "Owner update org" ON public.organizations FOR UPDATE TO authenticated USING(owner_id=auth.uid());
CREATE POLICY "Public view published orgs" ON public.organizations FOR SELECT TO anon,authenticated USING(landing_published=true);

-- ── org_members ───────────────────────────────────────────────────────────────
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers (avoids circular RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_members WHERE user_id=_user_id AND org_id=_org_id);
$$;
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id=_org_id AND owner_id=_user_id);
$$;

-- Now apply org policies that depend on helpers
CREATE POLICY "Members view org" ON public.organizations FOR SELECT TO authenticated USING(is_org_member(auth.uid(),id) OR owner_id=auth.uid());
CREATE POLICY "Members view org members" ON public.org_members FOR SELECT TO authenticated USING(is_org_member(auth.uid(),org_id));
CREATE POLICY "Owner manage members" ON public.org_members FOR ALL TO authenticated USING(is_org_owner(auth.uid(),org_id)) WITH CHECK(is_org_owner(auth.uid(),org_id));
GRANT SELECT ON public.organizations TO anon, authenticated;
GRANT INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.org_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_members TO authenticated;

-- ── subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  plan text NOT NULL DEFAULT 'free', status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT(now()+interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view sub" ON public.subscriptions FOR SELECT TO authenticated USING(is_org_member(auth.uid(),org_id));
CREATE POLICY "Owner manage sub" ON public.subscriptions FOR ALL TO authenticated USING(is_org_owner(auth.uid(),org_id)) WITH CHECK(is_org_owner(auth.uid(),org_id));
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;

-- ── org_invitations ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;
CREATE TABLE public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL, role text NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL, status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view invitations" ON public.org_invitations FOR SELECT TO authenticated USING(is_org_member(auth.uid(),org_id));
CREATE POLICY "Owner manage invitations" ON public.org_invitations FOR ALL TO authenticated USING(is_org_owner(auth.uid(),org_id)) WITH CHECK(is_org_owner(auth.uid(),org_id));
CREATE TRIGGER update_org_invitations_updated_at BEFORE UPDATE ON public.org_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── org_followers ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON public.org_followers TO authenticated;
GRANT SELECT ON public.org_followers TO anon;
CREATE TABLE public.org_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, org_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);
ALTER TABLE public.org_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view followers" ON public.org_followers FOR SELECT TO authenticated USING(true);
CREATE POLICY "Users follow" ON public.org_followers FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users unfollow" ON public.org_followers FOR DELETE TO authenticated USING(user_id=auth.uid());

-- ── org_sponsor_tiers ─────────────────────────────────────────────────────────
CREATE TABLE public.org_sponsor_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, label text NOT NULL, color text,
  display_order int NOT NULL DEFAULT 0, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX org_sponsor_tiers_org_label ON public.org_sponsor_tiers(org_id, lower(label));
ALTER TABLE public.org_sponsor_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view tiers" ON public.org_sponsor_tiers FOR SELECT TO authenticated USING(is_org_member(auth.uid(),org_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY "Members create tiers" ON public.org_sponsor_tiers FOR INSERT TO authenticated WITH CHECK(is_org_member(auth.uid(),org_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owner update tiers" ON public.org_sponsor_tiers FOR UPDATE TO authenticated USING(is_org_owner(auth.uid(),org_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owner delete tiers" ON public.org_sponsor_tiers FOR DELETE TO authenticated USING(is_org_owner(auth.uid(),org_id) OR has_role(auth.uid(),'admin'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.org_sponsor_tiers TO authenticated;

-- ── events ────────────────────────────────────────────────────────────────────
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title text NOT NULL, description text, slug text NOT NULL,
  date timestamptz NOT NULL, end_date timestamptz, venue text, location text,
  capacity int DEFAULT 0, tickets_sold int DEFAULT 0, price numeric(10,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR', timezone text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','cancelled','completed')),
  event_format text NOT NULL DEFAULT 'physical' CHECK(event_format IN('physical','virtual','hybrid')),
  virtual_provider text, virtual_url text,
  requires_approval boolean NOT NULL DEFAULT false, cover_video_url text, image_url text,
  banner_landscape_url text, banner_portrait_url text,
  page_config jsonb, attendance_target_pct int CHECK(attendance_target_pct IS NULL OR attendance_target_pct BETWEEN 0 AND 100),
  webinar_branding_enabled boolean,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX events_slug_org_unique ON public.events(org_id, slug);
CREATE INDEX events_slug_idx ON public.events(slug);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View published events" ON public.events FOR SELECT TO anon,authenticated USING(status='published' OR auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert events" ON public.events FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Update events" ON public.events FOR UPDATE TO authenticated USING(auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Delete events" ON public.events FOR DELETE TO authenticated USING(auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── speakers ──────────────────────────────────────────────────────────────────
CREATE TABLE public.speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, name text NOT NULL, email text, bio text, photo_url text,
  company text, designation text, title text, first_name text, last_name text,
  mobile_country_code text, mobile_number text, linkedin_url text,
  company_website text, company_employee_count text, industry text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage speakers" ON public.speakers FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Admins manage speakers" ON public.speakers FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
GRANT SELECT ON public.speakers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.speakers TO authenticated;
CREATE TRIGGER update_speakers_updated_at BEFORE UPDATE ON public.speakers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── sponsors ──────────────────────────────────────────────────────────────────
CREATE TABLE public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, name text NOT NULL, email text, logo_url text, website text,
  tier text NOT NULL DEFAULT 'bronze', tier_label text, description text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage sponsors" ON public.sponsors FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Admins manage sponsors" ON public.sponsors FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
GRANT SELECT ON public.sponsors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
CREATE TRIGGER update_sponsors_updated_at BEFORE UPDATE ON public.sponsors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── event_speakers ────────────────────────────────────────────────────────────
CREATE TABLE public.event_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, speaker_id)
);
ALTER TABLE public.event_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view event_speakers" ON public.event_speakers FOR SELECT TO authenticated USING(true);
CREATE POLICY "Owner manage event_speakers" ON public.event_speakers FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin')))) WITH CHECK(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT ON public.event_speakers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_speakers TO authenticated;

-- Anon cross-join policies (now safe — event_speakers exists)
CREATE POLICY "Anon view speakers for published" ON public.speakers FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM public.event_speakers es JOIN public.events e ON e.id=es.event_id WHERE es.speaker_id=speakers.id AND e.status='published'));
CREATE POLICY "Auth view speakers for published" ON public.speakers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.event_speakers es JOIN public.events e ON e.id=es.event_id WHERE es.speaker_id=speakers.id AND e.status='published'));
CREATE POLICY "Event owner view linked speakers" ON public.speakers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.event_speakers es JOIN public.events e ON e.id=es.event_id WHERE es.speaker_id=speakers.id AND e.user_id=auth.uid()));
REVOKE SELECT(email) ON public.speakers FROM anon;

-- ── event_sponsors ────────────────────────────────────────────────────────────
CREATE TABLE public.event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  tier_override text, display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id, sponsor_id)
);
ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view event_sponsors" ON public.event_sponsors FOR SELECT TO authenticated USING(true);
CREATE POLICY "Owner manage event_sponsors" ON public.event_sponsors FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin')))) WITH CHECK(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT ON public.event_sponsors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_sponsors TO authenticated;

CREATE POLICY "Anon view sponsors for published" ON public.sponsors FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM public.event_sponsors es JOIN public.events e ON e.id=es.event_id WHERE es.sponsor_id=sponsors.id AND e.status='published'));
CREATE POLICY "Auth view sponsors for published" ON public.sponsors FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.event_sponsors es JOIN public.events e ON e.id=es.event_id WHERE es.sponsor_id=sponsors.id AND e.status='published'));
CREATE POLICY "Event owner view linked sponsors" ON public.sponsors FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.event_sponsors es JOIN public.events e ON e.id=es.event_id WHERE es.sponsor_id=sponsors.id AND e.user_id=auth.uid()));
REVOKE SELECT(email) ON public.sponsors FROM anon;

-- ── sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL, description text, session_type text NOT NULL DEFAULT 'talk',
  start_time timestamptz NOT NULL, end_time timestamptz NOT NULL, location text,
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view sessions" ON public.sessions FOR SELECT TO authenticated USING(true);
CREATE POLICY "Owner manage sessions" ON public.sessions FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin')))) WITH CHECK(EXISTS(SELECT 1 FROM public.events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT ON public.sessions TO anon;
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── session_speakers ──────────────────────────────────────────────────────────
CREATE TABLE public.session_speakers (
  session_id uuid NOT NULL, speaker_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id, speaker_id)
);
ALTER TABLE public.session_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view session_speakers" ON public.session_speakers FOR SELECT TO authenticated USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_speakers TO authenticated;
GRANT SELECT ON public.session_speakers TO anon;

-- ── registrations ─────────────────────────────────────────────────────────────
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid, name text NOT NULL, email text NOT NULL,
  ticket_type text NOT NULL DEFAULT 'general', status text NOT NULL DEFAULT 'confirmed',
  approval_status text NOT NULL DEFAULT 'approved', amount_paid numeric DEFAULT 0,
  qr_code text, join_token text NOT NULL DEFAULT(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
  active_session_id text, active_session_started_at timestamptz,
  checked_in boolean NOT NULL DEFAULT false, checked_in_at timestamptz, checked_in_method text,
  attendance_state text NOT NULL DEFAULT 'never',
  last_in_at timestamptz, last_out_at timestamptz, total_minutes int NOT NULL DEFAULT 0,
  title text, first_name text, last_name text, company text, designation text,
  mobile_country_code text, mobile_number text, linkedin_url text,
  company_website text, company_employee_count text, industry text,
  approved_by uuid, approved_at timestamptz, decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX registrations_qr_code_unique ON public.registrations(qr_code) WHERE qr_code IS NOT NULL;
CREATE UNIQUE INDEX registrations_join_token_idx ON public.registrations(join_token);
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner view regs" ON public.registrations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Auth register" ON public.registrations FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() OR user_id IS NULL);
CREATE POLICY "Owner update regs" ON public.registrations FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Owner delete regs" ON public.registrations FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM events WHERE id=event_id AND(user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Attendee view own" ON public.registrations FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Attendee cancel own" ON public.registrations FOR DELETE TO authenticated USING(user_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
ALTER TABLE public.registrations REPLICA IDENTITY DEFAULT;
CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── sponsor_members ───────────────────────────────────────────────────────────
CREATE TABLE public.sponsor_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  user_id uuid, email text NOT NULL, display_name text,
  role text NOT NULL DEFAULT 'member',
  invite_token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
  accepted_at timestamptz,
  title text, first_name text, last_name text, company text, designation text,
  mobile_country_code text, mobile_number text, linkedin_url text,
  company_website text, company_employee_count text, industry text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sponsor_id, email)
);
ALTER TABLE public.sponsor_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sponsor owner manage" ON public.sponsor_members FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM sponsors s WHERE s.id=sponsor_id AND(s.user_id=auth.uid() OR has_role(auth.uid(),'admin')))) WITH CHECK(EXISTS(SELECT 1 FROM sponsors s WHERE s.id=sponsor_id AND(s.user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Member read own" ON public.sponsor_members FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sponsor_members TO authenticated;
CREATE TRIGGER trg_sponsor_members_updated BEFORE UPDATE ON public.sponsor_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── attendance_events ─────────────────────────────────────────────────────────
CREATE TABLE public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL, event_id uuid NOT NULL,
  event_day date, kind text NOT NULL CHECK(kind IN('in','out','auto_out')),
  method text NOT NULL DEFAULT 'manual', occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendance_events_reg ON public.attendance_events(registration_id, occurred_at);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read attendance" ON public.attendance_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM events e WHERE e.id=event_id AND(e.user_id=auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;

-- ── event_emails ──────────────────────────────────────────────────────────────
CREATE TABLE public.event_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL, body text NOT NULL DEFAULT '',
  recipient_filter text NOT NULL DEFAULT 'all', recipients text NOT NULL DEFAULT 'All Registrants',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','sent')),
  sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_emails_event_id_idx ON public.event_emails(event_id, created_at DESC);
ALTER TABLE public.event_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view emails" ON public.event_emails FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM events e JOIN org_members om ON om.org_id=e.org_id WHERE e.id=event_id AND om.user_id=auth.uid()));
CREATE POLICY "Org members insert emails" ON public.event_emails FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM events e JOIN org_members om ON om.org_id=e.org_id WHERE e.id=event_id AND om.user_id=auth.uid()));
CREATE POLICY "Org members update emails" ON public.event_emails FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM events e JOIN org_members om ON om.org_id=e.org_id WHERE e.id=event_id AND om.user_id=auth.uid()));
CREATE POLICY "Org members delete emails" ON public.event_emails FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM events e JOIN org_members om ON om.org_id=e.org_id WHERE e.id=event_id AND om.user_id=auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_emails TO authenticated;

-- ── site_content ──────────────────────────────────────────────────────────────
CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL UNIQUE, content jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_content jsonb, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view site_content" ON public.site_content FOR SELECT TO anon, authenticated USING(true);
CREATE POLICY "Admin manage site_content" ON public.site_content FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
GRANT SELECT ON public.site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
CREATE TRIGGER update_site_content_updated_at BEFORE UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, actor_email text, action text NOT NULL,
  target_type text, target_id text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read logs" ON public.audit_logs FOR SELECT TO authenticated USING(has_role(auth.uid(),'admin'));

-- ── email_settings ────────────────────────────────────────────────────────────
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  domain_configured boolean NOT NULL DEFAULT false,
  send_ticket_emails boolean NOT NULL DEFAULT true, send_approval_emails boolean NOT NULL DEFAULT true,
  require_2fa_for_admins boolean NOT NULL DEFAULT false, notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage email_settings" ON public.email_settings FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
INSERT INTO public.email_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;

-- ── email_otp_codes ───────────────────────────────────────────────────────────
CREATE TABLE public.email_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, email text NOT NULL, code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own OTP" ON public.email_otp_codes FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

-- ── cities ────────────────────────────────────────────────────────────────────
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geoname_id int UNIQUE, name text NOT NULL, ascii_name text NOT NULL,
  region text, region_code text, country text NOT NULL, country_code text NOT NULL,
  population int NOT NULL DEFAULT 0, latitude double precision, longitude double precision,
  timezone text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cities_name_trgm_idx ON public.cities USING gin(lower(ascii_name) gin_trgm_ops);
CREATE INDEX cities_population_idx ON public.cities(population DESC);
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone read cities" ON public.cities FOR SELECT USING(true);

-- ── Webinar tables ────────────────────────────────────────────────────────────
-- (Helper functions needed first)
CREATE OR REPLACE FUNCTION public.is_event_approved_attendee(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM registrations r WHERE r.event_id=_event_id AND r.user_id=_user_id AND r.approval_status='approved');
$$;
CREATE OR REPLACE FUNCTION public.is_event_owner(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM events e WHERE e.id=_event_id AND(e.user_id=_user_id OR has_role(_user_id,'admin')));
$$;

CREATE TABLE public.webinar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  livekit_room text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','live','ended','error')),
  layout text NOT NULL DEFAULT 'grid', branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  record_enabled boolean NOT NULL DEFAULT false, recording_url text, egress_id text,
  lobby_open_at timestamptz, reactions_enabled boolean NOT NULL DEFAULT true,
  lounge_enabled boolean NOT NULL DEFAULT false,
  started_at timestamptz, ended_at timestamptz,
  viewer_peak int NOT NULL DEFAULT 0, viewer_total int NOT NULL DEFAULT 0,
  publisher_peak int NOT NULL DEFAULT 0, attendance_minutes int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_sessions TO authenticated;
CREATE POLICY "Owner manage ws" ON public.webinar_sessions FOR ALL TO authenticated USING(is_event_owner(auth.uid(),event_id)) WITH CHECK(is_event_owner(auth.uid(),event_id));
CREATE POLICY "Attendee read ws" ON public.webinar_sessions FOR SELECT TO authenticated USING(is_event_approved_attendee(auth.uid(),event_id));
CREATE TRIGGER trg_ws_updated BEFORE UPDATE ON public.webinar_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.webinar_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid, email text NOT NULL, display_name text NOT NULL,
  role text NOT NULL DEFAULT 'speaker' CHECK(role IN('host','cohost','speaker')),
  invite_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_speakers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_speakers TO authenticated;
CREATE POLICY "Owner manage wsp" ON public.webinar_speakers FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id))) WITH CHECK(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_stage_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,user_id));
ALTER TABLE public.webinar_stage_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_stage_requests TO authenticated;
CREATE POLICY "Attendee create req" ON public.webinar_stage_requests FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Attendee read own req" ON public.webinar_stage_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Owner manage req" ON public.webinar_stage_requests FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id))) WITH CHECK(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_qa (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, question text NOT NULL CHECK(length(question) BETWEEN 1 AND 1000), upvotes int NOT NULL DEFAULT 0, answered boolean NOT NULL DEFAULT false, pinned boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_qa ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_qa TO authenticated;
CREATE POLICY "Read qa" ON public.webinar_qa FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));
CREATE POLICY "Ask qa" ON public.webinar_qa FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_approved_attendee(auth.uid(),s.event_id)));
CREATE POLICY "Moderate qa" ON public.webinar_qa FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));
CREATE POLICY "Delete qa" ON public.webinar_qa FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_polls (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, question text NOT NULL, options jsonb NOT NULL, open boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_polls ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_polls TO authenticated;
CREATE POLICY "Read polls" ON public.webinar_polls FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));
CREATE POLICY "Manage polls" ON public.webinar_polls FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id))) WITH CHECK(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_poll_votes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poll_id uuid NOT NULL REFERENCES public.webinar_polls(id) ON DELETE CASCADE, user_id uuid NOT NULL, option_index int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(poll_id,user_id));
ALTER TABLE public.webinar_poll_votes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_poll_votes TO authenticated;
CREATE POLICY "Vote" ON public.webinar_poll_votes FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id=p.session_id WHERE p.id=poll_id AND p.open AND is_event_approved_attendee(auth.uid(),s.event_id)));
CREATE POLICY "Read votes" ON public.webinar_poll_votes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id=p.session_id WHERE p.id=poll_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));

CREATE TABLE public.webinar_chat (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, message text NOT NULL CHECK(length(message) BETWEEN 1 AND 500), deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_chat ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_chat TO authenticated;
CREATE POLICY "Read chat" ON public.webinar_chat FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));
CREATE POLICY "Post chat" ON public.webinar_chat FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_approved_attendee(auth.uid(),s.event_id)));
CREATE POLICY "Moderate chat" ON public.webinar_chat FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_reactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_reactions TO authenticated;
CREATE POLICY "Read reactions" ON public.webinar_reactions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));
CREATE POLICY "Post reactions" ON public.webinar_reactions FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));

CREATE TABLE public.webinar_announcements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_announcements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_announcements TO authenticated;
CREATE POLICY "Read announce" ON public.webinar_announcements FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND(is_event_approved_attendee(auth.uid(),s.event_id) OR is_event_owner(auth.uid(),s.event_id))));
CREATE POLICY "Manage announce" ON public.webinar_announcements FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id))) WITH CHECK(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_lounge_tables (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE, name text NOT NULL, capacity int NOT NULL DEFAULT 6, livekit_subroom text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.webinar_lounge_tables ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_lounge_tables TO authenticated;

CREATE TABLE public.webinar_attendance (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, user_id uuid, identity text NOT NULL, display_name text, role text NOT NULL DEFAULT 'viewer', joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz, duration_seconds int);
ALTER TABLE public.webinar_attendance ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_attendance TO authenticated;
CREATE POLICY "Owner read attendance" ON public.webinar_attendance FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM webinar_sessions s WHERE s.id=session_id AND is_event_owner(auth.uid(),s.event_id)));

CREATE TABLE public.webinar_browser_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL, browser_session_id text NOT NULL, fingerprint text, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), UNIQUE(registration_id,browser_session_id));
ALTER TABLE public.webinar_browser_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_browser_sessions TO authenticated;

-- ── Speaker & Sponsor application tables ──────────────────────────────────────
CREATE TABLE public.speaker_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Personal info
  full_name text NOT NULL,
  email text NOT NULL,
  mobile_country_code text,
  mobile_number text,
  linkedin_url text,
  portfolio_url text,
  -- Professional info
  job_title text,
  company text,
  years_experience int,
  industry text,
  -- Speaker profile
  bio text,
  expertise text,
  topics text,
  past_experience text,
  -- Session proposal
  session_title text NOT NULL,
  session_description text NOT NULL,
  key_takeaways text,
  target_audience text,
  session_category text,
  session_duration_minutes int,
  -- Optional links
  past_videos_url text,
  resume_url text,
  notes text,
  -- Status workflow
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);
CREATE INDEX idx_speaker_apps_event ON public.speaker_applications(event_id, status);
CREATE INDEX idx_speaker_apps_user ON public.speaker_applications(user_id);
ALTER TABLE public.speaker_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Applicant view own speaker apps" ON public.speaker_applications FOR SELECT TO authenticated USING(user_id = auth.uid());
CREATE POLICY "Applicant create speaker apps" ON public.speaker_applications FOR INSERT TO authenticated WITH CHECK(user_id = auth.uid());
CREATE POLICY "Organizer view speaker apps" ON public.speaker_applications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Organizer update speaker apps" ON public.speaker_applications FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_applications TO authenticated;
CREATE TRIGGER trg_speaker_apps_updated BEFORE UPDATE ON public.speaker_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sponsor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Company info
  company_name text NOT NULL,
  company_website text,
  industry text,
  company_description text,
  logo_url text,
  -- Contact person
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_mobile_country_code text,
  contact_mobile_number text,
  contact_designation text,
  -- Sponsorship info
  sponsorship_tier text,
  budget_range text,
  objectives text,
  expected_outcomes text,
  -- Marketing assets (URLs only — no file upload in v1)
  brochure_url text,
  deck_url text,
  promotional_url text,
  -- Notes + status
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);
CREATE INDEX idx_sponsor_apps_event ON public.sponsor_applications(event_id, status);
CREATE INDEX idx_sponsor_apps_user ON public.sponsor_applications(user_id);
ALTER TABLE public.sponsor_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Applicant view own sponsor apps" ON public.sponsor_applications FOR SELECT TO authenticated USING(user_id = auth.uid());
CREATE POLICY "Applicant create sponsor apps" ON public.sponsor_applications FOR INSERT TO authenticated WITH CHECK(user_id = auth.uid());
CREATE POLICY "Organizer view sponsor apps" ON public.sponsor_applications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));
CREATE POLICY "Organizer update sponsor apps" ON public.sponsor_applications FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM events e WHERE e.id = event_id AND (e.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_applications TO authenticated;
CREATE TRIGGER trg_sponsor_apps_updated BEFORE UPDATE ON public.sponsor_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notifications: lightweight in-app notifications for application status updates
CREATE TABLE public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_notifs_user ON public.app_notifications(user_id, created_at DESC);
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User view own notifs" ON public.app_notifications FOR SELECT TO authenticated USING(user_id = auth.uid());
CREATE POLICY "User update own notifs" ON public.app_notifications FOR UPDATE TO authenticated USING(user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_notifications TO authenticated;

-- ── Storage buckets ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets(id,name,public) VALUES('site-assets','site-assets',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public) VALUES('webinar-recordings','webinar-recordings',false) ON CONFLICT(id) DO NOTHING;

CREATE POLICY "Public read site-assets" ON storage.objects FOR SELECT USING(bucket_id='site-assets');
CREATE POLICY "Admin upload site-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='site-assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin update site-assets" ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='site-assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin delete site-assets" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='site-assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Avatars readable" ON storage.objects FOR SELECT USING(bucket_id='avatars');
CREATE POLICY "Users upload avatar" ON storage.objects FOR INSERT WITH CHECK(bucket_id='avatars' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users update avatar" ON storage.objects FOR UPDATE USING(bucket_id='avatars' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users delete avatar" ON storage.objects FOR DELETE USING(bucket_id='avatars' AND auth.uid()::text=(storage.foldername(name))[1]);

-- ── Domain validation trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_organization_domains()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN NEW.slug := lower(NEW.slug); IF NEW.slug !~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$' THEN RAISE EXCEPTION 'Invalid slug'; END IF; END IF;
  IF NEW.subdomain IS NOT NULL THEN NEW.subdomain := lower(NEW.subdomain); IF NEW.subdomain !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' THEN RAISE EXCEPTION 'Invalid subdomain'; END IF; END IF;
  IF NEW.custom_domain IS NOT NULL THEN NEW.custom_domain := lower(NEW.custom_domain); IF NEW.custom_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Invalid custom domain'; END IF; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_validate_domains BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.validate_organization_domains();

-- ── Person title validation ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._validate_person_title()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.title IS NOT NULL AND NEW.title NOT IN('Mr','Ms','Mrs','Prefer not to say') THEN RAISE EXCEPTION 'Invalid title: %', NEW.title; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER validate_title_registrations BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();
CREATE TRIGGER validate_title_speakers BEFORE INSERT OR UPDATE ON public.speakers FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();
CREATE TRIGGER validate_title_sponsor_members BEFORE INSERT OR UPDATE ON public.sponsor_members FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();

-- ────────────────────────────────────────────────────────────
-- 002_functions.sql
-- ────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 2/3: All RPC functions (run AFTER 001_tables.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Internal audit helper ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._record_audit(_action text, _target_type text, _target_id text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text;
BEGIN SELECT email INTO _email FROM auth.users WHERE id=auth.uid();
  INSERT INTO audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES(auth.uid(),_email,_action,_target_type,_target_id,COALESCE(_details,'{}'));
END; $$;

-- ── handle_new_user (signup trigger) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m jsonb:=COALESCE(NEW.raw_user_meta_data,'{}'); _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text; _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
BEGIN
  _at:=COALESCE(_m->>'account_type','attendee'); IF _at NOT IN('attendee','organizer') THEN _at:='attendee'; END IF;
  _t:=NULLIF(trim(_m->>'title'),''); _fn:=NULLIF(trim(_m->>'first_name'),''); _ln:=NULLIF(trim(_m->>'last_name'),'');
  _d:=NULLIF(trim(_m->>'designation'),''); _co:=NULLIF(trim(_m->>'company'),'');
  _mc:=NULLIF(trim(_m->>'mobile_country_code'),''); _mn:=NULLIF(trim(_m->>'mobile_number'),'');
  _li:=NULLIF(trim(_m->>'linkedin_url'),''); _cw:=NULLIF(trim(_m->>'company_website'),'');
  _ce:=NULLIF(trim(_m->>'company_employee_count'),''); _ind:=NULLIF(trim(_m->>'industry'),'');
  _dn:=NULLIF(trim(COALESCE(_fn,'')||' '||COALESCE(_ln,'')),''); IF _dn IS NULL THEN _dn:=COALESCE(_m->>'display_name',NEW.email); END IF;
  _done:=_fn IS NOT NULL AND _ln IS NOT NULL AND _d IS NOT NULL AND _co IS NOT NULL AND _mn IS NOT NULL;
  INSERT INTO profiles(user_id,display_name,account_type,title,first_name,last_name,designation,company,mobile_country_code,mobile_number,linkedin_url,company_website,company_employee_count,industry,profile_completed)
  VALUES(NEW.id,_dn,_at,_t,_fn,_ln,_d,_co,_mc,_mn,_li,_cw,_ce,_ind,_done);
  -- Auto-confirm email for organizer-created participant accounts so they can sign in immediately
  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── get_my_profile ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile() RETURNS public.profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT * FROM profiles WHERE user_id=auth.uid() LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ── Slug system ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.slugify(_input text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(_input,'')), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g')); $$;

CREATE OR REPLACE FUNCTION public.generate_event_slug(_title text, _org_id uuid, _event_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _b text; _c text; _i int:=0;
BEGIN _b:=substring(slugify(_title) from 1 for 60); IF _b IS NULL OR _b='' THEN _b:='event'; END IF; _c:=_b;
  LOOP EXIT WHEN NOT EXISTS(SELECT 1 FROM events WHERE slug=_c AND org_id IS NOT DISTINCT FROM _org_id AND(_event_id IS NULL OR id<>_event_id)); _i:=_i+1; _c:=_b||'-'||_i; END LOOP;
  RETURN _c;
END; $$;

CREATE OR REPLACE FUNCTION public.events_set_slug() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _c text;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug))>0 THEN _c:=slugify(NEW.slug); IF _c='' THEN _c:=slugify(NEW.title); END IF; ELSE _c:=slugify(NEW.title); END IF;
  IF _c IS NULL OR _c='' THEN _c:='event'; END IF;
  IF EXISTS(SELECT 1 FROM events WHERE slug=_c AND org_id IS NOT DISTINCT FROM NEW.org_id AND id<>NEW.id) THEN _c:=generate_event_slug(_c,NEW.org_id,NEW.id); END IF;
  NEW.slug:=_c; RETURN NEW;
END; $$;
CREATE TRIGGER trg_events_set_slug BEFORE INSERT OR UPDATE OF slug,title,org_id ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_set_slug();

-- ── Registrations validate ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrations_validate() RETURNS trigger LANGUAGE plpgsql SET search_path = 'public','extensions' AS $$
DECLARE _ra boolean; _p numeric;
BEGIN SELECT requires_approval,COALESCE(price,0) INTO _ra,_p FROM events WHERE id=NEW.event_id;
  IF _p>0 THEN NEW.approval_status:='approved'; ELSIF _ra AND TG_OP='INSERT' THEN NEW.approval_status:='pending'; END IF;
  IF NEW.approval_status NOT IN('pending','approved','waitlisted','declined') THEN RAISE EXCEPTION 'Invalid approval_status'; END IF;
  IF NEW.qr_code IS NULL THEN NEW.qr_code:=substring(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') from 1 for 24); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER registrations_validate_trg BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.registrations_validate();

-- ── Attendance system ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_tracking_closed(_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT now()>(COALESCE(e.end_date,e.date)+interval '2 hours') FROM events e WHERE e.id=_event_id; $$;

CREATE OR REPLACE FUNCTION public._attendance_recompute(_reg_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text; _li timestamptz; _lo timestamptz; _min int; _fi timestamptz;
BEGIN
  SELECT MAX(occurred_at) FILTER(WHERE kind='in') INTO _li FROM attendance_events WHERE registration_id=_reg_id;
  SELECT MAX(occurred_at) FILTER(WHERE kind IN('out','auto_out')) INTO _lo FROM attendance_events WHERE registration_id=_reg_id;
  SELECT MIN(occurred_at) FILTER(WHERE kind='in') INTO _fi FROM attendance_events WHERE registration_id=_reg_id;
  IF _li IS NULL THEN _st:='never'; ELSIF _lo IS NULL OR _li>_lo THEN _st:='inside'; ELSE _st:='outside'; END IF;
  WITH o AS(SELECT occurred_at,kind,ROW_NUMBER() OVER(ORDER BY occurred_at) rn FROM attendance_events WHERE registration_id=_reg_id),
  p AS(SELECT a.occurred_at in_at,(SELECT MIN(b.occurred_at) FROM o b WHERE b.rn>a.rn AND b.kind IN('out','auto_out')) out_at FROM o a WHERE a.kind='in')
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM(out_at-in_at))/60)::int,0) INTO _min FROM p WHERE out_at IS NOT NULL;
  UPDATE registrations SET attendance_state=_st,last_in_at=_li,last_out_at=_lo,total_minutes=COALESCE(_min,0),checked_in=(_st<>'never'),checked_in_at=CASE WHEN _fi IS NULL THEN NULL ELSE _fi END,updated_at=now() WHERE id=_reg_id;
END; $$;

CREATE OR REPLACE FUNCTION public._attendance_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM _attendance_recompute(NEW.registration_id); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public._attendance_after_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM _attendance_recompute(OLD.registration_id); RETURN OLD; END; $$;
CREATE TRIGGER attendance_events_after_insert AFTER INSERT ON public.attendance_events FOR EACH ROW EXECUTE FUNCTION public._attendance_after_insert();
CREATE TRIGGER attendance_events_after_delete AFTER DELETE ON public.attendance_events FOR EACH ROW EXECUTE FUNCTION public._attendance_after_delete();

CREATE OR REPLACE FUNCTION public.toggle_attendance(p_reg_id uuid, p_method text DEFAULT 'manual')
RETURNS TABLE(state text, event_id uuid, occurred_at timestamptz, total_minutes int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r registrations%ROWTYPE; _k text; _ts timestamptz:=now(); _d date;
BEGIN SELECT * INTO r FROM registrations WHERE id=p_reg_id; IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT(has_role(auth.uid(),'admin') OR is_event_owner(auth.uid(),r.event_id) OR r.user_id=auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF event_tracking_closed(r.event_id) THEN RETURN QUERY SELECT 'tracking_closed'::text,r.event_id,_ts,r.total_minutes; RETURN; END IF;
  _k:=CASE WHEN r.attendance_state='inside' THEN 'out' ELSE 'in' END;
  _d:=(_ts AT TIME ZONE COALESCE((SELECT timezone FROM events WHERE id=r.event_id),'UTC'))::date;
  INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,actor_id,occurred_at) VALUES(r.id,r.event_id,_d,_k,COALESCE(p_method,'manual'),auth.uid(),_ts);
  SELECT * INTO r FROM registrations WHERE id=p_reg_id;
  RETURN QUERY SELECT r.attendance_state,r.event_id,_ts,r.total_minutes;
END; $$;

CREATE OR REPLACE FUNCTION public.bulk_set_attendance(p_ids uuid[], p_target text, p_method text DEFAULT 'bulk')
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _c int:=0; r registrations%ROWTYPE; _k text; _d date; _ts timestamptz:=now();
BEGIN IF p_target NOT IN('inside','outside') THEN RAISE EXCEPTION 'Invalid'; END IF;
  FOREACH _id IN ARRAY p_ids LOOP
    SELECT * INTO r FROM registrations WHERE id=_id; CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN NOT(has_role(auth.uid(),'admin') OR is_event_owner(auth.uid(),r.event_id));
    CONTINUE WHEN event_tracking_closed(r.event_id); CONTINUE WHEN r.attendance_state=p_target;
    _k:=CASE WHEN p_target='inside' THEN 'in' ELSE 'out' END;
    _d:=(_ts AT TIME ZONE COALESCE((SELECT timezone FROM events WHERE id=r.event_id),'UTC'))::date;
    INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,actor_id,occurred_at) VALUES(r.id,r.event_id,_d,_k,COALESCE(p_method,'bulk'),auth.uid(),_ts);
    _c:=_c+1;
  END LOOP; RETURN _c;
END; $$;

CREATE OR REPLACE FUNCTION public.undo_attendance(p_reg_id uuid, p_kind text)
RETURNS TABLE(deleted boolean, state text, total_minutes int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r registrations%ROWTYPE; _tid uuid; _to timestamptz; _lc boolean:=false;
BEGIN IF p_kind NOT IN('in','out') THEN RAISE EXCEPTION 'Invalid'; END IF;
  SELECT * INTO r FROM registrations WHERE id=p_reg_id; IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT(has_role(auth.uid(),'admin') OR is_event_owner(auth.uid(),r.event_id) OR r.user_id=auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_kind='in' THEN SELECT id,occurred_at INTO _tid,_to FROM attendance_events WHERE registration_id=p_reg_id AND kind='in' ORDER BY occurred_at DESC LIMIT 1;
  ELSE SELECT id,occurred_at INTO _tid,_to FROM attendance_events WHERE registration_id=p_reg_id AND kind IN('out','auto_out') ORDER BY occurred_at DESC LIMIT 1; END IF;
  IF _tid IS NOT NULL THEN DELETE FROM attendance_events WHERE id=_tid;
  ELSE
    IF p_kind='in' AND r.attendance_state IN('inside','outside') THEN UPDATE registrations SET attendance_state='never',checked_in=false,checked_in_at=NULL,last_in_at=NULL,last_out_at=NULL,total_minutes=0,updated_at=now() WHERE id=p_reg_id; _lc:=true;
    ELSIF p_kind='out' AND r.attendance_state='outside' THEN
      IF r.last_in_at IS NOT NULL THEN UPDATE registrations SET attendance_state='inside',checked_in=true,last_out_at=NULL,updated_at=now() WHERE id=p_reg_id;
      ELSE UPDATE registrations SET attendance_state='never',checked_in=false,last_out_at=NULL,updated_at=now() WHERE id=p_reg_id; END IF; _lc:=true;
    END IF;
    IF NOT _lc THEN RETURN QUERY SELECT false,r.attendance_state,r.total_minutes; RETURN; END IF;
  END IF;
  SELECT * INTO r FROM registrations WHERE id=p_reg_id;
  RETURN QUERY SELECT true,r.attendance_state,r.total_minutes;
END; $$;
GRANT EXECUTE ON FUNCTION public.undo_attendance(uuid,text) TO authenticated;

-- ── self_check_in ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r registrations%ROWTYPE; ev events%ROWTYPE; _wi boolean; _ee timestamptz; _k text; _ref uuid; _n text; _e text; _co text; _tt text; _ts timestamptz:=now(); _d date; _rid uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token))=0 THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN RETURN QUERY SELECT 'wrong_event'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    _k:=split_part(p_token,':',1); BEGIN _ref:=split_part(p_token,':',2)::uuid; EXCEPTION WHEN others THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END;
    IF _k='speaker' THEN SELECT sp.name,sp.email,sp.company,'speaker' INTO _n,_e,_co,_tt FROM speakers sp JOIN event_speakers es ON es.speaker_id=sp.id AND es.event_id=p_event_id WHERE sp.id=_ref;
    ELSE SELECT sm.display_name,sm.email,sp.name,'sponsor' INTO _n,_e,_co,_tt FROM sponsor_members sm JOIN sponsors sp ON sp.id=sm.sponsor_id JOIN event_sponsors es ON es.sponsor_id=sp.id AND es.event_id=p_event_id WHERE sm.id=_ref; END IF;
    IF _n IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,p_event_id,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    SELECT reg.* INTO r FROM registrations reg WHERE reg.event_id=p_event_id AND reg.ticket_type=_tt AND lower(reg.email)=lower(COALESCE(_e,'')) LIMIT 1;
    IF NOT FOUND THEN INSERT INTO registrations(event_id,name,email,company,ticket_type,status,approval_status) VALUES(p_event_id,_n,COALESCE(_e,_n||'@no-email.local'),_co,_tt,'confirmed','approved') RETURNING * INTO r; END IF;
  ELSE SELECT reg.* INTO r FROM registrations reg WHERE reg.qr_code=p_token OR reg.join_token=p_token OR reg.id::text=p_token LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  END IF;
  IF p_event_id IS NOT NULL AND r.event_id<>p_event_id THEN RETURN QUERY SELECT 'wrong_event'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  SELECT e.* INTO ev FROM events e WHERE e.id=r.event_id;
  IF FOUND THEN _ee:=COALESCE(ev.end_date,ev.date); IF _ee IS NOT NULL AND now()>_ee+interval '2 hours' THEN RETURN QUERY SELECT 'expired'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF; END IF;
  IF r.status='cancelled' THEN RETURN QUERY SELECT 'cancelled'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  _wi:=(r.attendance_state='inside'); _d:=(_ts AT TIME ZONE COALESCE(ev.timezone,'UTC'))::date; _rid:=r.id;
  IF _wi THEN INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,occurred_at) VALUES(_rid,r.event_id,_d,'out','self',_ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id=_rid; RETURN QUERY SELECT 'checked_out'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_out_at;
  ELSE INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,occurred_at) VALUES(_rid,r.event_id,_d,'in','self',_ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id=_rid; RETURN QUERY SELECT 'ok'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_in_at;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.self_check_in(text,uuid) TO anon,authenticated;

-- ── Admin RPCs ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_orgs() RETURNS TABLE(id uuid,name text,slug text,owner_id uuid,plan text,billing_email text,subdomain text,custom_domain text,created_at timestamptz,member_count bigint,event_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT o.id,o.name,o.slug,o.owner_id,o.plan,o.billing_email,o.subdomain,o.custom_domain,o.created_at,(SELECT count(*) FROM org_members WHERE org_id=o.id),(SELECT count(*) FROM events WHERE org_id=o.id) FROM organizations o WHERE has_role(auth.uid(),'admin') ORDER BY o.created_at DESC; $$;
CREATE OR REPLACE FUNCTION public.admin_list_users() RETURNS TABLE(user_id uuid,display_name text,avatar_url text,onboarding_completed boolean,created_at timestamptz,org_name text,org_plan text,is_platform_admin boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT p.user_id,p.display_name,p.avatar_url,p.onboarding_completed,p.created_at,o.name,o.plan,EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=p.user_id AND ur.role='admin') FROM profiles p LEFT JOIN org_members om ON om.user_id=p.user_id LEFT JOIN organizations o ON o.id=om.org_id WHERE has_role(auth.uid(),'admin') ORDER BY p.created_at DESC; $$;
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_uid uuid,_role app_role,_grant boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; IF NOT _grant AND _role='admin' THEN IF(SELECT count(*) FROM user_roles WHERE role='admin')<=1 AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=_uid AND role='admin') THEN RAISE EXCEPTION 'Last admin'; END IF; END IF; IF _grant THEN INSERT INTO user_roles(user_id,role) VALUES(_uid,_role) ON CONFLICT DO NOTHING; ELSE DELETE FROM user_roles WHERE user_id=_uid AND role=_role; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.admin_delete_org(_oid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; DELETE FROM subscriptions WHERE org_id=_oid; DELETE FROM org_members WHERE org_id=_oid; DELETE FROM events WHERE org_id=_oid; DELETE FROM organizations WHERE id=_oid; END; $$;
CREATE OR REPLACE FUNCTION public.admin_update_org_plan(_oid uuid,_plan text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE organizations SET plan=_plan,updated_at=now() WHERE id=_oid; UPDATE subscriptions SET plan=_plan,updated_at=now() WHERE org_id=_oid; END; $$;
CREATE OR REPLACE FUNCTION public.admin_update_org(_oid uuid,_name text DEFAULT NULL,_subdomain text DEFAULT NULL,_billing_email text DEFAULT NULL,_plan text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE organizations SET name=COALESCE(_name,name),subdomain=COALESCE(_subdomain,subdomain),billing_email=COALESCE(_billing_email,billing_email),plan=COALESCE(_plan,plan),updated_at=now() WHERE id=_oid; IF _plan IS NOT NULL THEN UPDATE subscriptions SET plan=_plan,updated_at=now() WHERE org_id=_oid; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(_limit int DEFAULT 200) RETURNS TABLE(id uuid,actor_id uuid,actor_email text,action text,target_type text,target_id text,details jsonb,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id,actor_id,actor_email,action,target_type,target_id,details,created_at FROM audit_logs WHERE has_role(auth.uid(),'admin') ORDER BY created_at DESC LIMIT COALESCE(_limit,200); $$;

-- ── Site content helpers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_site_draft(_s text,_c jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; INSERT INTO site_content(section,content,draft_content) VALUES(_s,'{}',_c) ON CONFLICT(section) DO UPDATE SET draft_content=EXCLUDED.draft_content,updated_at=now(); END; $$;
CREATE OR REPLACE FUNCTION public.publish_site_section(_s text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE _d jsonb; BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; SELECT draft_content INTO _d FROM site_content WHERE section=_s; IF _d IS NULL THEN RAISE EXCEPTION 'No draft'; END IF; UPDATE site_content SET content=_d,draft_content=NULL,published_at=now(),updated_at=now() WHERE section=_s; END; $$;
CREATE OR REPLACE FUNCTION public.discard_site_draft(_s text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE site_content SET draft_content=NULL,updated_at=now() WHERE section=_s; END; $$;

-- ── Public lookup functions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_event_by_slug(_slug text,_org_slug text DEFAULT NULL) RETURNS TABLE(id uuid,slug text,org_id uuid,status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT e.id,e.slug,e.org_id,e.status FROM events e LEFT JOIN organizations o ON o.id=e.org_id WHERE e.slug=lower(_slug) AND(_org_slug IS NULL OR o.slug=_org_slug OR o.subdomain=_org_slug) ORDER BY(e.status='published') DESC LIMIT 1; $$;
CREATE OR REPLACE FUNCTION public.get_event_attendees_public(_eid uuid,_limit int DEFAULT 12) RETURNS TABLE(going_count bigint,attendees jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ WITH ap AS(SELECT r.user_id,r.name,r.created_at FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.event_id=_eid AND r.approval_status='approved' AND e.status='published'), sa AS(SELECT a.user_id,a.name,a.created_at,p.display_name,p.avatar_url FROM ap a LEFT JOIN profiles p ON p.user_id=a.user_id ORDER BY a.created_at LIMIT _limit) SELECT(SELECT count(*) FROM ap),COALESCE((SELECT jsonb_agg(jsonb_build_object('name',COALESCE(s.display_name,s.name),'avatar_url',s.avatar_url)) FROM sa s),'[]'); $$;
GRANT EXECUTE ON FUNCTION public.get_event_attendees_public(uuid,int) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_public_org_by_slug(_slug text) RETURNS TABLE(id uuid,name text,slug text,subdomain text,custom_domain text,logo_url text,landing_config jsonb,landing_published boolean,plan text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT o.id,o.name,o.slug,o.subdomain,o.custom_domain,o.logo_url,o.landing_config,o.landing_published,o.plan FROM organizations o WHERE o.landing_published=true AND(o.slug=_slug OR o.subdomain=lower(_slug)) LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION public.get_public_org_by_slug(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_public_org_brief(_oid uuid) RETURNS TABLE(id uuid,name text,slug text,subdomain text,logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT o.id,o.name,o.slug,o.subdomain,o.logo_url FROM organizations o WHERE o.id=_oid AND o.landing_published=true LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION public.get_public_org_brief(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.search_cities(_q text,_limit int DEFAULT 10) RETURNS TABLE(id uuid,name text,region text,country text,country_code text,label text,population int) LANGUAGE sql STABLE SET search_path = public AS $$ SELECT c.id,c.name,c.region,c.country,c.country_code,(c.name||COALESCE(', '||NULLIF(c.region,''),'')||', '||c.country),c.population FROM cities c WHERE _q IS NOT NULL AND length(trim(_q))>=1 AND lower(c.ascii_name) LIKE lower(trim(_q))||'%' ORDER BY c.population DESC LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),50); $$;
GRANT EXECUTE ON FUNCTION public.search_cities(text,int) TO anon,authenticated;

-- ── Sponsor portal ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_sponsor_member(_uid uuid,_sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM sponsor_members WHERE sponsor_id=_sid AND user_id=_uid AND accepted_at IS NOT NULL); $$;
CREATE OR REPLACE FUNCTION public.sponsor_portal_events() RETURNS TABLE(event_id uuid,event_title text,event_date timestamptz,end_date timestamptz,location text,sponsor_id uuid,sponsor_name text,tier text,registrations_count bigint,checked_in_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT e.id,e.title,e.date,e.end_date,e.location,s.id,s.name,COALESCE(es.tier_override,s.tier),(SELECT count(*) FROM registrations r WHERE r.event_id=e.id AND r.approval_status='approved'),(SELECT count(*) FROM registrations r WHERE r.event_id=e.id AND r.checked_in=true) FROM sponsor_members sm JOIN sponsors s ON s.id=sm.sponsor_id JOIN event_sponsors es ON es.sponsor_id=s.id JOIN events e ON e.id=es.event_id WHERE sm.user_id=auth.uid() AND sm.accepted_at IS NOT NULL ORDER BY e.date DESC; $$;
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_eid uuid) RETURNS TABLE(kind text,id uuid,name text,company text,ticket_type text,checked_in boolean,checked_in_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ WITH al AS(SELECT 1 FROM sponsor_members sm JOIN event_sponsors es ON es.sponsor_id=sm.sponsor_id WHERE sm.user_id=auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id=_eid LIMIT 1) SELECT 'speaker',sp.id,sp.name,sp.company,'speaker',COALESCE(r.checked_in,false),r.checked_in_at FROM event_speakers esp JOIN speakers sp ON sp.id=esp.speaker_id LEFT JOIN registrations r ON r.event_id=_eid AND r.ticket_type='speaker' AND lower(r.email)=lower(COALESCE(sp.email,'')) WHERE esp.event_id=_eid AND EXISTS(SELECT 1 FROM al) UNION ALL SELECT 'attendee',r.id,r.name,r.company,r.ticket_type,r.checked_in,r.checked_in_at FROM registrations r WHERE r.event_id=_eid AND r.approval_status='approved' AND r.ticket_type<>'speaker' AND EXISTS(SELECT 1 FROM al); $$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── Speaker portal RPCs ───────────────────────────────────────────────────────
-- Match speakers by email (speakers.email = auth.users.email of current user)
CREATE OR REPLACE FUNCTION public.speaker_portal_events()
RETURNS TABLE(event_id uuid, event_slug text, event_title text, event_description text, event_date timestamptz, end_date timestamptz, location text, venue text, image_url text, status text, organizer_name text, speaker_id uuid, speaker_name text, speaker_photo_url text, speaker_company text, session_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT
    e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue, e.image_url, e.status,
    o.name,
    sp.id, sp.name, sp.photo_url, sp.company,
    (SELECT count(*) FROM sessions s WHERE s.event_id = e.id AND s.speaker_id = sp.id)
  FROM speakers sp
  JOIN event_speakers es ON es.speaker_id = sp.id
  JOIN events e ON e.id = es.event_id
  LEFT JOIN organizations o ON o.id = e.org_id
  WHERE lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ORDER BY e.date DESC;
$$;

CREATE OR REPLACE FUNCTION public.speaker_portal_event_details(_eid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _result jsonb;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN NULL; END IF;

  -- Verify the user is a speaker for this event
  IF NOT EXISTS (
    SELECT 1 FROM speakers sp
    JOIN event_speakers es ON es.speaker_id = sp.id
    WHERE es.event_id = _eid AND lower(sp.email) = lower(_email)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'event', (SELECT to_jsonb(e) FROM (
      SELECT e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue,
             e.image_url, e.banner_landscape_url, e.status, e.timezone, e.event_format,
             o.name as organizer_name, o.slug as organizer_slug, o.logo_url as organizer_logo
      FROM events e LEFT JOIN organizations o ON o.id = e.org_id WHERE e.id = _eid
    ) e),
    'speaker', (SELECT to_jsonb(s) FROM (
      SELECT sp.id, sp.name, sp.email, sp.bio, sp.photo_url, sp.company, sp.designation,
             sp.linkedin_url, sp.company_website, sp.title, sp.first_name, sp.last_name
      FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE es.event_id = _eid AND lower(sp.email) = lower(_email)
      LIMIT 1
    ) s),
    'sessions', COALESCE((SELECT jsonb_agg(to_jsonb(ss) ORDER BY ss.start_time) FROM (
      SELECT s.id, s.title, s.description, s.session_type, s.start_time, s.end_time, s.location
      FROM sessions s
      WHERE s.event_id = _eid
        AND s.speaker_id IN (SELECT sp.id FROM speakers sp WHERE lower(sp.email) = lower(_email))
    ) ss), '[]'::jsonb),
    'analytics', (SELECT jsonb_build_object(
      'total_registrations', (SELECT count(*) FROM registrations r WHERE r.event_id = _eid AND r.approval_status = 'approved'),
      'checked_in_count', (SELECT count(*) FROM registrations r WHERE r.event_id = _eid AND r.checked_in = true)
    ))
  ) INTO _result;

  RETURN _result;
END;
$$;

-- Returns the role assignments for the current user (used to populate dropdown menu)
CREATE OR REPLACE FUNCTION public.user_role_assignments()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'has_speaker', EXISTS(
      SELECT 1 FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    ),
    'has_sponsor', EXISTS(
      SELECT 1 FROM sponsor_members sm
      WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.speaker_portal_event_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_assignments() TO authenticated;

-- ── Application workflow RPCs ─────────────────────────────────────────────────
-- Approve a speaker application: creates speakers row, links to event_speakers, notifies applicant
CREATE OR REPLACE FUNCTION public.approve_speaker_application(_app_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _app speaker_applications%ROWTYPE;
  _is_owner boolean;
  _speaker_id uuid;
  _event_title text;
BEGIN
  SELECT * INTO _app FROM speaker_applications WHERE id = _app_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  -- Authorization: only event owner or admin can approve
  SELECT EXISTS(SELECT 1 FROM events WHERE id = _app.event_id AND (user_id = auth.uid() OR has_role(auth.uid(),'admin'))) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Find or create speaker row (for the organizer's `user_id` so RLS lets them manage it)
  SELECT id INTO _speaker_id FROM speakers
    WHERE lower(email) = lower(_app.email) AND user_id IN (SELECT user_id FROM events WHERE id = _app.event_id)
    LIMIT 1;

  IF _speaker_id IS NULL THEN
    INSERT INTO speakers(user_id, name, email, bio, company, designation, linkedin_url, mobile_country_code, mobile_number)
    VALUES(
      (SELECT user_id FROM events WHERE id = _app.event_id),
      _app.full_name, _app.email, _app.bio, _app.company, _app.job_title, _app.linkedin_url,
      _app.mobile_country_code, _app.mobile_number
    )
    RETURNING id INTO _speaker_id;
  END IF;

  -- Link to event (idempotent via UNIQUE constraint)
  INSERT INTO event_speakers(event_id, speaker_id) VALUES(_app.event_id, _speaker_id)
    ON CONFLICT(event_id, speaker_id) DO NOTHING;

  -- Update application status
  UPDATE speaker_applications SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _app_id;

  -- Notification
  SELECT title INTO _event_title FROM events WHERE id = _app.event_id;
  INSERT INTO app_notifications(user_id, type, title, body, link)
  VALUES(_app.user_id, 'speaker_approved',
         'Speaker application approved',
         'You have been approved as a speaker for ' || COALESCE(_event_title, 'an event') || '.',
         '/speaker');

  RETURN _speaker_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_speaker_application(_app_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app speaker_applications%ROWTYPE; _is_owner boolean; _event_title text;
BEGIN
  SELECT * INTO _app FROM speaker_applications WHERE id = _app_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM events WHERE id = _app.event_id AND (user_id = auth.uid() OR has_role(auth.uid(),'admin'))) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE speaker_applications
    SET status = 'rejected', rejection_reason = _reason, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _app_id;

  SELECT title INTO _event_title FROM events WHERE id = _app.event_id;
  INSERT INTO app_notifications(user_id, type, title, body, link)
  VALUES(_app.user_id, 'speaker_rejected',
         'Speaker application not approved',
         'Your speaker application for ' || COALESCE(_event_title, 'the event') || ' was not approved.' ||
         CASE WHEN _reason IS NOT NULL THEN ' Reason: ' || _reason ELSE '' END,
         '/u/me/applications');
END;
$$;

-- Approve sponsor application: creates sponsor row + event_sponsors link + sponsor_members invite
CREATE OR REPLACE FUNCTION public.approve_sponsor_application(_app_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _app sponsor_applications%ROWTYPE;
  _is_owner boolean;
  _sponsor_id uuid;
  _event_title text;
BEGIN
  SELECT * INTO _app FROM sponsor_applications WHERE id = _app_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM events WHERE id = _app.event_id AND (user_id = auth.uid() OR has_role(auth.uid(),'admin'))) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Create sponsor record (owned by the event organizer)
  INSERT INTO sponsors(user_id, name, email, logo_url, website, tier, description)
  VALUES(
    (SELECT user_id FROM events WHERE id = _app.event_id),
    _app.company_name, _app.contact_email, _app.logo_url, _app.company_website,
    COALESCE(_app.sponsorship_tier, 'bronze'), _app.company_description
  ) RETURNING id INTO _sponsor_id;

  -- Link to event
  INSERT INTO event_sponsors(event_id, sponsor_id) VALUES(_app.event_id, _sponsor_id)
    ON CONFLICT(event_id, sponsor_id) DO NOTHING;

  -- Auto-accept the applicant as a sponsor member so they get portal access
  INSERT INTO sponsor_members(sponsor_id, user_id, email, display_name, role, accepted_at, designation, mobile_country_code, mobile_number)
  VALUES(_sponsor_id, _app.user_id, _app.contact_email, _app.contact_name, 'admin', now(),
         _app.contact_designation, _app.contact_mobile_country_code, _app.contact_mobile_number)
    ON CONFLICT(sponsor_id, email) DO UPDATE SET user_id = EXCLUDED.user_id, accepted_at = EXCLUDED.accepted_at;

  -- Update application status
  UPDATE sponsor_applications SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _app_id;

  -- Notification
  SELECT title INTO _event_title FROM events WHERE id = _app.event_id;
  INSERT INTO app_notifications(user_id, type, title, body, link)
  VALUES(_app.user_id, 'sponsor_approved',
         'Sponsor application approved',
         'Your company has been approved as a sponsor for ' || COALESCE(_event_title, 'an event') || '.',
         '/sponsor');

  RETURN _sponsor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_sponsor_application(_app_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app sponsor_applications%ROWTYPE; _is_owner boolean; _event_title text;
BEGIN
  SELECT * INTO _app FROM sponsor_applications WHERE id = _app_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM events WHERE id = _app.event_id AND (user_id = auth.uid() OR has_role(auth.uid(),'admin'))) INTO _is_owner;
  IF NOT _is_owner THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE sponsor_applications
    SET status = 'rejected', rejection_reason = _reason, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _app_id;

  SELECT title INTO _event_title FROM events WHERE id = _app.event_id;
  INSERT INTO app_notifications(user_id, type, title, body, link)
  VALUES(_app.user_id, 'sponsor_rejected',
         'Sponsor application not approved',
         'Your sponsor application for ' || COALESCE(_event_title, 'the event') || ' was not approved.' ||
         CASE WHEN _reason IS NOT NULL THEN ' Reason: ' || _reason ELSE '' END,
         '/u/me/applications');
END;
$$;

-- "My applications" — returns the current user's speaker + sponsor applications
CREATE OR REPLACE FUNCTION public.my_applications()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'speaker', COALESCE((SELECT jsonb_agg(to_jsonb(sa) ORDER BY sa.created_at DESC) FROM (
      SELECT sa.id, sa.event_id, sa.session_title, sa.expertise, sa.status, sa.rejection_reason,
             sa.created_at, sa.updated_at, e.title as event_title, e.date as event_date, e.image_url
      FROM speaker_applications sa
      JOIN events e ON e.id = sa.event_id
      WHERE sa.user_id = auth.uid()
    ) sa), '[]'::jsonb),
    'sponsor', COALESCE((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.created_at DESC) FROM (
      SELECT sp.id, sp.event_id, sp.company_name, sp.sponsorship_tier, sp.status, sp.rejection_reason,
             sp.created_at, sp.updated_at, e.title as event_title, e.date as event_date, e.image_url
      FROM sponsor_applications sp
      JOIN events e ON e.id = sp.event_id
      WHERE sp.user_id = auth.uid()
    ) sp), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.approve_speaker_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_speaker_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sponsor_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sponsor_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_applications() TO authenticated;

-- ── Webinar helpers ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_join_session(_jt text,_sid text) RETURNS TABLE(registration_id uuid,event_id uuid,user_id uuid,name text,email text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r registrations;
BEGIN SELECT * INTO _r FROM registrations WHERE join_token=_jt; IF _r.id IS NULL THEN RAISE EXCEPTION 'Invalid join link'; END IF;
  IF _r.user_id IS NOT NULL AND _r.user_id<>auth.uid() THEN RAISE EXCEPTION 'Belongs to another account'; END IF;
  UPDATE registrations SET active_session_id=_sid,active_session_started_at=now(),user_id=COALESCE(user_id,auth.uid()) WHERE id=_r.id;
  RETURN QUERY SELECT _r.id,_r.event_id,COALESCE(_r.user_id,auth.uid()),_r.name,_r.email;
END; $$;

CREATE OR REPLACE FUNCTION public.event_branding_enabled(_eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT COALESCE(e.webinar_branding_enabled,o.webinar_branding_enabled,true) FROM events e LEFT JOIN organizations o ON o.id=e.org_id WHERE e.id=_eid; $$;

CREATE OR REPLACE FUNCTION public.resolve_browser_session(_jt text,_csid text,_fp text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rid uuid; _ex text;
BEGIN SELECT id INTO _rid FROM registrations WHERE join_token=_jt; IF _rid IS NULL THEN RETURN _csid; END IF;
  SELECT browser_session_id INTO _ex FROM webinar_browser_sessions WHERE registration_id=_rid AND(browser_session_id=_csid OR(_fp IS NOT NULL AND fingerprint=_fp)) ORDER BY last_seen_at DESC LIMIT 1;
  IF _ex IS NOT NULL THEN UPDATE webinar_browser_sessions SET last_seen_at=now() WHERE registration_id=_rid AND browser_session_id=_ex; RETURN _ex; END IF;
  INSERT INTO webinar_browser_sessions(registration_id,browser_session_id,fingerprint) VALUES(_rid,_csid,_fp) ON CONFLICT(registration_id,browser_session_id) DO UPDATE SET last_seen_at=now();
  RETURN _csid;
END; $$;

CREATE OR REPLACE FUNCTION public.get_webinar_analytics(_sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _eid uuid; _r jsonb;
BEGIN SELECT event_id INTO _eid FROM webinar_sessions WHERE id=_sid; IF _eid IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT is_event_owner(auth.uid(),_eid) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH a AS(SELECT * FROM webinar_attendance WHERE session_id=_sid),
  k AS(SELECT(SELECT viewer_peak FROM webinar_sessions WHERE id=_sid) pk,COUNT(DISTINCT identity) uv,COALESCE(AVG(EXTRACT(EPOCH FROM(COALESCE(left_at,now())-joined_at))/60),0) aw,(SELECT count(*) FROM webinar_chat WHERE session_id=_sid AND deleted=false) cc,(SELECT count(*) FROM webinar_qa WHERE session_id=_sid) qc,(SELECT count(*) FROM webinar_polls WHERE session_id=_sid) pc,(SELECT count(*) FROM webinar_reactions WHERE session_id=_sid) rc,(SELECT count(*) FROM webinar_announcements WHERE session_id=_sid) ac FROM a),
  ta AS(SELECT a.identity,COALESCE(p.display_name,a.display_name,'Guest') n,ROUND(SUM(EXTRACT(EPOCH FROM(COALESCE(a.left_at,now())-a.joined_at))/60)::numeric,1) m FROM a LEFT JOIN profiles p ON p.user_id=a.user_id GROUP BY a.identity,p.display_name,a.display_name ORDER BY m DESC LIMIT 50)
  SELECT jsonb_build_object('kpis',(SELECT to_jsonb(k) FROM k),'top_attendees',COALESCE((SELECT jsonb_agg(to_jsonb(ta)) FROM ta),'[]')) INTO _r;
  RETURN _r;
END; $$;

-- ── Sync profile to registrations trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_to_registrations() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE registrations r SET title=COALESCE(NEW.title,r.title),first_name=COALESCE(NEW.first_name,r.first_name),last_name=COALESCE(NEW.last_name,r.last_name),name=COALESCE(NULLIF(TRIM(COALESCE(NEW.first_name,'')||' '||COALESCE(NEW.last_name,'')),''),r.name),designation=COALESCE(NEW.designation,r.designation),company=COALESCE(NEW.company,r.company),mobile_country_code=COALESCE(NEW.mobile_country_code,r.mobile_country_code),mobile_number=COALESCE(NEW.mobile_number,r.mobile_number),linkedin_url=COALESCE(NEW.linkedin_url,r.linkedin_url),company_website=COALESCE(NEW.company_website,r.company_website),company_employee_count=COALESCE(NEW.company_employee_count,r.company_employee_count),industry=COALESCE(NEW.industry,r.industry),updated_at=now() FROM events e WHERE r.user_id=NEW.user_id AND r.event_id=e.id AND COALESCE(e.end_date,e.date)>=now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_sync_to_registrations AFTER UPDATE OF title,first_name,last_name,designation,company,mobile_country_code,mobile_number,linkedin_url,company_website,company_employee_count,industry ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_registrations();

-- ── Revoke/Grant for security ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.is_event_approved_attendee(uuid,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.is_event_owner(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_event_approved_attendee(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_owner(uuid,uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 003_realtime_seeds.sql
-- ────────────────────────────────────────────────────────────
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
('footer','{"brandName":"Illuxus","tagline":"The modern event platform.","columns":[{"title":"Product","links":[{"label":"Features","href":"/features"},{"label":"Pricing","href":"/pricing"},{"label":"Events","href":"/events"},{"label":"Discover","href":"/discover"}]},{"title":"Company","links":[{"label":"About","href":"/about"},{"label":"Contact","href":"/contact"},{"label":"Blog","href":"/about"},{"label":"Careers","href":"/contact"}]},{"title":"Resources","links":[{"label":"Help Center","href":"/contact"},{"label":"Community","href":"/community"},{"label":"Status","href":"/contact"},{"label":"Changelog","href":"/about"}]},{"title":"Legal","links":[{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Cookie Policy","href":"/privacy"},{"label":"GDPR","href":"/privacy"}]}],"copyright":"© 2026 Illuxus Technologies. All rights reserved."}'::jsonb)
ON CONFLICT(section) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 004_attendance.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Attendance — state machine helper, RPCs, self check-in/out
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 004_apply_attendance_helper.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 4/?: _apply_attendance — internal helper for the tabbed scanner
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.1)
-- Requirements: 3, 4, 5, 6, 7, 8, 12.1, 12.2, 13.2
--
-- This helper is the single source of truth for attendance state transitions.
-- It is invoked by the SECURITY DEFINER RPCs `set_attendance` (Task 1.2) and
-- `bulk_set_attendance` (Task 1.3). It is intentionally PRIVATE — no
-- `GRANT EXECUTE` is issued — so it can only be reached through those callers.
--
-- Branch order (per design.md "Internal helper _apply_attendance"):
--   1. existence
--   2. authorization (platform admin OR event owner)
--   3. tracking window
--   4. status / approval guard
--   5. state machine
--
-- Inserts into `attendance_events` only on the success branches; the existing
-- `attendance_events_after_insert` trigger on that table fires
-- `_attendance_recompute(NEW.registration_id)`, which keeps `registrations`
-- (`attendance_state`, `last_in_at`, `last_out_at`, `total_minutes`,
-- `checked_in`, `checked_in_at`) in sync. This helper does not touch
-- `registrations` directly.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._apply_attendance(
  _reg_id uuid,
  _target text,
  _method text,
  _actor  uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r   registrations%ROWTYPE;
  _ts timestamptz := now();
  _d  date;
BEGIN
  -- Defensive: target must be one of the two permitted values. Callers
  -- already constrain this, but a malformed value should not fall through.
  IF _target NOT IN ('inside','outside') THEN
    RETURN 'invalid';
  END IF;

  -- 1. Existence ──────────────────────────────────────────────────────────────
  SELECT * INTO r FROM registrations WHERE id = _reg_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- 2. Authorization (REQ-13.2) ───────────────────────────────────────────────
  -- Reuses the same predicate pair already used by `bulk_set_attendance` and
  -- `toggle_attendance`. Note: unlike `toggle_attendance`, the scanner-driven
  -- transitions do NOT permit `r.user_id = _actor` self-service; the public
  -- self-check-in path goes through `self_check_in` instead.
  IF NOT (has_role(_actor, 'admin') OR is_event_owner(_actor, r.event_id)) THEN
    RETURN 'unauthorized';
  END IF;

  -- 3. Tracking window (REQ-8.1) ──────────────────────────────────────────────
  IF event_tracking_closed(r.event_id) THEN
    RETURN 'tracking_closed';
  END IF;

  -- 4. Status / approval guard (REQ-7) ────────────────────────────────────────
  IF r.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  IF r.approval_status = 'declined' THEN
    RETURN 'declined';
  END IF;
  IF r.approval_status IN ('pending','waitlisted') THEN
    RETURN 'pending_approval';
  END IF;

  -- 5. State machine (REQ-3, REQ-4, REQ-5, REQ-6) ─────────────────────────────
  -- `event_day` is computed in the event's timezone (matching the existing
  -- pattern in `bulk_set_attendance` / `toggle_attendance`).
  _d := (_ts AT TIME ZONE COALESCE((SELECT timezone FROM events WHERE id = r.event_id), 'UTC'))::date;

  IF _target = 'inside' THEN
    -- Permitted starts: 'never', 'outside' → INSERT kind='in'
    -- Rejected start: 'inside' → 'already_inside' (no write)
    IF r.attendance_state = 'inside' THEN
      RETURN 'already_inside';
    END IF;

    INSERT INTO attendance_events (registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
    VALUES (r.id, r.event_id, _d, 'in', _method, _actor, _ts);

    RETURN 'applied_in';

  ELSE -- _target = 'outside'
    -- Permitted start: 'inside' → INSERT kind='out'
    -- Rejected starts:
    --   'never'   → 'not_checked_in_yet' (also enforces the REQ-6.1 ordering
    --              invariant: count(out) ≤ count(in) at every prefix, since
    --              an 'out' insert before any 'in' is impossible)
    --   'outside' → 'already_outside' (no write)
    IF r.attendance_state = 'never' THEN
      RETURN 'not_checked_in_yet';
    END IF;
    IF r.attendance_state = 'outside' THEN
      RETURN 'already_outside';
    END IF;

    INSERT INTO attendance_events (registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
    VALUES (r.id, r.event_id, _d, 'out', _method, _actor, _ts);

    RETURN 'applied_out';
  END IF;
END;
$$;

-- ── Privacy ───────────────────────────────────────────────────────────────────
-- This helper is intentionally not exposed to PostgREST. Revoke any default
-- PUBLIC execute privilege; do NOT grant to `anon` or `authenticated`. Only
-- the SECURITY DEFINER callers (`set_attendance`, `bulk_set_attendance`)
-- reach it.
REVOKE ALL ON FUNCTION public._apply_attendance(uuid, text, text, uuid) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Section: 005_set_attendance_rpc.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 5/?: set_attendance — per-row RPC for the tabbed scanner
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.2)
-- Requirements: 3, 4, 5, 6, 7, 8, 10, 12.1, 12.2, 13.2
--
-- This RPC is the SECURITY DEFINER entry point the new `QRScannerDialog`
-- calls once per scan. It delegates the entire transition rule set to the
-- private `_apply_attendance` helper introduced in migration 004, then
-- projects the resulting registration row so the dialog can render its
-- success / warn / error banner without a second round-trip.
--
-- Returned shape (per design.md "RPC surface (final shape)"):
--   code              text         -- ScanResultCode
--   registration_id   uuid
--   attendance_state  text
--   last_in_at        timestamptz
--   last_out_at       timestamptz
--   total_minutes     int
--   name              text
--   ticket_type       text
--
-- Exactly one row is returned per call. When `_apply_attendance` returned
-- `'not_found'` (the registration does not exist), the row carries the
-- code plus NULLs for every other column, mirroring the convention
-- `self_check_in` already uses.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_attendance(
  p_reg_id uuid,
  p_target text,
  p_method text DEFAULT 'qr'
) RETURNS TABLE(
  code             text,
  registration_id  uuid,
  attendance_state text,
  last_in_at       timestamptz,
  last_out_at      timestamptz,
  total_minutes    int,
  name             text,
  ticket_type      text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _code text;
BEGIN
  -- Delegate every rule (existence, authz, tracking window, status guards,
  -- state machine, and the audit-row INSERT) to the private helper. The
  -- helper runs as the same SECURITY DEFINER context, so its `auth.uid()`-
  -- driven authorization predicate sees this caller's identity.
  _code := public._apply_attendance(p_reg_id, p_target, p_method, auth.uid());

  -- Project the registration row the helper just (potentially) mutated via
  -- its `_attendance_recompute` AFTER-INSERT trigger. For every code other
  -- than 'not_found', this SELECT returns exactly one row.
  RETURN QUERY
    SELECT _code,
           r.id,
           r.attendance_state,
           r.last_in_at,
           r.last_out_at,
           r.total_minutes,
           r.name,
           r.ticket_type
    FROM public.registrations r
    WHERE r.id = p_reg_id;

  -- 'not_found' branch: keep the contract "exactly one row per call" so
  -- callers can rely on `.maybeSingle()` / first-row destructuring.
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT _code,
             NULL::uuid,
             NULL::text,
             NULL::timestamptz,
             NULL::timestamptz,
             NULL::int,
             NULL::text,
             NULL::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_attendance(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 006_bulk_set_attendance_per_row.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 6/?: bulk_set_attendance — tightened per-row return shape
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.3)
-- Requirements: 15.1, 15.2, 15.3
--
-- Replaces the legacy `bulk_set_attendance(uuid[], text, text) RETURNS int`
-- (count of successful changes) with a per-row result form
-- `RETURNS TABLE(registration_id uuid, code text)` so callers can render
-- per-registration outcomes (REQ-15.3).
--
-- Behaviour change:
--   • Iterates `p_ids`, delegating each id to `public._apply_attendance`
--     (migration 004) so the bulk path uses the SAME state-machine, status
--     guards, tracking-window, and authorization checks as the per-row
--     `set_attendance` RPC (migration 005). REQ-15.1 + REQ-15.2.
--   • Yields exactly one row per input id — including unauthorized,
--     not_found, cancelled, declined, pending_approval, tracking_closed,
--     wrong-state, and invalid-target cases — so result-array length always
--     equals input-array length. REQ-15.3.
--
-- Migration mechanics:
--   • This is a breaking change to the function's return type. PostgreSQL's
--     `CREATE OR REPLACE FUNCTION` cannot change the return type of an
--     existing function, so we `DROP FUNCTION` with the original signature
--     first. The DROP is wrapped in `IF EXISTS` so the migration is
--     idempotent and safe to re-run.
--   • Re-grants `EXECUTE` to `authenticated`, matching the prior grant
--     surface.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.bulk_set_attendance(uuid[], text, text);

CREATE OR REPLACE FUNCTION public.bulk_set_attendance(
  p_ids    uuid[],
  p_target text,
  p_method text DEFAULT 'bulk'
) RETURNS TABLE(registration_id uuid, code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id     uuid;
  _actor  uuid := auth.uid();
  _code   text;
BEGIN
  -- Defensive: target must be one of the two permitted values. The helper
  -- also rejects malformed targets with `'invalid'`, but checking here lets
  -- us return a uniform `'invalid'` row per id without entering the helper
  -- per id when the entire call is malformed.
  IF p_target NOT IN ('inside','outside') THEN
    FOREACH _id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
      registration_id := _id;
      code            := 'invalid';
      RETURN NEXT;
    END LOOP;
    RETURN;
  END IF;

  -- Guard against NULL input array — yield zero rows.
  IF p_ids IS NULL THEN
    RETURN;
  END IF;

  -- Per-row delegation: every id (even rejected ones) produces a result row,
  -- so callers can pair `result[i].registration_id` with `p_ids[i]` and
  -- surface a per-row toast / log entry for non-success codes.
  FOREACH _id IN ARRAY p_ids LOOP
    _code := public._apply_attendance(_id, p_target, p_method, _actor);
    registration_id := _id;
    code            := _code;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Re-grant EXECUTE to authenticated (matches the prior grant surface; the
-- DROP above also dropped any privileges attached to the old signature).
GRANT EXECUTE ON FUNCTION public.bulk_set_attendance(uuid[], text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 007_self_check_in_no_out.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 007_self_check_in_no_out.sql
--
-- Patch `public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)` so the
-- public self-check-in flow is check-in only (Requirement 14, feature
-- `checkin-checkout-tabs`):
--
--   • When the resolved registration's attendance_state = 'inside', return
--     status='already' and DO NOT insert any attendance_events row.
--     (REQ-14.1, REQ-14.2 — no kind='out', no kind='in')
--   • When attendance_state = 'outside', re-entry is preserved: insert
--     kind='in', method='self' and return status='ok'. (REQ-14.3)
--   • When attendance_state = 'never', behavior is unchanged: insert
--     kind='in', method='self' and return status='ok'.
--
-- Signature, RETURNS shape, security, search_path, and grants are kept identical
-- to the definition in 002_functions.sql. Only the body of the trailing
-- IF _wi … ELSE … END IF block is changed.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r registrations%ROWTYPE; ev events%ROWTYPE; _wi boolean; _ee timestamptz; _k text; _ref uuid; _n text; _e text; _co text; _tt text; _ts timestamptz:=now(); _d date; _rid uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token))=0 THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN RETURN QUERY SELECT 'wrong_event'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    _k:=split_part(p_token,':',1); BEGIN _ref:=split_part(p_token,':',2)::uuid; EXCEPTION WHEN others THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END;
    IF _k='speaker' THEN SELECT sp.name,sp.email,sp.company,'speaker' INTO _n,_e,_co,_tt FROM speakers sp JOIN event_speakers es ON es.speaker_id=sp.id AND es.event_id=p_event_id WHERE sp.id=_ref;
    ELSE SELECT sm.display_name,sm.email,sp.name,'sponsor' INTO _n,_e,_co,_tt FROM sponsor_members sm JOIN sponsors sp ON sp.id=sm.sponsor_id JOIN event_sponsors es ON es.sponsor_id=sp.id AND es.event_id=p_event_id WHERE sm.id=_ref; END IF;
    IF _n IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,p_event_id,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    SELECT reg.* INTO r FROM registrations reg WHERE reg.event_id=p_event_id AND reg.ticket_type=_tt AND lower(reg.email)=lower(COALESCE(_e,'')) LIMIT 1;
    IF NOT FOUND THEN INSERT INTO registrations(event_id,name,email,company,ticket_type,status,approval_status) VALUES(p_event_id,_n,COALESCE(_e,_n||'@no-email.local'),_co,_tt,'confirmed','approved') RETURNING * INTO r; END IF;
  ELSE SELECT reg.* INTO r FROM registrations reg WHERE reg.qr_code=p_token OR reg.join_token=p_token OR reg.id::text=p_token LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  END IF;
  IF p_event_id IS NOT NULL AND r.event_id<>p_event_id THEN RETURN QUERY SELECT 'wrong_event'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  SELECT e.* INTO ev FROM events e WHERE e.id=r.event_id;
  IF FOUND THEN _ee:=COALESCE(ev.end_date,ev.date); IF _ee IS NOT NULL AND now()>_ee+interval '2 hours' THEN RETURN QUERY SELECT 'expired'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF; END IF;
  IF r.status='cancelled' THEN RETURN QUERY SELECT 'cancelled'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  _wi:=(r.attendance_state='inside'); _d:=(_ts AT TIME ZONE COALESCE(ev.timezone,'UTC'))::date; _rid:=r.id;
  -- Behavior change (REQ-14): when already inside, return 'already' WITHOUT
  -- inserting any attendance_events row. The previous implementation inserted
  -- kind='out' here; that is removed so the public self-check-in flow can never
  -- check a participant out (REQ-14.1, REQ-14.2).
  IF _wi THEN
    RETURN QUERY SELECT 'already'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_in_at;
  ELSE
    -- Covers both attendance_state='never' (first check-in) and 'outside'
    -- (re-entry, REQ-14.3). The existing _attendance_recompute AFTER-INSERT
    -- trigger keeps registrations.attendance_state, last_in_at, and the legacy
    -- checked_in/checked_in_at columns in sync.
    INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,occurred_at) VALUES(_rid,r.event_id,_d,'in','self',_ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id=_rid;
    RETURN QUERY SELECT 'ok'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_in_at;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.self_check_in(text,uuid) TO anon,authenticated;

-- ----------------------------------------------------------------------------
-- Section: 008_self_check_out.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 008_self_check_out.sql
--
-- Adds `public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)` so
-- the new public self-check-out page can flip an attendee from
-- attendance_state='inside' to 'outside' without organizer-staff oversight.
--
-- Mirrors `self_check_in` from 002_functions.sql (and patched in 007) but with
-- inverted semantics:
--   • attendance_state='inside'   → insert kind='out', method='self', return 'ok'
--   • attendance_state='outside'  → return 'already' (no insert)
--   • attendance_state='never'    → return 'not_checked_in_yet' (no insert)
--
-- All other guards match self_check_in:
--   • Validates the token shape (`speaker:<UUID>`, `sponsor_contact:<UUID>`,
--     id, qr_code, or join_token).
--   • Enforces the wrong_event guard when p_event_id is supplied.
--   • Enforces the 2-hour-after-end-of-event tracking window.
--   • Rejects cancelled registrations.
--   • Returns the same row shape as self_check_in for symmetry on the client.
--
-- Granted to anon and authenticated so the public /checkout/:eventId page can
-- call it without a session, identical to the self_check_in grant.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_out_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r registrations%ROWTYPE;
  ev events%ROWTYPE;
  _ee timestamptz;
  _k text;
  _ref uuid;
  _n text;
  _e text;
  _co text;
  _tt text;
  _ts timestamptz := now();
  _d date;
  _rid uuid;
  _state text;
BEGIN
  -- Empty / whitespace-only token = 'invalid'.
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Speaker / sponsor scoped tokens require an event id and a valid UUID payload.
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN
      _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END;
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker'
        INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor'
        INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    -- For self-check-out, the registration MUST already exist — we never lazy-
    -- create. If a speaker/sponsor scans without ever having checked in, we
    -- surface 'not_checked_in_yet' rather than 'not_found'.
    SELECT reg.* INTO r
      FROM registrations reg
     WHERE reg.event_id = p_event_id
       AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, ''))
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_checked_in_yet'::text, NULL::uuid, p_event_id, _n, _e, _tt, NULL::timestamptz;
      RETURN;
    END IF;
  ELSE
    SELECT reg.* INTO r
      FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- Wrong-event guard.
  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
    RETURN;
  END IF;

  -- Tracking window — same 2-hour-after-end policy as self_check_in.
  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
      RETURN;
    END IF;
  END IF;

  -- Cancelled registrations cannot self-checkout.
  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
    RETURN;
  END IF;

  _state := COALESCE(r.attendance_state, 'never');
  _d := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  -- State-machine branching:
  --   inside  → insert kind='out', return 'ok'
  --   outside → no-op, return 'already' (already checked out)
  --   never   → no-op, return 'not_checked_in_yet'
  IF _state = 'inside' THEN
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES(_rid, r.event_id, _d, 'out', 'self', _ts);
    -- Re-read after the AFTER-INSERT trigger updates last_out_at / state.
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
  ELSIF _state = 'outside' THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
  ELSE
    -- 'never' — never checked in, can't check out.
    RETURN QUERY SELECT 'not_checked_in_yet'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, NULL::timestamptz;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_check_out(text, uuid) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 005_community.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Community — schema, RBAC, notifications, leaderboard cleanup
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 004_community.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Community Ecosystem — Phase 1
-- Tables, helpers, RLS, triggers, auto-link, and RPCs needed for:
--   communities + memberships + feed (posts/comments/reactions/bookmarks)
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_kind') THEN
    CREATE TYPE community_kind AS ENUM ('parent','event');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_category') THEN
    CREATE TYPE community_category AS ENUM (
      'tech','ai','startup','hackathon','cybersecurity','finance','education',
      'design','marketing','health','sustainability','other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_role') THEN
    CREATE TYPE community_role AS ENUM (
      'member','speaker','sponsor','organizer','moderator','manager','mentor'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_post_type') THEN
    CREATE TYPE community_post_type AS ENUM (
      'discussion','question','announcement','resource','poll','event_update'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_visibility') THEN
    CREATE TYPE community_visibility AS ENUM ('public','members_only','private');
  END IF;
END $$;

-- ── 1. communities ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            community_kind NOT NULL,
  category        community_category,
  parent_id       uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  event_id        uuid UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  banner_url      text,
  logo_url        text,
  visibility      community_visibility NOT NULL DEFAULT 'public',
  rules           text,
  member_count    int NOT NULL DEFAULT 0,
  post_count      int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_event_kind_chk
    CHECK (kind = 'parent' OR (kind = 'event' AND event_id IS NOT NULL AND parent_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS communities_kind_idx     ON public.communities(kind);
CREATE INDEX IF NOT EXISTS communities_category_idx ON public.communities(category) WHERE kind='parent';
CREATE INDEX IF NOT EXISTS communities_parent_idx   ON public.communities(parent_id);

-- ── 2. community_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            community_role NOT NULL DEFAULT 'member',
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','banned','left')),
  auto            boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  notify_email    boolean NOT NULL DEFAULT false,
  notify_push     boolean NOT NULL DEFAULT true,
  last_read_at    timestamptz,
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS cmembers_user_idx ON public.community_members(user_id);
CREATE INDEX IF NOT EXISTS cmembers_role_idx ON public.community_members(community_id, role);

-- ── 3. community_posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            community_post_type NOT NULL DEFAULT 'discussion',
  title           text,
  body_md         text NOT NULL DEFAULT '',
  attachments     jsonb NOT NULL DEFAULT '[]',
  link_url        text,
  pinned          boolean NOT NULL DEFAULT false,
  important       boolean NOT NULL DEFAULT false,
  hidden          boolean NOT NULL DEFAULT false,
  comment_count   int NOT NULL DEFAULT 0,
  reaction_count  int NOT NULL DEFAULT 0,
  view_count      int NOT NULL DEFAULT 0,
  ts_search       tsvector,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS cposts_community_idx ON public.community_posts(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cposts_pinned_idx    ON public.community_posts(community_id, pinned, created_at DESC) WHERE pinned;
CREATE INDEX IF NOT EXISTS cposts_type_idx      ON public.community_posts(community_id, type);
CREATE INDEX IF NOT EXISTS cposts_search_idx    ON public.community_posts USING gin(ts_search);

-- ── 4. community_comments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_md         text NOT NULL,
  hidden          boolean NOT NULL DEFAULT false,
  reaction_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ccomments_post_idx ON public.community_comments(post_id, created_at);

-- ── 5. community_reactions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id      uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  emoji           text NOT NULL DEFAULT '👍',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS creactions_post_uniq
  ON public.community_reactions(user_id, post_id, emoji) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS creactions_comment_uniq
  ON public.community_reactions(user_id, comment_id, emoji) WHERE comment_id IS NOT NULL;

-- ── 6. community_bookmarks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ── Helper functions (SECURITY DEFINER, no RLS recursion) ───────────────────
CREATE OR REPLACE FUNCTION public.is_community_member(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.community_role_of(_user_id uuid, _community_id uuid)
RETURNS community_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.community_members
  WHERE community_id = _community_id AND user_id = _user_id AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_community(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.community_role_of(_user_id, _community_id) IN ('moderator','manager')
      OR public.has_role(_user_id, 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_role_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_community(uuid, uuid) TO authenticated;

-- ── Slugify helper for community slugs (idempotent) ─────────────────────────
CREATE OR REPLACE FUNCTION public.community_slugify(_input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(_input, '')), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- ── tsvector trigger for full-text search ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._community_posts_tsvector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ts_search := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.body_md, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_ts ON public.community_posts;
CREATE TRIGGER community_posts_ts
BEFORE INSERT OR UPDATE OF title, body_md ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._community_posts_tsvector();

-- ── Counter triggers (member_count, post_count, comment_count, reaction_count)
CREATE OR REPLACE FUNCTION public._cmembers_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE public.communities SET member_count = member_count + 1, updated_at = now() WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE public.communities SET member_count = greatest(0, member_count - 1), updated_at = now() WHERE id = OLD.community_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NEW.status = 'active' THEN
      UPDATE public.communities SET member_count = member_count + 1, updated_at = now() WHERE id = NEW.community_id;
    ELSIF OLD.status = 'active' THEN
      UPDATE public.communities SET member_count = greatest(0, member_count - 1), updated_at = now() WHERE id = NEW.community_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cmembers_count ON public.community_members;
CREATE TRIGGER cmembers_count
AFTER INSERT OR UPDATE OF status OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public._cmembers_count_trg();

CREATE OR REPLACE FUNCTION public._cposts_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET post_count = post_count + 1, updated_at = now() WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET post_count = greatest(0, post_count - 1), updated_at = now() WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cposts_count ON public.community_posts;
CREATE TRIGGER cposts_count
AFTER INSERT OR DELETE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._cposts_count_trg();

CREATE OR REPLACE FUNCTION public._ccomments_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET comment_count = comment_count + 1, updated_at = now() WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET comment_count = greatest(0, comment_count - 1), updated_at = now() WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS ccomments_count ON public.community_comments;
CREATE TRIGGER ccomments_count
AFTER INSERT OR DELETE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public._ccomments_count_trg();

CREATE OR REPLACE FUNCTION public._creactions_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE public.community_comments SET reaction_count = reaction_count + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = greatest(0, reaction_count - 1) WHERE id = OLD.post_id;
    ELSE
      UPDATE public.community_comments SET reaction_count = greatest(0, reaction_count - 1) WHERE id = OLD.comment_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS creactions_count ON public.community_reactions;
CREATE TRIGGER creactions_count
AFTER INSERT OR DELETE ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public._creactions_count_trg();

-- ── updated_at trigger (reuses existing function) ───────────────────────────
DROP TRIGGER IF EXISTS communities_updated_at ON public.communities;
CREATE TRIGGER communities_updated_at
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS community_posts_updated_at ON public.community_posts;
CREATE TRIGGER community_posts_updated_at
BEFORE UPDATE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS community_comments_updated_at ON public.community_comments;
CREATE TRIGGER community_comments_updated_at
BEFORE UPDATE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.communities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_bookmarks  ENABLE ROW LEVEL SECURITY;

-- communities
DROP POLICY IF EXISTS "view communities" ON public.communities;
CREATE POLICY "view communities" ON public.communities FOR SELECT
  USING (
    visibility = 'public'
    OR public.is_community_member(auth.uid(), id)
    OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "manage communities" ON public.communities;
CREATE POLICY "manage communities" ON public.communities FOR ALL TO authenticated
  USING (
    public.community_role_of(auth.uid(), id) = 'manager'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (org_id IS NOT NULL AND public.is_org_owner(auth.uid(), org_id))
  )
  WITH CHECK (
    public.community_role_of(auth.uid(), id) = 'manager'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (org_id IS NOT NULL AND public.is_org_owner(auth.uid(), org_id))
  );

-- community_members
DROP POLICY IF EXISTS "view members" ON public.community_members;
CREATE POLICY "view members" ON public.community_members FOR SELECT
  USING (
    public.is_community_member(auth.uid(), community_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "self join" ON public.community_members;
CREATE POLICY "self join" ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self update notif" ON public.community_members;
CREATE POLICY "self update notif" ON public.community_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self leave" ON public.community_members;
CREATE POLICY "self leave" ON public.community_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "moderate members" ON public.community_members;
CREATE POLICY "moderate members" ON public.community_members FOR UPDATE TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (public.can_moderate_community(auth.uid(), community_id));

-- community_posts
DROP POLICY IF EXISTS "members read posts" ON public.community_posts;
CREATE POLICY "members read posts" ON public.community_posts FOR SELECT
  USING (
    public.is_community_member(auth.uid(), community_id)
    AND (NOT hidden OR public.can_moderate_community(auth.uid(), community_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "members write posts" ON public.community_posts;
CREATE POLICY "members write posts" ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_community_member(auth.uid(), community_id)
    AND author_id = auth.uid()
    AND CASE
      WHEN type = 'announcement' THEN
        public.community_role_of(auth.uid(), community_id) IN ('organizer','moderator','manager')
      ELSE true
    END
  );

DROP POLICY IF EXISTS "edit own posts" ON public.community_posts;
CREATE POLICY "edit own posts" ON public.community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

DROP POLICY IF EXISTS "delete own posts" ON public.community_posts;
CREATE POLICY "delete own posts" ON public.community_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

-- community_comments
DROP POLICY IF EXISTS "read comments" ON public.community_comments;
CREATE POLICY "read comments" ON public.community_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id)
    )
    AND (NOT hidden OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    ))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "write comments" ON public.community_comments;
CREATE POLICY "write comments" ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id)
    )
  );

DROP POLICY IF EXISTS "edit own comments" ON public.community_comments;
CREATE POLICY "edit own comments" ON public.community_comments FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    )
  );

DROP POLICY IF EXISTS "delete own comments" ON public.community_comments;
CREATE POLICY "delete own comments" ON public.community_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    )
  );

-- community_reactions
DROP POLICY IF EXISTS "read reactions" ON public.community_reactions;
CREATE POLICY "read reactions" ON public.community_reactions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "self react" ON public.community_reactions;
CREATE POLICY "self react" ON public.community_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self un-react" ON public.community_reactions;
CREATE POLICY "self un-react" ON public.community_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- community_bookmarks
DROP POLICY IF EXISTS "self bookmarks" ON public.community_bookmarks;
CREATE POLICY "self bookmarks" ON public.community_bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Grants (REST works under RLS once granted) ─────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_comments   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_reactions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_bookmarks  TO authenticated;
GRANT ALL ON public.communities,         public.community_members,  public.community_posts,
            public.community_comments,   public.community_reactions, public.community_bookmarks TO service_role;

-- Public read of public communities (for org pages, marketing)
GRANT SELECT ON public.communities TO anon;

-- ── Auto-link: ensure parent + event communities are created/linked ─────────
-- Mapping events.category → community_category. Falls back to 'other'.
CREATE OR REPLACE FUNCTION public._map_event_category_to_community(_cat text)
RETURNS community_category LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_cat,''))
    WHEN 'tech'           THEN 'tech'::community_category
    WHEN 'technology'     THEN 'tech'::community_category
    WHEN 'ai'             THEN 'ai'::community_category
    WHEN 'startup'        THEN 'startup'::community_category
    WHEN 'hackathon'      THEN 'hackathon'::community_category
    WHEN 'cybersecurity'  THEN 'cybersecurity'::community_category
    WHEN 'security'       THEN 'cybersecurity'::community_category
    WHEN 'finance'        THEN 'finance'::community_category
    WHEN 'fintech'        THEN 'finance'::community_category
    WHEN 'education'      THEN 'education'::community_category
    WHEN 'design'         THEN 'design'::community_category
    WHEN 'marketing'      THEN 'marketing'::community_category
    WHEN 'health'         THEN 'health'::community_category
    WHEN 'sustainability' THEN 'sustainability'::community_category
    ELSE 'other'::community_category
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_parent_community(_category community_category)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _name text;
  _slug text;
BEGIN
  SELECT id INTO _id FROM communities WHERE kind='parent' AND category=_category LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  _name := initcap(replace(_category::text, '_', ' ')) || ' Community';
  _slug := community_slugify(_name);

  INSERT INTO communities (kind, category, slug, name, description, visibility, created_by)
  VALUES ('parent', _category, _slug,
          _name,
          'Industry hub for ' || lower(replace(_category::text,'_',' ')) || ' events and discussions.',
          'public',
          NULL)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing uuid;
  _evt RECORD;
  _parent_id uuid;
  _new_id uuid;
  _slug text;
  _base_slug text;
  _i int := 0;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id,
         COALESCE(NULL, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve category from optional column if it exists. We coalesce to 'other'
  -- since events.category may not exist in this schema.
  _parent_id := ensure_parent_community(_map_event_category_to_community('other'));

  _base_slug := community_slugify(_evt.slug || '-community');
  IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base_slug || '-' || _i;
  END LOOP;

  INSERT INTO communities (
    kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
  ) VALUES (
    'event', _parent_id, _evt.id, _evt.org_id, _slug,
    _evt.title || ' — Community',
    'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
    'public',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN _new_id;
END;
$$;

-- Trigger: create event community + auto-feed entry when event is inserted
CREATE OR REPLACE FUNCTION public._events_after_insert_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
  _parent_id uuid;
BEGIN
  _comm_id := ensure_event_community(NEW.id);
  IF _comm_id IS NULL THEN RETURN NEW; END IF;

  SELECT parent_id INTO _parent_id FROM communities WHERE id = _comm_id;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO community_posts (community_id, author_id, type, title, body_md)
    VALUES (
      _parent_id,
      NEW.user_id,
      'event_update',
      '🚀 New event: ' || NEW.title,
      'A new event has been added to the community: **' || NEW.title || '**.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_after_insert_community ON public.events;
CREATE TRIGGER events_after_insert_community
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_insert_community();

-- Auto-join speakers/sponsors/attendees to event community
CREATE OR REPLACE FUNCTION public._auto_join_event_community(
  _event_id uuid, _user_id uuid, _role community_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT id INTO _comm_id FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _comm_id IS NULL THEN RETURN; END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto, notify_push)
  VALUES (_comm_id, _user_id, _role, 'active', true, false)
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public._registrations_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.approval_status = 'approved' THEN
    PERFORM _auto_join_event_community(NEW.event_id, NEW.user_id, 'member');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_join_community ON public.registrations;
CREATE TRIGGER registrations_join_community
AFTER INSERT OR UPDATE OF approval_status, user_id ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._registrations_join_community();

CREATE OR REPLACE FUNCTION public._event_speakers_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  -- speakers table doesn't link to user_id directly; we match by email
  SELECT p.user_id INTO _uid
  FROM speakers s
  LEFT JOIN profiles p ON p.user_id IS NOT NULL AND lower(s.email) = lower((SELECT email FROM auth.users u WHERE u.id = p.user_id))
  WHERE s.id = NEW.speaker_id LIMIT 1;
  IF _uid IS NOT NULL THEN
    PERFORM _auto_join_event_community(NEW.event_id, _uid, 'speaker');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_speakers_join_community ON public.event_speakers;
CREATE TRIGGER event_speakers_join_community
AFTER INSERT ON public.event_speakers
FOR EACH ROW EXECUTE FUNCTION public._event_speakers_join_community();

CREATE OR REPLACE FUNCTION public._event_sponsors_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT s.user_id INTO _uid FROM sponsors s WHERE s.id = NEW.sponsor_id LIMIT 1;
  IF _uid IS NOT NULL THEN
    PERFORM _auto_join_event_community(NEW.event_id, _uid, 'sponsor');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_sponsors_join_community ON public.event_sponsors;
CREATE TRIGGER event_sponsors_join_community
AFTER INSERT ON public.event_sponsors
FOR EACH ROW EXECUTE FUNCTION public._event_sponsors_join_community();

-- ── RPCs ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_join(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _id uuid;
  _kind community_kind;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  
  SELECT kind INTO _kind FROM public.communities WHERE id = _community_id;
  IF _kind = 'event' THEN
    RAISE EXCEPTION 'Event communities can only be joined by registering for the event.';
  END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_community_id, auth.uid(), 'member', 'active', false)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = 'active', joined_at = excluded.joined_at
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_leave(_community_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  UPDATE community_members SET status = 'left'
  WHERE community_id = _community_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.community_create_post(
  _community_id uuid,
  _type community_post_type,
  _title text,
  _body_md text,
  _attachments jsonb DEFAULT '[]'::jsonb,
  _link_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _role community_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member of this community';
  END IF;
  IF _type = 'announcement' THEN
    _role := community_role_of(auth.uid(), _community_id);
    IF _role NOT IN ('organizer','moderator','manager') THEN
      RAISE EXCEPTION 'Only organizers, moderators, or managers can post announcements';
    END IF;
  END IF;

  INSERT INTO community_posts (community_id, author_id, type, title, body_md, attachments, link_url)
  VALUES (_community_id, auth.uid(), _type, NULLIF(trim(_title), ''), coalesce(_body_md, ''),
          COALESCE(_attachments, '[]'::jsonb), _link_url)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_react(
  _post_id uuid DEFAULT NULL,
  _comment_id uuid DEFAULT NULL,
  _emoji text DEFAULT '👍'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of _post_id or _comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT id INTO _existing FROM community_reactions
    WHERE user_id = auth.uid() AND post_id = _post_id AND emoji = _emoji;
  ELSE
    SELECT id INTO _existing FROM community_reactions
    WHERE user_id = auth.uid() AND comment_id = _comment_id AND emoji = _emoji;
  END IF;

  IF _existing IS NOT NULL THEN
    DELETE FROM community_reactions WHERE id = _existing;
    RETURN false;
  END IF;

  INSERT INTO community_reactions (user_id, post_id, comment_id, emoji)
  VALUES (auth.uid(), _post_id, _comment_id, _emoji);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_resolve_event(_event_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM communities WHERE event_id = _event_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.community_join(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_leave(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_create_post(uuid, community_post_type, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_react(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_resolve_event(uuid)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ensure_parent_community(community_category) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_event_community(uuid)     TO authenticated;

-- ── Realtime publication for live feed ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions';
  END IF;
END $$;

ALTER TABLE public.community_posts     REPLICA IDENTITY FULL;
ALTER TABLE public.community_comments  REPLICA IDENTITY FULL;
ALTER TABLE public.community_reactions REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- Section: 005_community_complete.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Community Ecosystem — Phases 2, 3, 4
-- Adds: chat channels + messages, resources, polls, reports, connections,
--       badges/leaderboard, moderation/notification triggers, calendar view,
--       search RPC.
-- ============================================================================

-- ── Storage bucket for community attachments / resources ────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('community', 'community', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read community"   ON storage.objects;
DROP POLICY IF EXISTS "Members write community" ON storage.objects;
CREATE POLICY "Public read community"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community');
CREATE POLICY "Members write community"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community' AND auth.uid() IS NOT NULL);

-- ── 1. community_channels (chat channels + topic threads) ───────────────────
CREATE TABLE IF NOT EXISTS public.community_channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'general'
                  CHECK (kind IN ('general','sessions','networking','qa','custom')),
  name            text NOT NULL,
  description     text,
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, name)
);
CREATE INDEX IF NOT EXISTS cchannels_community_idx ON public.community_channels(community_id);

ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read channels" ON public.community_channels;
CREATE POLICY "members read channels" ON public.community_channels FOR SELECT
  USING (public.is_community_member(auth.uid(), community_id) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "managers write channels" ON public.community_channels;
CREATE POLICY "managers write channels" ON public.community_channels FOR ALL TO authenticated
  USING (public.community_role_of(auth.uid(), community_id) IN ('manager','moderator') OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.community_role_of(auth.uid(), community_id) IN ('manager','moderator') OR public.has_role(auth.uid(),'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_channels TO authenticated;
GRANT ALL ON public.community_channels TO service_role;

-- ── 2. community_messages (chat) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  attachments     jsonb NOT NULL DEFAULT '[]',
  reply_to        uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmsgs_channel_idx ON public.community_messages(channel_id, created_at DESC);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read messages" ON public.community_messages;
CREATE POLICY "members read messages" ON public.community_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.community_channels c
            WHERE c.id = channel_id AND public.is_community_member(auth.uid(), c.community_id))
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "members send messages" ON public.community_messages;
CREATE POLICY "members send messages" ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.community_channels c
                WHERE c.id = channel_id AND public.is_community_member(auth.uid(), c.community_id))
  );

DROP POLICY IF EXISTS "edit own messages" ON public.community_messages;
CREATE POLICY "edit own messages" ON public.community_messages FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_channels c
               WHERE c.id = channel_id AND public.can_moderate_community(auth.uid(), c.community_id))
  );

DROP POLICY IF EXISTS "delete own messages" ON public.community_messages;
CREATE POLICY "delete own messages" ON public.community_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_channels c
               WHERE c.id = channel_id AND public.can_moderate_community(auth.uid(), c.community_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;

-- ── 3. community_resources ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_resources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category        text NOT NULL DEFAULT 'general'
                  CHECK (category IN ('learning','event','sponsor','session','general')),
  title           text NOT NULL,
  description     text,
  file_url        text NOT NULL,
  file_name       text NOT NULL,
  file_size       bigint NOT NULL,
  mime_type       text NOT NULL,
  download_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cresources_community_idx ON public.community_resources(community_id, created_at DESC);

ALTER TABLE public.community_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read resources" ON public.community_resources;
CREATE POLICY "members read resources" ON public.community_resources FOR SELECT
  USING (public.is_community_member(auth.uid(), community_id) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "non-members write resources" ON public.community_resources;
CREATE POLICY "non-members write resources" ON public.community_resources FOR INSERT TO authenticated
  WITH CHECK (
    public.is_community_member(auth.uid(), community_id)
    AND public.community_role_of(auth.uid(), community_id) <> 'member'
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "uploader/mod can edit/delete resources" ON public.community_resources;
CREATE POLICY "uploader/mod can edit/delete resources" ON public.community_resources FOR ALL TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (uploaded_by = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_resources TO authenticated;
GRANT ALL ON public.community_resources TO service_role;

-- ── 4. community_polls + votes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_polls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL UNIQUE REFERENCES public.community_posts(id) ON DELETE CASCADE,
  multi           boolean NOT NULL DEFAULT false,
  options         jsonb NOT NULL,                             -- [{id,label}]
  closes_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read polls" ON public.community_polls;
CREATE POLICY "members read polls" ON public.community_polls FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.community_posts p
            WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id))
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "create polls" ON public.community_polls;
CREATE POLICY "create polls" ON public.community_polls FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.community_posts p
            WHERE p.id = post_id AND p.author_id = auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON public.community_polls TO authenticated;
GRANT ALL ON public.community_polls TO service_role;

CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  poll_id         uuid NOT NULL REFERENCES public.community_polls(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_id)
);

ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read votes" ON public.community_poll_votes;
CREATE POLICY "members read votes" ON public.community_poll_votes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.community_polls p
            JOIN public.community_posts cp ON cp.id = p.post_id
            WHERE p.id = poll_id AND public.is_community_member(auth.uid(), cp.community_id))
  );

DROP POLICY IF EXISTS "self vote" ON public.community_poll_votes;
CREATE POLICY "self vote" ON public.community_poll_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self un-vote" ON public.community_poll_votes;
CREATE POLICY "self un-vote" ON public.community_poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.community_poll_votes TO authenticated;
GRANT ALL ON public.community_poll_votes TO service_role;

-- ── 5. community_reports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id      uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','reviewing','actioned','dismissed')),
  resolved_by     uuid REFERENCES auth.users(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS creports_community_idx ON public.community_reports(community_id, status, created_at DESC);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self report" ON public.community_reports;
CREATE POLICY "self report" ON public.community_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_community_member(auth.uid(), community_id));

DROP POLICY IF EXISTS "moderators read reports" ON public.community_reports;
CREATE POLICY "moderators read reports" ON public.community_reports FOR SELECT TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id) OR reporter_id = auth.uid());

DROP POLICY IF EXISTS "moderators resolve reports" ON public.community_reports;
CREATE POLICY "moderators resolve reports" ON public.community_reports FOR UPDATE TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (public.can_moderate_community(auth.uid(), community_id));

GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;

-- ── 6. community_connections (follow + connect) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('follow','connect')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','cancelled')),
  context_community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  UNIQUE (requester_id, target_id, kind),
  CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS cconn_requester_idx ON public.community_connections(requester_id, status);
CREATE INDEX IF NOT EXISTS cconn_target_idx    ON public.community_connections(target_id,    status);

ALTER TABLE public.community_connections ENABLE ROW LEVEL SECURITY;

-- Auto-accept follows by skipping pending state in the RPC; rows still created
-- so we keep an audit trail.
DROP POLICY IF EXISTS "view own connections" ON public.community_connections;
CREATE POLICY "view own connections" ON public.community_connections FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());

DROP POLICY IF EXISTS "self request" ON public.community_connections;
CREATE POLICY "self request" ON public.community_connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "respond connection" ON public.community_connections;
CREATE POLICY "respond connection" ON public.community_connections FOR UPDATE TO authenticated
  USING (target_id = auth.uid() OR requester_id = auth.uid());

DROP POLICY IF EXISTS "cancel connection" ON public.community_connections;
CREATE POLICY "cancel connection" ON public.community_connections FOR DELETE TO authenticated
  USING (requester_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_connections TO authenticated;
GRANT ALL ON public.community_connections TO service_role;

-- ── 7. community_badges (catalogue) + community_user_badges (awards) ────────
CREATE TABLE IF NOT EXISTS public.community_badges (
  id              text PRIMARY KEY,
  label           text NOT NULL,
  icon            text NOT NULL,
  description     text,
  rule_kind       text NOT NULL CHECK (rule_kind IN ('points_gte','posts_gte','comments_gte','speaker','manual')),
  threshold       int
);

INSERT INTO public.community_badges(id, label, icon, description, rule_kind, threshold) VALUES
  ('new_member',  'New Member',     '👋', 'Joined a community',                'manual',       NULL),
  ('contributor', 'Contributor',    '✍️', 'Posted 5 times',                    'posts_gte',    5),
  ('active',      'Active Member',  '🔥', 'Posted 25 times',                   'posts_gte',    25),
  ('expert',      'Expert',         '🏆', 'Earned 500 points',                 'points_gte',   500),
  ('leader',      'Community Leader','⭐','Earned 1500 points',                'points_gte',   1500),
  ('speaker',     'Speaker',        '🎤', 'Spoke at a community event',        'speaker',      NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.community_user_badges (
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id        text NOT NULL REFERENCES public.community_badges(id) ON DELETE CASCADE,
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id, badge_id)
);

ALTER TABLE public.community_user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone read badges" ON public.community_user_badges;
CREATE POLICY "anyone read badges" ON public.community_user_badges FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.community_badges       TO authenticated, anon;
GRANT SELECT ON public.community_user_badges  TO authenticated, anon;
GRANT ALL    ON public.community_badges       TO service_role;
GRANT ALL    ON public.community_user_badges  TO service_role;

-- ── 8. Default channels auto-created with each community ────────────────────
CREATE OR REPLACE FUNCTION public._communities_after_insert_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO community_channels (community_id, kind, name, description) VALUES
    (NEW.id, 'general',    'General',    'Chat about anything in the community.'),
    (NEW.id, 'sessions',   'Sessions',   'Discuss event sessions and talks.'),
    (NEW.id, 'networking', 'Networking', 'Introduce yourself and find collaborators.'),
    (NEW.id, 'qa',         'Q&A',        'Ask questions and get answers from speakers and peers.')
  ON CONFLICT (community_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communities_after_insert_channels ON public.communities;
CREATE TRIGGER communities_after_insert_channels
AFTER INSERT ON public.communities
FOR EACH ROW EXECUTE FUNCTION public._communities_after_insert_channels();

-- Backfill existing communities that don't have any channels yet
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'general',    'General',    'Chat about anything in the community.'    FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id);
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'sessions',   'Sessions',   'Discuss event sessions and talks.'        FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Sessions');
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'networking', 'Networking', 'Introduce yourself and find collaborators.' FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Networking');
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'qa',         'Q&A',        'Ask questions and get answers from speakers and peers.' FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Q&A');

-- ── 9. Notification triggers (write to existing app_notifications) ──────────
CREATE OR REPLACE FUNCTION public._community_comments_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _post RECORD;
BEGIN
  SELECT id, author_id, community_id, COALESCE(title, substring(body_md from 1 for 60)) AS preview
    INTO _post
  FROM public.community_posts WHERE id = NEW.post_id;

  IF _post.author_id IS NOT NULL AND _post.author_id <> NEW.author_id THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (
      _post.author_id,
      'community.post.comment',
      'New comment on your post',
      coalesce(_post.preview,''),
      '/dashboard/community/' ||
        coalesce((SELECT slug FROM public.communities WHERE id = _post.community_id), '') ||
        '/feed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_notify ON public.community_comments;
CREATE TRIGGER community_comments_notify
AFTER INSERT ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public._community_comments_notify();

CREATE OR REPLACE FUNCTION public._community_announcement_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slug text;
BEGIN
  IF NEW.type <> 'announcement' THEN RETURN NEW; END IF;
  SELECT slug INTO _slug FROM public.communities WHERE id = NEW.community_id;

  INSERT INTO public.app_notifications(user_id, type, title, body, link)
  SELECT cm.user_id,
         'community.announcement',
         coalesce(NEW.title, 'New announcement'),
         substring(NEW.body_md from 1 for 140),
         '/dashboard/community/' || coalesce(_slug,'') || '/announcements'
    FROM public.community_members cm
   WHERE cm.community_id = NEW.community_id
     AND cm.status = 'active'
     AND cm.user_id <> NEW.author_id
     AND cm.notify_push;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_announcement_notify ON public.community_posts;
CREATE TRIGGER community_announcement_notify
AFTER INSERT ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._community_announcement_notify();

CREATE OR REPLACE FUNCTION public._community_connections_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.kind = 'connect' AND NEW.status = 'pending' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.target_id, 'community.connection.request', 'New connection request', NULL, '/dashboard/community');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.requester_id, 'community.connection.accepted', 'Your connection was accepted', NULL, '/dashboard/community');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_connections_notify ON public.community_connections;
CREATE TRIGGER community_connections_notify
AFTER INSERT OR UPDATE OF status ON public.community_connections
FOR EACH ROW EXECUTE FUNCTION public._community_connections_notify();

-- ── 10. Connections RPCs ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_connect(_target_id uuid, _kind text DEFAULT 'connect', _community_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _kind NOT IN ('follow','connect') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _target_id = auth.uid() THEN RAISE EXCEPTION 'Cannot connect with self'; END IF;

  -- Follows are auto-accepted; connects need approval
  _status := CASE WHEN _kind = 'follow' THEN 'accepted' ELSE 'pending' END;

  INSERT INTO community_connections (requester_id, target_id, kind, status, context_community_id, responded_at)
  VALUES (auth.uid(), _target_id, _kind, _status, _community_id, CASE WHEN _status='accepted' THEN now() ELSE NULL END)
  ON CONFLICT (requester_id, target_id, kind) DO UPDATE SET
    status = _status,
    responded_at = CASE WHEN _status='accepted' THEN now() ELSE community_connections.responded_at END
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_respond_connection(_request_id uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  UPDATE community_connections
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
         responded_at = now()
   WHERE id = _request_id AND target_id = auth.uid() AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_connect(uuid, text, uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_respond_connection(uuid, boolean)     TO authenticated;

-- ── 11. Moderation RPCs ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_report(
  _post_id uuid DEFAULT NULL, _comment_id uuid DEFAULT NULL,
  _reason text DEFAULT 'inappropriate', _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _community_id uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of post_id or comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT community_id INTO _community_id FROM community_posts WHERE id = _post_id;
  ELSE
    SELECT p.community_id INTO _community_id FROM community_comments c
    JOIN community_posts p ON p.id = c.post_id WHERE c.id = _comment_id;
  END IF;

  IF _community_id IS NULL THEN RAISE EXCEPTION 'Target not found'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  INSERT INTO community_reports (community_id, reporter_id, post_id, comment_id, reason, notes)
  VALUES (_community_id, auth.uid(), _post_id, _comment_id, _reason, _notes)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_moderate(
  _post_id uuid DEFAULT NULL, _comment_id uuid DEFAULT NULL,
  _action text DEFAULT 'hide',
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _community_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _action NOT IN ('hide','unhide','delete','pin','unpin') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of post_id or comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT community_id INTO _community_id FROM community_posts WHERE id = _post_id;
  ELSE
    SELECT p.community_id INTO _community_id FROM community_comments c
    JOIN community_posts p ON p.id = c.post_id WHERE c.id = _comment_id;
  END IF;

  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;

  IF _post_id IS NOT NULL THEN
    IF _action = 'hide'    THEN UPDATE community_posts SET hidden = true,  updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'unhide'  THEN UPDATE community_posts SET hidden = false, updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'delete'  THEN DELETE FROM community_posts WHERE id = _post_id; END IF;
    IF _action = 'pin'     THEN UPDATE community_posts SET pinned = true,  updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'unpin'   THEN UPDATE community_posts SET pinned = false, updated_at = now() WHERE id = _post_id; END IF;
  ELSE
    IF _action = 'hide'    THEN UPDATE community_comments SET hidden = true,  updated_at = now() WHERE id = _comment_id; END IF;
    IF _action = 'unhide'  THEN UPDATE community_comments SET hidden = false, updated_at = now() WHERE id = _comment_id; END IF;
    IF _action = 'delete'  THEN DELETE FROM community_comments WHERE id = _comment_id; END IF;
  END IF;

  PERFORM _record_audit(
    'community.moderate.' || _action,
    CASE WHEN _post_id IS NOT NULL THEN 'community_post' ELSE 'community_comment' END,
    coalesce(_post_id::text, _comment_id::text),
    jsonb_build_object('community_id', _community_id, 'reason', _reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_set_member_status(
  _community_id uuid, _user_id uuid, _status text, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _status NOT IN ('active','suspended','banned') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;
  UPDATE community_members SET status = _status
  WHERE community_id = _community_id AND user_id = _user_id;

  PERFORM _record_audit(
    'community.member.' || _status,
    'community_member',
    _user_id::text,
    jsonb_build_object('community_id', _community_id, 'reason', _reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_report(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_moderate(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_set_member_status(uuid, uuid, text, text) TO authenticated;

-- ── 12. Polls RPCs ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_create_poll(
  _community_id uuid, _question text, _options jsonb,
  _multi boolean DEFAULT false, _closes_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _post_id uuid; _poll_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;
  IF jsonb_array_length(_options) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 options';
  END IF;

  INSERT INTO community_posts (community_id, author_id, type, title, body_md)
  VALUES (_community_id, auth.uid(), 'poll', _question, '')
  RETURNING id INTO _post_id;

  INSERT INTO community_polls (post_id, multi, options, closes_at)
  VALUES (_post_id, _multi, _options, _closes_at)
  RETURNING id INTO _poll_id;

  RETURN _post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_vote(_poll_id uuid, _option_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _multi boolean; _closes_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT multi, closes_at INTO _multi, _closes_at FROM community_polls WHERE id = _poll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll not found'; END IF;
  IF _closes_at IS NOT NULL AND _closes_at < now() THEN
    RAISE EXCEPTION 'Poll closed';
  END IF;

  IF NOT _multi THEN
    DELETE FROM community_poll_votes WHERE poll_id = _poll_id AND user_id = auth.uid();
  END IF;

  INSERT INTO community_poll_votes (poll_id, user_id, option_id)
  VALUES (_poll_id, auth.uid(), _option_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_create_poll(uuid, text, jsonb, boolean, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_vote(uuid, text)                                     TO authenticated;

-- ── 13. Calendar view (events + sessions joined to community) ───────────────
CREATE OR REPLACE VIEW public.community_calendar AS
WITH base AS (
  -- events
  SELECT c.id AS community_id,
         e.id::text AS item_id,
         'event'::text AS kind,
         e.title,
         e.date AS starts_at,
         COALESCE(e.end_date, e.date) AS ends_at,
         e.location,
         e.slug AS event_slug,
         NULL::text AS session_id
  FROM communities c
  LEFT JOIN events e ON c.event_id = e.id OR (c.kind = 'parent' AND e.org_id IS NOT NULL AND e.org_id = c.org_id)
  WHERE e.id IS NOT NULL
  UNION ALL
  -- sessions belonging to event communities
  SELECT c.id AS community_id,
         s.id::text AS item_id,
         'session'::text AS kind,
         s.title,
         s.start_time AS starts_at,
         s.end_time   AS ends_at,
         s.location,
         e.slug AS event_slug,
         s.id::text AS session_id
  FROM communities c
  JOIN events e ON e.id = c.event_id
  JOIN sessions s ON s.event_id = e.id
)
SELECT * FROM base;

GRANT SELECT ON public.community_calendar TO authenticated, anon;

-- ── 14. Search RPC ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_search(_q text, _community_id uuid DEFAULT NULL, _limit int DEFAULT 30)
RETURNS TABLE(
  kind text, id uuid, community_id uuid, title text, snippet text, score real, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'post'::text, p.id, p.community_id,
         COALESCE(p.title, substring(p.body_md from 1 for 60)) AS title,
         substring(p.body_md from 1 for 200) AS snippet,
         ts_rank(p.ts_search, websearch_to_tsquery('simple', _q)) AS score,
         p.created_at
  FROM community_posts p
  WHERE (NOT p.hidden)
    AND p.ts_search @@ websearch_to_tsquery('simple', _q)
    AND (_community_id IS NULL OR p.community_id = _community_id)
    AND (
      is_community_member(auth.uid(), p.community_id)
      OR has_role(auth.uid(),'admin'::app_role)
    )
  UNION ALL
  SELECT 'community'::text, c.id, c.id,
         c.name, COALESCE(c.description,''),
         similarity(lower(c.name), lower(_q)),
         c.created_at
  FROM communities c
  WHERE (c.visibility = 'public' OR is_community_member(auth.uid(), c.id))
    AND (lower(c.name) LIKE '%' || lower(_q) || '%' OR lower(coalesce(c.description,'')) LIKE '%' || lower(_q) || '%')
  ORDER BY score DESC NULLS LAST, created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.community_search(text, uuid, int) TO authenticated;

-- ── 15. Leaderboard view ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.community_leaderboard AS
SELECT
  cm.community_id,
  cm.user_id,
  COALESCE(p.posts, 0)        AS posts,
  COALESCE(co.comments, 0)    AS comments,
  COALESCE(r.resources, 0)    AS resources,
  -- Points formula: post=5, comment=2, resource=20
  (COALESCE(p.posts, 0) * 5
   + COALESCE(co.comments, 0) * 2
   + COALESCE(r.resources, 0) * 20) AS points
FROM community_members cm
LEFT JOIN (
  SELECT community_id, author_id AS user_id, count(*) AS posts
  FROM community_posts WHERE NOT hidden GROUP BY community_id, author_id
) p ON p.community_id = cm.community_id AND p.user_id = cm.user_id
LEFT JOIN (
  SELECT cp.community_id, c.author_id AS user_id, count(*) AS comments
  FROM community_comments c JOIN community_posts cp ON cp.id = c.post_id
  WHERE NOT c.hidden
  GROUP BY cp.community_id, c.author_id
) co ON co.community_id = cm.community_id AND co.user_id = cm.user_id
LEFT JOIN (
  SELECT community_id, uploaded_by AS user_id, count(*) AS resources
  FROM community_resources GROUP BY community_id, uploaded_by
) r ON r.community_id = cm.community_id AND r.user_id = cm.user_id
WHERE cm.status = 'active';

GRANT SELECT ON public.community_leaderboard TO authenticated, anon;

-- ── 16. Realtime publications for new tables ────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_poll_votes') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_poll_votes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_connections') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_connections';
  END IF;
END $$;

ALTER TABLE public.community_messages    REPLICA IDENTITY FULL;
ALTER TABLE public.community_poll_votes  REPLICA IDENTITY FULL;
ALTER TABLE public.community_connections REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- Section: 006_community_notif_urls.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Community: relocate notification deep-links from /dashboard/community/...
-- to the new top-level /community/... URLs introduced when the area was made
-- standalone. Updates the three trigger functions that emit links.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._community_comments_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _post RECORD;
BEGIN
  SELECT id, author_id, community_id, COALESCE(title, substring(body_md from 1 for 60)) AS preview
    INTO _post
  FROM public.community_posts WHERE id = NEW.post_id;

  IF _post.author_id IS NOT NULL AND _post.author_id <> NEW.author_id THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (
      _post.author_id,
      'community.post.comment',
      'New comment on your post',
      coalesce(_post.preview,''),
      '/community/' ||
        coalesce((SELECT slug FROM public.communities WHERE id = _post.community_id), '') ||
        '/feed'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._community_announcement_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slug text;
BEGIN
  IF NEW.type <> 'announcement' THEN RETURN NEW; END IF;
  SELECT slug INTO _slug FROM public.communities WHERE id = NEW.community_id;

  INSERT INTO public.app_notifications(user_id, type, title, body, link)
  SELECT cm.user_id,
         'community.announcement',
         coalesce(NEW.title, 'New announcement'),
         substring(NEW.body_md from 1 for 140),
         '/community/' || coalesce(_slug,'') || '/announcements'
    FROM public.community_members cm
   WHERE cm.community_id = NEW.community_id
     AND cm.status = 'active'
     AND cm.user_id <> NEW.author_id
     AND cm.notify_push;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._community_connections_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.kind = 'connect' AND NEW.status = 'pending' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.target_id, 'community.connection.request', 'New connection request', NULL, '/community');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.requester_id, 'community.connection.accepted', 'Your connection was accepted', NULL, '/community');
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill any existing notification rows with /dashboard/community → /community
UPDATE public.app_notifications
SET link = regexp_replace(link, '^/dashboard/community', '/community')
WHERE link LIKE '/dashboard/community%';

-- ----------------------------------------------------------------------------
-- Section: 007_drop_leaderboard.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Community: remove the leaderboard feature.
-- ============================================================================

DROP VIEW IF EXISTS public.community_leaderboard;


-- ============================================================================
-- Section: 010_community_trigger_fix.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Fix `events.create_community` toggle so it actually creates the community
-- ----------------------------------------------------------------------------
-- The original update trigger (`_events_after_update_community` in
-- 006_event_extensions.sql) only ran `ensure_event_community` on a
-- FALSE → TRUE transition. Events created with the default
-- (`create_community = true`) before the INSERT trigger existed — or any case
-- where the INSERT trigger silently no-op'd — end up stuck:
--   * `create_community = true` so the settings UI shows "Community is active"
--   * but no row in `communities` for the event
--   * `community_resolve_event` returns NULL, so the Community tab shows
--     "No Community Setup" and saving the toggle / changing the category
--     never wires anything up because the trigger sees OLD = NEW = true and
--     skips the create branch entirely.
--
-- This migration:
--   1. Replaces `_events_after_update_community` with a defensive version
--      that calls `ensure_event_community` whenever `create_community = true`
--      (the helper is idempotent — returns the existing id if one exists).
--   2. Handles category change on an already-existing community.
--   3. Drops the community on toggle-off (unchanged behavior).
--   4. Backfills every event currently in the "should have a community but
--      doesn't" state.
-- ============================================================================

-- ── 1. Patched UPDATE trigger function
CREATE OR REPLACE FUNCTION public._events_after_update_community()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF NEW.create_community THEN
    -- Idempotent: returns the existing community id if one is already linked,
    -- otherwise creates it. This fixes the "toggle is on but no community"
    -- limbo state that pre-trigger events get stuck in.
    _comm_id := ensure_event_community(NEW.id);

    -- Sync the parent (industry) link when the category changes.
    IF _comm_id IS NOT NULL
       AND NEW.community_category IS DISTINCT FROM OLD.community_category THEN
      UPDATE communities
         SET parent_id = ensure_parent_community(
           _map_event_category_to_community(NEW.community_category)
         )
       WHERE event_id = NEW.id;
    END IF;
  ELSIF NOT NEW.create_community AND OLD.create_community THEN
    -- Toggle flipped off — remove the linked community.
    DELETE FROM communities WHERE event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged — only the function body changes.
DROP TRIGGER IF EXISTS events_after_update_community ON public.events;
CREATE TRIGGER events_after_update_community
AFTER UPDATE OF create_community, community_category ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_update_community();

-- ── 2. Backfill: create the missing community for every event whose toggle
--      is on but has no `communities` row yet.
DO $$
DECLARE
  _eid uuid;
BEGIN
  FOR _eid IN
    SELECT e.id
      FROM public.events e
     WHERE e.create_community = true
       AND NOT EXISTS (
         SELECT 1 FROM public.communities c WHERE c.event_id = e.id
       )
  LOOP
    PERFORM public.ensure_event_community(_eid);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 006_event_extensions.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Event extensions — series, site assets, application toggles, community link
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 008_event_series.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Event series + community carry-over
-- ----------------------------------------------------------------------------
-- Adds events.previous_event_id so an event can declare itself a follow-up
-- of an earlier event in the same org. When the new event's community is
-- created, all active members of the previous event's community are copied
-- in (preserving role).
-- Also adds an RPC for managers to change a member's role.
-- ============================================================================

-- ── 1. Schema ───────────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS previous_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_previous_event_idx
  ON public.events(previous_event_id) WHERE previous_event_id IS NOT NULL;

-- Validate previous_event_id rules: same org, no self-reference, no cycles.
CREATE OR REPLACE FUNCTION public._events_validate_previous()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _prev_org uuid;
  _hop uuid;
  _depth int := 0;
BEGIN
  IF NEW.previous_event_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.previous_event_id = NEW.id THEN
    RAISE EXCEPTION 'previous_event_id cannot reference the same event';
  END IF;

  SELECT org_id INTO _prev_org FROM public.events WHERE id = NEW.previous_event_id;
  IF _prev_org IS NULL THEN
    RAISE EXCEPTION 'previous_event_id references a missing event';
  END IF;
  IF NEW.org_id IS NOT NULL AND _prev_org IS NOT NULL AND NEW.org_id <> _prev_org THEN
    RAISE EXCEPTION 'previous_event_id must belong to the same organization';
  END IF;

  -- Walk the chain (cap at 50) to make sure we don't form a cycle.
  _hop := NEW.previous_event_id;
  WHILE _hop IS NOT NULL AND _depth < 50 LOOP
    IF _hop = NEW.id THEN
      RAISE EXCEPTION 'previous_event_id chain forms a cycle';
    END IF;
    SELECT previous_event_id INTO _hop FROM public.events WHERE id = _hop;
    _depth := _depth + 1;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_validate_previous ON public.events;
CREATE TRIGGER events_validate_previous
BEFORE INSERT OR UPDATE OF previous_event_id, org_id ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_validate_previous();

-- ── 2. Carry-over helper ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._copy_community_members_from_previous(
  _new_community_id uuid,
  _previous_event_id uuid
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prev_community_id uuid;
  _copied int := 0;
BEGIN
  IF _previous_event_id IS NULL THEN RETURN 0; END IF;

  SELECT id INTO _prev_community_id
    FROM communities
   WHERE event_id = _previous_event_id
   LIMIT 1;
  IF _prev_community_id IS NULL THEN RETURN 0; END IF;

  WITH ins AS (
    INSERT INTO community_members (community_id, user_id, role, status, auto, notify_push)
    SELECT _new_community_id, cm.user_id, cm.role, 'active', true, false
      FROM community_members cm
     WHERE cm.community_id = _prev_community_id
       AND cm.status = 'active'
    ON CONFLICT (community_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _copied FROM ins;

  RETURN _copied;
END;
$$;

-- ── 3. Extend ensure_event_community to do carry-over ───────────────────────
CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing uuid;
  _evt RECORD;
  _parent_id uuid;
  _new_id uuid;
  _slug text;
  _base_slug text;
  _i int := 0;
  _carried int := 0;
  _prev_title text;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id, e.previous_event_id,
         COALESCE(NULL, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  _parent_id := ensure_parent_community(_map_event_category_to_community('other'));

  _base_slug := community_slugify(_evt.slug || '-community');
  IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base_slug || '-' || _i;
  END LOOP;

  INSERT INTO communities (
    kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
  ) VALUES (
    'event', _parent_id, _evt.id, _evt.org_id, _slug,
    _evt.title || ' — Community',
    'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
    'members_only',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Series carry-over: pull active members from the predecessor's community.
  IF _evt.previous_event_id IS NOT NULL THEN
    _carried := _copy_community_members_from_previous(_new_id, _evt.previous_event_id);

    IF _carried > 0 THEN
      SELECT title INTO _prev_title FROM events WHERE id = _evt.previous_event_id;
      INSERT INTO community_posts (community_id, author_id, type, title, body_md)
      VALUES (
        _new_id,
        _evt.user_id,
        'event_update',
        '👋 Welcome back',
        'This community continues from **' || coalesce(_prev_title, 'a previous event')
          || '**. We''ve carried ' || _carried::text || ' member'
          || CASE WHEN _carried = 1 THEN '' ELSE 's' END
          || ' over so the conversation can keep going.'
      );
    END IF;
  END IF;

  RETURN _new_id;
END;
$$;

-- ── 4. Re-sync RPC (manual carry-over for late changes) ─────────────────────
-- If an organizer sets / changes previous_event_id after the community is
-- already created, they can call this to do the copy explicitly.
CREATE OR REPLACE FUNCTION public.community_resync_from_previous(_event_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _community_id uuid;
  _previous uuid;
  _copied int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT id INTO _community_id FROM communities WHERE event_id = _event_id;
  IF _community_id IS NULL THEN RAISE EXCEPTION 'No community for this event'; END IF;

  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT previous_event_id INTO _previous FROM events WHERE id = _event_id;
  IF _previous IS NULL THEN RETURN 0; END IF;

  _copied := _copy_community_members_from_previous(_community_id, _previous);
  RETURN _copied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_resync_from_previous(uuid) TO authenticated;

-- ── 5. Member role change RPC (manager-only) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_set_member_role(
  _community_id uuid, _user_id uuid, _role community_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _viewer_role community_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  _viewer_role := community_role_of(auth.uid(), _community_id);
  IF _viewer_role IS DISTINCT FROM 'manager' AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only managers can change member roles';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use the leave action to change your own role';
  END IF;

  UPDATE community_members
     SET role = _role
   WHERE community_id = _community_id AND user_id = _user_id;

  PERFORM _record_audit(
    'community.member.role',
    'community_member',
    _user_id::text,
    jsonb_build_object('community_id', _community_id, 'role', _role::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_set_member_role(uuid, uuid, community_role) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 008_site_assets_org_upload.sql
-- ----------------------------------------------------------------------------
-- Migration: Allow authenticated org members (owners & admins) to upload to site-assets
-- Previously only users with the global "admin" role could upload.
-- Now any authenticated user who belongs to at least one org (i.e. has a row in
-- org_members) can upload/update/delete, which covers the Landing Page branding
-- fields and the Event Quick-Create banner pickers.

-- Drop the old admin-only upload policies
DROP POLICY IF EXISTS "Admin upload site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin update site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete site-assets" ON storage.objects;

-- Allow any authenticated user to upload to site-assets
CREATE POLICY "Authenticated upload site-assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-assets');

-- Allow an authenticated user to update objects they originally uploaded
-- (owner = auth.uid()::text matches the first segment of the storage path, or we just allow all authenticated)
CREATE POLICY "Authenticated update site-assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- Allow an authenticated user to delete objects they own
CREATE POLICY "Authenticated delete site-assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- ----------------------------------------------------------------------------
-- Section: 009_application_toggles.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 009_application_toggles.sql
--
-- Adds per-event enable/disable flags for the public Call-for-Speakers and
-- Call-for-Sponsors CTAs. Organisers and platform admins toggle these from
-- the event Settings tab to open or close applications without having to
-- unpublish the event.
--
-- Behaviour
--   * Both columns default to TRUE so every existing event keeps its current
--     behaviour (CTAs visible) without needing a backfill.
--   * The frontend hides the corresponding CTA when its flag is FALSE.
--   * Existing speaker_applications / sponsor_applications rows are
--     untouched; this migration only gates new submissions.
--
-- Reversibility: drop the two columns to revert. No data loss because nothing
-- else references them yet.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS speaker_applications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sponsor_applications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.speaker_applications_enabled IS
  'When false, the public event page hides the "Apply as Speaker" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';

COMMENT ON COLUMN public.events.sponsor_applications_enabled IS
  'When false, the public event page hides the "Become a Sponsor" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';

-- ----------------------------------------------------------------------------
-- Section: 009_event_community_options.sql
-- ----------------------------------------------------------------------------
-- Add community options to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS create_community boolean NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS community_category text DEFAULT 'other';

-- Update ensure_event_community to use the new category
CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing uuid;
  _evt RECORD;
  _parent_id uuid;
  _new_id uuid;
  _slug text;
  _base_slug text;
  _i int := 0;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id,
         COALESCE(e.community_category, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve category from event column
  _parent_id := ensure_parent_community(_map_event_category_to_community(_evt.category_text));

  _base_slug := community_slugify(_evt.slug || '-community');
  IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base_slug || '-' || _i;
  END LOOP;

  INSERT INTO communities (
    kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
  ) VALUES (
    'event', _parent_id, _evt.id, _evt.org_id, _slug,
    _evt.title || ' — Community',
    'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
    'public',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Increment member count for the newly created event community
  UPDATE communities SET member_count = member_count + 1 WHERE id = _new_id;

  RETURN _new_id;
END;
$$;

-- Update INSERT trigger function to respect create_community flag
CREATE OR REPLACE FUNCTION public._events_after_insert_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
  _parent_id uuid;
BEGIN
  IF NOT NEW.create_community THEN RETURN NEW; END IF;

  _comm_id := ensure_event_community(NEW.id);
  IF _comm_id IS NULL THEN RETURN NEW; END IF;

  SELECT parent_id INTO _parent_id FROM communities WHERE id = _comm_id;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO community_posts (community_id, author_id, type, title, body_md)
    VALUES (
      _parent_id,
      NEW.user_id,
      'event_update',
      '🚀 New event: ' || NEW.title,
      'A new event has been added to the community: **' || NEW.title || '**.'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Add UPDATE trigger function to handle changes from settings
CREATE OR REPLACE FUNCTION public._events_after_update_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF NEW.create_community AND NOT OLD.create_community THEN
    -- Community was enabled. Ensure it exists.
    _comm_id := ensure_event_community(NEW.id);
  ELSIF NOT NEW.create_community AND OLD.create_community THEN
    -- Community was disabled. We will delete it.
    DELETE FROM communities WHERE event_id = NEW.id;
  ELSIF NEW.create_community AND NEW.community_category IS DISTINCT FROM OLD.community_category THEN
    -- Category changed. Update the parent_id of the community.
    UPDATE communities 
    SET parent_id = ensure_parent_community(_map_event_category_to_community(NEW.community_category))
    WHERE event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_after_update_community ON public.events;
CREATE TRIGGER events_after_update_community
AFTER UPDATE OF create_community, community_category ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_update_community();


-- ============================================================================
-- Section: 009_tickets_sold_trigger.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Maintain `events.tickets_sold` automatically from `registrations`
-- ----------------------------------------------------------------------------
-- The `events.tickets_sold` column has existed since 001_tables but no trigger
-- ever populated it, so the organizer dashboard's event card and the Tickets
-- page have always shown 0/N tickets even after attendees register. The public
-- RSVP card sidesteps this by computing capacity live from the `registrations`
-- table on every render (see src/components/EventRsvpCard.tsx), but organizer
-- surfaces read the column directly and have no realtime fallback.
--
-- This migration:
--   1. Adds `_recompute_tickets_sold(event_id)` — single-event recount helper.
--   2. Adds a trigger on `registrations` that calls the helper after
--      INSERT / DELETE / UPDATE of any field that affects the count
--      (`status`, `approval_status`, `event_id`).
--   3. Backfills `tickets_sold` for every event using the same predicate so
--      existing rows are correct on day one.
--
-- "Sold" predicate matches what EventRsvpCard.tsx and the communications
-- resolver in 007_communications.sql already use:
--     status <> 'cancelled'
--     AND COALESCE(approval_status, 'approved') NOT IN ('declined','waitlisted')
-- i.e. confirmed seats only — no cancellations, declines, or waitlist.
-- ============================================================================

-- ── 1. Single-event recount helper
CREATE OR REPLACE FUNCTION public._recompute_tickets_sold(_eid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
     SET tickets_sold = COALESCE((
           SELECT count(*)
             FROM public.registrations r
            WHERE r.event_id = _eid
              AND r.status <> 'cancelled'
              AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
         ), 0)
   WHERE e.id = _eid;
END;
$$;

-- ── 2. Trigger function — handles INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION public._registrations_tickets_sold_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    -- Registration moved between events; recount both.
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  ELSE
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS registrations_tickets_sold_trg ON public.registrations;
CREATE TRIGGER registrations_tickets_sold_trg
AFTER INSERT OR DELETE OR UPDATE OF status, approval_status, event_id
ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._registrations_tickets_sold_trg();

-- ── 3. Backfill all existing events so day-one numbers are correct.
UPDATE public.events e
   SET tickets_sold = COALESCE((
         SELECT count(*)
           FROM public.registrations r
          WHERE r.event_id = e.id
            AND r.status <> 'cancelled'
            AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
       ), 0);

-- ────────────────────────────────────────────────────────────
-- 007_communications.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Communications — schema, scheduling, WhatsApp, render pipeline, RBAC, grants
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 009_communications.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 1 — Unified communications module
-- ----------------------------------------------------------------------------
-- Replaces the per-event email-only flow with a multi-channel communications
-- model. Phase 1 ships email-only; the schema is shaped so WhatsApp and
-- scheduling slot in cleanly later (channels jsonb, scheduled_for column,
-- per-recipient delivery rows already split by channel).
--
--   communications              ← compose-once envelope (subject, body, filter)
--   communication_recipients    ← per-recipient delivery rows (status by channel)
--
-- Authorisation model: only org_members of the event's org (or admins) can
-- create / view / dispatch communications. Recipients themselves don't read
-- this table — their delivery surface is the email/WhatsApp message itself.
-- ============================================================================

-- ── 1. Communications envelope ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES public.events(id) ON DELETE CASCADE,
  community_id    uuid,        -- reserved for community-scoped sends (Phase 5)

  -- Channels: array of {'email','whatsapp'}. Phase 1 only inserts {'email'}
  -- but the column can already hold the multi-channel value.
  channels        text[] NOT NULL DEFAULT ARRAY['email']::text[],

  -- Recipient filter config (json so the client can describe complex
  -- targeting without us having to migrate the schema for every new filter).
  -- Shape:
  --   { "types": ["all_attendees"|"checked_in"|"paid"|"speakers"|"sponsors"|"custom"],
  --     "user_ids": ["..."] }
  recipient_filter jsonb NOT NULL DEFAULT '{"types":["all_attendees"]}'::jsonb,

  -- Content
  subject         text NOT NULL,
  body_text       text NOT NULL DEFAULT '',
  body_html       text,

  -- State machine
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','queued','sending','sent','failed')),
  scheduled_for   timestamptz,         -- null = send immediately on dispatch

  -- Stats (denormalised to avoid recomputing on every list render)
  recipient_count int NOT NULL DEFAULT 0,
  sent_count      int NOT NULL DEFAULT 0,
  failed_count    int NOT NULL DEFAULT 0,

  -- Audit
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,

  CONSTRAINT communications_channels_nonempty
    CHECK (array_length(channels, 1) >= 1),
  CONSTRAINT communications_subject_nonempty
    CHECK (length(trim(subject)) > 0)
);

CREATE INDEX IF NOT EXISTS communications_org_idx
  ON public.communications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communications_event_idx
  ON public.communications(event_id, created_at DESC) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS communications_status_idx
  ON public.communications(status, scheduled_for) WHERE status IN ('draft','scheduled','queued');

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view communications" ON public.communications;
CREATE POLICY "Org members view communications" ON public.communications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Org members insert communications" ON public.communications;
CREATE POLICY "Org members insert communications" ON public.communications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members update communications" ON public.communications;
CREATE POLICY "Org members update communications" ON public.communications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Org members delete communications" ON public.communications;
CREATE POLICY "Org members delete communications" ON public.communications
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications TO authenticated;


-- ── 2. Per-recipient delivery rows ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communication_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id    uuid NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,

  -- Recipient identity (denormalised so the row remains useful even if the
  -- profile is deleted later or the user wasn't a registered member).
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email               text,
  phone               text,
  name                text,

  -- Per-channel status (null = channel not used for this comm)
  email_status        text CHECK (email_status IN
                          ('pending','sending','sent','delivered','opened','clicked','bounced','failed')),
  whatsapp_status     text CHECK (whatsapp_status IN
                          ('pending','sending','sent','delivered','read','failed')),

  email_sent_at       timestamptz,
  email_delivered_at  timestamptz,
  email_opened_at     timestamptz,
  email_clicked_at    timestamptz,
  whatsapp_sent_at    timestamptz,
  whatsapp_delivered_at timestamptz,
  whatsapp_read_at    timestamptz,

  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_recipients_comm_idx
  ON public.communication_recipients(communication_id);
CREATE INDEX IF NOT EXISTS comm_recipients_user_idx
  ON public.communication_recipients(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.communication_recipients ENABLE ROW LEVEL SECURITY;

-- Org members of the parent communication can view delivery rows.
DROP POLICY IF EXISTS "Org members view comm recipients" ON public.communication_recipients;
CREATE POLICY "Org members view comm recipients" ON public.communication_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.communications c
        JOIN public.org_members om ON om.org_id = c.org_id
       WHERE c.id = communication_recipients.communication_id
         AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON public.communication_recipients TO authenticated;
-- Inserts/updates happen exclusively through the dispatch RPC (SECURITY DEFINER),
-- so we don't expose write policies to the authenticated role.


-- ── 3. Recipient resolution helper (used by both preview + dispatch) ────────
-- Returns one row per addressable recipient. Email/phone may be null for some
-- types so the caller can decide what to do per channel.
CREATE OR REPLACE FUNCTION public.communications_resolve_recipients(
  _event_id uuid,
  _filter   jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  -- Defensive parsing: never trust client-supplied jsonb.
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: caller must be an org_member of the event's org, or admin.
  IF _event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM events e
        JOIN org_members om ON om.org_id = e.org_id
       WHERE e.id = _event_id AND om.user_id = auth.uid()
    ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Not authorised to read recipients for this event';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    -- All confirmed (non-cancelled, non-declined) registrations.
    SELECT r.user_id,
           COALESCE(NULLIF(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                    r.name, split_part(r.email,'@',1)) AS name,
           lower(r.email) AS email,
           NULLIF(trim(coalesce(r.mobile_country_code,'') || ' ' || coalesce(r.mobile_number,'')), '') AS phone,
           COALESCE(r.attendance_state, 'never') AS attendance_state,
           COALESCE(r.amount_paid, 0)::numeric AS amount_paid
      FROM registrations r
     WHERE r.event_id = _event_id
       AND r.status <> 'cancelled'
       AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
  ),
  speakers_set AS (
    SELECT s.user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    SELECT NULL::uuid AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''),
                    split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  filtered_attendees AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE
       (
         'all_attendees' = ANY(_types)
       )
       OR (
         'checked_in' = ANY(_types) AND b.attendance_state IN ('inside','outside')
       )
       OR (
         'paid' = ANY(_types) AND b.amount_paid > 0
       )
  ),
  custom_set AS (
    -- Custom user_ids: pull whatever profile/registration data we have.
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types) AND b.user_id = ANY(_user_ids)
  ),
  all_recipients AS (
    SELECT user_id, name, email, phone FROM filtered_attendees
    UNION
    SELECT user_id, name, email, phone FROM custom_set
    UNION ALL
    SELECT user_id, name, email, phone FROM speakers_set
     WHERE 'speakers' = ANY(_types)
    UNION ALL
    SELECT user_id, name, email, phone FROM sponsors_set
     WHERE 'sponsors' = ANY(_types)
  )
  -- Final dedup by lower(email) — same human shouldn't be hit twice if they
  -- happen to be both a speaker and a paid attendee.
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.communications_resolve_recipients(uuid, jsonb) TO authenticated;


-- ── 4. Dispatch RPC ─────────────────────────────────────────────────────────
-- Resolves recipients, materialises per-recipient delivery rows, and flips
-- the parent communication's status to `sent`. Email provider integration
-- is layered on top of this (an edge function reads the recipient rows and
-- ships them out); for Phase 1 the recipient rows are pre-stamped with
-- `email_status='sent'` so the UI shows accurate counts even before the
-- provider is wired.
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  -- Authorisation: org member of comm.org_id, or admin.
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch communications for this org';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  -- Mark sending so the UI can disable controls during the (sub-second) window.
  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fan out recipients. Phase 1: stamp email rows as sent immediately; Phase 2
  -- will leave them at 'pending' and let the worker advance them.
  WITH resolved AS (
    SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
  ),
  inserted AS (
    INSERT INTO communication_recipients (
      communication_id, user_id, email, phone, name,
      email_status, email_sent_at,
      whatsapp_status
    )
    SELECT _communication_id,
           r.user_id,
           r.email,
           r.phone,
           r.name,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
           CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
      FROM resolved r
    RETURNING 1
  )
  SELECT count(*) INTO _recipient_count FROM inserted;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- ── 5. Updated_at trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._communications_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communications_set_updated_at ON public.communications;
CREATE TRIGGER communications_set_updated_at
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public._communications_set_updated_at();

-- ── 6. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'communications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communications';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'communication_recipients'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_recipients';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section: 010_communications_schedule.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 2 — Communications scheduling + worker
-- ----------------------------------------------------------------------------
-- Lets organizers schedule a draft instead of sending immediately. A pg_cron
-- job ticks every minute and fan-outs any scheduled communications whose
-- send time has arrived.
--
-- Authorisation model:
--   - User-facing scheduling goes through `communications_schedule()` (RLS
--     update would also work but we wrap it so we can validate state +
--     scheduled_for in one place).
--   - The cron worker runs as the table owner (SECURITY DEFINER) and bypasses
--     `auth.uid()` checks via the new `_communications_dispatch_impl()` helper.
-- ============================================================================

-- ── 1. Refactor: extract dispatch core into an internal helper ─────────────
-- The user-facing `communications_dispatch()` already validates auth. The
-- worker has no auth context, so we move the actual fan-out into a private
-- impl function and have both callers wrap it.
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  WITH resolved AS (
    SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
  ),
  inserted AS (
    INSERT INTO communication_recipients (
      communication_id, user_id, email, phone, name,
      email_status, email_sent_at,
      whatsapp_status
    )
    SELECT _communication_id,
           r.user_id,
           r.email,
           r.phone,
           r.name,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
           CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
      FROM resolved r
    RETURNING 1
  )
  SELECT count(*) INTO _recipient_count FROM inserted;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- User-facing dispatch keeps the same signature; just delegates after auth.
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT org_id INTO _org_id FROM communications WHERE id = _communication_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch communications for this org';
  END IF;

  RETURN _communications_dispatch_impl(_communication_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- ── 2. Schedule RPC ─────────────────────────────────────────────────────────
-- Persists a future send time and flips the status to `scheduled`. The cron
-- worker picks it up once `scheduled_for <= now()`.
CREATE OR REPLACE FUNCTION public.communications_schedule(
  _communication_id uuid,
  _scheduled_for    timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _scheduled_for IS NULL THEN RAISE EXCEPTION 'scheduled_for is required'; END IF;
  IF _scheduled_for <= now() THEN
    RAISE EXCEPTION 'scheduled_for must be in the future';
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be scheduled', _comm.status;
  END IF;

  UPDATE communications
     SET status        = 'scheduled',
         scheduled_for = _scheduled_for,
         updated_at    = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_schedule(uuid, timestamptz) TO authenticated;

-- Cancel a schedule (drops back to draft so the user can edit it again).
CREATE OR REPLACE FUNCTION public.communications_unschedule(_communication_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Communication is not scheduled';
  END IF;

  UPDATE communications
     SET status        = 'draft',
         scheduled_for = NULL,
         updated_at    = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_unschedule(uuid) TO authenticated;

-- ── 3. Duplicate RPC ────────────────────────────────────────────────────────
-- Clones a communication (sent or draft) into a fresh draft so the organizer
-- can tweak and resend. Stats / sent_at / scheduled_for / status are reset.
CREATE OR REPLACE FUNCTION public.communications_duplicate(_communication_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO communications (
    org_id, event_id, community_id, channels, recipient_filter,
    subject, body_text, body_html, status, created_by
  )
  VALUES (
    _comm.org_id, _comm.event_id, _comm.community_id,
    _comm.channels, _comm.recipient_filter,
    'Copy of ' || _comm.subject,
    _comm.body_text, _comm.body_html,
    'draft', auth.uid()
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_duplicate(uuid) TO authenticated;


-- ── 4. Cron worker ──────────────────────────────────────────────────────────
-- Picks up to 50 scheduled communications whose send time has arrived and
-- runs each through the dispatch impl. Failures are recorded on the row so
-- the organizer can retry from the UI.
CREATE OR REPLACE FUNCTION public.communications_run_scheduled()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm RECORD;
  _processed int := 0;
BEGIN
  FOR _comm IN
    SELECT id FROM communications
     WHERE status = 'scheduled' AND scheduled_for <= now()
     ORDER BY scheduled_for ASC
     LIMIT 50
  LOOP
    BEGIN
      PERFORM _communications_dispatch_impl(_comm.id);
      _processed := _processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE communications
         SET status = 'failed',
             updated_at = now()
       WHERE id = _comm.id;
      RAISE WARNING 'Failed to dispatch scheduled communication %: %', _comm.id, SQLERRM;
    END;
  END LOOP;
  RETURN _processed;
END;
$$;

-- The worker is intentionally NOT exposed to authenticated callers — only the
-- pg_cron job (which runs as table owner via SECURITY DEFINER) should call it.

-- ── 5. pg_cron schedule (best-effort) ───────────────────────────────────────
-- Registers the cron job if pg_cron is available. If the extension hasn't
-- been enabled yet, the migration logs a NOTICE and continues — the user can
-- enable pg_cron in Dashboard → Database → Extensions and re-run, or call
-- `communications_run_scheduled()` manually until then.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior version of this job (idempotent re-run).
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communications-tick') THEN
      PERFORM cron.unschedule('communications-tick');
    END IF;

    PERFORM cron.schedule(
      'communications-tick',
      '* * * * *',
      $cron$ SELECT public.communications_run_scheduled() $cron$
    );
    RAISE NOTICE 'Scheduled communications-tick to run every minute via pg_cron';
  ELSE
    RAISE NOTICE 'pg_cron is not installed — communications-tick is not scheduled. Enable pg_cron in the Supabase dashboard, then re-run this migration.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section: 011_communications_resolver_fix.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Hotfix for Phase 1 — sponsor column names
-- ----------------------------------------------------------------------------
-- The first cut of `communications_resolve_recipients` referenced
-- `sponsors.contact_name` / `sponsors.contact_email`, which don't exist in
-- this schema. The actual sponsor table only has `name` and `email`.
-- This migration replaces the function with the corrected version. No data
-- changes; nothing else in 009/010 needs to be re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.communications_resolve_recipients(
  _event_id uuid,
  _filter   jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  IF _event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM events e
        JOIN org_members om ON om.org_id = e.org_id
       WHERE e.id = _event_id AND om.user_id = auth.uid()
    ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Not authorised to read recipients for this event';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.user_id,
           COALESCE(NULLIF(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                    r.name, split_part(r.email,'@',1)) AS name,
           lower(r.email) AS email,
           NULLIF(trim(coalesce(r.mobile_country_code,'') || ' ' || coalesce(r.mobile_number,'')), '') AS phone,
           COALESCE(r.attendance_state, 'never') AS attendance_state,
           COALESCE(r.amount_paid, 0)::numeric AS amount_paid
      FROM registrations r
     WHERE r.event_id = _event_id
       AND r.status <> 'cancelled'
       AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
  ),
  speakers_set AS (
    SELECT s.user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    -- Sponsors table only has `name` + `email` (no contact_* split).
    SELECT NULL::uuid AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''),
                    split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  filtered_attendees AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE
       (
         'all_attendees' = ANY(_types)
       )
       OR (
         'checked_in' = ANY(_types) AND b.attendance_state IN ('inside','outside')
       )
       OR (
         'paid' = ANY(_types) AND b.amount_paid > 0
       )
  ),
  custom_set AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types) AND b.user_id = ANY(_user_ids)
  ),
  all_recipients AS (
    SELECT user_id, name, email, phone FROM filtered_attendees
    UNION
    SELECT user_id, name, email, phone FROM custom_set
    UNION ALL
    SELECT user_id, name, email, phone FROM speakers_set
     WHERE 'speakers' = ANY(_types)
    UNION ALL
    SELECT user_id, name, email, phone FROM sponsors_set
     WHERE 'sponsors' = ANY(_types)
  )
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

-- ----------------------------------------------------------------------------
-- Section: 012_communications_whatsapp.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 3 — WhatsApp Business Cloud API integration
-- ----------------------------------------------------------------------------
-- WhatsApp's Cloud API forces template-based delivery for any message sent
-- outside an active 24-hour customer-care window. Event organizers are
-- almost always reaching out proactively, so we standardise on templates
-- across the platform.
--
-- This migration adds:
--   - whatsapp_templates       — local cache of approved templates per org
--   - communications.whatsapp_template_name / language / variables — what
--     to send when the comm's channel array includes 'whatsapp'.
--
-- The actual HTTP calls to Meta live in the `send-whatsapp` edge function;
-- delivery/read callbacks land at `whatsapp-webhook`. Both update the
-- communication_recipients row's whatsapp_* fields directly.
-- ============================================================================

-- ── 1. Cached registry of approved templates ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Meta's template identifiers
  name            text NOT NULL,
  language        text NOT NULL,           -- e.g. "en", "en_US", "hi"
  category        text,                    -- MARKETING / UTILITY / AUTHENTICATION
  status          text NOT NULL DEFAULT 'APPROVED'
                    CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED')),
  -- Raw `components` array from Meta. We don't try to model header/body/buttons
  -- in columns — the UI parses the JSON to render variable inputs.
  components      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Convenience: list of placeholder variable counts per component, derived
  -- from `components` at sync time. Lets the UI render variable inputs without
  -- re-parsing.
  variable_count  int NOT NULL DEFAULT 0,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, name, language)
);

CREATE INDEX IF NOT EXISTS whatsapp_templates_org_idx
  ON public.whatsapp_templates(org_id, status);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Org members view whatsapp templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = whatsapp_templates.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Inserts/updates happen via the sync edge function (service role) — no
-- client-side write policy. The user_facing read policy is enough.
GRANT SELECT ON public.whatsapp_templates TO authenticated;

-- ── 2. Add WhatsApp template fields to communications ──────────────────────
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS whatsapp_template_name     text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_language text DEFAULT 'en',
  -- jsonb array of { component: "body" | "header", values: ["v1","v2"] }
  -- — flexible enough to cover header substitutions when those are used.
  ADD COLUMN IF NOT EXISTS whatsapp_template_variables jsonb DEFAULT '{}'::jsonb;

-- Constraint: if 'whatsapp' is in the channels array, a template must be set.
-- We enforce this at the application layer rather than via CHECK so drafts
-- without templates can still exist while the user is composing.

-- ── 3. RPC: list approved templates for an org ─────────────────────────────
-- Convenience wrapper so the UI can pass an org_id without leaking other
-- columns from the table.
CREATE OR REPLACE FUNCTION public.whatsapp_templates_list(_org_id uuid)
RETURNS TABLE (
  name text,
  language text,
  category text,
  status text,
  variable_count int,
  components jsonb,
  synced_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, t.language, t.category, t.status, t.variable_count, t.components, t.synced_at
    FROM whatsapp_templates t
   WHERE t.org_id = _org_id
     AND t.status = 'APPROVED'
   ORDER BY t.name, t.language;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid) TO authenticated;

-- ── 4. Internal helper used by the edge function to mark recipient status ──
-- The edge function runs with service role so it could write directly, but
-- centralising the update in an RPC keeps the constraint logic in one place.
CREATE OR REPLACE FUNCTION public._whatsapp_recipient_update(
  _recipient_id uuid,
  _status       text,
  _error        text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('pending','sending','sent','delivered','read','failed') THEN
    RAISE EXCEPTION 'Invalid whatsapp status: %', _status;
  END IF;

  UPDATE communication_recipients
     SET whatsapp_status      = _status,
         whatsapp_sent_at     = CASE WHEN _status = 'sent'      AND whatsapp_sent_at      IS NULL THEN now() ELSE whatsapp_sent_at      END,
         whatsapp_delivered_at = CASE WHEN _status = 'delivered' AND whatsapp_delivered_at IS NULL THEN now() ELSE whatsapp_delivered_at END,
         whatsapp_read_at     = CASE WHEN _status = 'read'      AND whatsapp_read_at      IS NULL THEN now() ELSE whatsapp_read_at      END,
         error_message        = COALESCE(_error, error_message)
   WHERE id = _recipient_id;
END;
$$;

-- service-role-only; we don't grant to authenticated.

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_templates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section: 013_communications_community.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 5 — Community integration + role-based gating + retry
-- ----------------------------------------------------------------------------
-- This migration:
--   1. Lets community managers / moderators compose communications scoped to
--      a community (event_id NULL, community_id NOT NULL).
--   2. Adds a community-scoped recipient resolver mirroring the event one.
--   3. Teaches `_communications_dispatch_impl` to pick the right resolver
--      based on which scope the comm has set.
--   4. Adds a "retry only failed recipients" RPC for partial-failure recovery
--      (typically a few WhatsApp recipients failing inside an otherwise sent
--      communication).
-- ============================================================================

-- ── 1. Schema: connect community_id to communities ──────────────────────────
-- The original 009 migration declared community_id as plain uuid (no FK)
-- because the communities table was reserved for a later phase. Add the FK
-- now that the table exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'communications_community_id_fkey'
  ) THEN
    ALTER TABLE public.communications
      ADD CONSTRAINT communications_community_id_fkey
      FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS communications_community_idx
  ON public.communications(community_id, created_at DESC) WHERE community_id IS NOT NULL;

-- A communication must have exactly one scope: event_id XOR community_id.
-- This prevents accidental cross-pollination once we start dispatching.
ALTER TABLE public.communications
  DROP CONSTRAINT IF EXISTS communications_scope_check;
ALTER TABLE public.communications
  ADD  CONSTRAINT communications_scope_check
       CHECK (
         (event_id IS NOT NULL AND community_id IS NULL)
         OR (event_id IS NULL AND community_id IS NOT NULL)
       );

-- ── 2. RLS: extend org-member policies to include community managers ───────
-- The base policies from 009 already cover org members. Add parallel policies
-- so a community manager / moderator can manage comms scoped to their
-- community even if they aren't org_members of the parent org.
DROP POLICY IF EXISTS "Community managers view communications" ON public.communications;
CREATE POLICY "Community managers view communications" ON public.communications
  FOR SELECT TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers insert communications" ON public.communications;
CREATE POLICY "Community managers insert communications" ON public.communications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers update communications" ON public.communications;
CREATE POLICY "Community managers update communications" ON public.communications
  FOR UPDATE TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers delete communications" ON public.communications;
CREATE POLICY "Community managers delete communications" ON public.communications
  FOR DELETE TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

-- Recipient rows: same extension — community managers should be able to read
-- their own communication's delivery rows.
DROP POLICY IF EXISTS "Community managers view comm recipients" ON public.communication_recipients;
CREATE POLICY "Community managers view comm recipients" ON public.communication_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.communications c
       WHERE c.id = communication_recipients.communication_id
         AND c.community_id IS NOT NULL
         AND public.can_moderate_community(auth.uid(), c.community_id)
    )
  );


-- ── 3. Community recipient resolver ────────────────────────────────────────
-- Filter shape:
--   { "types": ["all_members"|"managers"|"moderators"|"organizers"|"mentors"|
--               "speakers"|"sponsors"|"custom"],
--     "user_ids": ["..."] }
--
-- Email comes from auth.users (profiles.email doesn't exist in this schema).
-- Phone comes from profiles.{mobile_country_code, mobile_number}.
CREATE OR REPLACE FUNCTION public.communications_resolve_community_recipients(
  _community_id uuid,
  _filter       jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: only managers / moderators / admins can read members.
  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised to read community members';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id,
           cm.role,
           COALESCE(
             NULLIF(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
             p.display_name,
             p.username,
             split_part(u.email,'@',1)
           ) AS name,
           lower(u.email) AS email,
           NULLIF(trim(coalesce(p.mobile_country_code,'') || ' ' || coalesce(p.mobile_number,'')), '') AS phone
      FROM community_members cm
      JOIN auth.users u ON u.id = cm.user_id
      LEFT JOIN profiles p ON p.user_id = cm.user_id
     WHERE cm.community_id = _community_id
       AND cm.status = 'active'
  ),
  filtered AS (
    SELECT b.user_id, b.name, b.email, b.phone, b.role
      FROM base b
     WHERE
       'all_members' = ANY(_types)
       OR ('managers'   = ANY(_types) AND b.role = 'manager'::community_role)
       OR ('moderators' = ANY(_types) AND b.role = 'moderator'::community_role)
       OR ('organizers' = ANY(_types) AND b.role = 'organizer'::community_role)
       OR ('mentors'    = ANY(_types) AND b.role = 'mentor'::community_role)
       OR ('speakers'   = ANY(_types) AND b.role = 'speaker'::community_role)
       OR ('sponsors'   = ANY(_types) AND b.role = 'sponsor'::community_role)
       OR ('custom'     = ANY(_types) AND b.user_id = ANY(_user_ids))
  )
  SELECT DISTINCT ON (lower(coalesce(f.email,'')))
         f.user_id, f.name, f.email, f.phone
    FROM filtered f
   WHERE f.email IS NOT NULL AND f.email <> ''
   ORDER BY lower(coalesce(f.email,'')), f.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.communications_resolve_community_recipients(uuid, jsonb) TO authenticated;

-- ── 4. Update dispatch impl to pick the right resolver ─────────────────────
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  -- Pick resolver based on scope (one of event_id / community_id is NOT NULL,
  -- enforced by communications_scope_check).
  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  ELSE
    WITH resolved AS (
      SELECT * FROM communications_resolve_community_recipients(_comm.community_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- ── 5. Update user-facing dispatch auth to include community managers ──────
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  -- Org members can dispatch event-scoped comms; community managers can
  -- dispatch community-scoped comms; admins can dispatch anything.
  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;

  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch this communication';
  END IF;

  RETURN _communications_dispatch_impl(_communication_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- Same auth model for schedule / unschedule.
CREATE OR REPLACE FUNCTION public.communications_schedule(
  _communication_id uuid,
  _scheduled_for    timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _scheduled_for IS NULL THEN RAISE EXCEPTION 'scheduled_for is required'; END IF;
  IF _scheduled_for <= now() THEN RAISE EXCEPTION 'scheduled_for must be in the future'; END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;
  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be scheduled', _comm.status;
  END IF;

  UPDATE communications
     SET status = 'scheduled', scheduled_for = _scheduled_for, updated_at = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_schedule(uuid, timestamptz) TO authenticated;


-- ── 6. Retry only failed recipients (partial-failure recovery) ──────────────
-- Resets failed recipient rows back to pending for the given channel.
-- The frontend can then re-invoke the relevant edge function (send-whatsapp
-- for now; send-email when wired). Returns the number of rows reset.
CREATE OR REPLACE FUNCTION public.communications_retry_failed(
  _communication_id uuid,
  _channel          text DEFAULT 'whatsapp'
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
  _reset int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _channel NOT IN ('email','whatsapp') THEN
    RAISE EXCEPTION 'Invalid channel: %', _channel;
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;
  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _channel = 'whatsapp' THEN
    UPDATE communication_recipients
       SET whatsapp_status = 'pending', error_message = NULL
     WHERE communication_id = _communication_id
       AND whatsapp_status = 'failed';
    GET DIAGNOSTICS _reset = ROW_COUNT;
  ELSE
    UPDATE communication_recipients
       SET email_status = 'pending', error_message = NULL
     WHERE communication_id = _communication_id
       AND email_status = 'failed';
    GET DIAGNOSTICS _reset = ROW_COUNT;
  END IF;

  RETURN _reset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_retry_failed(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 014_communications_render.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 5.1 — Server-side variable substitution at fan-out
-- ----------------------------------------------------------------------------
-- The compose preview interpolates `{{user_name}}`, `{{event_name}}`, etc.
-- using sample data. Until now the actual fan-out left the raw tokens in the
-- persisted recipient rows, so any future provider integration would have to
-- duplicate the substitution logic.
--
-- This migration:
--   1. Adds `rendered_subject` / `rendered_body` columns on
--      `communication_recipients`.
--   2. Adds a private `_communications_render_text()` helper that mirrors
--      the client-side `applyVariables()` exactly.
--   3. Updates `_communications_dispatch_impl()` to fan out per-recipient
--      rendered text alongside the existing status columns.
-- ============================================================================

-- ── 1. New columns ─────────────────────────────────────────────────────────
ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS rendered_subject text,
  ADD COLUMN IF NOT EXISTS rendered_body    text;

-- ── 2. Render helper ───────────────────────────────────────────────────────
-- Single-purpose: substitute a small set of curly-brace variables in a string.
-- Tokens not present in the context map are left unchanged so the organizer
-- can spot mis-typed names.
CREATE OR REPLACE FUNCTION public._communications_render_text(
  _text text,
  _ctx  jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _key   text;
  _value text;
  _out   text := COALESCE(_text, '');
BEGIN
  IF _out = '' THEN RETURN _out; END IF;

  -- Iterate the keys of `_ctx` and replace every `{{key}}` occurrence.
  -- Using regexp_replace with a literal token keeps the substitution safe
  -- even if the value contains regex meta-chars (we use replace(), not regexp).
  FOR _key, _value IN SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v) LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    _out := replace(_out, '{{' || _key || '}}', _value);
    -- Tolerate inner whitespace ({{ user_name }}) the same way the JS regex does.
    _out := regexp_replace(_out, '\{\{\s*' || _key || '\s*\}\}', _value, 'g');
  END LOOP;

  RETURN _out;
END;
$$;

-- ── 3. Update dispatch impl to render at fan-out ───────────────────────────
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;   -- event / community fields shared by all recipients
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  -- Build scope-level context once (event_name / event_date / event_location
  -- or community_name). Per-recipient pieces (`user_name`) get layered on
  -- inside the INSERT below.
  IF _comm.event_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'event_name',     e.title,
      'event_date',     to_char(e.date, 'FMMonth FMDD, YYYY'),
      'event_location', COALESCE(e.venue, e.location)
    ))
      INTO _scope_ctx
      FROM events e
     WHERE e.id = _comm.event_id;
  ELSIF _comm.community_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'community_name', c.name
    ))
      INTO _scope_ctx
      FROM communities c
     WHERE c.id = _comm.community_id;
  END IF;

  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  ELSE
    WITH resolved AS (
      SELECT * FROM communications_resolve_community_recipients(_comm.community_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Section: 015_communications_render_strip.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 5.2 — Strip unresolved tokens at render time
-- ----------------------------------------------------------------------------
-- The earlier render helper (014) left `{{token}}` literally in place when a
-- value wasn't supplied for the key. That's nice for compose-time debugging
-- but ugly for recipients — they'd see "Welcome to {{community_name}}!" in
-- their inbox.
--
-- This migration replaces `_communications_render_text` so that:
--   1. Known tokens with values get substituted.
--   2. Any other `{{...}}` tokens are stripped along with one leading space
--      to avoid leaving double-gaps in the rendered text.
--   3. Excess whitespace + orphan punctuation (" ." / " ,") are tightened.
--
-- The behaviour mirrors `applyVariables()` in `src/lib/communications/substitute.ts`
-- so the preview matches what gets persisted byte-for-byte.
--
-- The compose dialog independently warns the organizer about out-of-scope
-- tokens at edit time so they can fix them before send.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._communications_render_text(
  _text text,
  _ctx  jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _key   text;
  _value text;
  _out   text := COALESCE(_text, '');
BEGIN
  IF _out = '' THEN RETURN _out; END IF;

  -- 1. Substitute every key present in `_ctx`.
  FOR _key, _value IN
    SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v)
  LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    -- Tolerate inner whitespace: `{{ user_name }}` matches `{{user_name}}`.
    -- Use POSIX `[[:space:]]` instead of `\s` for max portability.
    _out := regexp_replace(_out, '\{\{[[:space:]]*' || _key || '[[:space:]]*\}\}', _value, 'gi');
  END LOOP;

  -- 2. Strip any tokens that didn't get substituted, eating one leading
  -- whitespace char so we don't leave gaps. Pattern mirrors the JS regex
  -- in `applyVariables()`.
  _out := regexp_replace(_out, '[[:space:]]?\{\{[[:space:]]*[a-z_][a-z_0-9]*[[:space:]]*\}\}', '', 'gi');

  -- 3. Collapse runs of whitespace + tighten orphaned punctuation.
  _out := regexp_replace(_out, '[[:space:]]{2,}', ' ', 'g');
  _out := regexp_replace(_out, '[[:space:]]+([.,!?;:])', '\1', 'g');
  _out := btrim(_out);

  RETURN _out;
END;
$$;

-- ----------------------------------------------------------------------------
-- Section: 016_communications_email_pending.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 6 — Real email delivery via Resend
-- ----------------------------------------------------------------------------
-- The earlier dispatch impl pre-stamped `email_status='sent'` because there
-- was no provider integration yet. Now that the `send-communication-email`
-- edge function actually ships emails, dispatch should mark recipients as
-- `pending` and let the worker advance them to `sent` / `failed`.
--
-- This migration replaces `_communications_dispatch_impl` only — schema and
-- RLS stay untouched. After applying, the dispatch flow is:
--
--   1. RPC `communications_dispatch(id)` validates auth + fans out recipient
--      rows with `email_status='pending'` and `whatsapp_status='pending'`
--      where applicable, marks the parent row `status='sent'` (the comm has
--      been queued — delivery happens off-thread).
--   2. The client immediately invokes `send-communication-email` which
--      batches pending email rows through Resend and updates statuses.
--
-- WhatsApp delivery is intentionally untouched in this migration. WhatsApp
-- rows are still inserted as `whatsapp_status='pending'` and wait for the
-- future phase to ship them.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  -- Build scope-level context once.
  IF _comm.event_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'event_name',     e.title,
      'event_date',     to_char(e.date, 'FMMonth FMDD, YYYY'),
      'event_location', COALESCE(e.venue, e.location)
    ))
      INTO _scope_ctx
      FROM events e
     WHERE e.id = _comm.event_id;
  ELSIF _comm.community_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object('community_name', c.name))
      INTO _scope_ctx
      FROM communities c
     WHERE c.id = _comm.community_id;
  END IF;

  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             -- Now using 'pending' so the worker is the source of truth
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  ELSE
    WITH resolved AS (
      SELECT * FROM communications_resolve_community_recipients(_comm.community_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  -- Parent row is "sent" in the sense that fan-out is complete. Per-recipient
  -- delivery state lives in `communication_recipients.email_status`.
  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = 0,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- ── Helper: roll up per-recipient email status into the parent's counts ─────
-- Called by the edge function after each batch flushes so the list view's
-- "5/342 delivered" copy stays in sync without polling every recipient row.
CREATE OR REPLACE FUNCTION public.communications_recompute_email_counts(
  _communication_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE communications
     SET sent_count   = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('sent','delivered','opened','clicked')),
         failed_count = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('bounced','failed')),
         updated_at   = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 017_communications_service_role_grants.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 6 hotfix — service_role privileges on communications tables
-- ----------------------------------------------------------------------------
-- The `send-communication-email` edge function connects as `service_role`
-- (via `SUPABASE_SERVICE_ROLE_KEY`). The original 009 migration only
-- granted privileges to `authenticated`, so the edge function gets a
-- `permission denied for table communication_recipients` (SQLSTATE 42501)
-- when it tries to read pending rows.
--
-- This migration adds explicit grants for `service_role`. RLS still applies
-- if it were enforced for service_role — but service_role bypasses RLS by
-- default in Supabase, so the grants are the only thing in the way.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;

-- RPCs the edge function calls. EXECUTE on functions is typically default
-- but we grant explicitly so the migration is a complete reference.
GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_render_text(text, jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_dispatch_impl(uuid)                TO service_role;

-- ----------------------------------------------------------------------------
-- Section: 018_whatsapp_service_role_grants.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 7 hotfix — service_role privileges on WhatsApp tables / helpers
-- ----------------------------------------------------------------------------
-- The `send-whatsapp` and `whatsapp-sync-templates` edge functions connect
-- as `service_role`. The original 012 migration only granted privileges to
-- `authenticated`, which would make the edge functions hit
-- `permission denied for table whatsapp_templates` (SQLSTATE 42501) on the
-- first sync.
--
-- This mirrors migration 017 for the email side.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;

GRANT EXECUTE ON FUNCTION public._whatsapp_recipient_update(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid)                TO service_role;


-- ============================================================================
-- Section: 013_communications_cron_invoke.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Make the scheduled-communications cron actually deliver
-- ----------------------------------------------------------------------------
-- The Phase 2 cron tick (`communications_run_scheduled`) calls
-- `_communications_dispatch_impl` to fan a scheduled communication out to
-- recipient rows, but it never tells the `send-communication-email` /
-- `send-whatsapp` edge functions to ship those rows. The pending rows sit
-- forever unless someone clicks "Send now" again from the UI.
--
-- This migration replaces the cron worker with a version that also POSTs to
-- the edge functions via `pg_net.http_post`, mirroring what the frontend does
-- on a manual send.
--
-- Settings storage: hosted Supabase doesn't let non-superusers run
-- `ALTER DATABASE ... SET app.settings.*`, so we use a small `app_settings`
-- table instead. RLS is enabled with no policies — `authenticated` and `anon`
-- can't read it, but the cron worker runs as SECURITY DEFINER (function owner)
-- and bypasses RLS, so it can read the values just fine.
--
-- One-time setup AFTER running this migration (run in SQL Editor):
--
--   INSERT INTO app_settings (key, value) VALUES
--     ('supabase_url',     'https://<project_ref>.supabase.co'),
--     ('service_role_key', '<your service_role JWT>')
--   ON CONFLICT (key) DO UPDATE
--     SET value = EXCLUDED.value, updated_at = now();
-- ============================================================================

-- ── 1. Ensure pg_net is available (HTTP-from-Postgres)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Settings table (locked down via RLS, readable by SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — `authenticated` and `anon` cannot read this.
-- service_role bypasses RLS implicitly. The SECURITY DEFINER cron function
-- below also bypasses RLS by virtue of running as the function owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;

-- ── 3. Drop the old worker (returns `int`) so we can replace with one that
--      returns `jsonb`. Postgres rejects `CREATE OR REPLACE FUNCTION` if the
--      return type changes.
DROP FUNCTION IF EXISTS public.communications_run_scheduled();

-- ── 4. Create the replacement worker
CREATE OR REPLACE FUNCTION public.communications_run_scheduled()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _comm        RECORD;
  _processed   INT := 0;
  _failed      INT := 0;
  _invoked     INT := 0;
  _supabase_url text;
  _service_key  text;
BEGIN
  -- Pull credentials from the locked-down settings table.
  SELECT value INTO _supabase_url FROM public.app_settings WHERE key = 'supabase_url';
  SELECT value INTO _service_key  FROM public.app_settings WHERE key = 'service_role_key';

  FOR _comm IN
    SELECT id, channels
      FROM communications
     WHERE status = 'scheduled'
       AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT 50
  LOOP
    BEGIN
      -- Fan out the recipient rows (sets the parent row to "sent" and creates
      -- per-recipient `pending` rows that the edge functions will pick up).
      PERFORM _communications_dispatch_impl(_comm.id);
      _processed := _processed + 1;

      -- Fire the edge functions via pg_net so the pending rows actually ship.
      -- We POST per channel and per communication; the edge functions are
      -- idempotent (they only pick up `pending` rows).
      IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
        IF 'email' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-communication-email',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;

        IF 'whatsapp' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-whatsapp',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      -- Parent `communications` row has no `error_message` column — per-recipient
      -- errors live on `communication_recipients.error_message`. Just flip the
      -- envelope to `failed` here so the UI can surface a retry button.
      UPDATE communications
         SET status        = 'failed',
             updated_at    = now()
       WHERE id = _comm.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', _processed,
    'failed',    _failed,
    'invoked',   _invoked,
    'has_url',   _supabase_url IS NOT NULL,
    'has_key',   _service_key  IS NOT NULL
  );
END;
$$;

-- The worker is private — only the pg_cron job (running as table owner via
-- SECURITY DEFINER) and the SQL Editor (for manual catch-up) should call it.
REVOKE EXECUTE ON FUNCTION public.communications_run_scheduled() FROM PUBLIC, authenticated, anon;

-- ── 5. Re-register the pg_cron job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communications-tick') THEN
      PERFORM cron.unschedule('communications-tick');
    END IF;
    PERFORM cron.schedule(
      'communications-tick',
      '* * * * *',
      $cron$ SELECT public.communications_run_scheduled() $cron$
    );
    RAISE NOTICE 'communications-tick re-registered (runs every minute)';
  ELSE
    RAISE NOTICE 'pg_cron is not installed — enable it in Dashboard -> Database -> Extensions, then re-run this migration.';
  END IF;
END $$;

-- ============================================================================
-- Section: 014_communications_diagnostics.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Communications scheduling diagnostics
-- ----------------------------------------------------------------------------
-- The cron tick from 013 caught an exception on the most recent run but
-- swallowed the reason, leaving the comm flipped to `status='failed'` with
-- no clue why. This migration:
--
--   1. Adds a `last_error` column on `communications` so failures persist
--      a human-readable reason that the UI can surface.
--   2. Replaces `communications_run_scheduled()` so its EXCEPTION handler
--      writes SQLERRM into `last_error` instead of dropping it.
--   3. Adds a `communications_diagnose(_id)` RPC that runs the dispatch
--      pipeline against ONE communication and returns the result/error
--      directly, so an organiser can ask "why didn't this send?" from SQL
--      Editor without trawling postgres logs.
--
-- Apply this AFTER 013 has been applied. Safe to re-run.
-- ============================================================================

-- ── 1. Persistent error column on the parent envelope.
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS last_error text;

-- ── 2. Replace the cron worker so failures are captured properly.
DROP FUNCTION IF EXISTS public.communications_run_scheduled();

CREATE OR REPLACE FUNCTION public.communications_run_scheduled()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _comm        RECORD;
  _processed   INT := 0;
  _failed      INT := 0;
  _invoked     INT := 0;
  _last_error  text;
  _supabase_url text;
  _service_key  text;
BEGIN
  SELECT value INTO _supabase_url FROM public.app_settings WHERE key = 'supabase_url';
  SELECT value INTO _service_key  FROM public.app_settings WHERE key = 'service_role_key';

  FOR _comm IN
    SELECT id, channels
      FROM communications
     WHERE status = 'scheduled'
       AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT 50
  LOOP
    BEGIN
      PERFORM _communications_dispatch_impl(_comm.id);
      _processed := _processed + 1;

      IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
        IF 'email' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-communication-email',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;

        IF 'whatsapp' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-whatsapp',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      _last_error := SQLERRM;
      UPDATE communications
         SET status     = 'failed',
             last_error = LEFT(SQLERRM, 1000),
             updated_at = now()
       WHERE id = _comm.id;
      -- Also raise as a postgres LOG so it shows up in cron.job_run_details.
      RAISE LOG 'communications_run_scheduled failed for %: %', _comm.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed',   _processed,
    'failed',      _failed,
    'invoked',     _invoked,
    'has_url',     _supabase_url IS NOT NULL,
    'has_key',     _service_key  IS NOT NULL,
    'last_error',  _last_error
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.communications_run_scheduled() FROM PUBLIC, authenticated, anon;

-- ── 3. Diagnostic RPC — run dispatch on a single comm and return the result
--      or the error verbatim. Usable from SQL Editor for self-troubleshooting.
CREATE OR REPLACE FUNCTION public.communications_diagnose(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _row        RECORD;
  _result     jsonb;
  _err        text;
  _err_state  text;
BEGIN
  SELECT id, status, channels, recipient_filter, event_id, community_id,
         scheduled_for, sent_at, last_error
    INTO _row
    FROM communications
   WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'communication not found', 'id', _id);
  END IF;

  BEGIN
    _result := _communications_dispatch_impl(_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _err_state = RETURNED_SQLSTATE;
    _err := SQLERRM;
    UPDATE communications
       SET status = 'failed', last_error = LEFT(_err, 1000), updated_at = now()
     WHERE id = _id;
    RETURN jsonb_build_object(
      'ok',         false,
      'id',         _id,
      'sqlstate',   _err_state,
      'error',      _err,
      'comm_state', to_jsonb(_row)
    );
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'id',         _id,
    'dispatch',   _result,
    'comm_state', to_jsonb(_row)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_diagnose(uuid) TO authenticated, service_role;

-- ── 4. Re-register the cron job (idempotent) so the new function body is in use.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communications-tick') THEN
      PERFORM cron.unschedule('communications-tick');
    END IF;
    PERFORM cron.schedule(
      'communications-tick',
      '* * * * *',
      $cron$ SELECT public.communications_run_scheduled() $cron$
    );
  END IF;
END $$;

-- ============================================================================
-- Section: 015_communications_resolver_cron_auth.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Allow cron / service-role context to read communications recipients
-- ----------------------------------------------------------------------------
-- The recipient resolvers (`communications_resolve_recipients` and
-- `communications_resolve_community_recipients`) reject the caller when the
-- caller is not an org member / community moderator. The check is correct for
-- the front-end (RLS-equivalent guard) but it fails when the cron worker
-- runs the resolver headlessly: pg_cron has no auth context, so `auth.uid()`
-- is NULL, the org-membership EXISTS clause returns false, and the function
-- raises `Not authorised to read recipients for this event`.
--
-- This migration relaxes both auth checks so they run only when there's an
-- actual authenticated user. For headless callers (cron, service_role JWT
-- via the edge functions), the check is skipped — those callers already pass
-- the table-level GRANT-to-service_role gate, which is the appropriate
-- privilege boundary for them.
--
-- The query bodies themselves are unchanged from the latest definitions in
-- 007_communications.sql; only the IF-block at the top of each function is
-- patched.
-- ============================================================================

-- ── Event resolver ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.communications_resolve_recipients(
  _event_id uuid,
  _filter   jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: only enforced when an actual user is calling. Headless
  -- callers (pg_cron worker, service_role JWT from edge functions) get past
  -- the table-level GRANT and bypass this check.
  IF auth.uid() IS NOT NULL AND _event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM events e
        JOIN org_members om ON om.org_id = e.org_id
       WHERE e.id = _event_id AND om.user_id = auth.uid()
    ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Not authorised to read recipients for this event';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.user_id,
           COALESCE(NULLIF(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                    r.name, split_part(r.email,'@',1)) AS name,
           lower(r.email) AS email,
           NULLIF(trim(coalesce(r.mobile_country_code,'') || ' ' || coalesce(r.mobile_number,'')), '') AS phone,
           COALESCE(r.attendance_state, 'never') AS attendance_state,
           COALESCE(r.amount_paid, 0)::numeric AS amount_paid
      FROM registrations r
     WHERE r.event_id = _event_id
       AND r.status <> 'cancelled'
       AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
  ),
  speakers_set AS (
    SELECT s.user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    SELECT NULL::uuid AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''),
                    split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  filtered_attendees AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE
       (
         'all_attendees' = ANY(_types)
       )
       OR (
         'checked_in' = ANY(_types) AND b.attendance_state IN ('inside','outside')
       )
       OR (
         'paid' = ANY(_types) AND b.amount_paid > 0
       )
  ),
  custom_set AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types) AND b.user_id = ANY(_user_ids)
  ),
  all_recipients AS (
    SELECT user_id, name, email, phone FROM filtered_attendees
    UNION
    SELECT user_id, name, email, phone FROM custom_set
    UNION ALL
    SELECT user_id, name, email, phone FROM speakers_set
     WHERE 'speakers' = ANY(_types)
    UNION ALL
    SELECT user_id, name, email, phone FROM sponsors_set
     WHERE 'sponsors' = ANY(_types)
  )
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) TO authenticated, service_role;

-- ── Community resolver ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.communications_resolve_community_recipients(
  _community_id uuid,
  _filter       jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: only enforced when an actual user is calling. See the
  -- event resolver above for the rationale.
  IF auth.uid() IS NOT NULL AND NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised to read community members';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id,
           cm.role,
           COALESCE(
             NULLIF(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
             p.display_name,
             p.username,
             split_part(u.email,'@',1)
           ) AS name,
           lower(u.email) AS email,
           NULLIF(trim(coalesce(p.mobile_country_code,'') || ' ' || coalesce(p.mobile_number,'')), '') AS phone
      FROM community_members cm
      JOIN auth.users u ON u.id = cm.user_id
      LEFT JOIN profiles p ON p.user_id = cm.user_id
     WHERE cm.community_id = _community_id
       AND cm.status = 'active'
  ),
  filtered AS (
    SELECT b.user_id, b.name, b.email, b.phone, b.role
      FROM base b
     WHERE
       'all_members' = ANY(_types)
       OR ('managers'   = ANY(_types) AND b.role = 'manager'::community_role)
       OR ('moderators' = ANY(_types) AND b.role = 'moderator'::community_role)
       OR ('organizers' = ANY(_types) AND b.role = 'organizer'::community_role)
       OR ('mentors'    = ANY(_types) AND b.role = 'mentor'::community_role)
       OR ('speakers'   = ANY(_types) AND b.role = 'speaker'::community_role)
       OR ('sponsors'   = ANY(_types) AND b.role = 'sponsor'::community_role)
       OR ('custom'     = ANY(_types) AND b.user_id = ANY(_user_ids))
  )
  SELECT DISTINCT ON (lower(coalesce(f.email,'')))
         f.user_id, f.name, f.email, f.phone
    FROM filtered f
   WHERE f.email IS NOT NULL AND f.email <> ''
   ORDER BY lower(coalesce(f.email,'')), f.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_resolve_community_recipients(uuid, jsonb) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 008_portal_access_fix.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Hotfix — Sponsor / Speaker portal access for application-approved users
-- ----------------------------------------------------------------------------
-- The original RPCs (in `002_functions.sql`) only recognised users who became
-- speakers/sponsors via the team-invite flow:
--
--   - Sponsor: must have a `sponsor_members` row with `accepted_at IS NOT NULL`
--   - Speaker: matched by `speakers.email = auth.users.email`
--
-- That misses two real-world cases:
--
--   1. APPLICATIONS — When an organiser approves a sponsor application,
--      `useApplications.ts` inserts a row into `sponsors` with
--      `user_id = applicant_user_id` and links via `event_sponsors`. NO row is
--      created in `sponsor_members` (that table is for team-mate invites only),
--      so `has_sponsor` returned `false` and the dropdown hid "Sponsor dashboard".
--
--   2. SPEAKER EMAIL DRIFT — Speakers added by the organiser may have an email
--      that doesn't match the user's auth email (e.g. business vs personal,
--      or after the user changes email). Email-only matching makes them invisible
--      to the speaker portal even when the user_id is set on `speakers`.
--
-- This migration replaces the four affected RPCs to recognise both paths.
-- Pure SQL replace; no schema changes; safe to re-run.
-- ============================================================================

-- ── 1. user_role_assignments — covers BOTH paths for has_sponsor + has_speaker
CREATE OR REPLACE FUNCTION public.user_role_assignments()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'has_speaker', EXISTS(
      -- match by user_id first (most reliable), fall back to email
      SELECT 1 FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE sp.user_id = auth.uid()
         OR lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    ),
    'has_sponsor', EXISTS(
      -- team-invite path: a `sponsor_members` row that's been accepted
      SELECT 1 FROM sponsor_members sm
      WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
    ) OR EXISTS(
      -- application-approval path: the user IS the sponsor (sponsors.user_id),
      -- and that sponsor is attached to at least one event via event_sponsors
      SELECT 1 FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
      WHERE s.user_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_role_assignments() TO authenticated;

-- ── 2. sponsor_portal_events — list events where the user is a sponsor via either path
CREATE OR REPLACE FUNCTION public.sponsor_portal_events()
RETURNS TABLE(
  event_id uuid, event_title text, event_date timestamptz, end_date timestamptz, location text,
  sponsor_id uuid, sponsor_name text, tier text,
  registrations_count bigint, checked_in_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Combine both paths via UNION on the underlying sponsor IDs the user owns.
  WITH user_sponsors AS (
    SELECT sm.sponsor_id
      FROM sponsor_members sm
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
    UNION
    SELECT s.id AS sponsor_id
      FROM sponsors s
     WHERE s.user_id = auth.uid()
  )
  SELECT
    e.id, e.title, e.date, e.end_date, e.location,
    s.id, s.name, COALESCE(es.tier_override, s.tier),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.approval_status = 'approved'),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = true)
  FROM user_sponsors us
  JOIN sponsors s         ON s.id = us.sponsor_id
  JOIN event_sponsors es  ON es.sponsor_id = s.id
  JOIN events e           ON e.id = es.event_id
  ORDER BY e.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_events() TO authenticated;

-- ── 3. sponsor_portal_people — gate on either path
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    -- Either path can grant access to the event's people list:
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid()
       AND sm.accepted_at IS NOT NULL
       AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid()
       AND es.event_id = _eid
    LIMIT 1
  )
  SELECT 'speaker', sp.id, sp.name, sp.company, 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.ticket_type, r.checked_in, r.checked_in_at
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 4. speaker_portal_events — match by user_id OR email
CREATE OR REPLACE FUNCTION public.speaker_portal_events()
RETURNS TABLE(
  event_id uuid, event_slug text, event_title text, event_description text,
  event_date timestamptz, end_date timestamptz, location text, venue text, image_url text, status text,
  organizer_name text,
  speaker_id uuid, speaker_name text, speaker_photo_url text, speaker_company text,
  session_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT
    e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue, e.image_url, e.status,
    o.name,
    sp.id, sp.name, sp.photo_url, sp.company,
    (SELECT count(*) FROM sessions s WHERE s.event_id = e.id AND s.speaker_id = sp.id)
  FROM speakers sp
  JOIN event_speakers es ON es.speaker_id = sp.id
  JOIN events e         ON e.id = es.event_id
  LEFT JOIN organizations o ON o.id = e.org_id
  WHERE sp.user_id = auth.uid()
     OR lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ORDER BY e.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_events() TO authenticated;

-- ── 5. speaker_portal_event_details — gate / filter both paths
CREATE OR REPLACE FUNCTION public.speaker_portal_event_details(_eid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _result jsonb;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();

  -- Verify the user is a speaker for this event by user_id OR email match.
  IF NOT EXISTS (
    SELECT 1 FROM speakers sp
    JOIN event_speakers es ON es.speaker_id = sp.id
    WHERE es.event_id = _eid
      AND (sp.user_id = auth.uid() OR lower(sp.email) = lower(COALESCE(_email, '')))
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'event', (SELECT to_jsonb(e) FROM (
      SELECT e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue,
             e.image_url, e.banner_landscape_url, e.status, e.timezone, e.event_format,
             o.name as organizer_name, o.slug as organizer_slug, o.logo_url as organizer_logo
      FROM events e LEFT JOIN organizations o ON o.id = e.org_id WHERE e.id = _eid
    ) e),
    'speaker', (SELECT to_jsonb(s) FROM (
      SELECT sp.id, sp.name, sp.email, sp.bio, sp.photo_url, sp.company, sp.designation,
             sp.linkedin_url, sp.company_website, sp.title, sp.first_name, sp.last_name
      FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE es.event_id = _eid
        AND (sp.user_id = auth.uid() OR lower(sp.email) = lower(COALESCE(_email, '')))
      LIMIT 1
    ) s),
    'sessions', COALESCE((SELECT jsonb_agg(to_jsonb(ss) ORDER BY ss.start_time) FROM (
      SELECT s.id, s.title, s.description, s.session_type, s.start_time, s.end_time, s.location
      FROM sessions s
      WHERE s.event_id = _eid
        AND s.speaker_id IN (
          SELECT sp.id FROM speakers sp
          WHERE sp.user_id = auth.uid()
             OR lower(sp.email) = lower(COALESCE(_email, ''))
        )
    ) ss), '[]'::jsonb),
    'analytics', (SELECT jsonb_build_object(
      'total_registrations', (SELECT count(*) FROM registrations r
                                WHERE r.event_id = _eid AND r.approval_status = 'approved'),
      'checked_in_count',    (SELECT count(*) FROM registrations r
                                WHERE r.event_id = _eid AND r.checked_in = true)
    ))
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_event_details(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 009_grants_hotfix.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Grants hotfix — RLS-enabled tables that were missing table-level GRANTs
-- ----------------------------------------------------------------------------
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original
-- filename.
--
-- Background: 001_tables.sql defined RLS policies for several tables but
-- never paired them with table-level GRANTs. Postgres checks privileges
-- BEFORE evaluating row-level policies, so every request fails with
-- `permission denied for table <X>` — even when the policy itself would
-- have allowed the request. These hotfixes add the missing GRANTs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 011_org_followers_grants.sql
-- ----------------------------------------------------------------------------
-- The Subscribe pill on the public org page hits this whenever a signed-in
-- user clicks Subscribe / Unsubscribe.
GRANT SELECT, INSERT, DELETE ON public.org_followers TO authenticated;

-- Anonymous viewers can still see follower counts on a public org page.
-- The RLS policy `"Auth view followers"` is `TO authenticated USING(true)`, so
-- this anon grant is gated by RLS — anon will currently see 0 rows until/unless
-- a `TO anon` SELECT policy is added. Granting the privilege is harmless and
-- future-proofs adding such a policy without another grant migration.
GRANT SELECT ON public.org_followers TO anon;

-- ----------------------------------------------------------------------------
-- Section: 012_org_invitations_grants.sql
-- ----------------------------------------------------------------------------
-- The "Send Invitation" button in the organizer Settings → Team flow hits
-- this whenever an owner tries to invite a new member.
--
-- We grant SELECT / INSERT / UPDATE / DELETE because the "Owner manage
-- invitations" policy is `FOR ALL` — it covers every operation, including the
-- DELETE on revoke and the UPDATE the application uses to mark accepted
-- invitations.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 014_video_provider.sql
-- ────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════
-- 014_video_provider.sql
--
-- Per-event override for the live video provider used by the in-house webinar
-- studio. NULL means "use the platform default" (resolved by the client via
-- VITE_WEBINAR_PROVIDER, falling back to 'livekit').
--
-- Allowed values today: 'livekit' | 'agora'.
--
-- This is the canary knob: organisers can flip a single event to Agora to
-- validate the cut-over before the platform default is changed. The frontend
-- reads it with getWebinarProvider({ eventOverride: events.video_provider }).
--
-- Reversibility: drop the column to revert. No data loss because nothing else
-- references it.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_provider text;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_video_provider_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_video_provider_check
  CHECK (video_provider IS NULL OR video_provider IN ('livekit', 'agora'));

COMMENT ON COLUMN public.events.video_provider IS
  'Per-event override for the live video provider. NULL means "use platform default" (VITE_WEBINAR_PROVIDER). Today only ''livekit'' and ''agora'' are accepted.';

-- ────────────────────────────────────────────────────────────
-- 015_fk_indexes.sql
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 017_speaker_webinar_interaction.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Speakers can interact (chat, react, Q&A, polls) in webinar sessions
-- ----------------------------------------------------------------------------
-- Safe to re-run.
-- ============================================================================

-- Create helper function to check if user is a speaker for the event
CREATE OR REPLACE FUNCTION public.is_event_speaker(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.event_speakers es
      JOIN public.speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id
       AND (
         s.user_id = _user_id
         OR lower(s.email) = lower((SELECT email FROM auth.users WHERE id = _user_id))
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_event_speaker(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_event_speaker(uuid,uuid) TO authenticated;

-- Update webinar_chat policies
DROP POLICY IF EXISTS "Read chat" ON public.webinar_chat;
CREATE POLICY "Read chat" ON public.webinar_chat FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Post chat" ON public.webinar_chat;
CREATE POLICY "Post chat" ON public.webinar_chat FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_reactions policies
DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
CREATE POLICY "Read reactions" ON public.webinar_reactions FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;
CREATE POLICY "Post reactions" ON public.webinar_reactions FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_qa policies
DROP POLICY IF EXISTS "Read qa" ON public.webinar_qa;
CREATE POLICY "Read qa" ON public.webinar_qa FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Ask qa" ON public.webinar_qa;
CREATE POLICY "Ask qa" ON public.webinar_qa FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_polls policies
DROP POLICY IF EXISTS "Read polls" ON public.webinar_polls;
CREATE POLICY "Read polls" ON public.webinar_polls FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_poll_votes policies
DROP POLICY IF EXISTS "Vote" ON public.webinar_poll_votes;
CREATE POLICY "Vote" ON public.webinar_poll_votes FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id = p.session_id WHERE p.id = poll_id AND p.open AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Read votes" ON public.webinar_poll_votes;
CREATE POLICY "Read votes" ON public.webinar_poll_votes FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id = p.session_id WHERE p.id = poll_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- ────────────────────────────────────────────────────────────
-- 018_fix_webinar_reactions.sql
-- ────────────────────────────────────────────────────────────
-- Make user_id nullable in webinar_reactions to support anonymous guests
ALTER TABLE public.webinar_reactions ALTER COLUMN user_id DROP NOT NULL;

-- Grant access to anonymous users
GRANT SELECT, INSERT ON public.webinar_reactions TO anon;

-- Simplify and update policies to allow both authenticated and anon users to react
DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;

CREATE POLICY "Read reactions" ON public.webinar_reactions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Post reactions" ON public.webinar_reactions FOR INSERT TO authenticated, anon WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 019_attendance_audit_rpcs.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Attendance history RPCs — backs the History dialogs in the organizer UI
-- ----------------------------------------------------------------------------
-- The "Attendance history" button on the Registrations section (and the
-- per-row "Attendance history" menu item) call two RPCs that didn't exist:
--
--   - `event_attendance_audit(_event_id, _limit)`      — all events for a given event
--   - `registration_attendance_audit(p_registration_id, p_limit)` — one registrant's history
--
-- Without these, the dialog opened but stayed empty (or errored out silently
-- if RLS allowed nothing through). This migration adds both, reading from
-- the existing `attendance_events` table (single source of truth for
-- check-in / check-out activity).
--
-- Shape of return rows matches what the React side already expects:
--   id, actor_email, action, target_id, details(jsonb), created_at
--
-- Action mapping:
--   attendance_events.kind = 'in'       → "attendance.check_in"
--   attendance_events.kind = 'out'      → "attendance.check_out"
--   attendance_events.kind = 'auto_out' → "attendance.auto_check_out"
-- ============================================================================

-- ── 1. Per-event audit (icon next to attendance tabs)
CREATE OR REPLACE FUNCTION public.event_attendance_audit(
  _event_id uuid,
  _limit    int DEFAULT 200
)
RETURNS TABLE(
  id          uuid,
  actor_email text,
  action      text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ae.id,
    u.email                             AS actor_email,
    CASE ae.kind
      WHEN 'in'       THEN 'attendance.check_in'
      WHEN 'out'      THEN 'attendance.check_out'
      WHEN 'auto_out' THEN 'attendance.auto_check_out'
      ELSE 'attendance.' || ae.kind
    END                                 AS action,
    ae.registration_id                  AS target_id,
    jsonb_strip_nulls(jsonb_build_object(
      'method',            ae.method,
      'registration_name', COALESCE(NULLIF(r.name, ''), r.email),
      'ticket_type',       r.ticket_type,
      'event_day',         ae.event_day
    ))                                  AS details,
    ae.occurred_at                      AS created_at
  FROM public.attendance_events ae
  LEFT JOIN public.registrations r ON r.id = ae.registration_id
  LEFT JOIN auth.users u           ON u.id = ae.actor_id
  WHERE ae.event_id = _event_id
    AND (
      -- Event owner OR platform admin can read everything for this event.
      EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY ae.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000);
$$;

GRANT EXECUTE ON FUNCTION public.event_attendance_audit(uuid, int) TO authenticated;

-- ── 2. Per-registration audit (per-row "Attendance history" menu item)
CREATE OR REPLACE FUNCTION public.registration_attendance_audit(
  p_registration_id uuid,
  p_limit           int DEFAULT 50
)
RETURNS TABLE(
  id          uuid,
  actor_email text,
  action      text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ae.id,
    u.email                             AS actor_email,
    CASE ae.kind
      WHEN 'in'       THEN 'attendance.check_in'
      WHEN 'out'      THEN 'attendance.check_out'
      WHEN 'auto_out' THEN 'attendance.auto_check_out'
      ELSE 'attendance.' || ae.kind
    END                                 AS action,
    ae.registration_id                  AS target_id,
    jsonb_strip_nulls(jsonb_build_object(
      'method',            ae.method,
      'registration_name', COALESCE(NULLIF(r.name, ''), r.email),
      'ticket_type',       r.ticket_type,
      'event_day',         ae.event_day
    ))                                  AS details,
    ae.occurred_at                      AS created_at
  FROM public.attendance_events ae
  LEFT JOIN public.registrations r ON r.id = ae.registration_id
  LEFT JOIN auth.users u           ON u.id = ae.actor_id
  WHERE ae.registration_id = p_registration_id
    AND (
      -- Event owner OR platform admin.
      EXISTS (
        SELECT 1
          FROM public.events e
          JOIN public.registrations reg ON reg.event_id = e.id
         WHERE reg.id = p_registration_id
           AND e.user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY ae.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.registration_attendance_audit(uuid, int) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 020_log_registrant_action.sql
-- ────────────────────────────────────────────────────────────
-- 020_log_registrant_action.sql
-- Audit-log RPC called by RegistrantQuickView when a registrant is
-- deleted or restored. Stores the action in a simple JSONB audit table
-- if it exists, otherwise falls back gracefully (no crash).
-- The frontend calls: supabaseRpc("log_registrant_action", { _action, _registration_id, _details })

CREATE TABLE IF NOT EXISTS public.registrant_audit_log (
  id          uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action      text          NOT NULL,
  reg_id      text          NOT NULL,  -- uuid stored as text to survive deleted rows
  actor_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  details     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.registrant_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit log" ON public.registrant_audit_log
  FOR SELECT TO authenticated
  USING(has_role(auth.uid(), 'admin'));

-- Grant: authenticated users can INSERT (own actions); read is admin-only.
GRANT INSERT ON public.registrant_audit_log TO authenticated;
GRANT SELECT ON public.registrant_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.log_registrant_action(
  _action          text,
  _registration_id uuid,
  _details         jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.registrant_audit_log(action, reg_id, actor_id, details)
  VALUES (_action, _registration_id::text, auth.uid(), COALESCE(_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- Audit failure must never break the calling operation.
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_registrant_action(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_registrant_action IS
'Records delete/restore actions on registrant rows for audit purposes.';

-- ────────────────────────────────────────────────────────────
-- 021_unique_invite_and_member.sql
-- ────────────────────────────────────────────────────────────
-- 021_unique_invite_and_member.sql
-- Enforce unique email per org in pending invitations and unique user per org in members.
-- Without these constraints the same email can be invited with multiple roles.

-- 1. Unique active (pending) invitation per email per org.
--    Accepts only one pending invite per email; completed/cancelled invites don't block re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_org_email_pending_unique
  ON public.org_invitations (org_id, lower(email))
  WHERE status = 'pending';

-- 2. Unique member (user) per org — prevents the same user being added with two different roles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_members_org_id_user_id_key'
  ) THEN
    ALTER TABLE public.org_members
      ADD CONSTRAINT org_members_org_id_user_id_key UNIQUE (org_id, user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001 (merged): event_owner_can_edit_speakers_sponsors
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: let event organizers edit linked speakers / sponsor members.
--
-- Apply this file in the Supabase SQL editor (or via `supabase db push`).
-- It is idempotent — re-running drops and recreates the policies and
-- functions cleanly.
--
-- Why:
--   The QuickView panel on the Registrations page lets an event organizer edit
--   the contact details (mobile, designation, company, LinkedIn, etc.) of any
--   attendee, speaker, or sponsor for their event.
--   - `registrations` already has an "Owner update regs" policy, so attendee
--     edits save fine.
--   - `speakers` only had a "Creators manage speakers" policy
--     (auth.uid = speakers.user_id), so the event organizer could NEVER
--     update a speaker row.
--   - `sponsor_members` had the same restriction.
--
-- This migration:
--   1. Adds additive RLS policies so the event organizer (events.user_id =
--      auth.uid) can read/update speakers and sponsor_members linked to one
--      of their events.
--   2. Adds SECURITY DEFINER RPC fallbacks the client can call when an
--      organizer is editing through a role (org member, future team roles)
--      where the direct RLS path can't see them. The RPC re-validates that
--      the caller owns the event and then updates the row with elevated
--      privileges.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Speakers: RLS policy for event organizers ─────────────────────────────────

DROP POLICY IF EXISTS "Event owner update linked speakers" ON public.speakers;
CREATE POLICY "Event owner update linked speakers"
  ON public.speakers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_speakers es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.speaker_id = speakers.id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.event_speakers es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.speaker_id = speakers.id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- ── Sponsor members: RLS policies for event organizers ────────────────────────

DROP POLICY IF EXISTS "Event owner view linked sponsor_members" ON public.sponsor_members;
CREATE POLICY "Event owner view linked sponsor_members"
  ON public.sponsor_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "Event owner update linked sponsor_members" ON public.sponsor_members;
CREATE POLICY "Event owner update linked sponsor_members"
  ON public.sponsor_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- ── Helper used by the RPCs ───────────────────────────────────────────────────
-- Returns true if the calling user owns the event or is an admin.
-- SECURITY DEFINER so it can read events even when the caller's own SELECT
-- policy on events would have hidden the row.

CREATE OR REPLACE FUNCTION public._is_event_organizer(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
$$;

REVOKE ALL ON FUNCTION public._is_event_organizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_event_organizer(uuid) TO authenticated;

-- ── SECURITY DEFINER RPC: update a speaker for an organizer ───────────────────
-- Accepts a jsonb payload of column → value. Only columns in the whitelist are
-- considered. Any key the payload contains overrides that column; keys NOT
-- present are left untouched. Explicit `null` values are written as null.

CREATE OR REPLACE FUNCTION public.organizer_update_speaker(
  _event_id uuid,
  _speaker_id uuid,
  _payload jsonb
)
RETURNS public.speakers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.speakers;
BEGIN
  IF NOT public._is_event_organizer(_event_id) THEN
    RAISE EXCEPTION 'Not authorized to edit speakers for this event'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_speakers
    WHERE event_id = _event_id AND speaker_id = _speaker_id
  ) THEN
    RAISE EXCEPTION 'Speaker is not linked to this event'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.speakers SET
    title                  = CASE WHEN _payload ? 'title'                  THEN _payload->>'title'                  ELSE title                  END,
    first_name             = CASE WHEN _payload ? 'first_name'             THEN _payload->>'first_name'             ELSE first_name             END,
    last_name              = CASE WHEN _payload ? 'last_name'              THEN _payload->>'last_name'              ELSE last_name              END,
    name                   = CASE WHEN _payload ? 'name'                   THEN _payload->>'name'                   ELSE name                   END,
    email                  = CASE WHEN _payload ? 'email'                  THEN _payload->>'email'                  ELSE email                  END,
    designation            = CASE WHEN _payload ? 'designation'            THEN _payload->>'designation'            ELSE designation            END,
    company                = CASE WHEN _payload ? 'company'                THEN _payload->>'company'                ELSE company                END,
    mobile_country_code    = CASE WHEN _payload ? 'mobile_country_code'    THEN _payload->>'mobile_country_code'    ELSE mobile_country_code    END,
    mobile_number          = CASE WHEN _payload ? 'mobile_number'          THEN _payload->>'mobile_number'          ELSE mobile_number          END,
    linkedin_url           = CASE WHEN _payload ? 'linkedin_url'           THEN _payload->>'linkedin_url'           ELSE linkedin_url           END,
    company_website        = CASE WHEN _payload ? 'company_website'        THEN _payload->>'company_website'        ELSE company_website        END,
    company_employee_count = CASE WHEN _payload ? 'company_employee_count' THEN _payload->>'company_employee_count' ELSE company_employee_count END,
    industry               = CASE WHEN _payload ? 'industry'               THEN _payload->>'industry'               ELSE industry               END
  WHERE id = _speaker_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_update_speaker(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_update_speaker(uuid, uuid, jsonb) TO authenticated;

-- ── SECURITY DEFINER RPC: update a sponsor member for an organizer ────────────

CREATE OR REPLACE FUNCTION public.organizer_update_sponsor_member(
  _event_id uuid,
  _member_id uuid,
  _payload jsonb
)
RETURNS public.sponsor_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.sponsor_members;
  v_sponsor_id uuid;
BEGIN
  IF NOT public._is_event_organizer(_event_id) THEN
    RAISE EXCEPTION 'Not authorized to edit sponsor members for this event'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sponsor_id INTO v_sponsor_id
  FROM public.sponsor_members WHERE id = _member_id;

  IF v_sponsor_id IS NULL THEN
    RAISE EXCEPTION 'Sponsor member not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_sponsors
    WHERE event_id = _event_id AND sponsor_id = v_sponsor_id
  ) THEN
    RAISE EXCEPTION 'Sponsor is not linked to this event'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.sponsor_members SET
    title                  = CASE WHEN _payload ? 'title'                  THEN _payload->>'title'                  ELSE title                  END,
    first_name             = CASE WHEN _payload ? 'first_name'             THEN _payload->>'first_name'             ELSE first_name             END,
    last_name              = CASE WHEN _payload ? 'last_name'              THEN _payload->>'last_name'              ELSE last_name              END,
    display_name           = CASE WHEN _payload ? 'display_name'           THEN _payload->>'display_name'           ELSE display_name           END,
    email                  = CASE WHEN _payload ? 'email'                  THEN _payload->>'email'                  ELSE email                  END,
    designation            = CASE WHEN _payload ? 'designation'            THEN _payload->>'designation'            ELSE designation            END,
    company                = CASE WHEN _payload ? 'company'                THEN _payload->>'company'                ELSE company                END,
    mobile_country_code    = CASE WHEN _payload ? 'mobile_country_code'    THEN _payload->>'mobile_country_code'    ELSE mobile_country_code    END,
    mobile_number          = CASE WHEN _payload ? 'mobile_number'          THEN _payload->>'mobile_number'          ELSE mobile_number          END,
    linkedin_url           = CASE WHEN _payload ? 'linkedin_url'           THEN _payload->>'linkedin_url'           ELSE linkedin_url           END,
    company_website        = CASE WHEN _payload ? 'company_website'        THEN _payload->>'company_website'        ELSE company_website        END,
    company_employee_count = CASE WHEN _payload ? 'company_employee_count' THEN _payload->>'company_employee_count' ELSE company_employee_count END,
    industry               = CASE WHEN _payload ? 'industry'               THEN _payload->>'industry'               ELSE industry               END
  WHERE id = _member_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_update_sponsor_member(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_update_sponsor_member(uuid, uuid, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 (merged): normalize_person_titles
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: normalise legacy person titles.
--
-- The `_validate_person_title` trigger (see 000_full_schema.sql) only accepts
-- titles in the set ('Mr','Ms','Mrs','Prefer not to say'). Earlier UI revisions
-- of RegistrantQuickView wrote the dotted forms ('Mr.', 'Ms.', 'Mrs.',
-- 'Prefer Not to Say') so saves now fail with "Invalid title: Mr." until the
-- existing rows are rewritten to the canonical form.
--
-- The UPDATE goes through the same trigger; the new values are in the allowed
-- set so it accepts them. Re-running this migration is a no-op once the data
-- has been normalised.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl  text;
  tbls text[] := ARRAY['registrations', 'speakers', 'sponsor_members', 'profiles'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'title'
    ) THEN
      EXECUTE format($f$
        UPDATE public.%I SET title = CASE title
          WHEN 'Mr.'                THEN 'Mr'
          WHEN 'Ms.'                THEN 'Ms'
          WHEN 'Mrs.'               THEN 'Mrs'
          WHEN 'Prefer Not to Say'  THEN 'Prefer not to say'
          WHEN 'prefer not to say'  THEN 'Prefer not to say'
          WHEN ''                   THEN NULL
          ELSE title
        END
        WHERE title IN (
          'Mr.', 'Ms.', 'Mrs.', 'Prefer Not to Say', 'prefer not to say', ''
        );
      $f$, tbl);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003 (merged): accept_org_invitation
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 003_accept_org_invitation.sql
--
-- Closes the team-invite loop. Before this migration, sending an invite from
-- Settings created an `org_invitations` row and emailed `/login?invite=<token>`,
-- but nothing on the frontend or in SQL ever consumed the token. The invited
-- user could sign in but never landed in `org_members`, so they had no access
-- to manage events.
--
-- This migration adds:
--   public.accept_org_invitation(_token uuid)
--       — looks up the invitation, verifies the caller's auth.email() matches
--         the invited email, upserts an `org_members` row with the invited
--         role, and stamps the invitation as accepted.
--
-- Email matching is enforced server-side so a leaked token can't be redeemed
-- by a different account. The function is idempotent: re-calling it with the
-- same token after success returns the same org_id without errors.
--
-- ── 2026-06-25 fix ───────────────────────────────────────────────────────────
-- Dropped the previous version which used `org_id` and `role` as OUT column
-- names. PostgreSQL throws `column reference "org_id" is ambiguous` inside
-- INSERT / ON CONFLICT clauses because those identifiers also exist on
-- `public.org_members`. Renaming the OUT columns to `accepted_org_id` and
-- `assigned_role` resolves the conflict.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE OR REPLACE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _inv    record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation' USING ERRCODE = '28000';
  END IF;
  IF _email = '' THEN
    RAISE EXCEPTION 'Signed-in user has no email — cannot match invitation' USING ERRCODE = '22023';
  END IF;

  -- Lookup. The token is the only field on the public link, so it must
  -- be sufficient to find the row, but the email check below is what
  -- prevents arbitrary redemption.
  SELECT i.id, i.org_id, i.email, i.role, i.status
    INTO _inv
    FROM public.org_invitations i
   WHERE i.token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already withdrawn' USING ERRCODE = 'P0002';
  END IF;

  IF _inv.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %)', _inv.status USING ERRCODE = 'P0001';
  END IF;

  IF lower(_inv.email) <> _email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in as % to accept.', _inv.email
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent member creation. UNIQUE(org_id, user_id) on org_members
  -- means re-accepting just refreshes the role to whatever the invitation
  -- specifies — the inviter could have changed it.
  INSERT INTO public.org_members(org_id, user_id, role)
  VALUES(_inv.org_id, _uid, _inv.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET
    role = EXCLUDED.role;

  -- Mark the invitation accepted (idempotent on re-call).
  UPDATE public.org_invitations
     SET status = 'accepted', updated_at = now()
   WHERE id = _inv.id
     AND status <> 'accepted';

  accepted_org_id := _inv.org_id;
  assigned_role   := _inv.role;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accepts a team invitation by token. Caller must be authenticated and their auth.email() must match the invitation address. Inserts or refreshes the org_members row and stamps the invitation accepted. Idempotent. Returns (accepted_org_id, assigned_role).';
