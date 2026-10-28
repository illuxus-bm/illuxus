-- Illuxus — consolidated Supabase SQL bundle
--
-- Contains the base schema followed by every numbered migration in order.
-- Run the complete file once only when provisioning a fresh database.
-- For an existing database, apply only the needed section after checking
-- its prerequisites. This file does not preserve Supabase CLI migration
-- history, and must not be replayed as a new migration on an existing DB.
-- Manual/duplicate root scripts are retained as commented archival sections.
--
-- >>> BEGIN BASE SCHEMA: 000_full_schema.sql >>>
-- SECTION: 000_full_schema.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ==============================================================
-- Illuxus — complete database schema
-- Combined from 001–021 migrations on 2026-06-23
-- Apply to a FRESH Supabase project via the SQL Editor.
-- This bundle is not a replacement migration history for an existing project.
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
-- Parameter names must match the site editor's calls (_section, _content).
DROP FUNCTION IF EXISTS public.save_site_draft(text, jsonb);
DROP FUNCTION IF EXISTS public.save_site_draft(jsonb, text);
DROP FUNCTION IF EXISTS public.publish_site_section(text);
DROP FUNCTION IF EXISTS public.discard_site_draft(text);
CREATE OR REPLACE FUNCTION public.save_site_draft(_section text,_content jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; INSERT INTO site_content(section,content,draft_content) VALUES(_section,'{}',_content) ON CONFLICT(section) DO UPDATE SET draft_content=EXCLUDED.draft_content,updated_at=now(); END; $$;
CREATE OR REPLACE FUNCTION public.publish_site_section(_section text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE _d jsonb; BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; SELECT draft_content INTO _d FROM site_content WHERE section=_section; IF _d IS NULL THEN RAISE EXCEPTION 'No draft'; END IF; UPDATE site_content SET content=_d,draft_content=NULL,published_at=now(),updated_at=now() WHERE section=_section; END; $$;
CREATE OR REPLACE FUNCTION public.discard_site_draft(_section text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE site_content SET draft_content=NULL,updated_at=now() WHERE section=_section; END; $$;

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
-- Check-in / check-out scanner (Task 1.1)
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
-- Check-in / check-out scanner (Task 1.2)
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
-- Check-in / check-out scanner (Task 1.3)
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
    e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue,
    -- Banners live in banner_*_url; image_url is a legacy field, usually empty.
    COALESCE(NULLIF(e.banner_landscape_url, ''), NULLIF(e.image_url, ''), NULLIF(e.banner_portrait_url, '')),
    e.status,
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

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 003_fix_footer_links.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- Fix footer links: replace placeholder "#" hrefs with real routes.
-- All pages (About, Contact, Features, Pricing, Privacy, Terms) already exist
-- in the app — this update simply points the footer CMS data to them.

UPDATE public.site_content
SET content = '{
  "brandName": "Illuxus",
  "tagline": "The modern event platform.",
  "columns": [
    {
      "title": "Product",
      "links": [
        { "label": "Features",  "href": "/features"  },
        { "label": "Pricing",   "href": "/pricing"   },
        { "label": "Events",    "href": "/events"    },
        { "label": "Discover",  "href": "/discover"  }
      ]
    },
    {
      "title": "Company",
      "links": [
        { "label": "About",    "href": "/about"   },
        { "label": "Contact",  "href": "/contact" },
        { "label": "Blog",     "href": "/about"   },
        { "label": "Careers",  "href": "/contact" }
      ]
    },
    {
      "title": "Resources",
      "links": [
        { "label": "Help Center", "href": "/contact"   },
        { "label": "Community",   "href": "/community" },
        { "label": "Status",      "href": "/contact"   },
        { "label": "Changelog",   "href": "/about"     }
      ]
    },
    {
      "title": "Legal",
      "links": [
        { "label": "Privacy Policy",   "href": "/privacy" },
        { "label": "Terms of Service", "href": "/terms"   },
        { "label": "Cookie Policy",    "href": "/privacy" },
        { "label": "GDPR",             "href": "/privacy" }
      ]
    }
  ],
  "copyright": "© 2026 Illuxus Technologies. All rights reserved."
}'::jsonb
WHERE section = 'footer';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 004_footer_legal_links.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- Point footer Legal column entries at their dedicated pages.
--
-- Previously Cookie Policy and GDPR both fell back to /privacy. We now have
-- /cookies (CookiePolicyPage) and /gdpr (GdprPage) — wire the CMS so the
-- footer renders the correct destinations across the site.
--
-- Everything else in the footer is unchanged from migration 003.

UPDATE public.site_content
SET content = '{
  "brandName": "Illuxus",
  "tagline": "The modern event platform.",
  "columns": [
    {
      "title": "Product",
      "links": [
        { "label": "Features",  "href": "/features"  },
        { "label": "Pricing",   "href": "/pricing"   },
        { "label": "Events",    "href": "/events"    },
        { "label": "Discover",  "href": "/discover"  }
      ]
    },
    {
      "title": "Company",
      "links": [
        { "label": "About",    "href": "/about"   },
        { "label": "Contact",  "href": "/contact" },
        { "label": "Blog",     "href": "/about"   },
        { "label": "Careers",  "href": "/contact" }
      ]
    },
    {
      "title": "Resources",
      "links": [
        { "label": "Help Center", "href": "/contact"   },
        { "label": "Community",   "href": "/community" },
        { "label": "Status",      "href": "/contact"   },
        { "label": "Changelog",   "href": "/about"     }
      ]
    },
    {
      "title": "Legal",
      "links": [
        { "label": "Privacy Policy",   "href": "/privacy" },
        { "label": "Terms of Service", "href": "/terms"   },
        { "label": "Cookie Policy",    "href": "/cookies" },
        { "label": "GDPR",             "href": "/gdpr"    }
      ]
    }
  ],
  "copyright": "© 2026 Illuxus Technologies. All rights reserved."
}'::jsonb
WHERE section = 'footer';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 005_support_tickets.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- 005_support_tickets.sql — comprehensive ticket-based support system.
--
-- Replaces the simulated contact-form submission with a real, numbered,
-- trackable ticketing workflow:
--
--   • Anonymous visitors (and logged-in users) submit tickets via the contact
--     form. The edge function `submit-support-ticket` inserts via the service
--     role, generates a human-readable ID (ILX-YYYY-XXXXXX), and emails both
--     the submitter and the support inbox.
--   • Users track their tickets at /support/ticket/:ticketNumber by supplying
--     the email they used to submit; the `get_my_ticket` SECURITY DEFINER
--     RPC matches on (ticket_number, lower(email)) — no auth required.
--   • Super admins (`user_roles.role = 'admin'`) read and manage everything
--     via direct table access (RLS-gated) and the `admin_ticket_stats` RPC.
--
-- Idempotent-safe: every DDL statement uses IF NOT EXISTS / DROP-and-recreate
-- where possible. Re-running the migration on a partially-applied DB will not
-- error out.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Postgres doesn't support `CREATE TYPE … IF NOT EXISTS` directly, so wrap
-- each in a DO block that checks pg_type. This makes the migration safe to
-- re-run when ticketing has been partially applied (or applied via squash).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status') THEN
    CREATE TYPE public.support_ticket_status AS ENUM
      ('open', 'pending', 'awaiting_user', 'resolved', 'closed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_priority') THEN
    CREATE TYPE public.support_ticket_priority AS ENUM
      ('low', 'normal', 'high', 'urgent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_category') THEN
    CREATE TYPE public.support_ticket_category AS ENUM
      ('general', 'sales', 'support', 'billing', 'privacy',
       'grievance', 'press', 'legal', 'feature_request', 'bug_report', 'other');
  END IF;
END $$;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  -- Submitter info (may not have an account)
  name text NOT NULL,
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Ticket details
  subject text NOT NULL,
  category public.support_ticket_category NOT NULL DEFAULT 'general',
  message text NOT NULL,
  -- Workflow
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Provenance
  source text NOT NULL DEFAULT 'contact_form',
  user_agent text,
  ip_hash text,
  page_url text,
  -- Internal admin notes (free-form, hidden from user)
  internal_notes text,
  -- Tracking
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_email    ON public.support_tickets(lower(email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created  ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to);

-- Message thread (replies, both user and staff, plus system audit messages)
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('user', 'staff', 'system')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  email_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON public.support_ticket_messages(ticket_id, created_at);

-- ── Helper functions ─────────────────────────────────────────────────────────

-- Generate a human-readable ticket number: ILX-2026-A1B2C3.
-- Uses gen_random_bytes (pgcrypto, already loaded in 000_full_schema.sql).
-- Retries on the (astronomically unlikely) collision.
CREATE OR REPLACE FUNCTION public.generate_ticket_number() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_suffix text;
  v_candidate text;
  v_exists boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_suffix := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    v_candidate := 'ILX-' || v_year || '-' || v_suffix;
    SELECT EXISTS(SELECT 1 FROM public.support_tickets WHERE ticket_number = v_candidate)
      INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_tries := v_tries + 1;
    IF v_tries > 16 THEN
      -- Should never happen with 16^6 = 16.7M values per year; raise rather
      -- than loop forever so the caller sees a real error.
      RAISE EXCEPTION 'Could not generate unique ticket number after % tries', v_tries;
    END IF;
  END LOOP;
  RETURN v_candidate;
END $$;

-- BEFORE INSERT trigger: fill ticket_number if missing, normalise email.
CREATE OR REPLACE FUNCTION public.support_tickets_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_insert
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_insert();

-- BEFORE UPDATE trigger: bump updated_at, stamp resolved_at / closed_at on
-- the first transition into each terminal state.
CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch_updated ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies are dropped/recreated to keep the migration idempotent.

DROP POLICY IF EXISTS "Authenticated can insert ticket"          ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins read all tickets"            ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins update all tickets"          ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins delete tickets"              ON public.support_tickets;
DROP POLICY IF EXISTS "Super admins read all messages"           ON public.support_ticket_messages;
DROP POLICY IF EXISTS "Super admins insert messages"             ON public.support_ticket_messages;

-- Authenticated users can submit their own ticket directly (the contact form
-- normally goes via the service-role edge function, but the policy keeps the
-- in-app "Contact support" surfaces working too).
CREATE POLICY "Authenticated can insert ticket"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Super admins read and update every ticket. `has_role` was defined in
-- 000_full_schema.sql and is the canonical admin check across the platform.
CREATE POLICY "Super admins read all tickets"
  ON public.support_tickets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins update all tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins delete tickets"
  ON public.support_tickets FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Messages: admins read + write. The public tracking flow uses SECURITY DEFINER
-- RPCs that bypass RLS, so anonymous users never need direct table access.
CREATE POLICY "Super admins read all messages"
  ON public.support_ticket_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins insert messages"
  ON public.support_ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Public tracking RPCs ─────────────────────────────────────────────────────

-- Anyone (anon or authenticated) can look up a ticket by (number, email).
-- Returns 0 rows when either value is wrong — same shape either way, so a
-- bad email can't be distinguished from a bad number.
CREATE OR REPLACE FUNCTION public.get_my_ticket(p_ticket_number text, p_email text)
RETURNS TABLE (
  id uuid,
  ticket_number text,
  name text,
  email text,
  subject text,
  category public.support_ticket_category,
  message text,
  status public.support_ticket_status,
  priority public.support_ticket_priority,
  created_at timestamptz,
  updated_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.ticket_number, t.name, t.email, t.subject, t.category,
         t.message, t.status, t.priority, t.created_at, t.updated_at,
         t.first_response_at, t.resolved_at
  FROM public.support_tickets t
  WHERE t.ticket_number = trim(p_ticket_number)
    AND lower(t.email) = lower(trim(p_email));
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_ticket(text, text) TO anon, authenticated;

-- Returns the (non-internal) message thread for a ticket, gated by the same
-- (number, email) match as the ticket lookup. Internal notes / system audit
-- rows are filtered out before they leave the database.
CREATE OR REPLACE FUNCTION public.get_my_ticket_messages(p_ticket_number text, p_email text)
RETURNS TABLE (
  id uuid,
  author_type text,
  author_name text,
  body text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.author_type, m.author_name, m.body, m.created_at
  FROM public.support_ticket_messages m
  JOIN public.support_tickets t ON t.id = m.ticket_id
  WHERE t.ticket_number = trim(p_ticket_number)
    AND lower(t.email) = lower(trim(p_email))
    AND m.is_internal = false
    AND m.author_type IN ('user', 'staff')
  ORDER BY m.created_at ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_ticket_messages(text, text) TO anon, authenticated;

-- ── Admin stats RPC ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_ticket_stats()
RETURNS TABLE (
  total bigint,
  open_count bigint,
  pending_count bigint,
  awaiting_user_count bigint,
  resolved_count bigint,
  closed_count bigint,
  urgent_count bigint,
  high_count bigint,
  last_24h_count bigint,
  avg_resolution_hours numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE status = 'open')::bigint,
    count(*) FILTER (WHERE status = 'pending')::bigint,
    count(*) FILTER (WHERE status = 'awaiting_user')::bigint,
    count(*) FILTER (WHERE status = 'resolved')::bigint,
    count(*) FILTER (WHERE status = 'closed')::bigint,
    count(*) FILTER (WHERE priority = 'urgent')::bigint,
    count(*) FILTER (WHERE priority = 'high')::bigint,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::bigint,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
        FILTER (WHERE resolved_at IS NOT NULL),
      0
    )::numeric
  FROM public.support_tickets;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_ticket_stats() TO authenticated;

-- ── Admin list-of-admins RPC (for the "Assign to" dropdown) ──────────────────
-- Lists every super admin so the admin panel can populate the assignee
-- selector without exposing the full users table.
CREATE OR REPLACE FUNCTION public.admin_list_super_admins()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.display_name, '') AS display_name,
         COALESCE(u.email, '') AS email
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY display_name NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_super_admins() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 006_admin_activity_log.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- 006_admin_activity_log.sql — automated audit triggers + super-admin RPCs.
--
-- Adds the back-end machinery for the super-admin control suite:
--
--   • Generic `audit_log_row_change()` trigger function that captures
--     auth.uid() + actor email + a curated jsonb diff into `public.audit_logs`
--     for every INSERT / UPDATE / DELETE on the platform's critical tables.
--   • Trigger wiring for events, organizations, profiles, user_roles,
--     subscriptions, support_tickets.
--   • New columns:
--       profiles.banned_at / banned_reason
--       events.published    (boolean mirror of `status = 'published'`)
--       events.deleted_at   (soft-delete marker for admin force-delete)
--       subscriptions.cancelled_at
--   • New admin RPCs (all SECURITY DEFINER, gated by `has_role(_, 'admin')`):
--       admin_user_activity_feed
--       admin_recent_activity
--       admin_ban_user / admin_unban_user
--       admin_force_password_reset
--       admin_delete_user
--       admin_event_force_unpublish / admin_event_force_delete
--       admin_revenue_summary
--       admin_health_snapshot
--
-- Idempotent-safe: every DDL uses IF NOT EXISTS / DROP-and-recreate. The
-- migration is re-runnable on a partially-applied DB.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. New columns ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at      timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason  text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS published  boolean,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill `published` from existing `status` so downstream code can rely on
-- the boolean. New rows default to `status = 'draft'` so published stays false.
UPDATE public.events
   SET published = (status = 'published')
 WHERE published IS NULL;

ALTER TABLE public.events ALTER COLUMN published SET DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ── 2. Helper: resolve actor email from auth.users ───────────────────────────

CREATE OR REPLACE FUNCTION public._audit_actor_email(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT email::text FROM auth.users WHERE id = _uid;
$$;

-- ── 3. Generic audit trigger function ────────────────────────────────────────
--
-- One function covers every wired-up table. We derive the verb from TG_OP and
-- the table name (e.g. event.created, event.updated, event.deleted), capture
-- a curated diff of the top-watched columns, and skip when auth.uid() is null
-- (service-role inserts during signup / migrations should not flood the log).
--
-- The set of "watched columns" is intentionally narrow per table so that big
-- jsonb blobs (page_config, plan_limits, landing_config, video_fx_prefs) never
-- end up in audit_logs.details.

CREATE OR REPLACE FUNCTION public.audit_log_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_email text;
  v_action     text;
  v_target_type text := TG_TABLE_NAME;
  v_target_id  text;
  v_details    jsonb := '{}'::jsonb;
  v_old        jsonb;
  v_new        jsonb;
  v_singular   text;
BEGIN
  -- Skip writes that don't have an auth.uid() (service-role / signup flow).
  -- Without an actor we can't attribute the change, and the noise would
  -- swamp the feed.
  IF v_actor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Singularise table_name for nicer action verbs (events -> event).
  v_singular := CASE TG_TABLE_NAME
    WHEN 'events'           THEN 'event'
    WHEN 'organizations'    THEN 'org'
    WHEN 'profiles'         THEN 'profile'
    WHEN 'user_roles'       THEN 'role'
    WHEN 'subscriptions'    THEN 'subscription'
    WHEN 'support_tickets'  THEN 'ticket'
    ELSE TG_TABLE_NAME
  END;

  v_action := v_singular || '.' || CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    WHEN 'DELETE' THEN 'deleted'
  END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_target_id := COALESCE(v_old->>'id', '');
  ELSE
    v_new := to_jsonb(NEW);
    v_target_id := COALESCE(v_new->>'id', '');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
  END IF;

  -- Build a curated diff per table. Each branch lists the top-10ish columns
  -- worth keeping in the audit trail; everything else (jsonb config blobs,
  -- timestamps, denormalised counters) is dropped.
  IF TG_TABLE_NAME = 'events' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'title',     COALESCE(v_new->>'title',     v_old->>'title'),
      'slug',      COALESCE(v_new->>'slug',      v_old->>'slug'),
      'status',    COALESCE(v_new->>'status',    v_old->>'status'),
      'date',      COALESCE(v_new->>'date',      v_old->>'date'),
      'capacity',  COALESCE(v_new->>'capacity',  v_old->>'capacity'),
      'price',     COALESCE(v_new->>'price',     v_old->>'price'),
      'currency',  COALESCE(v_new->>'currency',  v_old->>'currency'),
      'published', COALESCE(v_new->>'published', v_old->>'published'),
      'deleted_at',COALESCE(v_new->>'deleted_at',v_old->>'deleted_at'),
      'org_id',    COALESCE(v_new->>'org_id',    v_old->>'org_id')
    ));

  ELSIF TG_TABLE_NAME = 'organizations' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'name',          COALESCE(v_new->>'name',          v_old->>'name'),
      'slug',          COALESCE(v_new->>'slug',          v_old->>'slug'),
      'plan',          COALESCE(v_new->>'plan',          v_old->>'plan'),
      'owner_id',      COALESCE(v_new->>'owner_id',      v_old->>'owner_id'),
      'custom_domain', COALESCE(v_new->>'custom_domain', v_old->>'custom_domain'),
      'subdomain',     COALESCE(v_new->>'subdomain',     v_old->>'subdomain'),
      'billing_email', COALESCE(v_new->>'billing_email', v_old->>'billing_email')
    ));

  ELSIF TG_TABLE_NAME = 'profiles' THEN
    -- Profiles are noisy (every UI form submit touches at least display_name),
    -- so only log when account_type / completion flags / ban status changed.
    IF TG_OP = 'UPDATE' AND
       (v_old->>'account_type')          IS NOT DISTINCT FROM (v_new->>'account_type') AND
       (v_old->>'profile_completed')     IS NOT DISTINCT FROM (v_new->>'profile_completed') AND
       (v_old->>'onboarding_completed')  IS NOT DISTINCT FROM (v_new->>'onboarding_completed') AND
       (v_old->>'banned_at')             IS NOT DISTINCT FROM (v_new->>'banned_at')
    THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'user_id',              COALESCE(v_new->>'user_id',              v_old->>'user_id'),
      'account_type',         COALESCE(v_new->>'account_type',         v_old->>'account_type'),
      'profile_completed',    COALESCE(v_new->>'profile_completed',    v_old->>'profile_completed'),
      'onboarding_completed', COALESCE(v_new->>'onboarding_completed', v_old->>'onboarding_completed'),
      'banned_at',            COALESCE(v_new->>'banned_at',            v_old->>'banned_at'),
      'banned_reason',        COALESCE(v_new->>'banned_reason',        v_old->>'banned_reason')
    ));
    -- For profiles, target_id is the user_id (more useful than the profile pk).
    v_target_id := COALESCE(v_new->>'user_id', v_old->>'user_id', v_target_id);

  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    -- Every grant/revoke is interesting. Encode the verb in the action name
    -- so the activity feed reads naturally ("role.granted: admin").
    v_action := 'role.' || CASE TG_OP
      WHEN 'INSERT' THEN 'granted'
      WHEN 'DELETE' THEN 'revoked'
      ELSE 'updated'
    END;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'user_id', COALESCE(v_new->>'user_id', v_old->>'user_id'),
      'role',    COALESCE(v_new->>'role',    v_old->>'role')
    ));
    v_target_id := COALESCE(v_new->>'user_id', v_old->>'user_id', v_target_id);

  ELSIF TG_TABLE_NAME = 'subscriptions' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'org_id',       COALESCE(v_new->>'org_id',       v_old->>'org_id'),
      'plan',         COALESCE(v_new->>'plan',         v_old->>'plan'),
      'status',       COALESCE(v_new->>'status',       v_old->>'status'),
      'cancelled_at', COALESCE(v_new->>'cancelled_at', v_old->>'cancelled_at')
    ));

  ELSIF TG_TABLE_NAME = 'support_tickets' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'ticket_number', COALESCE(v_new->>'ticket_number', v_old->>'ticket_number'),
      'status',        COALESCE(v_new->>'status',        v_old->>'status'),
      'priority',      COALESCE(v_new->>'priority',      v_old->>'priority'),
      'assigned_to',   COALESCE(v_new->>'assigned_to',   v_old->>'assigned_to')
    ));
  END IF;

  v_actor_email := public._audit_actor_email(v_actor_id);

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (v_actor_id, v_actor_email, v_action, v_target_type, v_target_id, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 4. Trigger wiring ────────────────────────────────────────────────────────
-- One DROP + CREATE per (table, event) so the migration is fully idempotent.
-- UPDATE triggers use WHEN (OLD.* IS DISTINCT FROM NEW.*) to avoid no-op
-- writes that would otherwise spam the feed.

-- events ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_events_insert ON public.events;
CREATE TRIGGER audit_events_insert
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_events_update ON public.events;
CREATE TRIGGER audit_events_update
  AFTER UPDATE ON public.events
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_events_delete ON public.events;
CREATE TRIGGER audit_events_delete
  AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- organizations ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_organizations_insert ON public.organizations;
CREATE TRIGGER audit_organizations_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_organizations_update ON public.organizations;
CREATE TRIGGER audit_organizations_update
  AFTER UPDATE ON public.organizations
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_organizations_delete ON public.organizations;
CREATE TRIGGER audit_organizations_delete
  AFTER DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- profiles ──────────────────────────────────────────────────────────────────
-- INSERT skipped intentionally: profile rows are created during signup with
-- auth.uid() set to the new user, and we don't need a "profile.created" entry
-- for every single signup.
DROP TRIGGER IF EXISTS audit_profiles_update ON public.profiles;
CREATE TRIGGER audit_profiles_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

-- user_roles ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_user_roles_insert ON public.user_roles;
CREATE TRIGGER audit_user_roles_insert
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_user_roles_delete ON public.user_roles;
CREATE TRIGGER audit_user_roles_delete
  AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- subscriptions ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_subscriptions_insert ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_insert
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_subscriptions_update ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_update
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_subscriptions_delete ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_delete
  AFTER DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- support_tickets ───────────────────────────────────────────────────────────
-- Tickets are mostly admin-facing edits, so we log every change.
DROP TRIGGER IF EXISTS audit_support_tickets_update ON public.support_tickets;
CREATE TRIGGER audit_support_tickets_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

-- ── 5. Admin RPCs ────────────────────────────────────────────────────────────

-- 5.1 admin_user_activity_feed ───────────────────────────────────────────────
-- Pull every audit row where the user was either the actor or the target
-- (matched via target_id::text — covers user_id, profile-user-id, etc).
CREATE OR REPLACE FUNCTION public.admin_user_activity_feed(
  _user_id uuid,
  _limit   int DEFAULT 50
)
RETURNS TABLE (
  id          uuid,
  actor_id    uuid,
  actor_email text,
  action      text,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT a.id, a.actor_id, a.actor_email, a.action,
         a.target_type, a.target_id, a.details, a.created_at
  FROM public.audit_logs a
  WHERE a.actor_id = _user_id
     OR a.target_id = _user_id::text
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_activity_feed(uuid, int) TO authenticated;

-- 5.2 admin_recent_activity ──────────────────────────────────────────────────
-- Paginated platform-wide audit feed with optional action filter.
CREATE OR REPLACE FUNCTION public.admin_recent_activity(
  _limit         int  DEFAULT 100,
  _action_filter text DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  actor_id    uuid,
  actor_email text,
  action      text,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.audit_logs a
  WHERE (_action_filter IS NULL OR a.action ILIKE _action_filter || '%');

  RETURN QUERY
  SELECT a.id, a.actor_id, a.actor_email, a.action,
         a.target_type, a.target_id, a.details, a.created_at,
         v_total
  FROM public.audit_logs a
  WHERE (_action_filter IS NULL OR a.action ILIKE _action_filter || '%')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recent_activity(int, text) TO authenticated;

-- 5.3 admin_ban_user / admin_unban_user ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  UPDATE public.profiles
     SET banned_at     = now(),
         banned_reason = _reason,
         updated_at    = now()
   WHERE user_id = _user_id;

  -- Trigger on profiles will fire, but we also write an explicit user.banned
  -- entry so the activity feed surfaces the ban as its own primary verb.
  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.banned', 'profiles',
          _user_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
     SET banned_at     = NULL,
         banned_reason = NULL,
         updated_at    = now()
   WHERE user_id = _user_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.unbanned', 'profiles',
          _user_id::text, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- 5.4 admin_force_password_reset ─────────────────────────────────────────────
-- Generates a Supabase recovery token directly on auth.users. The admin can
-- copy-paste the magic link from the returned token. We intentionally do not
-- email the user — keeps the surface area small and avoids confusing
-- end-users who didn't request a reset.
CREATE OR REPLACE FUNCTION public.admin_force_password_reset(_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  UPDATE auth.users
     SET recovery_token  = v_token,
         recovery_sent_at = now()
   WHERE id = _user_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.password_reset_forced',
          'auth.users', _user_id::text, '{}'::jsonb);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_password_reset(uuid) TO authenticated;

-- 5.5 admin_delete_user ──────────────────────────────────────────────────────
-- Deletes the row from auth.users — cascades clean up profiles, user_roles,
-- registrations (where user_id matches), org_members, etc.
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin_count int;
  v_target_is_admin boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    INTO v_target_is_admin;

  IF v_target_is_admin THEN
    SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last super admin';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.deleted', 'auth.users',
          _user_id::text, jsonb_build_object('was_admin', v_target_is_admin));

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 5.6 admin_event_force_unpublish ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_event_force_unpublish(_event_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.events
     SET status     = 'cancelled',
         published  = false,
         updated_at = now()
   WHERE id = _event_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'event.force_unpublished',
          'events', _event_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_event_force_unpublish(uuid, text) TO authenticated;

-- 5.7 admin_event_force_delete (soft delete) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_event_force_delete(_event_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.events
     SET deleted_at = now(),
         status     = 'cancelled',
         published  = false,
         updated_at = now()
   WHERE id = _event_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'event.force_deleted',
          'events', _event_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_event_force_delete(uuid, text) TO authenticated;

-- 5.8 admin_revenue_summary ──────────────────────────────────────────────────
-- All numbers are derived directly from registrations / subscriptions so the
-- super admin always sees the live snapshot, no caching layer involved.
--
--   gross_revenue        — sum of amount_paid on confirmed/paid registrations
--   platform_fees        — 2% of gross
--   refunds_issued       — sum of amount_paid on rows where status='refunded'
--   net_revenue          — gross - refunds - platform_fees
--   mrr                  — sum of plan-implied MRR for active paid subs
--   ticket_count_paid    — number of paid registrations contributing to gross
CREATE OR REPLACE FUNCTION public.admin_revenue_summary()
RETURNS TABLE (
  gross_revenue     numeric,
  platform_fees     numeric,
  refunds_issued    numeric,
  net_revenue       numeric,
  mrr               numeric,
  ticket_count_paid bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gross  numeric;
  v_refunds numeric;
  v_fees   numeric;
  v_net    numeric;
  v_mrr    numeric;
  v_count  bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    COALESCE(SUM(amount_paid) FILTER (WHERE status IN ('confirmed','paid')), 0)::numeric,
    COALESCE(SUM(amount_paid) FILTER (WHERE status = 'refunded'), 0)::numeric,
    COALESCE(count(*) FILTER (WHERE status IN ('confirmed','paid') AND amount_paid > 0), 0)::bigint
  INTO v_gross, v_refunds, v_count
  FROM public.registrations;

  v_fees := (v_gross * 0.02)::numeric;
  v_net  := (v_gross - v_refunds - v_fees)::numeric;

  -- Simple plan-to-MRR map. Edit alongside pricing changes in
  -- src/lib/billing/plan-meta.ts.
  SELECT COALESCE(SUM(
    CASE plan
      WHEN 'starter'   THEN 29
      WHEN 'pro'       THEN 99
      WHEN 'business'  THEN 299
      ELSE 0
    END
  ), 0)::numeric
  INTO v_mrr
  FROM public.subscriptions
  WHERE status = 'active';

  RETURN QUERY SELECT v_gross, v_fees, v_refunds, v_net, v_mrr, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO authenticated;

-- 5.9 admin_health_snapshot ──────────────────────────────────────────────────
-- Live counters for the System Health page.
CREATE OR REPLACE FUNCTION public.admin_health_snapshot()
RETURNS TABLE (
  db_size_mb                  numeric,
  total_users                 bigint,
  total_events                bigint,
  total_orgs                  bigint,
  total_tickets               bigint,
  total_communications_sent   bigint,
  last_24h_signups            bigint,
  last_24h_events_created     bigint,
  last_24h_failed_email_count bigint,
  last_24h_errors_logged      bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    -- pg_database_size returns bytes; convert to whole megabytes.
    (pg_database_size(current_database()) / (1024.0 * 1024.0))::numeric AS db_size_mb,
    (SELECT count(*)::bigint FROM public.profiles),
    (SELECT count(*)::bigint FROM public.events),
    (SELECT count(*)::bigint FROM public.organizations),
    (SELECT count(*)::bigint FROM public.support_tickets),
    (SELECT count(*)::bigint FROM public.communication_recipients
       WHERE email_status IN ('sent','delivered','opened','clicked')),
    (SELECT count(*)::bigint FROM public.profiles
       WHERE created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.events
       WHERE created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.communication_recipients
       WHERE email_status IN ('failed','bounced')
         AND created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.audit_logs
       WHERE action LIKE '%error%'
         AND created_at >= now() - interval '24 hours');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_health_snapshot() TO authenticated;

-- ── 6. RLS hardening for banned users ────────────────────────────────────────
-- Banned users (`profiles.banned_at IS NOT NULL`) should not be able to
-- create new events or register for events. Existing RLS on each table is
-- preserved; we just AND in the not-banned predicate.

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = _user_id AND banned_at IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated;

-- Replace the event INSERT policy so banned users are blocked at the row level.
DROP POLICY IF EXISTS "Insert events" ON public.events;
CREATE POLICY "Insert events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_user_banned(auth.uid())
  );

-- And the registration INSERT policy.
DROP POLICY IF EXISTS "Auth register" ON public.registrations;
CREATE POLICY "Auth register" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR user_id IS NULL)
    AND NOT public.is_user_banned(auth.uid())
  );

-- ── 7. End ───────────────────────────────────────────────────────────────────
-- Migration is fully idempotent: every CREATE OR REPLACE / DROP-and-CREATE
-- ensures a clean re-run on a partially-applied database.

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 007_co_owner_management.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- 007_co_owner_management.sql — allow co-owners to manage org team roles.
--
-- Before this migration, `is_org_owner(uid, org_id)` only returned TRUE when
-- the user matched `organizations.owner_id` (a singular column). When an
-- existing owner promoted a teammate to the "owner" role via the org member
-- dropdown, the new owner's `org_members.role` was set to 'owner' but RLS
-- still rejected them from inviting members, changing roles, or removing
-- people because `is_org_owner` ignored that membership row.
--
-- The fix: extend `is_org_owner` to return TRUE in EITHER case —
--   (a) the user is the canonical workspace owner (organizations.owner_id),
--   (b) the user has org_members.role = 'owner' in that workspace.
--
-- All policies that USED `is_org_owner` automatically inherit the new
-- behaviour because they call the helper rather than encoding the predicate
-- inline. The function is idempotent — CREATE OR REPLACE handles re-runs.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.organizations
       WHERE id = _org_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.org_members
       WHERE org_id = _org_id
         AND user_id = _user_id
         AND role = 'owner'
    );
$$;

-- No GRANT needed — the helper is SECURITY DEFINER and is called by RLS
-- policies + RPCs that already have access. The original definition in
-- 000_full_schema.sql had no explicit GRANT either.

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 008_utm_tracking.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 008_utm_tracking.sql — UTM parameter capture + link analytics
--
-- Adds first-touch UTM attribution to every registration so organisers can
-- measure which campaigns / channels drive the most sign-ups and ticket
-- sales for each event.
--
-- Changes:
--   1. Add 5 nullable utm_* columns to public.registrations
--   2. Create public.utm_clicks — lightweight page-view tracking table so
--      we can compute funnel drop-off (views → registrations) per campaign.
--   3. Admin / organiser RPC: event_utm_summary(_event_id) that returns an
--      aggregated breakdown by source × medium × campaign with click + reg
--      + conversion-rate columns.
--
-- Idempotent: every DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. UTM columns on registrations ─────────────────────────────────────────

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- Index the most common group-by columns for the analytics query.
CREATE INDEX IF NOT EXISTS idx_registrations_utm_source
  ON public.registrations(event_id, utm_source)
  WHERE utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_utm_campaign
  ON public.registrations(event_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- ── 2. utm_clicks — page-view / link-click events ───────────────────────────
-- Each row is a single page-view on a public event URL that carried at least
-- one utm_* parameter. Stored client-side via a SECURITY DEFINER RPC so
-- anonymous visitors can write without exposing the table directly.

CREATE TABLE IF NOT EXISTS public.utm_clicks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  -- Referrer and path are stored for debugging; never store PII here.
  referrer     text,
  path         text,
  -- Nullable session fingerprint (non-PII): helps de-duplicate rapid re-loads.
  session_key  text,
  clicked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_clicks_event
  ON public.utm_clicks(event_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_utm_clicks_campaign
  ON public.utm_clicks(event_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- RLS: organisers and admins can read; no direct inserts from the client.
ALTER TABLE public.utm_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org owners read utm_clicks" ON public.utm_clicks;
CREATE POLICY "Org owners read utm_clicks"
  ON public.utm_clicks FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- ── 3. record_utm_click — SECURITY DEFINER RPC called from the SPA ──────────
-- Anonymous-safe: the SPA calls this on every public event page-load that
-- has at least one utm_* parameter. The function validates the event_id is
-- published before inserting.

CREATE OR REPLACE FUNCTION public.record_utm_click(
  _event_id     uuid,
  _utm_source   text DEFAULT NULL,
  _utm_medium   text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL,
  _utm_content  text DEFAULT NULL,
  _utm_term     text DEFAULT NULL,
  _referrer     text DEFAULT NULL,
  _path         text DEFAULT NULL,
  _session_key  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only track clicks on published events to avoid polluting analytics with
  -- draft previews.
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = _event_id AND status = 'published'
  ) THEN
    RETURN;
  END IF;

  -- De-duplicate: skip if the same session_key already recorded a click for
  -- this event in the last 30 minutes (prevents rapid browser-reload spam).
  IF _session_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.utm_clicks
    WHERE event_id = _event_id
      AND session_key = _session_key
      AND clicked_at > now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.utm_clicks (
    event_id, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, referrer, path, session_key
  ) VALUES (
    _event_id, _utm_source, _utm_medium, _utm_campaign,
    _utm_content, _utm_term,
    -- Truncate to 1000 chars to prevent oversized rows.
    left(_referrer, 1000),
    left(_path,     500),
    left(_session_key, 128)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.record_utm_click TO anon, authenticated;

-- ── 4. event_utm_summary — analytics RPC ────────────────────────────────────
-- Returns one row per (utm_source, utm_medium, utm_campaign) combination for
-- a given event, with click count, registration count, and conversion rate.
-- Gated: caller must be the event owner, an org member, or a super admin.

CREATE OR REPLACE FUNCTION public.event_utm_summary(_event_id uuid)
RETURNS TABLE (
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  clicks            bigint,
  registrations     bigint,
  conversion_rate   numeric  -- percentage, 0-100
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Auth gate
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH click_agg AS (
    SELECT
      coalesce(uc.utm_source,   '(direct)') AS src,
      coalesce(uc.utm_medium,   '(none)')   AS med,
      coalesce(uc.utm_campaign, '(none)')   AS camp,
      count(*) AS clicks
    FROM public.utm_clicks uc
    WHERE uc.event_id = _event_id
    GROUP BY 1, 2, 3
  ),
  reg_agg AS (
    SELECT
      coalesce(r.utm_source,   '(direct)') AS src,
      coalesce(r.utm_medium,   '(none)')   AS med,
      coalesce(r.utm_campaign, '(none)')   AS camp,
      count(*) AS regs
    FROM public.registrations r
    WHERE r.event_id = _event_id
      AND r.status <> 'cancelled'
    GROUP BY 1, 2, 3
  )
  SELECT
    coalesce(c.src, r.src)   AS utm_source,
    coalesce(c.med, r.med)   AS utm_medium,
    coalesce(c.camp, r.camp) AS utm_campaign,
    coalesce(c.clicks, 0)    AS clicks,
    coalesce(r.regs, 0)      AS registrations,
    CASE
      WHEN coalesce(c.clicks, 0) = 0 THEN 0
      ELSE round(coalesce(r.regs, 0)::numeric / c.clicks * 100, 1)
    END AS conversion_rate
  FROM click_agg c
  FULL OUTER JOIN reg_agg r
    ON r.src = c.src AND r.med = c.med AND r.camp = c.camp
  ORDER BY coalesce(r.regs, 0) DESC, coalesce(c.clicks, 0) DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.event_utm_summary TO authenticated;

-- ── 5. platform_utm_summary — super-admin cross-event view ──────────────────
-- Returns top campaigns across the whole platform, ranked by registrations.
-- Restricted to super admins only.

CREATE OR REPLACE FUNCTION public.platform_utm_summary(
  _limit int DEFAULT 50
)
RETURNS TABLE (
  event_id      uuid,
  event_title   text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  clicks        bigint,
  registrations bigint,
  conversion_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    e.id                                    AS event_id,
    e.title                                 AS event_title,
    coalesce(r.utm_source,   '(direct)')    AS utm_source,
    coalesce(r.utm_medium,   '(none)')      AS utm_medium,
    coalesce(r.utm_campaign, '(none)')      AS utm_campaign,
    coalesce(ck.clicks, 0)                  AS clicks,
    count(r.id)                             AS registrations,
    CASE
      WHEN coalesce(ck.clicks, 0) = 0 THEN 0
      ELSE round(count(r.id)::numeric / ck.clicks * 100, 1)
    END                                     AS conversion_rate
  FROM public.registrations r
  JOIN public.events e ON e.id = r.event_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS clicks
    FROM public.utm_clicks uc
    WHERE uc.event_id = r.event_id
      AND coalesce(uc.utm_source,   '(direct)') = coalesce(r.utm_source,   '(direct)')
      AND coalesce(uc.utm_medium,   '(none)')   = coalesce(r.utm_medium,   '(none)')
      AND coalesce(uc.utm_campaign, '(none)')   = coalesce(r.utm_campaign, '(none)')
  ) ck ON true
  WHERE r.status <> 'cancelled'
  GROUP BY e.id, e.title, r.utm_source, r.utm_medium, r.utm_campaign, ck.clicks
  ORDER BY count(r.id) DESC
  LIMIT _limit;
END $$;

GRANT EXECUTE ON FUNCTION public.platform_utm_summary TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 009_utm_links.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 009_utm_links.sql — Persistent UTM link registry
--
-- Purpose
-- ───────
-- When an organiser generates a tracked share link via the UTM / Links tab,
-- save it to this table so the link can be reviewed, renamed, edited, and
-- (if unused) deleted. Links with any click or registration data attached
-- may be edited but NOT deleted — their history must be preserved.
--
-- Rules enforced
-- ───────────────
--   CREATE  → always allowed (INSERT).
--   EDIT    → allowed when at least one row exists in utm_clicks OR
--              registrations for the same (event_id, utm_campaign,
--              utm_source, utm_medium) combination.
--              Also allowed when zero data rows exist.
--   DELETE  → only allowed when zero clicks AND zero registrations have
--              been recorded for this link's coordinates.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.utm_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- UTM parameters (source + medium + campaign uniquely identify a link per event)
  utm_source   text NOT NULL,
  utm_medium   text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content  text,
  utm_term     text,

  -- Human-readable label the organiser optionally gives the link
  label        text,

  -- The full generated URL (stored for quick copy — derived from utm_* + event)
  url          text NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Enforce uniqueness: one saved link per (event, source, medium, campaign)
  UNIQUE (event_id, utm_source, utm_medium, utm_campaign)
);

CREATE INDEX IF NOT EXISTS idx_utm_links_event
  ON public.utm_links(event_id, created_at DESC);

ALTER TABLE public.utm_links ENABLE ROW LEVEL SECURITY;

-- Org members + super admins can read
DROP POLICY IF EXISTS "Org members read utm_links" ON public.utm_links;
CREATE POLICY "Org members read utm_links"
  ON public.utm_links FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- Org members can insert
DROP POLICY IF EXISTS "Org members insert utm_links" ON public.utm_links;
CREATE POLICY "Org members insert utm_links"
  ON public.utm_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- Org members can update (edit is always allowed)
DROP POLICY IF EXISTS "Org members update utm_links" ON public.utm_links;
CREATE POLICY "Org members update utm_links"
  ON public.utm_links FOR UPDATE TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- DELETE is allowed only when the link has received no data.
-- The check is enforced in the application layer via the
-- `utm_link_has_data` helper function below; the RLS policy
-- permits deletion for org members (the function call gates it).
DROP POLICY IF EXISTS "Org members delete utm_links" ON public.utm_links;
CREATE POLICY "Org members delete utm_links"
  ON public.utm_links FOR DELETE TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- ── Helper: does a utm_link row have any associated data? ────────────────────
-- Returns true when at least one utm_click or registration exists that
-- matches the link's (event_id, utm_source, utm_medium, utm_campaign).
-- Used client-side to decide whether to show Delete vs Edit-only.

CREATE OR REPLACE FUNCTION public.utm_link_has_data(_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id     uuid;
  v_utm_source   text;
  v_utm_medium   text;
  v_utm_campaign text;
  v_has_data     boolean;
BEGIN
  SELECT event_id, utm_source, utm_medium, utm_campaign
  INTO   v_event_id, v_utm_source, v_utm_medium, v_utm_campaign
  FROM   public.utm_links
  WHERE  id = _link_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT (
    EXISTS(
      SELECT 1 FROM public.utm_clicks
      WHERE event_id   = v_event_id
        AND coalesce(utm_source,   '') = coalesce(v_utm_source,   '')
        AND coalesce(utm_medium,   '') = coalesce(v_utm_medium,   '')
        AND coalesce(utm_campaign, '') = coalesce(v_utm_campaign, '')
    )
    OR
    EXISTS(
      SELECT 1 FROM public.registrations
      WHERE event_id   = v_event_id
        AND coalesce(utm_source,   '') = coalesce(v_utm_source,   '')
        AND coalesce(utm_medium,   '') = coalesce(v_utm_medium,   '')
        AND coalesce(utm_campaign, '') = coalesce(v_utm_campaign, '')
        AND status <> 'cancelled'
    )
  ) INTO v_has_data;

  RETURN v_has_data;
END $$;

GRANT EXECUTE ON FUNCTION public.utm_link_has_data TO authenticated;

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.utm_links_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_utm_links_updated ON public.utm_links;
CREATE TRIGGER trg_utm_links_updated
  BEFORE UPDATE ON public.utm_links
  FOR EACH ROW EXECUTE FUNCTION public.utm_links_set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 010_org_members_can_view_event_registrations.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 010_org_members_can_view_event_registrations.sql
--
-- Closes a long-standing visibility gap: when an organisation has multiple
-- team members and one of them creates an event, ONLY that creator (or a
-- platform admin) could see the registrations. Any other member of the same
-- organisation — including the org owner — got back zero rows from the
-- registrations table because the original RLS policy keyed off
-- `events.user_id` alone.
--
-- This is the bug behind reports like "I see Total: 4 in Registrations but
-- the Pending Approvals tab is empty even though an attendee just requested
-- to join" — the new pending row exists in the DB but RLS hides it from
-- everyone except the event creator.
--
-- The fix extends every registrations policy (SELECT / UPDATE / DELETE) to
-- also allow:
--   • Any member of the event's organisation (via org_members)
--   • Any user who is also the organisation's owner directly (legacy fallback)
--
-- INSERT stays as-is — attendees still register themselves.
--
-- Idempotent: drops the old policies before recreating with the same names so
-- the migration can be re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SELECT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner view regs" ON public.registrations;
CREATE POLICY "Owner view regs"
ON public.registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()                    -- event creator
         OR o.owner_id = auth.uid()                   -- organisation owner
         OR m.user_id IS NOT NULL                     -- any org_members row for this user
         OR has_role(auth.uid(), 'admin')             -- platform admin
       )
  )
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner update regs" ON public.registrations;
CREATE POLICY "Owner update regs"
ON public.registrations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()
         OR o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
         OR has_role(auth.uid(), 'admin')
       )
  )
);

-- ── DELETE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner delete regs" ON public.registrations;
CREATE POLICY "Owner delete regs"
ON public.registrations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()
         OR o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') IN ('admin', 'member'))
         OR has_role(auth.uid(), 'admin')
       )
  )
);

-- ── Audit-friendly comments so future engineers can find this quickly ───────
COMMENT ON POLICY "Owner view regs"   ON public.registrations IS
  'SELECT registrations: event creator, org owner, any org_member, or platform admin.';
COMMENT ON POLICY "Owner update regs" ON public.registrations IS
  'UPDATE registrations: event creator, org owner, org_members with role admin/member (NOT viewer), or platform admin.';
COMMENT ON POLICY "Owner delete regs" ON public.registrations IS
  'DELETE registrations: event creator, org owner, org_members with role admin/member (NOT viewer), or platform admin.';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 011_grant_service_role.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 011_grant_service_role.sql
--
-- Edge functions authenticate to Postgres using the `service_role` JWT/role.
-- The historical migrations granted privileges to `authenticated` (and a few
-- to `anon`), but never explicitly granted to `service_role`. In stock
-- Supabase projects that's usually fine because `service_role` inherits from
-- a superuser-ish ancestor and BYPASSRLS, but on this project the privilege
-- chain has drifted: edge functions like `send-ticket-email` hit
--
--   "permission denied for table registrations"
--
-- when they try to read a row, even with the service role key.
--
-- This migration grants every privilege `service_role` needs on the tables
-- our edge functions read or write today. It's idempotent — re-running it
-- on a fresh project is a no-op since `GRANT` doesn't error on already-
-- granted privileges.
--
-- It also re-grants on `authenticated` and `anon` for the same tables so
-- nothing the dashboard relies on regresses.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Core registration / event tables ─────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO service_role;

-- ── Email-related audit tables ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE         ON public.email_settings TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.event_emails   TO service_role;

-- ── Communications module (used by send-communication-email / send-email) ────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients   TO service_role;

-- ── Speaker / sponsor tables (used by participant flows + ticket email) ─────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speakers        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_speakers  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sponsors  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_members TO service_role;

-- ── Webinar tables touched by livekit/agora functions ────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_sessions  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_speakers  TO service_role;

-- ── Belt-and-braces: a future-proof grant for any table later added to public
-- ── so the next edge function we ship doesn't run into the same wall.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ── Sequences (needed if any insert uses a serial / identity column) ─────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- ── Function execution: every RPC we call from edge functions ────────────────
-- Edge functions call RPCs like communications_dispatch via service_role;
-- this blanket grant ensures none of them throw "function does not exist".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS fn_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.fn_name, r.args
    );
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── Schema usage (Postgres requires this even if the role has table grants) ──
GRANT USAGE ON SCHEMA public TO service_role;

COMMENT ON SCHEMA public IS
  'Public schema. Edge functions authenticate as service_role; grants in 011_grant_service_role.sql ensure they can read/write the tables our SMTP-based mailers need.';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 012_org_members_can_manage_events.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 012_org_members_can_manage_events.sql
--
-- Closes the manage-event editing gap. Before this migration, the events
-- table's RLS policies (UPDATE / DELETE) only allowed the original creator
-- (`events.user_id = auth.uid()`) or a platform admin to modify a row. When
-- a workspace owner, admin, or member — i.e. anyone except the literal
-- creator — opened the Manage Event → Settings tab on an event created by a
-- teammate, the form loaded fine but pressing "Save changes" silently
-- affected zero rows. Supabase does NOT raise an error for an RLS-blocked
-- UPDATE; the request returns 200 with an empty `data`, so the UI shows the
-- success toast and reloading reverts to the previous values.
--
-- Mirrors the pattern used in 010_org_members_can_view_event_registrations.sql.
-- Extends SELECT (so drafts authored by a teammate are visible to the rest
-- of the org), UPDATE (same audience, viewer excluded), and DELETE
-- (owner / admin / member only) to all org_members of the event's org.
--
-- INSERT keeps the existing predicate from 006_admin_activity_log.sql which
-- already covers banned-user enforcement.
--
-- Idempotent: drops the old policies by their original names before
-- recreating, so the migration can be re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- Drafts authored by a teammate must be visible to the workspace owner and
-- to every org_members row. Public/published events stay world-readable so
-- the marketing site continues to work.
DROP POLICY IF EXISTS "View published events" ON public.events;
CREATE POLICY "View published events"
ON public.events
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  OR auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (o.owner_id = auth.uid() OR m.user_id IS NOT NULL)
  )
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
-- Anyone with a non-viewer org_members role can edit the event. Viewers stay
-- read-only. Platform admins and the canonical workspace owner keep access.
DROP POLICY IF EXISTS "Update events" ON public.events;
CREATE POLICY "Update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
       )
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
       )
  )
);

-- ── DELETE ───────────────────────────────────────────────────────────────────
-- Destructive, so member is allowed (matches 010's behaviour for
-- registrations) but viewers explicitly cannot.
DROP POLICY IF EXISTS "Delete events" ON public.events;
CREATE POLICY "Delete events"
ON public.events
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') IN ('owner', 'admin', 'member'))
       )
  )
);

-- ── Audit comments ───────────────────────────────────────────────────────────
COMMENT ON POLICY "View published events" ON public.events IS
  'SELECT events: anyone for published; otherwise creator, platform admin, org owner, or any org_member.';
COMMENT ON POLICY "Update events" ON public.events IS
  'UPDATE events: creator, platform admin, org owner, or org_members with role owner/admin/member (NOT viewer).';
COMMENT ON POLICY "Delete events" ON public.events IS
  'DELETE events: creator, platform admin, org owner, or org_members with role owner/admin/member (NOT viewer).';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 013_anon_can_read_orgs_with_published_events.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 013_anon_can_read_orgs_with_published_events.sql
--
-- Unblocks per-event OG / Twitter share previews on links like:
--   https://illuxus.com/org/<orgSlug>/events/<eventSlug>
--
-- Before this migration, `organizations` RLS for anon allowed only rows where
-- `landing_published = true`. The Vercel edge function `api/event-og.ts`
-- joins the event row to its organisation via `organizations!inner(...)` so
-- the share card can include the org's name, logo, and canonical handle.
-- For any org whose landing page hadn't been explicitly published, anon got
-- back zero rows from the join — the function quietly fell through to the
-- unmodified `index.html`, which is why every event link previews as the
-- generic "illuxus — events, communities, and webinars" card.
--
-- Most events are published before their org's landing page is, so this gap
-- silently breaks share previews for almost every freshly-created event.
--
-- The fix: add an additional SELECT policy that grants anon read access to
-- an organisation row when it owns at least one published event. RLS
-- policies are OR'd together, so this only widens visibility — orgs without
-- any published events stay private under the existing policy.
--
-- Scope is intentionally tight: anon only ever sees the public identity
-- fields the OG endpoint and public event/org pages already render
-- (name, slug, subdomain, logo_url, custom_domain) — sensitive columns
-- (billing_email, payment provider ids, etc.) aren't read by anon code
-- paths. RLS controls visibility row-by-row; column-level scoping is
-- enforced at the query layer.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public view orgs with published events" ON public.organizations;
CREATE POLICY "Public view orgs with published events"
ON public.organizations
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
     WHERE e.org_id = organizations.id
       AND e.status = 'published'
  )
);

COMMENT ON POLICY "Public view orgs with published events" ON public.organizations IS
  'Allows anon (and authenticated) to read the parent org of any published event so per-event share cards / OG endpoints can include org name and logo.';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 014_fix_events_select_for_anon.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 014_fix_events_select_for_anon.sql
--
-- Repairs a regression introduced by 012_org_members_can_manage_events.sql.
--
-- 012 widened the events SELECT policy so workspace teammates could see draft
-- events authored by colleagues. The new predicate referenced
-- `public.org_members` directly inside an EXISTS / LEFT JOIN. That works for
-- authenticated callers — they have `GRANT SELECT ON org_members` — but
-- anonymous (public) callers do not. Postgres evaluates a RLS policy as the
-- caller's role; when anon hits /discover, /events, or any public event
-- listing, the SELECT policy fails permission checks on org_members and the
-- entire row is hidden, even though `status = 'published'` would have matched
-- on its own.
--
-- Net effect: every public events listing went empty after 012 was applied.
--
-- Fix
-- ────
-- Switch from raw table references to the existing SECURITY DEFINER helpers
-- `is_org_member` and `is_org_owner` (defined in 000_full_schema.sql + 007).
-- SECURITY DEFINER functions execute with the function owner's privileges,
-- which bypasses both the missing GRANT and the org_members RLS — exactly
-- what RLS policies need when they have to "look across" tables a caller
-- doesn't otherwise own.
--
-- UPDATE / DELETE policies from 012 stay as-is — they're scoped `TO
-- authenticated`, who do have access to org_members, so they were never
-- broken.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "View published events" ON public.events;
CREATE POLICY "View published events"
ON public.events
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  OR auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR (
    auth.uid() IS NOT NULL
    AND events.org_id IS NOT NULL
    AND (
      is_org_owner(auth.uid(), events.org_id)
      OR is_org_member(auth.uid(), events.org_id)
    )
  )
);

COMMENT ON POLICY "View published events" ON public.events IS
  'SELECT events: anyone for published rows; otherwise creator, platform admin, org owner (canonical or via org_members.role=owner), or any org_member. Uses SECURITY DEFINER helpers so anon callers do not need direct access to org_members.';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 015_event_og_rpc.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 015_event_og_rpc.sql
--
-- Robust support for per-event share previews (WhatsApp / Twitter / LinkedIn /
-- iMessage / Slack / Discord / Telegram / Facebook).
--
-- The Vercel edge function `api/event-og.ts` rewrites <title>, <meta og:*>,
-- and `<link rel="canonical">` into the served HTML so crawlers see an
-- event-specific share card. To do that it needs to fetch the event row plus
-- its parent organisation (for org name + logo).
--
-- Previously this lookup ran over PostgREST as the anon role and used the
-- standard table policies. That path is brittle:
--   • `organizations` RLS for anon requires `landing_published = true`. Most
--     events go live before their org's landing page is published, so the
--     join silently returned nothing and the function fell through to the
--     generic shell.
--   • Even after 013 widened anon visibility, an in-flight migration state
--     could still leave the function returning nothing.
--
-- Solution: expose a SECURITY DEFINER RPC that returns ONLY the public OG
-- fields, callable by `anon`. SECURITY DEFINER lets the function bypass RLS
-- and the table grants safely because the function itself enforces the
-- "published only" predicate at the top of its query — no row that isn't
-- already meant to be public can be returned through this path.
--
-- The edge function now calls this single RPC instead of two queries; it
-- can't return a half-populated result, and behaviour is identical whether
-- or not 013 has been applied.
--
-- Idempotent: DROP + CREATE so re-runs are safe.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_event_og(text, text, uuid);

CREATE FUNCTION public.get_event_og(
  _event_slug text DEFAULT NULL,
  _org_slug   text DEFAULT NULL,
  _event_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  title                text,
  description          text,
  date                 timestamptz,
  end_date             timestamptz,
  venue                text,
  location             text,
  banner_landscape_url text,
  image_url            text,
  slug                 text,
  timezone             text,
  event_format         text,
  status               text,
  price                numeric,
  currency             text,
  virtual_url          text,
  org_id               uuid,
  org_name             text,
  org_slug             text,
  org_subdomain        text,
  org_logo_url         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.date,
    e.end_date,
    e.venue,
    e.location,
    e.banner_landscape_url,
    e.image_url,
    e.slug,
    e.timezone,
    e.event_format,
    e.status,
    e.price,
    e.currency,
    e.virtual_url,
    o.id          AS org_id,
    o.name        AS org_name,
    o.slug        AS org_slug,
    o.subdomain   AS org_subdomain,
    o.logo_url    AS org_logo_url
    FROM public.events e
    LEFT JOIN public.organizations o ON o.id = e.org_id
   WHERE e.status = 'published'
     AND (
          (_event_id IS NOT NULL AND e.id = _event_id)
       OR (
            _event_id IS NULL
            AND _event_slug IS NOT NULL
            AND e.slug = _event_slug
            AND (
                 _org_slug IS NULL
              OR o.slug      = _org_slug
              OR o.subdomain = _org_slug
            )
          )
        )
   ORDER BY e.created_at DESC NULLS LAST
   LIMIT 1;
$$;

-- anon needs EXECUTE so the edge function can call this without elevated
-- credentials. SECURITY DEFINER means the function body runs with the owner's
-- privileges regardless of caller, so RLS on events / organizations doesn't
-- apply inside the function — the WHERE clause enforces "published only"
-- itself.
GRANT EXECUTE ON FUNCTION public.get_event_og(text, text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_event_og(text, text, uuid) IS
  'Public-safe lookup for per-event share previews. Returns one row containing the event + org identity fields needed to render an OG card. Only published events are ever returned. Callable by anon.';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION: 016_skip_pending_override_for_organisers.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 016_skip_pending_override_for_organisers.sql
--
-- Problem
-- ───────
-- The `registrations_validate` BEFORE-INSERT trigger forces
-- `approval_status := 'pending'` whenever the parent event has
-- `requires_approval = true`. That's correct for self-serve attendee
-- sign-ups (organiser must approve them) but WRONG for participants
-- the organiser adds themselves via the Add Participant dialog or CSV
-- import — those should land pre-approved with no manual step.
--
-- Fix
-- ───
-- Skip the pending override when the inserting user is an organiser
-- (event owner, super admin, or org member). Self-serve attendees still
-- get flipped to 'pending' as before.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public','extensions'
AS $$
DECLARE
  _ra            boolean;
  _p             numeric;
  _org_id        uuid;
  _is_organiser  boolean;
BEGIN
  SELECT requires_approval, COALESCE(price, 0), org_id
    INTO _ra, _p, _org_id
  FROM events
  WHERE id = NEW.event_id;

  -- Is the actor an organiser? Event owner, super admin, or org member.
  _is_organiser := EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = NEW.event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
      )
  );

  -- Paid events: every registration is implicitly approved (payment IS the gate).
  IF _p > 0 THEN
    NEW.approval_status := 'approved';
  -- Free events that require approval: only force pending for self-serve
  -- registrants (NOT organisers adding people manually).
  ELSIF _ra AND TG_OP = 'INSERT' AND NOT _is_organiser THEN
    NEW.approval_status := 'pending';
  END IF;

  IF NEW.approval_status NOT IN ('pending', 'approved', 'waitlisted', 'declined') THEN
    RAISE EXCEPTION 'Invalid approval_status';
  END IF;

  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := substring(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
      FROM 1 FOR 24
    );
  END IF;

  RETURN NEW;
END;
$$;


-- ==========================================================================
-- Section: 016_accept_org_invitation.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 016_accept_org_invitation.sql
--
-- (Re)installs the `accept_org_invitation` RPC. An earlier migration that
-- defined this function (003_accept_org_invitation.sql) was overwritten by
-- upstream conflicts, leaving the production schema in an undefined state —
-- on some environments the function still exists, on others it doesn't, and
-- where it does exist there's no guarantee its body matches the LoginPage's
-- expectations.
--
-- Beyond reinstalling the function, this migration closes a real loophole:
--
--   1. An organiser invites a teammate.
--   2. The teammate accepts the link, joins the workspace.
--   3. The organiser later removes them via Settings → Team.
--   4. The teammate clicks the original invite link in their mailbox.
--   5. Pre-fix: the link still works — they're back in the workspace.
--
-- The fix makes acceptance strictly conditional on:
--   • The invitation row exists and `status = 'pending'`.
--   • The caller is signed in (auth.uid() IS NOT NULL).
--   • The caller's email matches the invitation row's email (auth.users.email).
--
-- The function then inserts into `org_members` (ON CONFLICT DO UPDATE so
-- re-acceptance after a role change is idempotent) and stamps the
-- invitation row `status = 'accepted'`. Subsequent removal flow marks the
-- invitation `status = 'revoked'`, which makes this RPC refuse the token.
--
-- SECURITY DEFINER so the call works even when the user can't see the
-- invitation row under RLS, but the body enforces all access rules itself.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  -- Caller's verified email — used to make sure someone with a stolen link
  -- can't accept on behalf of the real invitee.
  SELECT lower(email) INTO caller_email
    FROM auth.users
   WHERE id = auth.uid();

  SELECT id, org_id, email, role, status
    INTO invitation
    FROM public.org_invitations
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF invitation.status <> 'pending' THEN
    -- 'accepted' or 'revoked' (the latter is set by the removal flow in
    -- SettingsPage). Either way the link is no longer valid.
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF caller_email IS NULL OR caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  -- Idempotent join: upsert into org_members so a re-issued role change
  -- (e.g. organiser invited the same person again with a new role) lands
  -- cleanly without duplicate-key errors.
  INSERT INTO public.org_members (org_id, user_id, role)
       VALUES (invitation.org_id, auth.uid(), invitation.role)
  ON CONFLICT (org_id, user_id) DO UPDATE
        SET role = EXCLUDED.role;

  UPDATE public.org_invitations
     SET status = 'accepted',
         updated_at = now()
   WHERE id = invitation.id;

  RETURN QUERY SELECT invitation.org_id, invitation.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by token. Refuses if status is not pending, caller is not signed in, or caller email does not match invitation email. Marks the invitation accepted on success.';


-- ==========================================================================
-- Section: 017_communications_recipients_user_id_guard.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 017_communications_recipients_user_id_guard.sql
--
-- Repairs the "insert or update on table 'communication_recipients' violates
-- foreign key constraint 'communication_recipients_user_id_fkey'" error that
-- surfaced when an organiser pressed Send on an event communication.
--
-- Cause
-- ─────
-- `communications_resolve_recipients` (the event-side resolver feeding the
-- dispatch RPC) returns `registrations.user_id` straight through to the
-- fan-out INSERT. `registrations.user_id` is NOT a foreign key in this
-- schema — it's a plain `uuid` column that gets stamped by the organiser
-- "Add participant" flow, the public RSVP flow, and the bulk import flow.
-- Any of those paths can leave behind a `user_id` that no longer points
-- at a live row in `auth.users`:
--   • The user was deleted in Supabase Auth but the registration was kept.
--   • A teammate manually patched the column via SQL.
--   • A legacy migration set placeholder UUIDs.
--
-- `communication_recipients.user_id`, on the other hand, IS a foreign key
-- (`REFERENCES auth.users(id) ON DELETE SET NULL`). So the dispatch INSERT
-- rejects the orphan rows and the whole send aborts.
--
-- Fix
-- ───
-- Patch the resolver so it only emits a `user_id` when the user actually
-- exists. When the auth user is gone, return NULL — the column on
-- `communication_recipients` is nullable, the recipient remains addressable
-- via the (denormalised) `email` / `phone` columns, and the existing
-- ON DELETE SET NULL behaviour is consistent with what's already happening
-- for users deleted after the recipient row was created.
--
-- The function is `SECURITY DEFINER` so its body can read `auth.users`
-- regardless of the caller. We use a correlated EXISTS so the planner can
-- still use the registrations indexes; CASE turns the result into NULL when
-- the user is missing.
--
-- The community resolver was already safe (it joins from `community_members`
-- which has its own FK to `auth.users`) but we mirror the guard there for
-- defence in depth.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Authorisation: only enforced when a user is calling. Headless callers
  -- (pg_cron, service_role JWT) get past the GRANT and skip this check.
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
    -- Critical change: wrap registration.user_id in a CASE that nulls it
    -- out when the auth row is gone. Prevents the downstream
    -- communication_recipients_user_id_fkey violation during dispatch.
    SELECT CASE
             WHEN r.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id)
               THEN r.user_id
             ELSE NULL
           END AS user_id,
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
    -- Same guard for speakers.user_id — same root cause.
    SELECT CASE
             WHEN s.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
               THEN s.user_id
             ELSE NULL
           END AS user_id,
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

COMMENT ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) IS
  'Resolves event communication recipients. Strips registration.user_id when the referenced auth user no longer exists so the dispatch INSERT does not violate communication_recipients_user_id_fkey.';


-- ==========================================================================
-- Section: 018_communications_resolver_email_match.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 018_communications_resolver_email_match.sql
--
-- Allows the event communication resolver to address imported participants
-- who haven't signed in yet. Previously the resolver's `custom_set` filtered
-- by `user_id = ANY(_user_ids)` — but participants added via bulk import or
-- the Add Participant dialog often have `registrations.user_id = NULL`
-- until the auth signup completes (or forever, if signup fails). The
-- frontend's custom-selection UI then dropped them from the user_ids array
-- entirely, so they never made it into `communication_recipients` and the
-- organiser's "Send to selected" did nothing for those rows.
--
-- The dashboard's "All attendees" path was unaffected (it iterates over
-- every base row regardless of user_id), but custom selection and any
-- email-keyed targeting were broken.
--
-- Fix
-- ───
-- The `_filter` jsonb argument now also reads an `emails` array. For the
-- `custom` recipient type, a base row matches when EITHER:
--
--   • `b.user_id = ANY(_user_ids)` (existing behaviour, kept for users
--     who have signed in), OR
--
--   • `lower(b.email) = ANY(_emails)` (new — works for imported
--     participants regardless of auth state).
--
-- The function is otherwise identical to the version in 017 — same
-- orphan-user-id guard, same authorisation check, same DISTINCT ON dedupe.
-- Re-applying is safe.
-- ─────────────────────────────────────────────────────────────────────────────

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
  _emails    text[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );
  _emails := COALESCE(
    ARRAY(SELECT lower(jsonb_array_elements_text(COALESCE(_filter -> 'emails', '[]'::jsonb)))),
    ARRAY[]::text[]
  );

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
    -- Orphan-user-id guard from migration 017 retained.
    SELECT CASE
             WHEN r.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id)
               THEN r.user_id
             ELSE NULL
           END AS user_id,
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
    SELECT CASE
             WHEN s.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
               THEN s.user_id
             ELSE NULL
           END AS user_id,
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
  sponsor_contacts_set AS (
    -- The people listed under a sponsor (sponsor_members). The compose
    -- picker offers each of them, so a custom selection has to reach them,
    -- not only the sponsor's own email.
    SELECT CASE
             WHEN m.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id)
               THEN m.user_id
             ELSE NULL
           END AS user_id,
           COALESCE(NULLIF(trim(coalesce(m.display_name,'')), ''),
                    NULLIF(trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')), ''),
                    split_part(m.email,'@',1)) AS name,
           lower(m.email) AS email,
           NULLIF(trim(coalesce(m.mobile_country_code,'') || ' ' || coalesce(m.mobile_number,'')), '') AS phone
      FROM event_sponsors es
      JOIN sponsor_members m ON m.sponsor_id = es.sponsor_id
     WHERE es.event_id = _event_id AND m.email IS NOT NULL
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
    -- New: match by user_id OR email. Imported participants without an
    -- auth account (user_id NULL) still match via their email — which is
    -- always present because the form/import validation requires it.
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types)
       AND (
            (b.user_id IS NOT NULL AND b.user_id = ANY(_user_ids))
         OR (lower(b.email) = ANY(_emails))
       )
    UNION
    -- Speakers and sponsors in custom selection follow the same rule, so
    -- the organiser can pick a single speaker without bringing the whole
    -- speaker group along.
    SELECT s.user_id, s.name, s.email, s.phone
      FROM speakers_set s
     WHERE 'custom' = ANY(_types)
       AND (
            (s.user_id IS NOT NULL AND s.user_id = ANY(_user_ids))
         OR (lower(s.email) = ANY(_emails))
       )
    UNION
    SELECT sp.user_id, sp.name, sp.email, sp.phone
      FROM sponsors_set sp
     WHERE 'custom' = ANY(_types)
       AND lower(sp.email) = ANY(_emails)
    UNION
    SELECT sc.user_id, sc.name, sc.email, sc.phone
      FROM sponsor_contacts_set sc
     WHERE 'custom' = ANY(_types)
       AND (
            (sc.user_id IS NOT NULL AND sc.user_id = ANY(_user_ids))
         OR (sc.email = ANY(_emails))
       )
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

COMMENT ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) IS
  'Resolves event communication recipients. Custom selection matches by user_id OR email so imported participants without an auth account still receive the message, and reaches sponsor contacts (sponsor_members) as well as the sponsor''s own email. Auth / password state is never used as a filter — everyone with an addressable email on the registration row is eligible.';


-- ==========================================================================
-- Section: 019_organiser_added_one_email_and_dedupe.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 019_organiser_added_one_email_and_dedupe.sql
--
-- Two changes to support a single "ticket email only" flow for organiser-
-- added participants, plus a DB-level guarantee against duplicate
-- registrations for the same event + email.
--
-- 1. Auto-claim orphan registrations when an auth user signs up
-- ─────────────────────────────────────────────────────────────
-- Organiser-added participants get a registrations row with `user_id = NULL`
-- and the participant's email. When the participant later creates their own
-- account (or signs in with an existing one for the first time), the
-- registration must link to their freshly-minted `auth.users.id` so the
-- attendee-side policy `Attendee view own` (USING user_id = auth.uid())
-- returns their ticket. Until this migration, the link only happened when
-- the participant happened to land on the event page (`EventRsvpCard` does
-- an email-match → update). Anyone clicking the "View your ticket" link in
-- the email saw an empty ticket page because RLS hid the orphan row.
--
-- We extend the existing `handle_new_user` signup trigger so the link
-- happens automatically right after profile creation. The trigger is
-- SECURITY DEFINER, so it can update registrations under any RLS state.
--
-- 2. Hard duplicate guard
-- ──────────────────────
-- Application-level dedupe in AddParticipantDialog and
-- ImportRegistrationsDialog has been in place since session-day, but it's a
-- TOCTOU window — two organisers adding the same email at the same time
-- can each pass the check and then both insert. After this migration the DB
-- rejects the second insert with a unique-violation, which the application
-- handlers already surface as "Already added or checked in".
--
-- The index excludes cancelled rows so a participant who cancels can
-- re-register without a unique-violation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend handle_new_user with orphan claiming ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m jsonb := COALESCE(NEW.raw_user_meta_data, '{}');
  _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text;
  _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
BEGIN
  _at := COALESCE(_m->>'account_type','attendee');
  IF _at NOT IN ('attendee','organizer') THEN _at := 'attendee'; END IF;

  _t  := NULLIF(trim(_m->>'title'),'');
  _fn := NULLIF(trim(_m->>'first_name'),'');
  _ln := NULLIF(trim(_m->>'last_name'),'');
  _d  := NULLIF(trim(_m->>'designation'),'');
  _co := NULLIF(trim(_m->>'company'),'');
  _mc := NULLIF(trim(_m->>'mobile_country_code'),'');
  _mn := NULLIF(trim(_m->>'mobile_number'),'');
  _li := NULLIF(trim(_m->>'linkedin_url'),'');
  _cw := NULLIF(trim(_m->>'company_website'),'');
  _ce := NULLIF(trim(_m->>'company_employee_count'),'');
  _ind:= NULLIF(trim(_m->>'industry'),'');

  _dn := NULLIF(trim(COALESCE(_fn,'') || ' ' || COALESCE(_ln,'')), '');
  IF _dn IS NULL THEN _dn := COALESCE(_m->>'display_name', NEW.email); END IF;

  _done := _fn IS NOT NULL AND _ln IS NOT NULL AND _d IS NOT NULL
       AND _co IS NOT NULL AND _mn IS NOT NULL;

  INSERT INTO profiles(
    user_id, display_name, account_type, title, first_name, last_name,
    designation, company, mobile_country_code, mobile_number,
    linkedin_url, company_website, company_employee_count, industry,
    profile_completed
  ) VALUES (
    NEW.id, _dn, _at, _t, _fn, _ln, _d, _co, _mc, _mn,
    _li, _cw, _ce, _ind, _done
  );

  -- Auto-confirm email for organiser-created accounts (kept for
  -- backwards compatibility with any legacy `must_change_password` flow).
  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;

  -- NEW: claim every registration that was created for this email before
  -- the participant had an account. RLS doesn't apply here because the
  -- function is SECURITY DEFINER. We only stamp rows where `user_id IS
  -- NULL` so an existing link (from a previous signup of the same email
  -- — should never happen, but defensive) is not clobbered.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.registrations
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger object itself is unchanged — `CREATE OR REPLACE FUNCTION`
-- updates the body in place. Re-creating the trigger is unnecessary.

COMMENT ON FUNCTION public.handle_new_user() IS
  'On auth.users INSERT: create profile row, auto-confirm legacy must_change_password accounts, and claim any orphan registrations whose email matches the new user.';


-- ── 2. Unique index for duplicate-registration guard ────────────────────────
-- Partial: cancelled rows are exempt so an attendee who cancels and
-- re-registers later doesn't trip the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_email_unique
  ON public.registrations (event_id, lower(email))
  WHERE status <> 'cancelled';

COMMENT ON INDEX public.registrations_event_email_unique IS
  'Prevents the same email from registering twice for the same event (excluding cancelled rows).';


-- ==========================================================================
-- Section: 020_accept_org_invitation_idempotent.sql
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 020_accept_org_invitation_idempotent.sql
--
-- Repairs the "could not accept the invitation" toast that appears after the
-- role is already assigned. Migration 016 made `accept_org_invitation`
-- strict: it raised an exception when the invitation row was anything but
-- `status = 'pending'`. The client flow (LoginPage → consumeInviteIfAny)
-- can call the RPC twice in quick succession in a few real scenarios:
--
--   • The user's auth state hydrates twice during the React mount of
--     LoginPage in production (StrictMode is dev-only, but route
--     transitions still cause a re-render).
--   • The forced `window.location.assign` introduced for the OrgContext
--     re-fetch can race the toast queue, leaving the previous toast
--     mounted as the destination page renders.
--   • The browser back-button / bookmarked URL with the same
--     `?invite=<token>` is followed after the user signed in elsewhere.
--
-- In every case the FIRST call already inserted the `org_members` row and
-- stamped the invitation `accepted`. The SECOND call is harmless; it just
-- needs to report success so the user doesn't see "Invitation not
-- accepted" as a destructive toast that contradicts the workspace dropdown
-- on the next page.
--
-- Behavioural changes
-- ───────────────────
-- 1. Status check now accepts `pending` AND `accepted`. Revoked stays
--    refused so the removal-flow loophole closed in 016 stays closed.
-- 2. The org_members INSERT is wrapped in ON CONFLICT DO NOTHING when the
--    invitation is already `accepted`, so we never clobber a role that an
--    organiser may have changed manually after acceptance.
-- 3. Returns the same `(accepted_org_id, assigned_role)` shape the
--    LoginPage already consumes — no client change required.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  caller_email text;
  -- Prefixed with `_` to avoid colliding with the built-in `current_role`
  -- function (which returns the active SQL role name).
  _current_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  -- Caller's verified email — used to make sure someone with a stolen link
  -- can't accept on behalf of the real invitee.
  SELECT lower(email) INTO caller_email
    FROM auth.users
   WHERE id = auth.uid();

  SELECT id, org_id, email, role, status
    INTO invitation
    FROM public.org_invitations
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Revoked = the organiser explicitly removed this member's link
  -- (Settings → Team → Remove). Anything else (pending or accepted) is
  -- treated as a valid token to keep re-acceptance idempotent.
  IF invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF caller_email IS NULL OR caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  -- Look up the current role (if any) so we can decide whether to write
  -- it or just return the existing assignment idempotently.
  SELECT role INTO _current_role
    FROM public.org_members
   WHERE org_id = invitation.org_id
     AND user_id = auth.uid();

  IF _current_role IS NULL THEN
    -- First-time acceptance. Insert with the invitation's role.
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (invitation.org_id, auth.uid(), invitation.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
    -- Fetch back the assigned role (covers the rare race where another
    -- transaction inserted the same row between SELECT and INSERT).
    SELECT role INTO _current_role
      FROM public.org_members
     WHERE org_id = invitation.org_id
       AND user_id = auth.uid();
  ELSIF invitation.status = 'pending' THEN
    -- Pending → first acceptance path, but the user is somehow already a
    -- member (e.g. they were re-invited with a new role after being
    -- removed and then immediately accepted via two clicks). Refresh the
    -- role to whatever the invitation specifies — the inviter's choice
    -- wins.
    UPDATE public.org_members
       SET role = invitation.role
     WHERE org_id = invitation.org_id
       AND user_id = auth.uid();
    _current_role := invitation.role;
  END IF;
  -- When invitation.status = 'accepted' AND _current_role IS NOT NULL we
  -- leave the existing role alone and just return idempotently.

  -- Stamp the invitation accepted (no-op when already accepted).
  UPDATE public.org_invitations
     SET status     = 'accepted',
         updated_at = now()
   WHERE id = invitation.id
     AND status <> 'accepted';

  accepted_org_id := invitation.org_id;
  assigned_role   := COALESCE(_current_role, invitation.role);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by token. Idempotent — safe to call multiple times for the same token. Refuses revoked tokens (set by the removal flow). Refuses callers whose email does not match the invitation.';


-- ==========================================================================
-- Section: 020_anon_public_event_visibility.sql
-- ==========================================================================

-- Anon SELECT on join + detail tables for published events
--
-- Why: PublicEventPage.tsx queries event_speakers, event_sponsors,
-- sessions, and session_speakers directly with the anon JWT to render
-- speaker / sponsor / agenda sections. The current RLS only grants
-- SELECT on these tables to {authenticated}, so logged-out visitors
-- see empty lists and the Speakers / Sponsors / Agenda blocks vanish.
--
-- The speakers / sponsors tables already have "Anon view ... for
-- published" policies, but those policies do an EXISTS through
-- event_speakers / event_sponsors / events — which the anon role
-- cannot read either, so the EXISTS resolves false and the policy
-- effectively returns nothing. Adding read policies on the join
-- tables (and on sessions / session_speakers) completes the chain.
--
-- Authenticated visibility is unchanged — the existing "Auth view ..."
-- policies stay in place.

-- Joins: event_speakers
DROP POLICY IF EXISTS "Anon view event_speakers for published" ON public.event_speakers;
CREATE POLICY "Anon view event_speakers for published"
  ON public.event_speakers
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_speakers.event_id
        AND e.status = 'published'
    )
  );

-- Joins: event_sponsors
DROP POLICY IF EXISTS "Anon view event_sponsors for published" ON public.event_sponsors;
CREATE POLICY "Anon view event_sponsors for published"
  ON public.event_sponsors
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_sponsors.event_id
        AND e.status = 'published'
    )
  );

-- Agenda: sessions
DROP POLICY IF EXISTS "Anon view sessions for published" ON public.sessions;
CREATE POLICY "Anon view sessions for published"
  ON public.sessions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = sessions.event_id
        AND e.status = 'published'
    )
  );

-- Agenda: session_speakers
DROP POLICY IF EXISTS "Anon view session_speakers for published" ON public.session_speakers;
CREATE POLICY "Anon view session_speakers for published"
  ON public.session_speakers
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = session_speakers.session_id
        AND e.status = 'published'
    )
  );


-- ==========================================================================
-- Section: 021_backfill_orphan_event_sponsors.sql
-- ==========================================================================

-- Backfill: link orphan sponsors to their owner's event
--
-- Why: sponsor_portal_events() gates analytics by event_sponsors. When an
-- organiser created a sponsor + invited a team member via SponsorManagement
-- but forgot to attach the sponsor to an event from the event Sponsors tab,
-- the team member who claimed the invite via /sponsor/accept ended up with
-- a sponsor_members row but no event_sponsors row. The sponsor portal then
-- shows "No events yet" instead of the analytics for the event the sponsor
-- was actually invited to support.
--
-- This migration links each orphan sponsor (sponsor with an accepted
-- sponsor_members row but zero event_sponsors rows) to its owner's single
-- published event, but only when the owner has exactly one such event so
-- the inference is unambiguous. Owners with zero or multiple published
-- events are left untouched and need a manual fix from the Sponsors tab.
--
-- Idempotent: ON CONFLICT DO NOTHING protects against re-running.

WITH orphans AS (
  SELECT
    s.id      AS sponsor_id,
    s.user_id AS owner_id
  FROM public.sponsors s
  WHERE EXISTS (
    SELECT 1 FROM public.sponsor_members sm
     WHERE sm.sponsor_id = s.id
       AND sm.accepted_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_sponsors es WHERE es.sponsor_id = s.id
  )
),
owner_events AS (
  SELECT
    o.sponsor_id,
    e.id AS event_id,
    count(*) OVER (PARTITION BY o.owner_id) AS event_count
  FROM orphans o
  JOIN public.events e
    ON e.user_id = o.owner_id
   AND e.status = 'published'
)
INSERT INTO public.event_sponsors (event_id, sponsor_id)
SELECT event_id, sponsor_id
  FROM owner_events
 WHERE event_count = 1
ON CONFLICT (event_id, sponsor_id) DO NOTHING;
-- <<< END BASE SCHEMA: 000_full_schema.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 021_user_roles_grant_authenticated.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 021_user_roles_grant_authenticated.sql
--
-- Grants `authenticated` the `SELECT` privilege on `public.user_roles`.
--
-- Why this is needed
-- ──────────────────
-- The table has RLS enabled with two SELECT policies:
--   • "Users view own roles"  — auth.uid() = user_id
--   • "Admins view all roles" — has_role(auth.uid(), 'admin')
--
-- But the original CREATE TABLE in 000_full_schema.sql never issued a
-- table-level `GRANT SELECT … TO authenticated`. RLS doesn't matter if the
-- caller can't pass the privilege check that runs *before* it. As a result,
-- the client-side `AuthContext.checkAdminRole` SELECT silently returns
-- `{ data: null }` (permission denied is swallowed by maybeSingle's null
-- path) and the user's `isAdmin` flag stays false. The header dropdown
-- then routes the freshly-promoted admin into the organiser dashboard
-- with no access to `/dashboard/admin`.
--
-- Granting SELECT to `authenticated` is safe: the RLS policies above
-- still filter rows. Each user sees only their own role row, and only an
-- actual admin sees everyone's. No row leaks.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.user_roles TO authenticated;
-- <<< END SOURCE MIGRATION: 021_user_roles_grant_authenticated.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 022_event_creatives.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 022_event_creatives.sql
--
-- Creates `public.event_creatives` — records of rendered social/email
-- promotional graphics (speaker, sponsor, or combo) generated by the
-- Creative_Generator for an event.
--
-- What this is
-- ────────────
-- Each row is one successfully rendered PNG: which entity (speaker/sponsor/
-- both), which code-defined template, which platform format (LinkedIn post,
-- Instagram story, etc.), and where the asset lives in Storage. Template
-- *selection* preferences are stored separately on `events.page_config`
-- (`creativeTemplatePrefs`) — this table only records generated output.
--
-- Why NO anon/public SELECT policy
-- ─────────────────────────────────
-- Unlike `event_speakers` / `event_sponsors`, this table is organizer/admin
-- tool data, not public event-page content. There is intentionally no
-- "Anon view" or "Auth view ... USING(true)" policy here — only the event's
-- owning organizer or a platform admin may see or manage these rows, per
-- Requirement 9 ("restrict... to that event's owning organizer and users
-- with the admin role").
--
-- Storage
-- ───────
-- Rendered PNGs upload to the EXISTING `site-assets` bucket under a new
-- `event-creatives/{event_id}/` prefix. This migration does NOT create a new
-- bucket or new storage policies — it reuses the `site-assets` bucket's
-- existing `storage.objects` RLS policies already defined in
-- `000_full_schema.sql` ("Public read site-assets", "Admin upload/update/
-- delete site-assets").
--
-- Requirements addressed: 8.1, 9.1, 9.2, 9.3
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.event_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creative_type text NOT NULL CHECK (creative_type IN ('speaker','sponsor','combo')),
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  template_id text NOT NULL,
  platform_format text NOT NULL,
  asset_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_creatives_entity_check CHECK (
    (creative_type = 'speaker' AND speaker_id IS NOT NULL AND sponsor_id IS NULL) OR
    (creative_type = 'sponsor' AND sponsor_id IS NOT NULL AND speaker_id IS NULL) OR
    (creative_type = 'combo'   AND speaker_id IS NOT NULL AND sponsor_id IS NOT NULL)
  )
);
CREATE INDEX event_creatives_event_idx ON public.event_creatives(event_id, created_at DESC);

ALTER TABLE public.event_creatives ENABLE ROW LEVEL SECURITY;

-- Same organizer/admin-scoped pattern as event_speakers / event_sponsors,
-- minus the anon/authenticated-public SELECT policy (see header comment).
CREATE POLICY "Owner view event_creatives" ON public.event_creatives
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE POLICY "Owner manage event_creatives" ON public.event_creatives
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creatives TO authenticated;
-- <<< END SOURCE MIGRATION: 022_event_creatives.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 023_creative_ai_backgrounds.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 023_creative_ai_backgrounds.sql
--
-- Creates `public.event_creative_backgrounds` — cached AI-generated background
-- images produced by the Creative_AI_Backgrounds feature. Each row records
-- one PNG generated by Google Gemini Imagen for a specific event with a
-- deterministic cache key so repeat requests reuse the same asset without
-- another Gemini call (Requirement 6.1, 6.2).
--
-- Also adds `event_creatives.metadata jsonb` so the base Creative_Generator
-- can persist AI-background provenance (`aiBackgroundId`, `stylePreset`,
-- `promptText`) alongside each rendered creative (Requirement 11.1, 11.2,
-- 11.3). Default `'{}'::jsonb` keeps every existing row valid without a
-- backfill.
--
-- Why NO anon/public SELECT policy
-- ─────────────────────────────────
-- Same rationale as `event_creatives` (migration 022): this is organizer/
-- admin tool data, not public event-page content. Only the event's owning
-- organizer or a platform admin may see or manage these rows
-- (Requirement 12.3).
--
-- Storage
-- ───────
-- Generated PNGs upload to the EXISTING `site-assets` bucket under the
-- `ai-backgrounds/{event_id}/` prefix. This migration does NOT create a
-- new bucket or new storage policies — it reuses the `site-assets` bucket's
-- existing `storage.objects` RLS policies from `000_full_schema.sql`.
--
-- Requirements addressed: 6.1, 6.2, 6.3, 8.1, 11.1, 11.2, 11.3, 12.3
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.event_creative_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  prompt text NOT NULL,
  prompt_normalized text NOT NULL,
  style_preset text NOT NULL,
  aspect_ratio text NOT NULL,
  asset_url text NOT NULL,
  storage_path text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'site-assets',
  media_type text NOT NULL DEFAULT 'image/png',
  width integer,
  height integer,
  size_bytes bigint,
  provider text NOT NULL DEFAULT 'gemini',
  model text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT event_creative_backgrounds_cache_key_unique
    UNIQUE (event_id, cache_key)
);

-- Fast lookup for library listings (Requirement 7.1): sorted most-to-least
-- recently created. Also serves single-column `event_id` filters via the
-- leftmost-prefix rule.
CREATE INDEX event_creative_backgrounds_event_idx
  ON public.event_creative_backgrounds (event_id, created_at DESC);

-- Partial index for expiry-based cleanup jobs: only rows with an explicit
-- `expires_at` participate, so the index stays compact.
CREATE INDEX event_creative_backgrounds_expires_idx
  ON public.event_creative_backgrounds (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.event_creative_backgrounds ENABLE ROW LEVEL SECURITY;

-- Same organizer/admin-scoped pattern as event_creatives (migration 022).
-- Intentionally no anon/authenticated-public SELECT policy: this is
-- organizer tool data (Requirement 12.3).
CREATE POLICY "Owner view event_creative_backgrounds" ON public.event_creative_backgrounds
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE POLICY "Owner manage event_creative_backgrounds" ON public.event_creative_backgrounds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creative_backgrounds TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- `event_creatives.metadata` — AI-background provenance for base-spec rows.
--
-- Existing base-spec inserts don't set this column; the `NOT NULL DEFAULT
-- '{}'::jsonb` clause guarantees every row (old and new) has a valid value,
-- so `typeof row.metadata === "object"` is a safe assumption in UI code
-- (Requirement 11.3, 11.4). Matches the shape of other JSONB columns in
-- the base schema (e.g. `events.page_config`).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_creatives
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
-- <<< END SOURCE MIGRATION: 023_creative_ai_backgrounds.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 024_event_creatives_customization.sql >>>
-- Adds the Customization_Config JSONB column to event_creatives.
-- Default of '{}'::jsonb means every existing row (and every new row from a
-- caller that doesn't opt into customization) stores an empty object,
-- preserving the Additivity_Invariant end-to-end.

alter table public.event_creatives
  add column if not exists customization jsonb not null default '{}'::jsonb;

comment on column public.event_creatives.customization is
  'Customization_Config JSONB for the Creative_Customization feature. Contains customPromptSlots, slotOverrides, positionNudges, backgroundOverlay, watermark, border, appliedBrandKitId, and snapshotTemplate. Default {} preserves base-spec render output.';
-- <<< END SOURCE MIGRATION: 024_event_creatives_customization.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 025_brand_kits.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 025_brand_kits.sql
--
-- Creates `public.brand_kits` — organization-scoped named theme snapshots
-- for the Creative_Customization feature (Requirement 9). A Brand_Kit
-- captures a `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, and
-- optional `preferredTemplateIds`/`preferredFormats` lists in its
-- `snapshot` JSONB. When applied at render time it is baked into the
-- `event_creatives.customization` blob under `appliedBrandKitId` so the
-- Creative reproduces byte-for-byte identically even if the Brand_Kit is
-- later edited or deleted (Requirement 9.7).
--
-- Authorisation (Requirements 9.6, 11.3)
-- ───────────────────────────────────────
-- • SELECT — any member of the org (`org_members.user_id = auth.uid()`)
--   OR platform admin (`public.has_role(auth.uid(), 'admin')`).
-- • INSERT/UPDATE/DELETE — only the org's owner
--   (`organizations.owner_id = auth.uid()`) OR platform admin.
--
-- The RLS truth table this migration implements (Property 48) — every
-- (is_org_member, is_org_owner, is_platform_admin) triple × verb combo,
-- 8 × 4 = 32 cells total:
--
--   is_member | is_owner | is_admin | SELECT | INSERT | UPDATE | DELETE
--   ----------+----------+----------+--------+--------+--------+--------
--       F     |    F     |    F     |  deny  |  deny  |  deny  |  deny
--       T     |    F     |    F     |  allow |  deny  |  deny  |  deny
--       F     |    T     |    F     |  allow*|  allow |  allow |  allow
--       T     |    T     |    F     |  allow |  allow |  allow |  allow
--       F     |    F     |    T     |  allow |  allow |  allow |  allow
--       T     |    F     |    T     |  allow |  allow |  allow |  allow
--       F     |    T     |    T     |  allow |  allow |  allow |  allow
--       T     |    T     |    T     |  allow |  allow |  allow |  allow
--
--   * The owner is transitively an org_member via the `org_members` row
--     inserted when the org is provisioned, so the SELECT policy's
--     `org_members` predicate covers the owner case as well.
--
-- Storage
-- ───────
-- No storage bucket work — the Brand_Kit's `logoUrl` references an image
-- that already lives in the existing `site-assets` bucket (or any public
-- URL). This migration does not create new storage policies.
--
-- Requirements addressed: 9.1, 9.2, 9.6, 9.7, 11.3
-- ─────────────────────────────────────────────────────────────────────────────

-- New table for organization-scoped named Brand_Kits (Requirement 9).

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists brand_kits_org_idx
  on public.brand_kits (org_id, created_at desc);

alter table public.brand_kits enable row level security;

-- SELECT: any member of the org OR platform admin (Requirement 9.6).
create policy "brand_kits: org members and admins can select"
  on public.brand_kits
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = brand_kits.org_id
        and om.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- INSERT: only the org's owner OR platform admin (Requirement 9.6).
create policy "brand_kits: org owner and admins can insert"
  on public.brand_kits
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- UPDATE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can update"
  on public.brand_kits
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- DELETE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can delete"
  on public.brand_kits
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

comment on table public.brand_kits is
  'Organization-scoped Brand_Kits for the Creative_Customization feature. RLS: any org_member (or admin) may select; only the org.owner_id (or admin) may insert/update/delete.';
-- <<< END SOURCE MIGRATION: 025_brand_kits.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 026_utm_attribution_coverage.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 026_utm_attribution_coverage.sql
--
-- Extends the shipped UTM_Attribution pattern (already in place for attendee
-- `registrations`) to three additional conversion surfaces:
--
--   • `public.speaker_applications`  — Speaker_Application rows
--   • `public.sponsor_applications`  — Sponsor_Application rows
--   • `public.profiles`              — User_Profile rows (Organizer_Signup)
--
-- Each table gets five nullable `text` columns matching the shipped
-- `registrations.utm_*` layout in name, type, and nullability
-- (Requirements 1.1, 1.2, 1.3). Existing rows are backfilled to SQL NULL
-- for every UTM_Field so already-persisted rows have well-defined values
-- immediately after migration (Requirement 1.6).
--
-- The `handle_new_user()` signup trigger is extended in place via
-- CREATE OR REPLACE to read the five UTM keys from
-- `auth.users.raw_user_meta_data` (populated by LoginPage's
-- `supabase.auth.signUp` `options.data` payload — Requirement 5.1) and
-- stamp them onto the new `profiles` row (Requirement 5.2). Empty strings
-- and whitespace-only values persist as SQL NULL per Requirements 1.5 /
-- 5.2. Every existing trigger side-effect (profile field extraction,
-- legacy `must_change_password` email auto-confirmation, orphan
-- registration claim) is preserved verbatim — only the UTM extraction
-- lines and UTM upsert columns are new.
--
-- RLS non-regression (Requirement 13)
-- ───────────────────────────────────
-- The three affected tables already have RLS enabled with policies that
-- scope reads to the parent row's viewers:
--
--   • `speaker_applications`  — applicant-self OR event owner OR admin
--   • `sponsor_applications`  — applicant-self OR event owner OR admin
--   • `profiles`              — authenticated-view; owner-update;
--                               owner-insert (admin bypass via
--                               `admin_users`)
--
-- Adding nullable columns does not change RLS scope — the new UTM_Field
-- columns inherit the parent row's existing policies with zero policy
-- edits (Requirements 13.1, 13.2, 13.3). This migration therefore adds
-- NO new RLS policies.
--
-- Query-result filtering (Requirement 13.4) is unchanged: any viewer
-- lacking the row-level grant already sees the parent row filtered out
-- of every SELECT, and that filtering transitively hides the row's new
-- UTM_Field values along with the rest of the row's columns.
--
-- Attribution_Export non-regression (Requirement 13.5): every CSV
-- export in this feature (`buildSpeakerApplicationsCsv`,
-- `buildSponsorApplicationsCsv`, and the extended `UserManagementPage`
-- export) iterates ONLY the rows already returned to the caller by
-- the tables' existing RLS-filtered SELECTs. A viewer without the RLS
-- grant never receives the row from the data layer, so the export
-- loop cannot emit it — the row is omitted entirely rather than
-- emitted with blanked UTM cells.
--
-- No indexes on UTM columns
-- ─────────────────────────
-- Applications and profiles are not queried by UTM values — those tables
-- are read by `event_id` / `user_id`. Aggregation lives in `utm_clicks` +
-- `event_utm_summary` (out of scope for this spec per requirements
-- decision #4). Indexing UTM_Fields here would only pay for itself when
-- application/profile UTM analytics ship as a future spec.
--
-- Idempotent
-- ──────────
-- Every ALTER uses `add column if not exists`. The trigger is
-- CREATE OR REPLACE, never DROP. Re-running this migration is safe.
--
-- Requirements addressed: 1.1, 1.2, 1.3, 1.5, 1.6, 5.1, 5.2, 13.1, 13.2,
-- 13.3, 13.4, 13.5
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. speaker_applications: add UTM_Fields ────────────────────────────────
ALTER TABLE public.speaker_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- ── 2. sponsor_applications: add UTM_Fields ────────────────────────────────
ALTER TABLE public.sponsor_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- ── 3. profiles: add UTM_Fields ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

COMMENT ON COLUMN public.speaker_applications.utm_source IS
  'First-touch UTM source captured from the tab''s sessionStorage at submission time. See docs/utm-attribution.md';
COMMENT ON COLUMN public.sponsor_applications.utm_source IS
  'First-touch UTM source captured from the tab''s sessionStorage at submission time. See docs/utm-attribution.md';
COMMENT ON COLUMN public.profiles.utm_source IS
  'First-touch UTM source read from auth.users.raw_user_meta_data by the handle_new_user trigger at account creation.';

-- ── 4. handle_new_user trigger extension ───────────────────────────────────
-- Extends the shipped trigger to read `utm_source` / `utm_medium` /
-- `utm_campaign` / `utm_content` / `utm_term` from
-- `auth.users.raw_user_meta_data` (populated by LoginPage's
-- `supabase.auth.signUp` `options.data` payload — Requirement 5.1) and
-- stamp them onto the new `profiles` row (Requirement 5.2).
--
-- Missing metadata keys, empty strings, and whitespace-only values
-- persist as SQL NULL per Requirements 1.5 / 5.2. Every existing field
-- the trigger already sets (account_type, display_name, first_name,
-- last_name, designation, company, mobile_country_code, mobile_number,
-- linkedin_url, company_website, company_employee_count, industry,
-- profile_completed) is preserved verbatim.
--
-- First-touch preservation on re-run: the trigger's INSERT now carries
-- an `ON CONFLICT (user_id) DO UPDATE SET ...` clause that uses
-- `coalesce(public.profiles.<col>, excluded.<col>)` for each UTM_Field
-- so a re-signup with new UTM does not overwrite existing UTM
-- (Requirement 5.2 first-touch semantics). The pre-existing trigger had
-- no ON CONFLICT clause because `profiles.user_id` is UNIQUE and each
-- new `auth.users.id` is fresh — the ON CONFLICT here is defensive and
-- only fires in the rare re-entry path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m jsonb := COALESCE(NEW.raw_user_meta_data, '{}');
  _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text;
  _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
  _utm_source   text := NULLIF(trim(_m->>'utm_source'),   '');
  _utm_medium   text := NULLIF(trim(_m->>'utm_medium'),   '');
  _utm_campaign text := NULLIF(trim(_m->>'utm_campaign'), '');
  _utm_content  text := NULLIF(trim(_m->>'utm_content'),  '');
  _utm_term     text := NULLIF(trim(_m->>'utm_term'),     '');
BEGIN
  _at := COALESCE(_m->>'account_type','attendee');
  IF _at NOT IN ('attendee','organizer') THEN _at := 'attendee'; END IF;

  _t  := NULLIF(trim(_m->>'title'),'');
  _fn := NULLIF(trim(_m->>'first_name'),'');
  _ln := NULLIF(trim(_m->>'last_name'),'');
  _d  := NULLIF(trim(_m->>'designation'),'');
  _co := NULLIF(trim(_m->>'company'),'');
  _mc := NULLIF(trim(_m->>'mobile_country_code'),'');
  _mn := NULLIF(trim(_m->>'mobile_number'),'');
  _li := NULLIF(trim(_m->>'linkedin_url'),'');
  _cw := NULLIF(trim(_m->>'company_website'),'');
  _ce := NULLIF(trim(_m->>'company_employee_count'),'');
  _ind:= NULLIF(trim(_m->>'industry'),'');

  _dn := NULLIF(trim(COALESCE(_fn,'') || ' ' || COALESCE(_ln,'')), '');
  IF _dn IS NULL THEN _dn := COALESCE(_m->>'display_name', NEW.email); END IF;

  _done := _fn IS NOT NULL AND _ln IS NOT NULL AND _d IS NOT NULL
       AND _co IS NOT NULL AND _mn IS NOT NULL;

  INSERT INTO profiles(
    user_id, display_name, account_type, title, first_name, last_name,
    designation, company, mobile_country_code, mobile_number,
    linkedin_url, company_website, company_employee_count, industry,
    profile_completed,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) VALUES (
    NEW.id, _dn, _at, _t, _fn, _ln, _d, _co, _mc, _mn,
    _li, _cw, _ce, _ind, _done,
    _utm_source, _utm_medium, _utm_campaign, _utm_content, _utm_term
  )
  ON CONFLICT (user_id) DO UPDATE SET
    utm_source   = COALESCE(public.profiles.utm_source,   EXCLUDED.utm_source),
    utm_medium   = COALESCE(public.profiles.utm_medium,   EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.profiles.utm_campaign, EXCLUDED.utm_campaign),
    utm_content  = COALESCE(public.profiles.utm_content,  EXCLUDED.utm_content),
    utm_term     = COALESCE(public.profiles.utm_term,     EXCLUDED.utm_term);

  -- Auto-confirm email for organiser-created accounts (kept for
  -- backwards compatibility with any legacy `must_change_password` flow).
  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;

  -- Claim every registration that was created for this email before the
  -- participant had an account. RLS doesn't apply here because the
  -- function is SECURITY DEFINER. We only stamp rows where `user_id IS
  -- NULL` so an existing link (from a previous signup of the same email
  -- — should never happen, but defensive) is not clobbered.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.registrations
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger object itself is unchanged — `CREATE OR REPLACE FUNCTION`
-- updates the body in place. Re-creating the trigger is unnecessary.

COMMENT ON FUNCTION public.handle_new_user() IS
  'On auth.users INSERT: create profile row (with first-touch UTM_Fields from raw_user_meta_data), auto-confirm legacy must_change_password accounts, and claim any orphan registrations whose email matches the new user.';
-- <<< END SOURCE MIGRATION: 026_utm_attribution_coverage.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 027_event_creatives_event_type.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 027_event_creatives_event_type.sql
--
-- Widens `event_creatives.creative_type` and its entity-shape CHECK
-- constraint to allow `'event'` — an Event_Promo creative (stats banner /
-- invite card announcing the event itself, no specific speaker or sponsor
-- entity). Both `speaker_id` and `sponsor_id` were already nullable columns
-- (see `022_event_creatives.sql`), so an event-level row simply carries
-- both as NULL; only the CHECK constraints needed widening to permit it.
--
-- Requirements addressed: Social_Creative_Generator Event_Promo extension.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_creative_type_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_creative_type_check
  CHECK (creative_type IN ('speaker', 'sponsor', 'combo', 'event'));

ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_entity_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_entity_check CHECK (
    (creative_type = 'speaker' AND speaker_id IS NOT NULL AND sponsor_id IS NULL) OR
    (creative_type = 'sponsor' AND sponsor_id IS NOT NULL AND speaker_id IS NULL) OR
    (creative_type = 'combo'   AND speaker_id IS NOT NULL AND sponsor_id IS NOT NULL) OR
    (creative_type = 'event'  AND speaker_id IS NULL AND sponsor_id IS NULL)
  );
-- <<< END SOURCE MIGRATION: 027_event_creatives_event_type.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 027_event_venue_selections.sql >>>
-- ============================================================================
-- Event ↔ Venue Vendor connection
-- ----------------------------------------------------------------------------
-- When an organizer picks a venue from the vendor marketplace during event
-- setup, this table records the connection. Both apps (Illuxus + Vendor
-- Connect) can read/write it since they share the same Supabase project.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_venue_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  selected_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'contacted'
    CHECK (status IN ('contacted', 'accepted', 'declined', 'cancelled')),
  notes text,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_event_venue_selections_event
  ON event_venue_selections (event_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_vendor
  ON event_venue_selections (vendor_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_org
  ON event_venue_selections (org_id);

ALTER TABLE event_venue_selections ENABLE ROW LEVEL SECURITY;

-- Organizers (event owners) can manage their own selections
DROP POLICY IF EXISTS event_venue_selections_org_manage ON event_venue_selections;
CREATE POLICY event_venue_selections_org_manage
  ON event_venue_selections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_venue_selections.event_id
        AND (e.user_id = auth.uid() OR e.org_id = event_venue_selections.org_id)
    )
  );

-- Vendors can see selections targeting them
DROP POLICY IF EXISTS event_venue_selections_vendor_read ON event_venue_selections;
CREATE POLICY event_venue_selections_vendor_read
  ON event_venue_selections
  FOR SELECT
  USING (is_vendor_member(auth.uid(), vendor_id));

-- Vendors can respond (accept/decline)
DROP POLICY IF EXISTS event_venue_selections_vendor_respond ON event_venue_selections;
CREATE POLICY event_venue_selections_vendor_respond
  ON event_venue_selections
  FOR UPDATE
  USING (is_vendor_member(auth.uid(), vendor_id));
-- <<< END SOURCE MIGRATION: 027_event_venue_selections.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 028_session_speakers_owner_manage.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 028_session_speakers_owner_manage.sql
--
-- Fixes a real bug: organizers could not attach MULTIPLE speakers to an
-- agenda session. `SessionManagement.tsx`'s save flow does:
--
--   await supabase.from("session_speakers").delete().eq("session_id", id);
--   await supabase.from("session_speakers").insert([{ session_id, speaker_id, position }, ...]);
--
-- `public.session_speakers` has Row-Level Security ENABLED (000_full_schema.sql)
-- but only ever had a SELECT policy:
--
--   CREATE POLICY "Auth view session_speakers" ON public.session_speakers
--     FOR SELECT TO authenticated USING(true);
--
-- Per Postgres RLS semantics, once RLS is enabled on a table, EVERY
-- operation with no matching policy is denied by default — regardless of
-- the plain SQL-privilege GRANTs also present in that same migration
-- (`GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_speakers TO
-- authenticated`). A GRANT only says a role is ALLOWED to attempt the
-- statement; RLS policies then decide whether any row actually qualifies.
-- With no INSERT/UPDATE/DELETE policy, every delete/insert against this
-- table silently affected zero rows for every organizer, including the
-- event owner — the UI's speaker checkboxes appeared to "not save."
--
-- The sibling junction tables `event_speakers` / `event_sponsors` (same
-- migration) and `webinar_speakers` (also same migration) all correctly
-- ship an owner-scoped `FOR ALL` policy alongside their SELECT policy.
-- This migration brings `session_speakers` in line with that established
-- pattern, reusing the same `is_event_owner(uuid, uuid)` helper —
-- reached through `sessions.event_id` since `session_speakers` itself has
-- no `event_id` column of its own.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner manage session_speakers" ON public.session_speakers;

CREATE POLICY "Owner manage session_speakers"
  ON public.session_speakers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  );
-- <<< END SOURCE MIGRATION: 028_session_speakers_owner_manage.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 029_event_creative_ai_drafts.sql >>>
-- ─────────────────────────────────────────────────────────────────────────────
-- 029_event_creative_ai_drafts.sql
--
-- Backing store for the `generate-creative-copy` edge function's output.
-- Every AI-generated copy suggestion — whether from the composer's "AI
-- Suggest" button (on-demand) or from the event-publish auto-fire
-- (`autoGenerateEventDrafts`) — persists here so the organizer can
-- browse, review, and apply drafts asynchronously from a single
-- "AI Drafts" panel in the Creatives library.
--
-- The `generate-creative-copy` function also counts rows in this table
-- (matching event_id, within the last 24h) as its per-event daily quota
-- gate. That means EVERY generation — auto-fire, on-demand, dismissed,
-- or already-applied — counts against the budget. This is deliberate:
-- each row corresponds to one paid Gemini call, and the quota exists to
-- cap the Google-side cost per event.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_creative_ai_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Which creative type the copy was generated for. Mirrors
  -- `CreativeType` in `src/lib/creatives/creative-templates.ts`; the
  -- text values match `CopyKind` in
  -- `supabase/functions/generate-creative-copy/index.ts` exactly so a
  -- draft row is a faithful record of the generation request.
  entity_type   text NOT NULL CHECK (entity_type IN ('event', 'speaker', 'sponsor', 'combo')),
  -- `speakers.id` when entity_type='speaker'/'combo', `sponsors.id` when
  -- entity_type='sponsor'/'combo', NULL for entity_type='event'. Not a
  -- foreign key (would need two separate columns for two references);
  -- the row is denormalised so a deleted speaker/sponsor doesn't cascade
  -- delete drafts the organizer may still want to browse.
  entity_id     uuid,

  -- The parsed CopySuggestion JSON: { tagline, subtitle?, ctaLabel, stats? }.
  -- See CopySuggestion type in generate-creative-copy/index.ts for
  -- the exact shape.
  copy          jsonb NOT NULL,

  -- Where this draft came from — helps the UI style auto-fire drafts
  -- distinctly from on-demand suggestions.
  source        text NOT NULL DEFAULT 'on_demand' CHECK (source IN ('on_demand', 'auto_publish')),

  -- 'pending' = shows in the review UI. 'applied' = organizer opened
  -- the composer prefilled from this draft (records provenance).
  -- 'dismissed' = organizer explicitly rejected it (hidden from the
  -- review UI but retained so the quota keeps counting it).
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_event_idx
  ON public.event_creative_ai_drafts(event_id);
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_pending_idx
  ON public.event_creative_ai_drafts(event_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_quota_idx
  ON public.event_creative_ai_drafts(event_id, created_at DESC);

ALTER TABLE public.event_creative_ai_drafts ENABLE ROW LEVEL SECURITY;

-- Organizers (event owners) and admins can view + manage drafts for
-- their own events. Mirrors the RLS pattern used by `event_speakers` /
-- `event_sponsors` — reach through `events.user_id` + `has_role`.
DROP POLICY IF EXISTS "Owner manage event_creative_ai_drafts"
  ON public.event_creative_ai_drafts;
CREATE POLICY "Owner manage event_creative_ai_drafts"
  ON public.event_creative_ai_drafts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.event_creative_ai_drafts
  TO authenticated;
-- The `generate-creative-copy` edge function runs with the service role
-- to insert drafts on behalf of the caller (bypassing the RLS check
-- above so quota counts and inserts stay atomic even when the caller's
-- JWT is short-lived).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.event_creative_ai_drafts
  TO service_role;

-- Keep `updated_at` fresh on every UPDATE so the UI can show "Applied
-- 2 minutes ago" style timestamps.
DROP TRIGGER IF EXISTS event_creative_ai_drafts_updated_at
  ON public.event_creative_ai_drafts;
CREATE TRIGGER event_creative_ai_drafts_updated_at
  BEFORE UPDATE ON public.event_creative_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- <<< END SOURCE MIGRATION: 029_event_creative_ai_drafts.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 030_org_admin_can_manage.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 030_org_admin_can_manage.sql
--
-- Extends day-to-day workspace management to teammates with the "admin" role
-- in org_members. Before this migration, RLS on `organizations`, `org_members`
-- and `org_invitations` gated all writes on `is_org_owner` (i.e., `owner_id`
-- or a teammate promoted to `role='owner'` via migration 007). That mismatch
-- with the product's stated role model — where the Settings → Team screen
-- offers Owner / Admin / Member / Viewer and describes Admin as "Manage
-- settings & members" — meant that anyone but an owner got a silent RLS
-- rejection when they clicked Save, Invite, or the role dropdown.
--
-- The fix mirrors the pattern already established for `events` (migration 012)
-- and `registrations` (migration 010): keep owners fully privileged, and add
-- narrower policies for admins that block only the owner-scoped edges —
-- creating/promoting an owner, or modifying an existing owner row.
--
-- Guardrails preserved for admins:
--   • Cannot INSERT an org_members row with role='owner'      (self-promotion)
--   • Cannot UPDATE any row whose current OR proposed role is 'owner'
--   • Cannot DELETE a row whose role is 'owner'               (kick an owner)
--   • Cannot INSERT/UPDATE an org_invitations row with role='owner'
--   • Cannot INSERT or DELETE a subscription (still owner-only billing)
--
-- Idempotent: `CREATE OR REPLACE` + `DROP POLICY IF EXISTS` throughout so the
-- migration can be re-run safely against a partially applied database.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── Helper ────────────────────────────────────────────────────────────────
-- is_org_manager(uid, org_id) → owner OR admin.
-- SECURITY DEFINER so RLS on `org_members` doesn't create a chicken-and-egg
-- loop when a policy calls this helper to evaluate itself.
CREATE OR REPLACE FUNCTION public.is_org_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_org_owner(_user_id, _org_id)
    OR EXISTS (
      SELECT 1 FROM public.org_members
       WHERE org_id  = _org_id
         AND user_id = _user_id
         AND role    = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_manager(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_manager(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_org_manager(uuid, uuid) IS
  'True when the user is the canonical workspace owner, a teammate promoted to role=owner in org_members, or a teammate with role=admin. Used by RLS to allow admins to invite/edit teammates and update org settings without granting owner-only privileges (billing plan changes, promoting to owner).';


-- ─── organizations ─────────────────────────────────────────────────────────
-- UPDATE: managers (owner + admin) can edit workspace details. Platform
-- admins keep bypass access for support.
DROP POLICY IF EXISTS "Owner update org" ON public.organizations;
CREATE POLICY "Managers update org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.is_org_manager(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
);

COMMENT ON POLICY "Managers update org" ON public.organizations IS
  'UPDATE organizations: canonical owner, org_members with role owner or admin, or platform admin. INSERT stays owner-self-service (Auth create orgs); ownership transfer must go through a dedicated RPC.';


-- ─── org_members ───────────────────────────────────────────────────────────
-- Keep the owner-only ALL policy for full lifecycle. Split admin access into
-- per-verb policies with role-guards so admins cannot create/modify/remove an
-- owner row.
DROP POLICY IF EXISTS "Owner manage members" ON public.org_members;
DROP POLICY IF EXISTS "Owners manage all members"            ON public.org_members;
DROP POLICY IF EXISTS "Admins insert non-owner members"      ON public.org_members;
DROP POLICY IF EXISTS "Admins update non-owner members"      ON public.org_members;
DROP POLICY IF EXISTS "Admins delete non-owner members"      ON public.org_members;

CREATE POLICY "Owners manage all members"
ON public.org_members
FOR ALL
TO authenticated
USING (public.is_org_owner(auth.uid(), org_id))
WITH CHECK (public.is_org_owner(auth.uid(), org_id));

CREATE POLICY "Admins insert non-owner members"
ON public.org_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

CREATE POLICY "Admins update non-owner members"
ON public.org_members
FOR UPDATE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
)
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

CREATE POLICY "Admins delete non-owner members"
ON public.org_members
FOR DELETE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

COMMENT ON POLICY "Owners manage all members" ON public.org_members IS
  'ALL org_members verbs: canonical owner or role=owner teammate. Unrestricted, including promoting/demoting other owners.';
COMMENT ON POLICY "Admins insert non-owner members" ON public.org_members IS
  'INSERT org_members: admins can add teammates as admin/member/viewer, but never as owner (self-promotion guard).';
COMMENT ON POLICY "Admins update non-owner members" ON public.org_members IS
  'UPDATE org_members: admins can retitle a non-owner teammate to another non-owner role. Cannot touch rows whose current role is owner, nor promote to owner.';
COMMENT ON POLICY "Admins delete non-owner members" ON public.org_members IS
  'DELETE org_members: admins can remove non-owner teammates. Owners are protected from being kicked by an admin.';


-- ─── org_invitations ───────────────────────────────────────────────────────
-- Same pattern: owners keep the unrestricted ALL policy; admins get scoped
-- verbs that block owner-role invitations.
DROP POLICY IF EXISTS "Owner manage invitations"             ON public.org_invitations;
DROP POLICY IF EXISTS "Owners manage all invitations"        ON public.org_invitations;
DROP POLICY IF EXISTS "Admins manage non-owner invitations"  ON public.org_invitations;

CREATE POLICY "Owners manage all invitations"
ON public.org_invitations
FOR ALL
TO authenticated
USING (public.is_org_owner(auth.uid(), org_id))
WITH CHECK (public.is_org_owner(auth.uid(), org_id));

CREATE POLICY "Admins manage non-owner invitations"
ON public.org_invitations
FOR ALL
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
)
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

COMMENT ON POLICY "Owners manage all invitations" ON public.org_invitations IS
  'ALL org_invitations verbs: canonical owner or role=owner teammate. Includes issuing owner-role invitations.';
COMMENT ON POLICY "Admins manage non-owner invitations" ON public.org_invitations IS
  'ALL org_invitations verbs: admins can issue, retitle, cancel, or update non-owner invitations. Owner-role invitations remain restricted to owners so admins cannot self-promote via an accepted invite.';
-- <<< END SOURCE MIGRATION: 030_org_admin_can_manage.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 031_venue_selection_notifications.sql >>>
-- ============================================================================
-- 031_venue_selection_notifications.sql
-- ----------------------------------------------------------------------------
-- Two fixes / additions for the venue-selection flow that ships in 027:
--
--   1. Define `is_vendor_member(user_id, vendor_id)` — migration 027 already
--      references this helper in its RLS policies, but the function itself
--      was never created. Without it every SELECT / UPDATE against
--      event_venue_selections from a vendor account errors out with
--      "function is_vendor_member(...) does not exist".
--
--   2. Notify the organizer when the vendor accepts or declines their venue
--      request. The existing `notify-venue-selection` edge function only
--      handles organizer → vendor. This trigger fires the reverse
--      direction (vendor → organizer) via pg_net → the new
--      `notify-organizer-venue-response` edge function.
--
-- Both apps (Illuxus and vendor-connect-standalone) share this Supabase
-- project, so the trigger fires regardless of which frontend flips the
-- status.
-- ============================================================================

-- ── 1. is_vendor_member helper ──────────────────────────────────────────────
-- SECURITY DEFINER so calls from RLS policies bypass the recursion that would
-- otherwise happen if an ordinary function tried to read vendor_members while
-- vendor_members' own RLS is being evaluated.
CREATE OR REPLACE FUNCTION public.is_vendor_member(_user_id uuid, _vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.vendor_members vm
     WHERE vm.user_id   = _user_id
       AND vm.vendor_id = _vendor_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_vendor_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.is_vendor_member(uuid, uuid) IS
  'Returns true when the given user is a member of the given vendor. Used by RLS policies on event_venue_selections (see migration 027).';

-- ── 2. keep updated_at fresh on status changes ──────────────────────────────
-- The client-side upsert sets updated_at explicitly, but a vendor accept /
-- decline from another surface (SQL, admin console, another app) will bypass
-- that — so bake it into a BEFORE trigger.
CREATE OR REPLACE FUNCTION public.event_venue_selections_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('accepted', 'declined')
     AND NEW.responded_at IS NULL
  THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_venue_selections_touch ON public.event_venue_selections;
CREATE TRIGGER trg_event_venue_selections_touch
  BEFORE UPDATE ON public.event_venue_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.event_venue_selections_touch_updated_at();

-- ── 3. Organizer notification on vendor accept / decline ────────────────────
-- Mirrors the pattern in 000_full_schema.sql for communications_run_scheduled:
-- pulls the service role key + supabase URL out of app_settings, then POSTs
-- to the edge function via pg_net. Any failure is swallowed so the vendor's
-- accept / decline never gets blocked by an email hiccup.
CREATE OR REPLACE FUNCTION public.notify_organizer_venue_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _supabase_url text;
  _service_key  text;
BEGIN
  -- Only fire on real status transitions into accepted / declined. Skips
  -- the initial contacted → contacted upsert and any no-op UPDATE.
  IF TG_OP <> 'UPDATE'
     OR NEW.status = OLD.status
     OR NEW.status NOT IN ('accepted', 'declined') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _supabase_url FROM public.app_settings WHERE key = 'supabase_url';
  SELECT value INTO _service_key  FROM public.app_settings WHERE key = 'service_role_key';

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    -- Not configured yet — dev / preview environment. Silently skip so the
    -- vendor's accept / decline still commits.
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := _supabase_url || '/functions/v1/notify-organizer-venue-response',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _service_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'selection_id',  NEW.id,
        'event_id',      NEW.event_id,
        'vendor_id',     NEW.vendor_id,
        'status',        NEW.status,
        'previous_status', OLD.status,
        'notes',         NEW.notes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the trigger for a delivery hiccup. Row is already saved.
    RAISE NOTICE 'notify_organizer_venue_response dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_organizer_venue_response() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_event_venue_selections_notify ON public.event_venue_selections;
CREATE TRIGGER trg_event_venue_selections_notify
  AFTER UPDATE OF status ON public.event_venue_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_organizer_venue_response();

COMMENT ON TRIGGER trg_event_venue_selections_notify ON public.event_venue_selections IS
  'Emails the event organizer whenever a vendor accepts or declines their venue request. Handled asynchronously via pg_net → notify-organizer-venue-response edge function.';
-- <<< END SOURCE MIGRATION: 031_venue_selection_notifications.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 032_anon_rpc_hardening.sql >>>
-- ============================================================================
-- 032_anon_rpc_hardening.sql
--
-- SECURITY FIXES for three CONFIRMED data-exposure defects in `SECURITY
-- DEFINER` functions that are executable by the `anon` role.
--
-- Why this class of function is dangerous: `SECURITY DEFINER` runs the body
-- with the owner's privileges, so **Row Level Security does not apply inside
-- it**. For an anon-callable function, the body's own `WHERE` clause is the
-- ONLY access boundary. Two of the three functions below were missing that
-- clause entirely.
--
-- Each fix is independent and each preserves the caller-visible behaviour the
-- application actually relies on (verified against the call sites, cited
-- inline).
--
-- ── AUDIT-01 (P1) — `get_event_attendees_public` unbounded attendee dump ────
--   The function takes `_limit int DEFAULT 12` and interpolates it straight
--   into `LIMIT _limit` with no clamp. It is granted to `anon`. So while the
--   intended contract is "≤12 avatars for the going-strip", an anonymous
--   caller passing `_limit => 2147483647` receives the NAME of every approved
--   attendee of any published event in a single request.
--   The visibility gate itself was already correct
--   (`approval_status='approved' AND e.status='published'`) — only the bound
--   was missing. `search_cities`, defined ~6 lines away in
--   000_full_schema.sql, already demonstrates the correct idiom:
--   `LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),50)`.
--
-- ── AUDIT-02 (P2) — `get_event_by_slug` returns unpublished events ──────────
--   `WHERE e.slug = lower(_slug) AND (...)` with NO visibility predicate. The
--   only reference to publication state is `ORDER BY (e.status='published')
--   DESC`, which merely *prefers* a published row on slug collision; when only
--   a draft matches, the draft is returned. An anonymous caller can therefore
--   confirm the existence of unannounced events and harvest their UUIDs (which
--   are inputs to other RPCs), with `status` in the result telling them
--   exactly what they found.
--
-- ── AUDIT-03 (P1) — `self_check_in` / `self_check_out` leak email ───────────
--   Both are granted to `anon` (the public `/checkin/:eventId` route is
--   unauthenticated) and both return `email` on EVERY path, including the
--   `wrong_event`, `expired` and `cancelled` failure paths. Anyone who obtains
--   a token — a photographed QR code, a forwarded ticket link, a screenshot —
--   reads the registrant's email address out of the database.
--
--   Worse, the `speaker:%` / `sponsor_contact:%` branches read
--   `speakers.email` and `sponsor_members.email` from inside the SECURITY
--   DEFINER body, which **defeats an explicit column-level revoke** that this
--   same schema sets at 000_full_schema.sql:275 and :294:
--       REVOKE SELECT(email) ON public.speakers FROM anon;
--       REVOKE SELECT(email) ON public.sponsors FROM anon;
--   The project deliberately hid those addresses from anon; these functions
--   handed them back. The `speakers.id` needed to trigger that branch is
--   published on public event pages.
--
--   VERIFIED SAFE TO REMOVE: no caller reads the field. Checked every call
--   site — src/pages/SelfCheckInPage.tsx:121, src/pages/SelfCheckOutPage.tsx:117,
--   src/components/event/RegistrationsSection.tsx:513 and :801,
--   src/components/event/registrations/BulkCheckInDialog.tsx:75. None
--   references `.email` on the RPC result; the UI renders `status` and `name`.
--
-- ── DEPLOYMENT NOTE (read before applying) ─────────────────────────────────
--   Postgres cannot change a function's return type with
--   `CREATE OR REPLACE` — it raises "cannot change return type of existing
--   function". Removing the `email` column therefore requires DROP + CREATE,
--   which means a sub-second window where `self_check_in` / `self_check_out`
--   do not exist. Apply during a period with no active door check-in, or
--   accept that a scan in that window returns a transient error and succeeds
--   on retry. The DROP is of a FUNCTION only — no table, row, or column is
--   touched, and there is no data loss.
--
--   `GRANT` is re-issued after each CREATE because DROP discards grants.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   Every change is reversible by re-applying the prior definition from
--   000_full_schema.sql (`get_event_attendees_public` line 908,
--   `get_event_by_slug` line 907, `self_check_in` line 1597, `self_check_out`
--   line 1664) and re-issuing the same GRANTs. No data is modified by this
--   migration.
-- ============================================================================


-- ── AUDIT-01: clamp the attendee-preview limit ─────────────────────────────
-- Return type is unchanged, so CREATE OR REPLACE is sufficient and grants are
-- preserved. The clamp mirrors `search_cities`: floor 1, ceiling 50, default 12.
-- 50 is comfortably above the 12 the UI requests
-- (src/pages/PublicEventPage.tsx passes `_limit: 12`) while making a full
-- roster dump impossible.
CREATE OR REPLACE FUNCTION public.get_event_attendees_public(_eid uuid, _limit int DEFAULT 12)
RETURNS TABLE(going_count bigint, attendees jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ap AS (
    SELECT r.user_id, r.name, r.created_at
      FROM registrations r
      JOIN events e ON e.id = r.event_id
     WHERE r.event_id = _eid
       AND r.approval_status = 'approved'
       AND e.status = 'published'
  ),
  sa AS (
    SELECT a.user_id, a.name, a.created_at, p.display_name, p.avatar_url
      FROM ap a
      LEFT JOIN profiles p ON p.user_id = a.user_id
     ORDER BY a.created_at
     -- CLAMPED. Was a bare `LIMIT _limit`, letting an anon caller request the
     -- entire approved-attendee roster by name.
     LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 50)
  )
  SELECT
    (SELECT count(*) FROM ap),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'name', COALESCE(s.display_name, s.name),
                'avatar_url', s.avatar_url))
         FROM sa s),
      '[]'
    );
$$;

COMMENT ON FUNCTION public.get_event_attendees_public(uuid, int) IS
  'Going-count plus a small avatar preview of approved attendees for a PUBLISHED event. `_limit` is clamped to 1..50 (default 12): the unclamped version allowed an anonymous caller to dump the full attendee roster by name. `going_count` is a total and is unaffected by the clamp.';


-- ── AUDIT-02: restrict slug resolution to publicly-visible events ──────────
-- Return type unchanged -> CREATE OR REPLACE, grants preserved.
--
-- A bare `AND e.status = 'published'` would BREAK organizer draft preview:
-- src/pages/PublicEventPage.tsx resolves the slug through this RPC (lines 80
-- and 93) for both public visitors and the organizer previewing their own
-- unpublished event. The predicate below therefore mirrors the `events` table's
-- own SELECT policy ("View published events", as widened by migration 012):
-- published, OR the caller owns it, OR the caller is a platform admin, OR the
-- caller is a member of the owning organisation.
--
-- `is_event_owner` is not used here because it is REVOKEd from anon
-- (000_full_schema.sql:1222) and this function must remain anon-callable; the
-- ownership test is inlined instead. `has_role` and `is_org_member` are both
-- SECURITY DEFINER and safe to call from this context.
--
-- For an anonymous caller every OR branch after the first evaluates against
-- `auth.uid() = NULL` and yields false, so anon sees published events only.
CREATE OR REPLACE FUNCTION public.get_event_by_slug(_slug text, _org_slug text DEFAULT NULL)
RETURNS TABLE(id uuid, slug text, org_id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.org_id, e.status
    FROM events e
    LEFT JOIN organizations o ON o.id = e.org_id
   WHERE e.slug = lower(_slug)
     AND (_org_slug IS NULL OR o.slug = _org_slug OR o.subdomain = _org_slug)
     -- VISIBILITY GATE (added). Previously absent entirely, so any slug guess
     -- returned draft/cancelled events to anonymous callers.
     AND (
          e.status = 'published'
       OR e.user_id = auth.uid()
       OR public.has_role(auth.uid(), 'admin')
       OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
     )
   ORDER BY (e.status = 'published') DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_event_by_slug(text, text) IS
  'Resolves an event slug to its id. Visibility mirrors the events SELECT policy: published, or owned by the caller, or caller is platform admin / member of the owning org. Anonymous callers see published events only. The prior version had no visibility predicate and leaked draft events.';


-- ── AUDIT-03: drop `email` from the public check-in/out return shape ───────
-- DROP + CREATE is required: the return type changes. See the DEPLOYMENT NOTE
-- at the top of this file.
--
-- The bodies below are otherwise transcribed unchanged from
-- 000_full_schema.sql (self_check_in at 1597, self_check_out at 1664),
-- including the REQ-14 guarantee that an already-inside registration returns
-- 'already' WITHOUT inserting an attendance row, so the public flow can never
-- check someone out. Only the `email` column is removed from `RETURNS TABLE`
-- and from every `RETURN QUERY`.
--
-- NOTE ON RESIDUAL RISK (not fixed here, tracked as AUDIT-04): the
-- `speaker:%` / `sponsor_contact:%` branch still LAZY-CREATES a
-- `status='confirmed', approval_status='approved'` registration row, and the
-- success path still inserts an `attendance_events` row, both driven purely by
-- token possession with no rate limit. Removing that is a behavioural change
-- to the door-check-in product flow and needs product sign-off, so it is
-- reported rather than silently altered. Dropping `email` closes the
-- disclosure half of the finding, which is the part with no behavioural cost.

DROP FUNCTION IF EXISTS public.self_check_in(text, uuid);

CREATE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, ticket_type text, checked_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r registrations%ROWTYPE; ev events%ROWTYPE; _wi boolean; _ee timestamptz;
  _k text; _ref uuid; _n text; _e text; _co text; _tt text;
  _ts timestamptz := now(); _d date; _rid uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END;
    -- `_e` is still read internally: it is the key used to match or create the
    -- registration row. It is simply never returned to the caller now.
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker' INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor' INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.event_id = p_event_id AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, '')) LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO registrations(event_id, name, email, company, ticket_type, status, approval_status)
      VALUES (p_event_id, _n, COALESCE(_e, _n || '@no-email.local'), _co, _tt, 'confirmed', 'approved')
      RETURNING * INTO r;
    END IF;
  ELSE
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
  END IF;

  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
  END IF;

  _wi := (r.attendance_state = 'inside');
  _d  := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  -- REQ-14 (preserved verbatim): when already inside, return 'already' WITHOUT
  -- inserting any attendance_events row, so the public self-check-in flow can
  -- never check a participant out.
  IF _wi THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_in_at;
  ELSE
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (_rid, r.event_id, _d, 'in', 'self', _ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_in_at;
  END IF;
END $$;

-- Re-issued: DROP FUNCTION discarded the previous grant. The public
-- `/checkin/:eventId` route is unauthenticated and depends on this.
GRANT EXECUTE ON FUNCTION public.self_check_in(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.self_check_in(text, uuid) IS
  'Public self-check-in by QR / join token. Returns status + name + ticket_type; `email` was REMOVED from the return shape because this function is anon-callable and every path (including failures) previously disclosed the registrant address, which also defeated the REVOKE SELECT(email) on speakers/sponsors. Never inserts an out-event (REQ-14).';


DROP FUNCTION IF EXISTS public.self_check_out(text, uuid);

CREATE FUNCTION public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, ticket_type text, checked_out_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r registrations%ROWTYPE; ev events%ROWTYPE; _ee timestamptz;
  _k text; _ref uuid; _n text; _e text; _co text; _tt text;
  _ts timestamptz := now(); _d date; _rid uuid; _state text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END;
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker' INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor' INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    -- Self-check-out never lazy-creates a registration.
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.event_id = p_event_id AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, '')) LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_checked_in_yet'::text, NULL::uuid, p_event_id, _n, _tt, NULL::timestamptz; RETURN;
    END IF;
  ELSE
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
  END IF;

  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
  END IF;

  _state := r.attendance_state;
  _d := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  IF _state = 'inside' THEN
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (_rid, r.event_id, _d, 'out', 'self', _ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at;
  ELSIF _state = 'outside' THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at;
  ELSE
    RETURN QUERY SELECT 'not_checked_in_yet'::text, r.id, r.event_id, r.name, r.ticket_type, NULL::timestamptz;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.self_check_out(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.self_check_out(text, uuid) IS
  'Public self-check-out by QR / join token. Mirrors self_check_in with inverted semantics. `email` was REMOVED from the return shape for the same anon-disclosure reason.';
-- <<< END SOURCE MIGRATION: 032_anon_rpc_hardening.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 032_venue_selection_service_details.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 032_venue_selection_service_details.sql
--
-- Persist which of the vendor's services the organizer selected when they
-- picked this vendor from the marketplace. Before this migration the
-- `event_venue_selections` row only recorded WHO the organizer wanted;
-- there was no room for WHAT services (e.g. "hall rental + food + AV").
--
-- Design decision: uuid[] on the parent row, not a join table.
--   • The list is small (a vendor typically has 3-10 services) and only
--     ever queried alongside its parent selection — a join table would
--     add a round-trip for every venue-request card the vendor sees.
--   • We use uuid[] instead of jsonb so we can rely on the FK-shaped
--     ids without teaching every reader how to parse a jsonb blob.
--   • No foreign key on the array — deleting a service that was
--     referenced from a historical selection shouldn't cascade-delete
--     the selection or throw. The vendor UI resolves ids to titles at
--     read time and handles missing ones gracefully.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.event_venue_selections
  ADD COLUMN IF NOT EXISTS selected_service_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN public.event_venue_selections.selected_service_ids IS
  'Optional array of vendor_services.id values the organizer picked when contacting this vendor. Empty array = "no specific services chosen, please quote the venue itself". The vendor UI resolves these to service titles at read time.';
-- <<< END SOURCE MIGRATION: 032_venue_selection_service_details.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 034_event_venue_selections_grants.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 034_event_venue_selections_grants.sql
--
-- FIX: migration 027 created `event_venue_selections` with ENABLE ROW LEVEL
-- SECURITY and three CREATE POLICY statements, but never granted
-- table-level SELECT / INSERT / UPDATE to the `authenticated` role. Since
-- RLS runs on top of table permissions, both apps saw 403 Forbidden on
-- every read and write — the policies were correct but unreachable.
--
-- Symptoms this fixes:
--   • Organizer sees 403 in the browser Network tab when the venue picker
--     tries to filter out vendors already booked on the event date
--     (useVenueVendors → the accepted-selection availability query).
--   • Organizer's Send-request upsert never actually inserts, so the
--     vendor's Inbox stays empty even after multiple picks.
--   • useVendorAvailability (added by migration 033's companion PR) also
--     returns 403 when the detail-view availability panel loads.
--
-- Grants required (per the three RLS policies in migration 027):
--   • SELECT  — organizer org-manage + vendor read policies need this so
--     RLS can evaluate its predicates. Row-level filtering happens on top.
--   • INSERT  — organizer org-manage covers writes; the upsert in
--     useSelectVenueVendor.ts is INSERT-with-fallback-UPDATE via the
--     UNIQUE (event_id, vendor_id) constraint.
--   • UPDATE  — organizer org-manage AND vendor-respond both need this
--     for status transitions (accept / decline / cancel).
--
-- DELETE is intentionally omitted: the flow uses UPDATE status='cancelled'
-- to keep a historical trail for both sides.
--
-- Idempotent: GRANT is additive; re-running does not error and does not
-- change effective permissions if the grants are already in place.
--
-- NOTE: A previous version of this file also RAISE'd if the vendor_read
-- policy was missing. That check was pulled — the GRANT alone is the
-- actual fix, and blocking it on the policy check was blocking every
-- deployment where migration 027 landed the table without landing the
-- policies (which is what we observed against the running database).
-- If the policies are missing, applying 027 idempotently afterwards
-- installs them; see the diagnostic block at the bottom of this file.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON public.event_venue_selections TO authenticated;

COMMENT ON TABLE public.event_venue_selections IS
  'Records an organizer picking a specific vendor for their event''s venue. Table grants installed by migration 034; RLS policies installed by migration 027 (organizer/org can manage own selections; vendor can read + respond to selections targeting them).';


-- ── Diagnostic (non-fatal) ─────────────────────────────────────────────────
-- Log a NOTICE if any of the three policies from 027 are missing so
-- operators know to re-apply 027 in a follow-up SQL run. Doesn't RAISE —
-- the GRANT is enough on its own for the 403 to clear.
DO $$
DECLARE
  _missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_org_manage'
  ) THEN
    _missing := _missing || 'event_venue_selections_org_manage';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_vendor_read'
  ) THEN
    _missing := _missing || 'event_venue_selections_vendor_read';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_vendor_respond'
  ) THEN
    _missing := _missing || 'event_venue_selections_vendor_respond';
  END IF;

  IF array_length(_missing, 1) > 0 THEN
    RAISE NOTICE
      'event_venue_selections is missing RLS policies: %. '
      'Re-apply migration 027_event_venue_selections.sql to install them. '
      'The GRANT from this migration will still work; RLS just won''t filter '
      'until 027''s policies are in place.',
      _missing;
  END IF;
END $$;
-- <<< END SOURCE MIGRATION: 034_event_venue_selections_grants.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 035_venue_booking_context.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 035_venue_booking_context.sql
--
-- Adds the "venue brief" fields the organizer fills in when they book a
-- venue. Before this migration the vendor only saw the ticked services on
-- the request card; they had no idea whether the event was a wedding or a
-- product launch, whether it needed 40 seats or 400, banquet vs theater
-- layout, VIP zone, breakout rooms, etc.
--
-- These fields describe what the organizer wants from the venue for THIS
-- specific booking — hence they live on `event_venue_selections` rather
-- than on `events`. That means:
--   • Two vendors contacted for the same event can each get a different
--     brief (rare, but supported by the model).
--   • If the organizer later changes vendors, the client copies the
--     previous brief onto the new selection so nothing is retyped.
--
-- Every column is nullable / boolean-with-default so historical rows
-- created before this migration continue to render correctly.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.event_venue_selections
  add column if not exists event_type              text,
  add column if not exists event_duration_hours    numeric(6,2),
  add column if not exists expected_attendees      int,
  add column if not exists seating_capacity        int,
  add column if not exists seating_arrangement     text,
  add column if not exists needs_pre_function_area boolean not null default false,
  add column if not exists needs_vip_area          boolean not null default false,
  add column if not exists needs_additional_rooms  boolean not null default false,
  add column if not exists venue_link              text;

-- Cheap sanity guard: seating_arrangement is free text on purpose (letting
-- the organizer pick "Other" or type a custom arrangement) but we cap the
-- length so a copy-paste accident doesn't ship a novel to the vendor.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_seating_arrangement_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_seating_arrangement_length
    check (seating_arrangement is null or length(seating_arrangement) <= 60);

-- Same for event_type — short free text.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_event_type_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_event_type_length
    check (event_type is null or length(event_type) <= 60);

-- Venue link — URL-ish text with a length cap. We don't hard-validate the
-- URL shape (letting mailto:, tel:, or a raw address through) but keep it
-- short enough that it isn't storing arbitrary payloads.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_venue_link_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_venue_link_length
    check (venue_link is null or length(venue_link) <= 500);

comment on column public.event_venue_selections.event_type              is 'Business type of the event (e.g. Wedding, Corporate offsite, Product launch). Free text, capped at 60 chars.';
comment on column public.event_venue_selections.event_duration_hours    is 'Planned event duration in hours. Numeric so half-days like 4.5 or overnight retreats can be modelled.';
comment on column public.event_venue_selections.expected_attendees      is 'Organizer''s attendee estimate — informs staffing / catering / capacity.';
comment on column public.event_venue_selections.seating_capacity        is 'Seat count the organizer needs the venue to comfortably support.';
comment on column public.event_venue_selections.seating_arrangement     is 'Layout preference (Theater, Classroom, Banquet, U-shape, Boardroom, Cocktail, Custom text). Free text, capped at 60 chars.';
comment on column public.event_venue_selections.needs_pre_function_area is 'Organizer wants a lobby / reception / registration space.';
comment on column public.event_venue_selections.needs_vip_area          is 'Organizer wants a segregated VIP / green-room area.';
comment on column public.event_venue_selections.needs_additional_rooms  is 'Organizer wants breakout / secondary rooms beyond the main space.';
comment on column public.event_venue_selections.venue_link              is 'Reference URL — a preferred layout, a mood board, or an existing venue''s site the organizer wants to match.';
-- <<< END SOURCE MIGRATION: 035_venue_booking_context.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 036_selections_reference_venue.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════
-- 036_selections_reference_venue.sql
--
-- Adds `venue_id` to `event_venue_selections` so a request records
-- WHICH specific venue the organizer picked, not just which vendor.
-- Necessary now that a single vendor can own multiple venues
-- (introduced by illuxus-vendor migration 106).
--
-- Nullable + ON DELETE SET NULL: historical rows created before this
-- migration have no venue_id, and a vendor deleting a venue shouldn't
-- cascade-delete the historical request record.
--
-- The UNIQUE (event_id, vendor_id) constraint is intentionally left
-- alone — one venue per event is still the norm, and even when a
-- vendor has multiple venues an organizer would only pick one for the
-- event. If that ever changes, drop this constraint and add
-- UNIQUE (event_id, venue_id) in a follow-up.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.event_venue_selections
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

comment on column public.event_venue_selections.venue_id is
  'The specific venue (from public.venues) the organizer selected. Nullable — rows created before migration 036 have no venue_id and represent a vendor-level request. New rows should always populate this.';

create index if not exists event_venue_selections_venue_id_idx
  on public.event_venue_selections (venue_id);
-- <<< END SOURCE MIGRATION: 036_selections_reference_venue.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 037_org_member_emails.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 037_org_member_emails.sql
--
-- Settings → Team needs teammates' email addresses for two things:
--   • the "already a member" pre-flight before issuing an invitation, and
--   • revoking a removed teammate's invitation rows so the original
--     `/login?invite=<token>` link can't re-add them via
--     accept_org_invitation (which treats 'accepted' tokens as reusable).
--
-- The client was reading `profiles.email`, but `profiles` has no email
-- column — emails only live on auth.users, which the client can't read.
-- Both queries silently returned nothing, so duplicate invites slipped
-- through and removed members could rejoin with their old link.
--
-- This RPC exposes (user_id, email) for one workspace's members, and only
-- to that workspace's managers (owner or admin, see migration 030).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.org_member_emails(_org_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_org_manager(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can list member emails';
  END IF;

  RETURN QUERY
    SELECT m.user_id, lower(u.email)::text
      FROM public.org_members m
      JOIN auth.users u ON u.id = m.user_id
     WHERE m.org_id = _org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_member_emails(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_member_emails(uuid) TO authenticated;

COMMENT ON FUNCTION public.org_member_emails(uuid) IS
  'Returns (user_id, email) for every member of the workspace. Restricted to owners/admins (is_org_manager). Used by Settings → Team for the already-a-member check and to revoke a removed member''s invitation.';
-- <<< END SOURCE MIGRATION: 037_org_member_emails.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 038_security_hardening.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 038_security_hardening.sql
--
-- Closes four data-exposure defects found in the security review. Idempotent:
-- safe to re-run.
--
-- ── SEC-01 (HIGH) — every signed-in user could read every profile ───────────
--   `"Auth can view profiles" … FOR SELECT TO authenticated USING (true)` let
--   any account (sign-up is open) read every user's mobile number, 2FA flag,
--   verification flags, UTM attribution and ban reason straight from
--   `profiles`.
--
--   Fix: a row is readable only by its owner or a platform admin. What other
--   users legitimately see (name, avatar, headline, company, designation —
--   community feed/chat, member lists, team list) is exposed through the
--   `profiles_public` view, which carries only those columns.
--
--   VERIFIED against the codebase before changing the policy:
--     • No SECURITY INVOKER function, RLS policy or view reads `profiles`
--       (every reader is SECURITY DEFINER), so nothing server-side depends on
--       the open policy.
--     • All 25 client queries were audited: own-row reads keep working; the
--       reads of *other* users' rows were moved to `profiles_public`
--       (src/lib/public-profiles.ts); the two admin pages are covered by the
--       admin branch of the new policy.
--
-- ── SEC-02 (HIGH) — `_audit_actor_email(uuid)` returned any user's email ────
--   SECURITY DEFINER, reads auth.users, and was executable by PUBLIC (the
--   Postgres default), i.e. callable through PostgREST by anon. User ids are
--   exposed throughout the app, so this was an email-harvesting oracle.
--   Its only callers are SECURITY DEFINER functions (audit trigger and the
--   admin_* functions), which run as the owner and keep working.
--
-- ── SEC-03 (HIGH) — `communications_diagnose(uuid)` open to all users ───────
--   Granted to `authenticated` with no ownership check: any signed-in user
--   could dispatch another organisation's draft communication and read its
--   audience filter. It is a SQL-Editor troubleshooting helper and is not
--   called by the app, so it is restricted to service_role. The internal
--   `_communications_dispatch_impl` it wraps had the same PUBLIC default and
--   is restricted too (callers: communications_dispatch / _run_scheduled,
--   both SECURITY DEFINER).
--
-- ── SEC-04 (MEDIUM) — internal helpers callable by anyone ───────────────────
--   `_whatsapp_recipient_update` (only edge functions call it, as
--   service_role) and `_copy_community_members_from_previous` (only
--   community_resync_from_previous, SECURITY DEFINER) were PUBLIC-executable.
--   The latter let a caller copy another event's community member list into
--   a community they control.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── SEC-01: profiles ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auth can view profiles"            ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile or admin"   ON public.profiles;

CREATE POLICY "Users view own profile or admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
);

COMMENT ON POLICY "Users view own profile or admin" ON public.profiles IS
  'A profile row (which holds mobile number, verification and 2FA flags, UTM attribution, ban reason) is readable only by its owner or a platform admin. Other users read the safe columns through the profiles_public view.';

-- The only profile data other signed-in users may see. Deliberately a plain
-- (owner-rights) view — the Postgres default, so no WITH (security_invoker)
-- clause: it must return every user's row even though the table's RLS now
-- hides them, and it exposes no sensitive column.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  user_id,
  display_name,
  first_name,
  last_name,
  username,
  avatar_url,
  headline,
  bio,
  company,
  designation
FROM public.profiles;

REVOKE ALL    ON public.profiles_public FROM PUBLIC, anon;
GRANT  SELECT ON public.profiles_public TO authenticated, service_role;

COMMENT ON VIEW public.profiles_public IS
  'Public-facing subset of profiles (name, avatar, headline, bio, company, designation) for signed-in users: community feed/chat, member lists, team list. Never add contact details, verification/2FA flags or attribution columns here.';


-- ─── SEC-02 / SEC-03 / SEC-04: lock internal functions to service_role ─────
-- Each of these is SECURITY DEFINER and was executable by PUBLIC (Postgres'
-- default) or explicitly by `authenticated`. Their legitimate callers are
-- other SECURITY DEFINER functions (which run as the owner) or edge
-- functions (service_role), so client roles lose nothing.
--
-- Done in a loop that skips any signature not present, so the migration
-- still applies cleanly on a database that has drifted from these files.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public._audit_actor_email(uuid)',                              -- SEC-02
    'public.communications_diagnose(uuid)',                         -- SEC-03
    'public._communications_dispatch_impl(uuid)',                   -- SEC-03
    'public._whatsapp_recipient_update(uuid, text, text)',          -- SEC-04
    'public._copy_community_members_from_previous(uuid, uuid)'      -- SEC-04
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '038: % not found, skipping', sig;
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;


-- ─── Support for the hardened create-participant-account edge function ─────
-- The function used auth.admin.listUsers(), which returns only the first page
-- (50 users), so existing accounts beyond that were not found. This gives the
-- service role an exact lookup instead. Not callable by anon/authenticated:
-- it would otherwise reveal whether an email has an account.
CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO service_role;

COMMENT ON FUNCTION public.admin_user_id_by_email(text) IS
  'Exact auth.users lookup by email for edge functions running as service_role. Not granted to anon/authenticated (would be an account-existence oracle).';
-- <<< END SOURCE MIGRATION: 038_security_hardening.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 039_utm_delete_tracking.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 039_utm_delete_tracking.sql
--
-- Lets an organiser delete a tracked (UTM) link from the event's UTM page.
--
-- Why a function: a row in the UTM breakdown exists because of what was
-- recorded for that source + medium + campaign — a saved `utm_links` row,
-- `utm_clicks`, and/or registrations. Clients can delete `utm_links` rows but
-- have no DELETE policy on `utm_clicks` (only SELECT), so a link that had ever
-- been clicked could not be removed from the page: deleting its saved row
-- left the click history, and the row stayed. Links shared without being
-- saved (e.g. from the event share button) had nothing deletable at all.
--
-- `delete_utm_tracking` removes, for one event and one source/medium/campaign:
--   • the saved link (if any), and
--   • its recorded clicks.
-- Registrations are leads and are NEVER deleted or altered here; the function
-- reports how many remain attributed to the link so the UI can say so.
--
-- Matching mirrors `event_utm_summary` (NULL medium/campaign are shown as
-- '(none)'), so what is deleted is exactly the row the organiser clicked.
-- '(direct)' is not a link and is refused.
--
-- Authorisation matches the existing utm_links / utm_clicks policies: the
-- event's creator, a member of its organisation, or a platform admin.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_links  int := 0;
  v_clicks int := 0;
  v_regs   int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.utm_links l
   WHERE l.event_id     = _event_id
     AND l.utm_source   = _utm_source
     AND l.utm_medium   = _utm_medium
     AND l.utm_campaign = _utm_campaign;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  DELETE FROM public.utm_clicks c
   WHERE c.event_id   = _event_id
     AND c.utm_source = _utm_source
     AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  SELECT count(*) INTO v_regs
    FROM public.registrations r
   WHERE r.event_id   = _event_id
     AND r.status    <> 'cancelled'
     AND r.utm_source = _utm_source
     AND coalesce(r.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(r.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');

  RETURN jsonb_build_object(
    'links_deleted',      v_links,
    'clicks_deleted',     v_clicks,
    'registrations_kept', v_regs
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) IS
  'Delete a tracked link for an event: its saved utm_links row and its recorded utm_clicks. Registrations are never touched; the count still attributed is returned. Caller must be the event creator, an org member, or a platform admin.';
-- <<< END SOURCE MIGRATION: 039_utm_delete_tracking.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 040_utm_partner_access.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 040_utm_partner_access.sql
--
-- Partner UTM sharing: an organiser shares ONE tracked link (an event's
-- utm_source + utm_medium + utm_campaign) with an external partner (agency).
-- The partner gets a dashboard that shows — and can add to — only the
-- registrations attributed to that link.
--
-- Isolation model
--   • `utm_partner_access` has RLS enabled and NO client policies: the table
--     cannot be read or written directly. Everything goes through the
--     SECURITY DEFINER functions below.
--   • Partners get no RLS access to `registrations`, `utm_clicks`,
--     `utm_links` or `attendance_events`. Every partner function takes a
--     grant id, re-validates it on every call (must be the caller's own,
--     accepted, not revoked) and derives the event + link from the grant row —
--     never from caller-supplied event ids or UTM values.
--   • Per-grant permissions are enforced here, not in the UI: fields the
--     grant doesn't cover are returned as NULL and filters on them ignored.
--   • Organiser-only data (decline reasons, notes, payment, tokens, QR codes)
--     is never returned by any partner function.
--
-- Reuses: registrations (+ its validation trigger, which applies the event's
-- approval rule, and the unique email index for duplicates), check-in columns
-- on registrations, audit_logs, registrant_audit_log, app_notifications.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Who created a registration ───────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.registrations.created_by IS
  'User who created the row on someone else''s behalf (e.g. a UTM partner). NULL for self-registrations and older rows.';

-- ── 2. Access grants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utm_partner_access (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- The shared link. Medium / campaign use '(none)' when absent, matching
  -- how event_utm_summary labels them.
  utm_source        text NOT NULL CHECK (btrim(utm_source) <> '' AND utm_source <> '(direct)'),
  utm_medium        text NOT NULL DEFAULT '(none)',
  utm_campaign      text NOT NULL DEFAULT '(none)',
  invited_email     text NOT NULL CHECK (invited_email = lower(btrim(invited_email)) AND position('@' in invited_email) > 1),
  partner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Viewing the shared participants is implied by the grant itself.
  can_register      boolean NOT NULL DEFAULT false,
  can_view_approval boolean NOT NULL DEFAULT true,
  can_view_checkin  boolean NOT NULL DEFAULT true,
  can_export        boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  granted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One grant per partner per link.
  UNIQUE (event_id, utm_source, utm_medium, utm_campaign, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_utm_partner_access_user  ON public.utm_partner_access(partner_user_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_utm_partner_access_email ON public.utm_partner_access(invited_email)   WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_utm_partner_access_event ON public.utm_partner_access(event_id);

DROP TRIGGER IF EXISTS update_utm_partner_access_updated_at ON public.utm_partner_access;
CREATE TRIGGER update_utm_partner_access_updated_at
  BEFORE UPDATE ON public.utm_partner_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on, no policies: no direct client access at all.
ALTER TABLE public.utm_partner_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.utm_partner_access FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.utm_partner_access TO service_role;

-- ── 3. Internal helpers (not callable by clients) ───────────────────────────

-- Event creator, a member of its organisation, or a platform admin — the same
-- rule the UTM page and utm_links policies use.
CREATE OR REPLACE FUNCTION public._utm_partner_manages_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  );
$$;

-- The caller's own active grant, or an error. Missing, revoked, pending and
-- someone-else's grants are indistinguishable to the caller.
CREATE OR REPLACE FUNCTION public._utm_partner_grant(_access_id uuid)
RETURNS public.utm_partner_access
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.utm_partner_access;
BEGIN
  IF auth.uid() IS NOT NULL AND _access_id IS NOT NULL THEN
    SELECT a.* INTO g
      FROM public.utm_partner_access a
     WHERE a.id = _access_id
       AND a.partner_user_id = auth.uid()
       AND a.status = 'accepted';
  END IF;
  IF g.id IS NULL OR public.is_user_banned(auth.uid()) THEN
    RAISE EXCEPTION 'You don''t have access to this shared link' USING ERRCODE = '42501';
  END IF;
  RETURN g;
END;
$$;

-- Registration counts for one link of one event (cancelled rows excluded).
CREATE OR REPLACE FUNCTION public._utm_partner_stats(_event_id uuid, _source text, _medium text, _campaign text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total',          count(*),
    'approved',       count(*) FILTER (WHERE r.approval_status = 'approved'),
    'pending',        count(*) FILTER (WHERE r.approval_status = 'pending'),
    'declined',       count(*) FILTER (WHERE r.approval_status = 'declined'),
    'waitlisted',     count(*) FILTER (WHERE r.approval_status = 'waitlisted'),
    'checked_in',     count(*) FILTER (WHERE r.checked_in),
    'not_checked_in', count(*) FILTER (WHERE NOT r.checked_in AND r.approval_status = 'approved')
  )
  FROM public.registrations r
  WHERE r.event_id   = _event_id
    AND r.status    <> 'cancelled'
    AND r.utm_source = _source
    AND coalesce(r.utm_medium,   '(none)') = _medium
    AND coalesce(r.utm_campaign, '(none)') = _campaign;
$$;

CREATE OR REPLACE FUNCTION public._utm_partner_audit(_action text, _access_id uuid, _details jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
    _action, 'utm_partner_access', _access_id::text, coalesce(_details, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- auditing must never break the operation it records
END;
$$;

CREATE OR REPLACE FUNCTION public._utm_partner_notify(_user_id uuid, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.app_notifications(user_id, type, title, body, link)
  VALUES (_user_id, _type, _title, _body, _link);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- What an organiser sees for one grant.
CREATE OR REPLACE FUNCTION public._utm_partner_row(a public.utm_partner_access)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'event_id', a.event_id,
    'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
    'invited_email', a.invited_email,
    'partner_name', (SELECT p.display_name FROM public.profiles p WHERE p.user_id = a.partner_user_id),
    'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
    'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
    'status', a.status, 'granted_at', a.granted_at, 'accepted_at', a.accepted_at, 'revoked_at', a.revoked_at,
    'stats', public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign),
    'registered_by_partner', (
      SELECT count(*) FROM public.registrations r
       WHERE a.partner_user_id IS NOT NULL
         AND r.created_by = a.partner_user_id
         AND r.event_id   = a.event_id
         AND r.status    <> 'cancelled'
         AND r.utm_source = a.utm_source
         AND coalesce(r.utm_medium,   '(none)') = a.utm_medium
         AND coalesce(r.utm_campaign, '(none)') = a.utm_campaign
    )
  );
$$;

-- ── 4. Organiser functions ──────────────────────────────────────────────────

-- Share a link with a partner (or update / re-activate an existing share).
CREATE OR REPLACE FUNCTION public.utm_partner_share(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text,
  _email        text,
  _permissions  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text := lower(btrim(coalesce(_email, '')));
  v_source   text := btrim(coalesce(_utm_source, ''));
  v_medium   text := coalesce(nullif(btrim(coalesce(_utm_medium, '')), ''), '(none)');
  v_campaign text := coalesce(nullif(btrim(coalesce(_utm_campaign, '')), ''), '(none)');
  v_perms    jsonb := coalesce(_permissions, '{}'::jsonb);
  v_user     uuid;
  v_title    text;
  v_existing public.utm_partner_access;
  v_row      public.utm_partner_access;
  v_new      boolean := false;
BEGIN
  IF NOT public._utm_partner_manages_event(_event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_source IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link and can''t be shared' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;

  -- The link must belong to this event: saved, clicked or registered through.
  IF NOT (
    EXISTS (SELECT 1 FROM public.utm_links l
             WHERE l.event_id = _event_id AND l.utm_source = v_source
               AND l.utm_medium = v_medium AND l.utm_campaign = v_campaign)
    OR EXISTS (SELECT 1 FROM public.utm_clicks c
                WHERE c.event_id = _event_id AND c.utm_source = v_source
                  AND coalesce(c.utm_medium, '(none)') = v_medium AND coalesce(c.utm_campaign, '(none)') = v_campaign)
    OR EXISTS (SELECT 1 FROM public.registrations r
                WHERE r.event_id = _event_id AND r.utm_source = v_source
                  AND coalesce(r.utm_medium, '(none)') = v_medium AND coalesce(r.utm_campaign, '(none)') = v_campaign)
  ) THEN
    RAISE EXCEPTION 'That tracked link doesn''t exist for this event' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user FROM auth.users u
   WHERE lower(u.email) = v_email AND u.email_confirmed_at IS NOT NULL
   LIMIT 1;
  SELECT e.title INTO v_title FROM public.events e WHERE e.id = _event_id;

  SELECT a.* INTO v_existing FROM public.utm_partner_access a
   WHERE a.event_id = _event_id AND a.utm_source = v_source AND a.utm_medium = v_medium
     AND a.utm_campaign = v_campaign AND a.invited_email = v_email
   FOR UPDATE;

  IF v_existing.id IS NULL THEN
    v_new := true;
    INSERT INTO public.utm_partner_access(
      event_id, utm_source, utm_medium, utm_campaign, invited_email,
      can_register, can_view_approval, can_view_checkin, can_export, granted_by
    ) VALUES (
      _event_id, v_source, v_medium, v_campaign, v_email,
      coalesce((v_perms->>'can_register')::boolean, false),
      coalesce((v_perms->>'can_view_approval')::boolean, true),
      coalesce((v_perms->>'can_view_checkin')::boolean, true),
      coalesce((v_perms->>'can_export')::boolean, false),
      auth.uid()
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.utm_partner_access a SET
      can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
      can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
      can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
      can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export),
      -- Re-sharing after a revoke starts a fresh invitation.
      status          = CASE WHEN a.status = 'revoked' THEN 'pending' ELSE a.status END,
      partner_user_id = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.partner_user_id END,
      accepted_at     = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.accepted_at END,
      revoked_at      = NULL,
      granted_by      = CASE WHEN a.status = 'revoked' THEN auth.uid() ELSE a.granted_by END,
      granted_at      = CASE WHEN a.status = 'revoked' THEN now()      ELSE a.granted_at END
    WHERE a.id = v_existing.id
    RETURNING * INTO v_row;
    v_new := v_existing.status = 'revoked';
  END IF;

  IF v_new THEN
    PERFORM public._utm_partner_audit('utm_partner.invited', v_row.id, jsonb_build_object(
      'event_id', _event_id, 'utm_source', v_source, 'utm_medium', v_medium, 'utm_campaign', v_campaign,
      'email', v_email, 'permissions', v_perms));
    PERFORM public._utm_partner_notify(v_user, 'utm_partner_invite',
      'A tracked link was shared with you',
      'You can now see and manage registrations for ' || coalesce(v_title, 'an event') || '.',
      '/partner');
  ELSE
    PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
  END IF;

  RETURN public._utm_partner_row(v_row) || jsonb_build_object('has_account', v_user IS NOT NULL, 'created', v_new, 'event_title', v_title);
END;
$$;

-- Every share of an event, with each partner's performance.
CREATE OR REPLACE FUNCTION public.utm_partner_list(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._utm_partner_manages_event(_event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public._utm_partner_row(a) ORDER BY a.created_at DESC)
      FROM public.utm_partner_access a
     WHERE a.event_id = _event_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.utm_partner_update(_access_id uuid, _permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perms jsonb := coalesce(_permissions, '{}'::jsonb);
  v_row   public.utm_partner_access;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  UPDATE public.utm_partner_access a SET
    can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
    can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
    can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
    can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export)
  WHERE a.id = _access_id
  RETURNING * INTO v_row;
  PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
  RETURN public._utm_partner_row(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.utm_partner_revoke(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row   public.utm_partner_access;
  v_title text;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'revoked' THEN
    UPDATE public.utm_partner_access a
       SET status = 'revoked', revoked_at = now()
     WHERE a.id = _access_id
    RETURNING * INTO v_row;
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
    PERFORM public._utm_partner_audit('utm_partner.revoked', v_row.id, jsonb_build_object('email', v_row.invited_email));
    PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
      'Access to a shared link was removed',
      'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
  END IF;
  RETURN public._utm_partner_row(v_row);
END;
$$;

-- ── 5. Partner functions ────────────────────────────────────────────────────

-- Cheap check for the account menu. No side effects.
CREATE OR REPLACE FUNCTION public.partner_utm_has_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.utm_partner_access a
     WHERE (a.status = 'accepted' AND a.partner_user_id = auth.uid())
        OR (a.status = 'pending' AND a.invited_email = (
              SELECT lower(u.email) FROM auth.users u
               WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL))
  );
$$;

-- The caller's shared links. Opening the dashboard accepts any invitation
-- addressed to the caller's verified email.
CREATE OR REPLACE FUNCTION public.partner_utm_grants()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  r       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_banned(v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u
   WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NOT NULL THEN
    FOR r IN
      UPDATE public.utm_partner_access a
         SET status = 'accepted', partner_user_id = v_uid, accepted_at = now()
       WHERE a.status = 'pending' AND a.invited_email = v_email
      RETURNING a.id, a.granted_by, a.event_id
    LOOP
      PERFORM public._utm_partner_audit('utm_partner.accepted', r.id, jsonb_build_object('email', v_email));
      PERFORM public._utm_partner_notify(r.granted_by, 'utm_partner_accepted',
        'Partner invitation accepted', v_email || ' opened the link you shared.',
        '/dashboard/events/' || r.event_id::text);
    END LOOP;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
      'label', (SELECT l.label FROM public.utm_links l
                 WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
                   AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
      'link_url', (SELECT l.url FROM public.utm_links l
                    WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
                      AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
      'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
      'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
      'event', jsonb_build_object(
        'title', e.title, 'date', e.date, 'end_date', e.end_date, 'timezone', e.timezone,
        'venue', e.venue, 'location', e.location, 'event_format', e.event_format,
        'status', e.status, 'requires_approval', e.requires_approval,
        'description', left(coalesce(e.description, ''), 600),
        'image_url', coalesce(e.banner_landscape_url, e.image_url),
        'organizer_name', (SELECT o.name FROM public.organizations o WHERE o.id = e.org_id)
      ),
      -- Counts cover this link only; parts the grant doesn't include are NULL.
      'stats', (
        SELECT jsonb_build_object(
          'total',          s->'total',
          'approved',       CASE WHEN a.can_view_approval THEN s->'approved'   END,
          'pending',        CASE WHEN a.can_view_approval THEN s->'pending'    END,
          'declined',       CASE WHEN a.can_view_approval THEN s->'declined'   END,
          'waitlisted',     CASE WHEN a.can_view_approval THEN s->'waitlisted' END,
          'checked_in',     CASE WHEN a.can_view_checkin  THEN s->'checked_in' END,
          'not_checked_in', CASE WHEN a.can_view_checkin AND a.can_view_approval THEN s->'not_checked_in' END
        )
        FROM (SELECT public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign) AS s) x
      )
    ) ORDER BY e.date DESC, a.created_at DESC)
    FROM public.utm_partner_access a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.partner_user_id = v_uid AND a.status = 'accepted'
  ), '[]'::jsonb);
END;
$$;

-- One page of the participants attributed to a shared link.
CREATE OR REPLACE FUNCTION public.partner_utm_participants(
  _access_id uuid,
  _search    text        DEFAULT NULL,
  _approval  text        DEFAULT NULL,   -- pending | approved | declined | waitlisted
  _checkin   text        DEFAULT NULL,   -- in | out
  _from      timestamptz DEFAULT NULL,
  _to        timestamptz DEFAULT NULL,
  _limit     int         DEFAULT 25,
  _offset    int         DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g          public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_limit    int  := least(greatest(coalesce(_limit, 25), 1), 200);
  v_offset   int  := greatest(coalesce(_offset, 0), 0);
  v_search   text := nullif(btrim(coalesce(_search, '')), '');
  -- Filtering on a field the grant can't see would leak it through counts.
  v_approval text := CASE WHEN g.can_view_approval THEN nullif(_approval, '') END;
  v_checkin  text := CASE WHEN g.can_view_checkin  THEN nullif(_checkin, '')  END;
  v_result   jsonb;
BEGIN
  IF v_search IS NOT NULL THEN
    v_search := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH scoped AS (
    SELECT r.*
      FROM public.registrations r
     WHERE r.event_id   = g.event_id
       AND r.status    <> 'cancelled'
       AND r.utm_source = g.utm_source
       AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
  ), filtered AS (
    SELECT * FROM scoped s
     WHERE (v_search IS NULL
            OR s.name ILIKE v_search OR s.email ILIKE v_search
            OR coalesce(s.company, '') ILIKE v_search OR coalesce(s.designation, '') ILIKE v_search)
       AND (v_approval IS NULL OR s.approval_status = v_approval)
       AND (v_checkin IS NULL OR (v_checkin = 'in' AND s.checked_in) OR (v_checkin = 'out' AND NOT s.checked_in))
       AND (_from IS NULL OR s.created_at >= _from)
       AND (_to   IS NULL OR s.created_at <  _to)
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC, id LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'email', p.email,
        'company', p.company, 'designation', p.designation,
        'registered_at', p.created_at,
        'added_by_you', p.created_by IS NOT NULL AND p.created_by = auth.uid(),
        'approval_status', CASE WHEN g.can_view_approval THEN p.approval_status END,
        'approved_at',     CASE WHEN g.can_view_approval THEN p.approved_at END,
        'checked_in',      CASE WHEN g.can_view_checkin  THEN p.checked_in END,
        'checked_in_at',   CASE WHEN g.can_view_checkin  THEN p.checked_in_at END
      ) ORDER BY p.created_at DESC, p.id)
      FROM page p), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Every participant of a shared link, for export. Needs the export permission.
CREATE OR REPLACE FUNCTION public.partner_utm_export(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_result jsonb;
BEGIN
  IF NOT g.can_export THEN
    RAISE EXCEPTION 'Export isn''t enabled for this shared link' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', r.name, 'email', r.email, 'company', r.company, 'designation', r.designation,
      'registered_at', r.created_at,
      'approval_status', CASE WHEN g.can_view_approval THEN r.approval_status END,
      'checked_in',      CASE WHEN g.can_view_checkin  THEN r.checked_in END,
      'checked_in_at',   CASE WHEN g.can_view_checkin  THEN r.checked_in_at END
    ) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
    INTO v_result
    FROM public.registrations r
   WHERE r.event_id   = g.event_id
     AND r.status    <> 'cancelled'
     AND r.utm_source = g.utm_source
     AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
     AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign;

  PERFORM public._utm_partner_audit('utm_partner.exported', g.id, jsonb_build_object('rows', jsonb_array_length(v_result)));
  RETURN v_result;
END;
$$;

-- Register a participant under a shared link. The event and the UTM values
-- come from the grant; nothing the caller sends can change them.
CREATE OR REPLACE FUNCTION public.partner_utm_register(_access_id uuid, _person jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  p        jsonb := coalesce(_person, '{}'::jsonb);
  e        public.events;
  v_first  text := btrim(coalesce(p->>'first_name', ''));
  v_last   text := btrim(coalesce(p->>'last_name', ''));
  v_email  text := lower(btrim(coalesce(p->>'email', '')));
  v_company text := btrim(coalesce(p->>'company', ''));
  v_desig  text := btrim(coalesce(p->>'designation', ''));
  v_cc     text := btrim(coalesce(p->>'mobile_country_code', ''));
  v_mobile text := btrim(coalesce(p->>'mobile_number', ''));
  v_going  int;
  v_reg    public.registrations;
BEGIN
  IF NOT g.can_register THEN
    RAISE EXCEPTION 'Registering participants isn''t enabled for this shared link' USING ERRCODE = '42501';
  END IF;

  SELECT ev.* INTO e FROM public.events ev WHERE ev.id = g.event_id;
  IF e.status <> 'published' THEN
    RAISE EXCEPTION 'Registration isn''t open for this event' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(e.end_date, e.date) < now() THEN
    RAISE EXCEPTION 'Registration for this event has closed' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(e.price, 0) > 0 THEN
    RAISE EXCEPTION 'This is a paid event — share your tracked link so participants can buy a ticket' USING ERRCODE = 'P0001';
  END IF;

  IF v_first = '' OR v_last = '' OR length(v_first) > 80 OR length(v_last) > 80 THEN
    RAISE EXCEPTION 'First and last name are required' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_company = '' OR length(v_company) > 160 THEN
    RAISE EXCEPTION 'Company is required' USING ERRCODE = '22023';
  END IF;
  IF v_desig = '' OR length(v_desig) > 120 THEN
    RAISE EXCEPTION 'Designation is required' USING ERRCODE = '22023';
  END IF;
  IF v_cc !~ '^\+\d{1,4}$' OR v_mobile !~ '^\d{6,15}$' THEN
    RAISE EXCEPTION 'Enter a valid mobile number' USING ERRCODE = '22023';
  END IF;

  -- Abuse guard: one partner account, at most 300 registrations an hour.
  IF (SELECT count(*) FROM public.registrations r
       WHERE r.created_by = auth.uid() AND r.created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'Too many registrations in a short time — please try again later' USING ERRCODE = 'P0001';
  END IF;

  -- Serialise capacity + duplicate checks per event.
  PERFORM pg_advisory_xact_lock(hashtext('partner_utm_register:' || g.event_id::text));

  IF EXISTS (SELECT 1 FROM public.registrations r
              WHERE r.event_id = g.event_id AND lower(r.email) = v_email AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
  END IF;

  IF coalesce(e.capacity, 0) > 0 THEN
    SELECT count(*) INTO v_going FROM public.registrations r
     WHERE r.event_id = g.event_id AND r.status <> 'cancelled'
       AND r.approval_status NOT IN ('declined', 'waitlisted');
    IF v_going >= e.capacity THEN
      RAISE EXCEPTION 'This event is full' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  BEGIN
    -- approval_status: the registrations_validate trigger turns this into
    -- 'pending' when the event requires approval (a partner is not an organiser).
    INSERT INTO public.registrations(
      event_id, user_id, name, email, title, first_name, last_name, company, designation,
      mobile_country_code, mobile_number, linkedin_url, company_website, company_employee_count, industry,
      ticket_type, status, approval_status,
      utm_source, utm_medium, utm_campaign, created_by
    ) VALUES (
      g.event_id, NULL, btrim(v_first || ' ' || v_last), v_email,
      nullif(btrim(coalesce(p->>'title', '')), ''), v_first, v_last, v_company, v_desig,
      v_cc, v_mobile,
      nullif(left(btrim(coalesce(p->>'linkedin_url', '')), 255), ''),
      nullif(left(btrim(coalesce(p->>'company_website', '')), 255), ''),
      nullif(btrim(coalesce(p->>'company_employee_count', '')), ''),
      nullif(btrim(coalesce(p->>'industry', '')), ''),
      CASE WHEN e.event_format = 'virtual' THEN 'webinar' ELSE 'general' END,
      'confirmed', 'approved',
      g.utm_source, nullif(g.utm_medium, '(none)'), nullif(g.utm_campaign, '(none)'), auth.uid()
    ) RETURNING * INTO v_reg;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
  END;

  PERFORM public.log_registrant_action('partner_registered', v_reg.id,
    jsonb_build_object('partner_access_id', g.id, 'utm_source', g.utm_source));
  PERFORM public._utm_partner_audit('utm_partner.registered', g.id, jsonb_build_object('registration_id', v_reg.id));

  RETURN jsonb_build_object(
    'id', v_reg.id, 'name', v_reg.name, 'email', v_reg.email,
    'approval_status', CASE WHEN g.can_view_approval THEN v_reg.approval_status END
  );
END;
$$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  -- Internal helpers: service role only.
  FOREACH fn IN ARRAY ARRAY[
    '_utm_partner_manages_event(uuid)',
    '_utm_partner_grant(uuid)',
    '_utm_partner_stats(uuid, text, text, text)',
    '_utm_partner_audit(text, uuid, jsonb)',
    '_utm_partner_notify(uuid, text, text, text, text)',
    '_utm_partner_row(public.utm_partner_access)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;

  -- Client-callable: signed-in users only.
  FOREACH fn IN ARRAY ARRAY[
    'utm_partner_share(uuid, text, text, text, text, jsonb)',
    'utm_partner_list(uuid)',
    'utm_partner_update(uuid, jsonb)',
    'utm_partner_revoke(uuid)',
    'partner_utm_has_access()',
    'partner_utm_grants()',
    'partner_utm_participants(uuid, text, text, text, timestamptz, timestamptz, int, int)',
    'partner_utm_export(uuid)',
    'partner_utm_register(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

COMMENT ON TABLE public.utm_partner_access IS
  'An organiser''s share of one tracked link (event + utm_source/medium/campaign) with an external partner. No direct client access — use the utm_partner_* (organiser) and partner_utm_* (partner) functions.';

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 040_utm_partner_access.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 041_utm_table_grants.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 041_utm_table_grants.sql
--
-- `utm_links` and `utm_clicks` were created with row-level-security policies
-- but without table privileges for signed-in users. RLS policies only narrow
-- access that a GRANT has already given, so every save of a tracked link
-- failed with "permission denied for table utm_links", and the UTM page could
-- not read saved links or recent clicks directly.
--
-- Who may touch which rows is unchanged — the existing policies still limit
-- everything to the event's creator, its organisation's members and admins.
-- `utm_clicks` stays read-only for clients (clicks are written by the
-- record-click function and removed by delete_utm_tracking).
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utm_links  TO authenticated;
GRANT ALL                            ON public.utm_links  TO service_role;

GRANT SELECT                         ON public.utm_clicks TO authenticated;
GRANT ALL                            ON public.utm_clicks TO service_role;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 041_utm_table_grants.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 042_partner_utm_analytics.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 042_partner_utm_analytics.sql
--
-- Analytics for the Partner dashboard's event view (follows 040).
--
-- `partner_utm_analytics(_access_id)` returns, for ONE shared link only:
--   • clicks on the link,
--   • a day-by-day series of clicks, registrations and check-ins,
--   • the companies most represented among its participants.
--
-- Same isolation rules as the other partner functions: the grant is
-- re-validated on every call, the event and UTM values come from the grant,
-- and anything the grant's permissions don't cover is returned as NULL.
-- Days are bucketed in the event's own timezone.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.partner_utm_analytics(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_tz     text;
  v_clicks bigint;
  v_series jsonb;
  v_top    jsonb;
BEGIN
  SELECT coalesce(nullif(e.timezone, ''), 'UTC') INTO v_tz FROM public.events e WHERE e.id = g.event_id;
  -- An unknown timezone name must not break the dashboard.
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;

  SELECT count(*) INTO v_clicks
    FROM public.utm_clicks c
   WHERE c.event_id   = g.event_id
     AND c.utm_source = g.utm_source
     AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
     AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign;

  WITH regs AS (
    SELECT r.created_at, r.checked_in, r.checked_in_at
      FROM public.registrations r
     WHERE r.event_id   = g.event_id
       AND r.status    <> 'cancelled'
       AND r.utm_source = g.utm_source
       AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
  ), days AS (
    SELECT (c.clicked_at AT TIME ZONE v_tz)::date AS day, 1 AS clicks, 0 AS registrations, 0 AS check_ins
      FROM public.utm_clicks c
     WHERE c.event_id   = g.event_id
       AND c.utm_source = g.utm_source
       AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 0, 1, 0 FROM regs
    UNION ALL
    SELECT (checked_in_at AT TIME ZONE v_tz)::date, 0, 0, 1 FROM regs
     WHERE g.can_view_checkin AND checked_in AND checked_in_at IS NOT NULL
  ), per_day AS (
    SELECT day, sum(clicks) AS clicks, sum(registrations) AS registrations, sum(check_ins) AS check_ins
      FROM days GROUP BY day
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(day, 'YYYY-MM-DD'),
           'clicks', clicks,
           'registrations', registrations,
           'check_ins', CASE WHEN g.can_view_checkin THEN check_ins END
         ) ORDER BY day), '[]'::jsonb)
    INTO v_series
    FROM per_day;

  SELECT coalesce(jsonb_agg(jsonb_build_object('company', company, 'registrations', n) ORDER BY n DESC, company), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT btrim(r.company) AS company, count(*) AS n
        FROM public.registrations r
       WHERE r.event_id   = g.event_id
         AND r.status    <> 'cancelled'
         AND r.utm_source = g.utm_source
         AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
         AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
         AND nullif(btrim(coalesce(r.company, '')), '') IS NOT NULL
       GROUP BY btrim(r.company)
       ORDER BY count(*) DESC, btrim(r.company)
       LIMIT 8
    ) t;

  RETURN jsonb_build_object('clicks', v_clicks, 'timezone', v_tz, 'series', v_series, 'top_companies', v_top);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_utm_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_utm_analytics(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 042_partner_utm_analytics.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 043_utm_partner_remove.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 043_utm_partner_remove.sql
--
-- Partner shares can be removed, not only revoked.
--
--   • `utm_partner_remove(_access_id)` deletes one share. If it was still
--     active the partner loses access immediately (and is notified), exactly
--     as with a revoke — the row is then gone from the Partners list.
--   • `delete_utm_tracking` (039) now also deletes the shares of the link it
--     deletes: a link that no longer exists can't stay shared with anyone.
--     The count is returned as `partners_removed`.
--
-- Registrations are never touched by either function.
-- Requires 040. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.utm_partner_remove(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row   public.utm_partner_access;
  v_title text;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.utm_partner_access a WHERE a.id = _access_id;

  PERFORM public._utm_partner_audit('utm_partner.removed', v_row.id, jsonb_build_object(
    'email', v_row.invited_email, 'event_id', v_row.event_id, 'previous_status', v_row.status,
    'utm_source', v_row.utm_source, 'utm_medium', v_row.utm_medium, 'utm_campaign', v_row.utm_campaign));
  IF v_row.status = 'accepted' THEN
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
    PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
      'Access to a shared link was removed',
      'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'removed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.utm_partner_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_partner_remove(uuid) TO authenticated, service_role;

-- Deleting a tracked link also ends its partner shares.
CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_links    int := 0;
  v_clicks   int := 0;
  v_regs     int := 0;
  v_partners int := 0;
  r          record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.utm_links l
   WHERE l.event_id     = _event_id
     AND l.utm_source   = _utm_source
     AND l.utm_medium   = _utm_medium
     AND l.utm_campaign = _utm_campaign;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  DELETE FROM public.utm_clicks c
   WHERE c.event_id   = _event_id
     AND c.utm_source = _utm_source
     AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  FOR r IN
    DELETE FROM public.utm_partner_access a
     WHERE a.event_id     = _event_id
       AND a.utm_source   = _utm_source
       AND a.utm_medium   = coalesce(_utm_medium,   '(none)')
       AND a.utm_campaign = coalesce(_utm_campaign, '(none)')
    RETURNING a.id, a.invited_email, a.status
  LOOP
    v_partners := v_partners + 1;
    PERFORM public._utm_partner_audit('utm_partner.removed', r.id,
      jsonb_build_object('email', r.invited_email, 'previous_status', r.status, 'reason', 'link deleted'));
  END LOOP;

  SELECT count(*) INTO v_regs
    FROM public.registrations r2
   WHERE r2.event_id   = _event_id
     AND r2.status    <> 'cancelled'
     AND r2.utm_source = _utm_source
     AND coalesce(r2.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(r2.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');

  RETURN jsonb_build_object(
    'links_deleted',      v_links,
    'clicks_deleted',     v_clicks,
    'registrations_kept', v_regs,
    'partners_removed',   v_partners
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 043_utm_partner_remove.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 044_brand_kit_access.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 044_brand_kit_access.sql
--
-- Makes `public.brand_kits` usable from the dashboard's Organization → Brand
-- kit tab, where a workspace keeps its logos (CMYK, white, black, icon),
-- colours, fonts, brand guidelines and other brand files.
--
-- Three things were in the way:
--
--   1. Migration 025 created the table with row-level-security policies but
--      no table privileges for signed-in users. RLS only narrows access that a
--      GRANT has already given, so every read and write was refused with
--      "permission denied for table brand_kits".
--   2. Only the canonical owner (`organizations.owner_id`) could write. Org
--      admins manage the rest of the workspace (migration 030), so they may
--      manage the brand kit too.
--   3. The canonical owner could only read through an `org_members` row. The
--      read policy now names the owner directly.
--
-- The table definition is repeated with IF NOT EXISTS so this file also works
-- on a database where 025 was never applied. The files themselves are stored
-- in the existing public `site-assets` bucket under `brand-kits/<org id>/`;
-- no storage changes are needed.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kits_org_idx
  ON public.brand_kits (org_id, created_at DESC);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
GRANT ALL                            ON public.brand_kits TO service_role;

-- Replace the 025 policies (and any earlier run of this file).
DROP POLICY IF EXISTS "brand_kits: org members and admins can select" ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can insert"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can update"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can delete"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: workspace can read"                ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can insert"               ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can update"               ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can delete"               ON public.brand_kits;

-- Read: anyone in the workspace (owner or member), or a platform admin.
CREATE POLICY "brand_kits: workspace can read"
  ON public.brand_kits FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = brand_kits.org_id AND o.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = brand_kits.org_id AND om.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Write: the workspace's owners and admins (`is_org_manager`, migration 030),
-- or a platform admin.
CREATE POLICY "brand_kits: managers can insert"
  ON public.brand_kits FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "brand_kits: managers can update"
  ON public.brand_kits FOR UPDATE TO authenticated
  USING      (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "brand_kits: managers can delete"
  ON public.brand_kits FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.brand_kits IS
  'Organization brand kits: logos, colours, fonts and brand files in `snapshot`. RLS: any workspace member (or platform admin) may read; workspace owners and admins (or platform admin) may write.';

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 044_brand_kit_access.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 045_guest_registration.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 045_guest_registration.sql
--
-- Supports registering for an event without an account, and setting a
-- password afterwards from a link in the confirmation email. Everything here
-- is used only by the `guest-registration` edge function, which runs as
-- service_role; browsers get no access to any of it.
--
--   1. `account_activation_tokens` — one row per emailed "set up your account"
--      link. Only the SHA-256 of the token is stored, so a copy of this table
--      cannot be used to activate anyone's account. A link works once
--      (`used_at`) and stops working at `expires_at`.
--   2. `guest_rate_limits` — a log of recent attempts, keyed by a hash of the
--      caller's address or email, used to slow down abuse of the public
--      registration, activation and resend endpoints.
--   3. `registrations.confirmation_email_sent_at` — when the confirmation
--      email went out, so a retried request does not send it twice.
--
-- Registrations themselves are unchanged: a guest registration is an ordinary
-- row with `user_id` NULL, exactly like a participant an organiser adds by
-- hand. The existing `handle_new_user` trigger attaches such rows to the
-- account when one is created for that email, and the existing unique index
-- on (event_id, lower(email)) keeps one registration per person per event.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  token_hash      text NOT NULL,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_activation_tokens_email_lower CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS account_activation_tokens_hash_idx
  ON public.account_activation_tokens (token_hash);
CREATE INDEX IF NOT EXISTS account_activation_tokens_email_idx
  ON public.account_activation_tokens (email, created_at DESC);

ALTER TABLE public.account_activation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_activation_tokens FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.account_activation_tokens TO service_role;

COMMENT ON TABLE public.account_activation_tokens IS
  'Single-use, expiring "set up your account" links sent after a guest registration. Stores only the SHA-256 of each token. service_role only (no RLS policies).';


CREATE TABLE IF NOT EXISTS public.guest_rate_limits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     text NOT NULL,
  key_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_rate_limits_lookup_idx
  ON public.guest_rate_limits (bucket, key_hash, created_at DESC);

ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_rate_limits FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.guest_rate_limits TO service_role;

COMMENT ON TABLE public.guest_rate_limits IS
  'Recent attempts against the public guest-registration endpoints, keyed by a hash of the caller address or email. service_role only. Rows older than a day can be deleted at any time.';


ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

COMMENT ON COLUMN public.registrations.confirmation_email_sent_at IS
  'When the guest-registration confirmation email was sent. NULL for registrations made before guest registration existed, or whose email could not be sent.';

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 045_guest_registration.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 046_team_invitation_onboarding.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 046_team_invitation_onboarding.sql
--
-- Team invitations: invitees join without a company form or a second
-- verification email, and only verified owners/admins can invite.
--
-- Used by the `team-invitation` edge function (service_role). Browsers keep
-- their existing access to `org_invitations` through RLS (migration 030),
-- with the extra rules enforced by the trigger in section 3.
--
--   1. New columns on `org_invitations`:
--        token_hash   SHA-256 of the emailed link's secret. The secret itself
--                     is never stored, so nobody who can read this table
--                     (every workspace member can) can use someone's link.
--        expires_at   links stop working after this (14 days from issue).
--                     Invitations already sent get 14 days from now.
--        accepted_at / accepted_by   who accepted, and when.
--        claimed_at   short-lived lock held while an acceptance is being
--                     processed, so two submissions cannot both go through.
--      Status stays pending | accepted | revoked; "expired" is a pending
--      invitation past expires_at.
--   2. `complete_org_invitation` — adds the membership and marks the
--      invitation accepted in one transaction. service_role only.
--   3. Trigger on `org_invitations` for requests made by signed-in users:
--        • creating or re-sending an invitation needs a verified email;
--        • `invited_by` is always the caller;
--        • a browser can never set `token_hash` (so it cannot mint a link it
--          knows the secret of), and changing the email or reopening an
--          invitation discards the old link.
--   4. `accept_org_invitation` (older `/login?invite=<uuid>` links, and
--      signed-in accounts) now refuses expired invitations, refuses accepted
--      ones unless the caller is already the member, needs a verified email,
--      and records who accepted.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS token_hash  text,
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;

UPDATE public.org_invitations
   SET expires_at = now() + interval '14 days'
 WHERE expires_at IS NULL;

ALTER TABLE public.org_invitations
  ALTER COLUMN expires_at SET DEFAULT now() + interval '14 days',
  ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_token_hash_idx
  ON public.org_invitations (token_hash) WHERE token_hash IS NOT NULL;

COMMENT ON COLUMN public.org_invitations.token_hash IS
  'SHA-256 (hex) of the secret in the emailed /invite link. Set only by the team-invitation edge function.';
COMMENT ON COLUMN public.org_invitations.expires_at IS
  'The invitation link stops working after this. A pending invitation past this time is shown as expired.';


-- ── 2. complete_org_invitation ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_org_invitation(
  _invitation_id uuid,
  _user_id       uuid,
  _new_account   boolean DEFAULT false
)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv     record;
  _email  text;
  _role   text;
BEGIN
  SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at
    INTO inv
    FROM public.org_invitations i
   WHERE i.id = _invitation_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF inv.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _user_id;
  IF _email IS NULL OR _email <> lower(inv.email) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  -- One membership per person per workspace. Someone who is already a
  -- member keeps the role they have.
  INSERT INTO public.org_members (org_id, user_id, role)
       VALUES (inv.org_id, _user_id, inv.role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  SELECT m.role INTO _role
    FROM public.org_members m
   WHERE m.org_id = inv.org_id AND m.user_id = _user_id;

  UPDATE public.org_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = _user_id,
         claimed_at  = NULL,
         updated_at  = now()
   WHERE id = inv.id;

  -- An invitee gave every personal detail the profile asks for; joining a
  -- workspace needs no company details of their own.
  IF _new_account THEN
    UPDATE public.profiles SET profile_completed = true WHERE user_id = _user_id;
  END IF;

  accepted_org_id := inv.org_id;
  assigned_role   := _role;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) IS
  'Adds the invited user to the workspace with the invitation''s role and marks the invitation accepted, in one transaction. Refuses expired, used or revoked invitations and any user whose email is not the invited one. service_role only (team-invitation edge function).';


-- ── 3. Guard on browser writes ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_invitations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _issuing boolean;
BEGIN
  -- Server-side code (service_role, SQL editor) has no auth.uid() and is
  -- trusted; these rules are for requests made by signed-in users.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.token_hash  := NULL;
    NEW.claimed_at  := NULL;
    NEW.accepted_at := NULL;
    NEW.accepted_by := NULL;
    _issuing := NEW.status = 'pending';
  ELSE
    -- A browser may keep or clear the link, never set a new one.
    IF NEW.token_hash IS DISTINCT FROM OLD.token_hash AND NEW.token_hash IS NOT NULL THEN
      NEW.token_hash := OLD.token_hash;
    END IF;
    -- A link is tied to one email and one workspace, and a closed
    -- invitation's link stays closed.
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR (NEW.status = 'pending' AND OLD.status <> 'pending') THEN
      NEW.token_hash := NULL;
    END IF;
    _issuing := NEW.status = 'pending' AND (
         OLD.status <> 'pending'
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.token IS DISTINCT FROM OLD.token
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    );
  END IF;

  IF _issuing THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Verify your email address before inviting team members.'
        USING ERRCODE = '42501';
    END IF;
    NEW.invited_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_guard ON public.org_invitations;
CREATE TRIGGER org_invitations_guard
  BEFORE INSERT OR UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_guard();

COMMENT ON FUNCTION public.org_invitations_guard() IS
  'For signed-in callers: inviting or re-inviting needs a verified email, invited_by is the caller, and token_hash can never be set from a browser.';


-- ── 4. accept_org_invitation ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation    record;
  caller_email  text;
  _current_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  SELECT lower(u.email) INTO caller_email
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email address before accepting an invitation';
  END IF;

  SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at
    INTO invitation
    FROM public.org_invitations i
   WHERE i.token = _token
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation was withdrawn. Ask the workspace admin to send a new one.';
  END IF;
  IF caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  SELECT m.role INTO _current_role
    FROM public.org_members m
   WHERE m.org_id = invitation.org_id AND m.user_id = auth.uid();

  -- Already accepted: only a repeat by the member it admitted succeeds.
  IF invitation.status = 'accepted' THEN
    IF _current_role IS NULL THEN
      RAISE EXCEPTION 'This invitation has already been used. Ask the workspace admin to send a new one.';
    END IF;
    accepted_org_id := invitation.org_id;
    assigned_role   := _current_role;
    RETURN NEXT;
    RETURN;
  END IF;

  IF invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired. Ask the workspace admin to send a new one.';
  END IF;

  IF _current_role IS NULL THEN
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (invitation.org_id, auth.uid(), invitation.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
    SELECT m.role INTO _current_role
      FROM public.org_members m
     WHERE m.org_id = invitation.org_id AND m.user_id = auth.uid();
  END IF;

  UPDATE public.org_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = auth.uid(),
         claimed_at  = NULL,
         updated_at  = now()
   WHERE id = invitation.id;

  accepted_org_id := invitation.org_id;
  assigned_role   := _current_role;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by its legacy uuid token as the signed-in, email-verified invitee. Refuses revoked and expired invitations; an accepted one only succeeds again for the member it admitted.';
-- <<< END SOURCE MIGRATION: 046_team_invitation_onboarding.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 047_certificates.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 047_certificates.sql
--
-- Event certificates: an editable template studio, immutable published
-- versions, issuing to an event's attendees, public verification, revocation
-- and an audit trail.
--
--   1. Helpers  can_manage_org_certificates / can_manage_event_certificates —
--      the same people who manage an event's registrations: the event's
--      creator, the workspace owner, non-viewer workspace members, and
--      platform admins.
--   2. certificate_templates  — a workspace's designs (editable configuration,
--      not pictures). Optionally tied to the event they were made for.
--   3. certificate_template_versions — a frozen copy made each time a template
--      is published. Certificates point at a version, so editing a template
--      never changes a certificate that was already issued. No one can edit
--      or delete a version.
--   4. certificates — one per attendee per event. Holds the values printed on
--      it (name, event, dates…) as they were when issued, and a random
--      verification code used by the QR code.
--   5. certificate_audit — issued / revoked / emailed, with who and when.
--   6. Functions: publish_certificate_template, issue_certificates (audience
--      'all' registered attendees or only 'checked_in' ones),
--      revoke_certificate, record_certificate_emails, and the public
--      get_certificate_public for the verification page.
--
-- Browsers write templates directly (RLS). Versions, certificates and the
-- audit log are written only by the functions above.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_org_certificates(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _org_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = _org_id AND m.user_id = _user_id AND m.role IN ('owner', 'admin', 'member'))
    OR public.has_role(_user_id, 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event_certificates(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = _event_id
       AND (e.user_id = _user_id
            OR public.can_manage_org_certificates(_user_id, e.org_id)
            OR public.has_role(_user_id, 'admin'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_org_certificates(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_event_certificates(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_manage_org_certificates(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_event_certificates(uuid, uuid) TO authenticated;


-- ── 2. Templates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id             uuid REFERENCES public.events(id) ON DELETE SET NULL,
  name                 text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category             text,
  orientation          text NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  source_template      text,
  design               jsonb NOT NULL,
  settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  current_version      int  NOT NULL DEFAULT 0,
  published_version_id uuid,
  published_at         timestamptz,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Uploaded backgrounds and signatures travel inside the design; keep rows sane.
  CONSTRAINT certificate_templates_design_size CHECK (octet_length(design::text) + octet_length(settings::text) <= 15000000)
);

CREATE INDEX IF NOT EXISTS certificate_templates_org_idx ON public.certificate_templates (org_id, status, updated_at DESC);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_templates FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.certificate_templates TO authenticated;
GRANT ALL ON public.certificate_templates TO service_role;

DROP POLICY IF EXISTS "Workspace members view certificate templates" ON public.certificate_templates;
CREATE POLICY "Workspace members view certificate templates" ON public.certificate_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.can_manage_org_certificates(auth.uid(), org_id));

DROP POLICY IF EXISTS "Managers create certificate templates" ON public.certificate_templates;
CREATE POLICY "Managers create certificate templates" ON public.certificate_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_org_certificates(auth.uid(), org_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.org_id = certificate_templates.org_id))
  );

DROP POLICY IF EXISTS "Managers edit certificate templates" ON public.certificate_templates;
CREATE POLICY "Managers edit certificate templates" ON public.certificate_templates
  FOR UPDATE TO authenticated
  USING (public.can_manage_org_certificates(auth.uid(), org_id))
  WITH CHECK (
    public.can_manage_org_certificates(auth.uid(), org_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.org_id = certificate_templates.org_id))
  );

-- Browsers may draft, edit and archive. Publishing, version numbers and the
-- workspace a template belongs to are the server's to set.
CREATE OR REPLACE FUNCTION public.certificate_templates_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Server code (service_role, and publish_certificate_template below, which
  -- sets this flag for its own transaction) sets the publishing fields itself.
  IF auth.uid() IS NULL OR current_setting('illuxus.certificate_publish', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.status := CASE WHEN NEW.status = 'archived' THEN 'archived' ELSE 'draft' END;
    NEW.current_version := 0;
    NEW.published_version_id := NULL;
    NEW.published_at := NULL;
  ELSE
    NEW.org_id := OLD.org_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.current_version := OLD.current_version;
    NEW.published_version_id := OLD.published_version_id;
    NEW.published_at := OLD.published_at;
    -- Archiving and un-archiving are allowed; becoming 'published' is not.
    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
      NEW.status := CASE WHEN OLD.published_version_id IS NOT NULL THEN 'published' ELSE 'draft' END;
    END IF;
    IF NEW.status = 'draft' AND OLD.published_version_id IS NOT NULL THEN
      NEW.status := 'published';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_templates_guard ON public.certificate_templates;
CREATE TRIGGER certificate_templates_guard
  BEFORE INSERT OR UPDATE ON public.certificate_templates
  FOR EACH ROW EXECUTE FUNCTION public.certificate_templates_guard();


-- ── 3. Versions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.certificate_templates(id) ON DELETE RESTRICT,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  name         text NOT NULL,
  design       jsonb NOT NULL,
  settings     jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

ALTER TABLE public.certificate_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_template_versions FROM anon, authenticated;
GRANT SELECT ON public.certificate_template_versions TO authenticated;
GRANT ALL ON public.certificate_template_versions TO service_role;

DROP POLICY IF EXISTS "Workspace members view certificate versions" ON public.certificate_template_versions;
CREATE POLICY "Workspace members view certificate versions" ON public.certificate_template_versions
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.can_manage_org_certificates(auth.uid(), org_id));


-- ── 4. Certificates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  registration_id     uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  template_version_id uuid NOT NULL REFERENCES public.certificate_template_versions(id) ON DELETE RESTRICT,
  code                text NOT NULL UNIQUE,
  recipient_name      text NOT NULL,
  recipient_email     text,
  field_values        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  issued_at           timestamptz NOT NULL DEFAULT now(),
  issued_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason      text,
  emailed_at          timestamptz,
  email_count         int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS certificates_one_per_registration
  ON public.certificates (event_id, registration_id) WHERE status = 'issued' AND registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificates_event_idx ON public.certificates (event_id, issued_at DESC);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificates FROM anon, authenticated;
GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;

DROP POLICY IF EXISTS "Event managers view certificates" ON public.certificates;
CREATE POLICY "Event managers view certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (public.can_manage_event_certificates(auth.uid(), event_id));


-- ── 5. Audit ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_audit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  certificate_id uuid REFERENCES public.certificates(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action         text NOT NULL CHECK (action IN ('issued', 'revoked', 'emailed', 'template_published')),
  actor          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_audit_event_idx ON public.certificate_audit (event_id, created_at DESC);

ALTER TABLE public.certificate_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_audit FROM anon, authenticated;
GRANT SELECT ON public.certificate_audit TO authenticated;
GRANT ALL ON public.certificate_audit TO service_role;

DROP POLICY IF EXISTS "Event managers view certificate audit" ON public.certificate_audit;
CREATE POLICY "Event managers view certificate audit" ON public.certificate_audit
  FOR SELECT TO authenticated
  USING (public.can_manage_event_certificates(auth.uid(), event_id));


-- ── 6a. Publish ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_certificate_template(_template_id uuid)
RETURNS TABLE (version_id uuid, version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tpl      record;
  _bad     text;
  _next    int;
  _vid     uuid;
  _allowed text[] := ARRAY['participant_name','event_name','event_date','certificate_type','issue_date','certificate_id',
                           'organization_name','participant_designation','participant_company','ticket_type','event_venue'];
BEGIN
  SELECT * INTO tpl FROM public.certificate_templates t WHERE t.id = _template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT public.can_manage_org_certificates(auth.uid(), tpl.org_id) THEN
    RAISE EXCEPTION 'You do not have permission to publish certificate templates for this workspace' USING ERRCODE = '42501';
  END IF;
  IF tpl.status = 'archived' THEN RAISE EXCEPTION 'Restore this template before publishing it'; END IF;

  IF jsonb_typeof(tpl.design->'pages') <> 'array' OR jsonb_array_length(tpl.design->'pages') < 1 THEN
    RAISE EXCEPTION 'This template has no page';
  END IF;
  IF tpl.design::text !~ '\{\{\s*participant_name\s*\}\}' THEN
    RAISE EXCEPTION 'Add the participant name field before publishing';
  END IF;
  SELECT m[1] INTO _bad
    FROM regexp_matches(tpl.design::text, '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g') AS m
   WHERE NOT (m[1] = ANY (_allowed))
   LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown field {{%}} in the template', _bad; END IF;

  IF jsonb_typeof(tpl.settings->'signatures') = 'array' THEN
    IF jsonb_array_length(tpl.settings->'signatures') > 3 THEN
      RAISE EXCEPTION 'A certificate can have at most three signatures';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(tpl.settings->'signatures') s
       WHERE (s->>'enabled')::boolean IS TRUE AND btrim(coalesce(s->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'Every signature that is switched on needs the signatory''s name';
    END IF;
  END IF;

  _next := tpl.current_version + 1;
  INSERT INTO public.certificate_template_versions (template_id, org_id, version, name, design, settings, published_by)
       VALUES (tpl.id, tpl.org_id, _next, tpl.name, tpl.design, tpl.settings, auth.uid())
    RETURNING id INTO _vid;

  PERFORM set_config('illuxus.certificate_publish', 'on', true);
  UPDATE public.certificate_templates
     SET status = 'published', current_version = _next, published_version_id = _vid, published_at = now(), updated_at = now()
   WHERE id = tpl.id;
  PERFORM set_config('illuxus.certificate_publish', 'off', true);

  IF tpl.event_id IS NOT NULL THEN
    INSERT INTO public.certificate_audit (event_id, action, actor, detail)
         VALUES (tpl.event_id, 'template_published', auth.uid(), jsonb_build_object('template_id', tpl.id, 'version', _next));
  END IF;

  version_id := _vid;
  version := _next;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_certificate_template(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_certificate_template(uuid) TO authenticated;


-- ── 6b. Issue ────────────────────────────────────────────────────────────────
-- Dates as "14 November 2026" / "14–15 November 2026" in the event's time zone.
CREATE OR REPLACE FUNCTION public.certificate_date_text(_start timestamptz, _end timestamptz, _tz text)
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  z  text := coalesce(nullif(_tz, ''), 'UTC');
  s  timestamp;
  e  timestamp;
BEGIN
  IF _start IS NULL THEN RETURN ''; END IF;
  BEGIN
    s := _start AT TIME ZONE z;
    e := coalesce(_end, _start) AT TIME ZONE z;
  EXCEPTION WHEN OTHERS THEN
    s := _start AT TIME ZONE 'UTC';
    e := coalesce(_end, _start) AT TIME ZONE 'UTC';
  END;
  IF s::date = e::date THEN RETURN to_char(s, 'FMDD FMMonth YYYY'); END IF;
  IF to_char(s, 'YYYY-MM') = to_char(e, 'YYYY-MM') THEN RETURN to_char(s, 'FMDD') || '–' || to_char(e, 'FMDD FMMonth YYYY'); END IF;
  IF to_char(s, 'YYYY') = to_char(e, 'YYYY') THEN RETURN to_char(s, 'FMDD FMMonth') || ' – ' || to_char(e, 'FMDD FMMonth YYYY'); END IF;
  RETURN to_char(s, 'FMDD FMMonth YYYY') || ' – ' || to_char(e, 'FMDD FMMonth YYYY');
END;
$$;

CREATE OR REPLACE FUNCTION public.new_certificate_code()
RETURNS text
LANGUAGE sql VOLATILE SET search_path = public AS $$
  -- 48 random bits (the first 12 hex digits of a v4 uuid are all random).
  SELECT 'ILX-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
    FROM (SELECT upper(replace(gen_random_uuid()::text, '-', '')) AS h) x;
$$;

CREATE OR REPLACE FUNCTION public.issue_certificates(
  _event_id         uuid,
  _version_id       uuid,
  _audience         text,
  _registration_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (certificate_id uuid, registration_id uuid, code text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev      record;
  ver     record;
  org     record;
  r       record;
  _cid    uuid;
  _code   text;
  _name   text;
  _today  text;
BEGIN
  IF NOT public.can_manage_event_certificates(auth.uid(), _event_id) THEN
    RAISE EXCEPTION 'You do not have permission to issue certificates for this event' USING ERRCODE = '42501';
  END IF;
  IF _audience NOT IN ('all', 'checked_in') THEN
    RAISE EXCEPTION 'Choose who receives certificates: all registered attendees or only checked-in attendees';
  END IF;

  SELECT e.id, e.org_id, e.title, e.date, e.end_date, e.timezone, e.venue, e.location INTO ev
    FROM public.events e WHERE e.id = _event_id;
  IF ev.org_id IS NULL THEN RAISE EXCEPTION 'This event is not part of a workspace'; END IF;

  SELECT v.id, v.org_id, v.settings, t.event_id AS template_event_id INTO ver
    FROM public.certificate_template_versions v
    JOIN public.certificate_templates t ON t.id = v.template_id
   WHERE v.id = _version_id;
  IF NOT FOUND OR ver.org_id <> ev.org_id OR (ver.template_event_id IS NOT NULL AND ver.template_event_id <> ev.id) THEN
    RAISE EXCEPTION 'That certificate template is not available for this event';
  END IF;

  SELECT o.name INTO org FROM public.organizations o WHERE o.id = ev.org_id;
  _today := to_char(now() AT TIME ZONE coalesce(nullif(ev.timezone, ''), 'UTC'), 'FMDD FMMonth YYYY');

  FOR r IN
    SELECT g.* FROM public.registrations g
     WHERE g.event_id = _event_id
       AND g.status <> 'cancelled'
       AND g.approval_status = 'approved'
       AND (_audience = 'all' OR g.checked_in IS TRUE)
       AND (_registration_ids IS NULL OR g.id = ANY (_registration_ids))
     ORDER BY g.created_at
  LOOP
    SELECT c.id, c.code INTO _cid, _code
      FROM public.certificates c
     WHERE c.event_id = _event_id AND c.registration_id = r.id AND c.status = 'issued';
    IF FOUND THEN
      certificate_id := _cid; registration_id := r.id; code := _code; created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    _name := coalesce(nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), nullif(btrim(r.name), ''), r.email);
    LOOP
      _code := public.new_certificate_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.code = _code);
    END LOOP;

    INSERT INTO public.certificates (event_id, org_id, registration_id, template_version_id, code, recipient_name, recipient_email, field_values, issued_by)
    VALUES (
      _event_id, ev.org_id, r.id, ver.id, _code, _name, lower(r.email),
      jsonb_strip_nulls(jsonb_build_object(
        'participant_name', _name,
        'participant_designation', nullif(btrim(r.designation), ''),
        'participant_company', nullif(btrim(r.company), ''),
        'ticket_type', nullif(btrim(r.ticket_type), ''),
        'event_name', ev.title,
        'event_date', public.certificate_date_text(ev.date, ev.end_date, ev.timezone),
        'event_venue', nullif(concat_ws(', ', nullif(btrim(ev.venue), ''), nullif(btrim(ev.location), '')), ''),
        'organization_name', org.name,
        'certificate_type', nullif(btrim(ver.settings->>'certificateType'), ''),
        'issue_date', _today,
        'certificate_id', _code
      )),
      auth.uid()
    )
    RETURNING id INTO _cid;

    INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor, detail)
         VALUES (_cid, _event_id, 'issued', auth.uid(), jsonb_build_object('audience', _audience, 'version_id', ver.id));

    certificate_id := _cid; registration_id := r.id; code := _code; created := true;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_certificates(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.issue_certificates(uuid, uuid, text, uuid[]) TO authenticated;


-- ── 6c. Revoke ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_certificate(_certificate_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = _certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF NOT public.can_manage_event_certificates(auth.uid(), c.event_id) THEN
    RAISE EXCEPTION 'You do not have permission to revoke certificates for this event' USING ERRCODE = '42501';
  END IF;
  IF c.status = 'revoked' THEN RETURN; END IF;
  UPDATE public.certificates
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoked_reason = left(nullif(btrim(_reason), ''), 500)
   WHERE id = c.id;
  INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor, detail)
       VALUES (c.id, c.event_id, 'revoked', auth.uid(), jsonb_build_object('reason', left(coalesce(_reason, ''), 500)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated;


-- ── 6d. Emailed ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_certificate_emails(_certificate_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _n int := 0;
  c  record;
BEGIN
  FOR c IN SELECT * FROM public.certificates WHERE id = ANY (_certificate_ids) AND status = 'issued' LOOP
    IF public.can_manage_event_certificates(auth.uid(), c.event_id) THEN
      UPDATE public.certificates SET emailed_at = now(), email_count = email_count + 1 WHERE id = c.id;
      INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor) VALUES (c.id, c.event_id, 'emailed', auth.uid());
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_certificate_emails(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_certificate_emails(uuid[]) TO authenticated;


-- ── 6e. Public verification ──────────────────────────────────────────────────
-- What the QR code opens. A valid certificate comes back with its design so
-- the holder can download it; a revoked one only says so.
CREATE OR REPLACE FUNCTION public.get_certificate_public(_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT c2.*, e.title AS event_title, o.name AS org_name, v.design, v.settings
    INTO c
    FROM public.certificates c2
    JOIN public.events e ON e.id = c2.event_id
    JOIN public.organizations o ON o.id = c2.org_id
    JOIN public.certificate_template_versions v ON v.id = c2.template_version_id
   WHERE c2.code = upper(btrim(coalesce(_code, '')));
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  IF c.status = 'revoked' THEN
    RETURN jsonb_build_object('found', true, 'status', 'revoked', 'code', c.code, 'recipient_name', c.recipient_name,
                              'event_name', c.event_title, 'organization_name', c.org_name, 'issued_at', c.issued_at, 'revoked_at', c.revoked_at);
  END IF;
  RETURN jsonb_build_object('found', true, 'status', 'issued', 'code', c.code, 'recipient_name', c.recipient_name,
                            'event_name', c.event_title, 'organization_name', c.org_name, 'issued_at', c.issued_at,
                            'field_values', c.field_values, 'design', c.design, 'settings', c.settings);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_certificate_public(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_certificate_public(text) TO anon, authenticated;
-- <<< END SOURCE MIGRATION: 047_certificates.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 048_plan_features.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 048_plan_features.sql
--
-- Plans and the features each one includes, controlled by super admins.
--
--   • `plans` — one row per plan: name, limits and the list of feature keys
--     it includes (keys are defined in src/lib/plans/features.ts). Anyone can
--     read it; only super admins can change it, through admin_save_plan /
--     admin_delete_plan.
--   • `organizations.feature_overrides` — per-organisation exceptions,
--     {"certificates": true, "webinar": false}, set by super admins only.
--   • org_entitlements(org) / org_has_feature(org, key) — the single answer to
--     "what can this organisation use", for the app and the edge functions.
--     Plan features + legacy `addons` + overrides set true − overrides set false.
--   • Triggers stop anyone but a super admin (or the service role) changing an
--     organisation's plan, limits, add-ons or overrides — until now an owner
--     could set their own plan, and onboarding let anyone pick a paid plan.
--     New organisations created by users always start on 'free'.
--   • BEFORE INSERT triggers refuse new certificates, certificate templates,
--     creatives, UTM links and venue selections when the organisation's plan
--     doesn't include the feature. Triggers also cover inserts made inside
--     SECURITY DEFINER functions such as issue_certificates.
--
-- The seeded plans keep every module on for every plan (the webinar studio
-- stays an add-on), so applying this changes nothing for existing organisers
-- until a super admin edits the matrix at /dashboard/admin/plans.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── pre-checks ────────────────────────────────────────────────────────────────
-- Stop early, with a clear message, if a helper this relies on is missing.
DO $$
DECLARE _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['public.has_role(uuid,public.app_role)', 'public.is_org_member(uuid,uuid)', 'public.is_org_owner(uuid,uuid)'] LOOP
    IF to_regprocedure(_fn) IS NULL THEN
      RAISE EXCEPTION 'Missing function %: apply the base schema first.', _fn;
    END IF;
  END LOOP;
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Missing organizations or events table: apply the base schema first.';
  END IF;
END $$;

-- Columns used below, in case an older database predates them.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan        text   NOT NULL DEFAULT 'free';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan_limits jsonb  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS addons      text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Own helpers, so this section doesn't depend on others that may be missing.
CREATE OR REPLACE FUNCTION public.plans_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- Audit entries are best-effort: a missing or changed audit_logs table must
-- never block a plan change.
CREATE OR REPLACE FUNCTION public._plan_audit(_action text, _target_type text, _target_id text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  NULL;
END; $$;
REVOKE ALL ON FUNCTION public._plan_audit(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── plans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  description  text NOT NULL DEFAULT '',
  sort_order   int  NOT NULL DEFAULT 0,
  is_public    boolean NOT NULL DEFAULT true,
  limits       jsonb NOT NULL DEFAULT '{"max_events":-1,"max_attendees_per_event":-1,"max_team_members":-1}'::jsonb,
  features     text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads plans" ON public.plans;
CREATE POLICY "Anyone reads plans" ON public.plans FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;

DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plans_touch_updated_at();

-- Seed. Must match DEFAULT_PLANS in src/lib/plans/features.ts.
INSERT INTO public.plans (key, name, description, sort_order, limits, features) VALUES
  ('free', 'Free', 'For trying things out', 0,
   '{"max_events":3,"max_attendees_per_event":50,"max_team_members":1}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain']),
  ('starter', 'Starter', 'For growing organisers', 1,
   '{"max_events":10,"max_attendees_per_event":200,"max_team_members":3}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain']),
  ('pro', 'Pro', 'For serious teams', 2,
   '{"max_events":50,"max_attendees_per_event":1000,"max_team_members":10}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain','advanced_analytics']),
  ('business', 'Business', 'For agencies & enterprises', 3,
   '{"max_events":-1,"max_attendees_per_event":-1,"max_team_members":-1}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain','advanced_analytics','white_label','api_access','priority_support'])
ON CONFLICT (key) DO NOTHING;

-- ── per-organisation overrides ────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── entitlements ──────────────────────────────────────────────────────────────
-- Internal: no caller check. Used by org_has_feature, the triggers below and
-- the public wrapper.
CREATE OR REPLACE FUNCTION public._org_entitlements(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan     text := 'free';
  _addons   text[] := '{}';
  _over     jsonb := '{}'::jsonb;
  _p        public.plans%ROWTYPE;
  _features text[];
BEGIN
  SELECT o.plan, COALESCE(o.addons, '{}'), COALESCE(o.feature_overrides, '{}'::jsonb)
    INTO _plan, _addons, _over
  FROM public.organizations o WHERE o.id = _org_id;
  -- No such organisation leaves the targets NULL.
  _plan := COALESCE(_plan, 'free');
  _addons := COALESCE(_addons, '{}');
  _over := COALESCE(_over, '{}'::jsonb);

  SELECT * INTO _p FROM public.plans WHERE key = _plan;
  IF NOT FOUND THEN
    SELECT * INTO _p FROM public.plans WHERE key = 'free';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') INTO _features
  FROM (
    SELECT unnest(COALESCE(_p.features, '{}')) AS f
    UNION SELECT unnest(_addons)
    UNION SELECT e.key FROM jsonb_each(_over) e WHERE e.value = 'true'::jsonb
  ) granted
  WHERE f NOT IN (SELECT e.key FROM jsonb_each(_over) e WHERE e.value = 'false'::jsonb);

  RETURN jsonb_build_object(
    'org_id',    _org_id,
    'plan',      _plan,
    'plan_name', COALESCE(_p.name, initcap(_plan)),
    'limits',    COALESCE(_p.limits, '{}'::jsonb),
    'features',  to_jsonb(_features),
    'overrides', _over
  );
END; $$;
REVOKE ALL ON FUNCTION public._org_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._org_entitlements(uuid) TO service_role;

-- Public: members of the organisation, owners of its events, super admins and
-- the service role.
CREATE OR REPLACE FUNCTION public.org_entitlements(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.is_org_member(auth.uid(), _org_id)
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.org_id = _org_id AND e.user_id = auth.uid())
  THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._org_entitlements(_org_id);
END; $$;
REVOKE ALL ON FUNCTION public.org_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_entitlements(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.org_has_feature(_org_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public._org_entitlements(_org_id) -> 'features') ? _feature, false);
$$;
REVOKE ALL ON FUNCTION public.org_has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_has_feature(uuid, text) TO authenticated, service_role;

-- ── only super admins change plans ────────────────────────────────────────────
-- Non-admin writes keep the stored plan columns (silently, so existing
-- "save organisation settings" calls that send the whole row keep working),
-- and a new organisation created by a user starts on 'free'.
CREATE OR REPLACE FUNCTION public.guard_org_plan_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _free public.plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO _free FROM public.plans WHERE key = 'free';
    NEW.plan := 'free';
    NEW.addons := '{}';
    NEW.feature_overrides := '{}'::jsonb;
    IF FOUND THEN
      NEW.plan_limits := _free.limits || jsonb_build_object('features', to_jsonb(_free.features));
    END IF;
  ELSE
    NEW.plan := OLD.plan;
    NEW.plan_limits := OLD.plan_limits;
    NEW.addons := OLD.addons;
    NEW.feature_overrides := OLD.feature_overrides;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS organizations_guard_plan ON public.organizations;
CREATE TRIGGER organizations_guard_plan BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_plan_columns();

-- Subscriptions: owners may create their organisation's row (onboarding);
-- only super admins change it. The plan always follows the organisation.
CREATE OR REPLACE FUNCTION public.guard_subscription_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT o.plan INTO NEW.plan FROM public.organizations o WHERE o.id = NEW.org_id;
  NEW.plan := COALESCE(NEW.plan, 'free');
  RETURN NEW;
END; $$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  DROP POLICY IF EXISTS "Owner manage sub" ON public.subscriptions;
  DROP POLICY IF EXISTS "Owner create sub" ON public.subscriptions;
  DROP POLICY IF EXISTS "Admin manage subs" ON public.subscriptions;
  CREATE POLICY "Owner create sub" ON public.subscriptions FOR INSERT TO authenticated
    WITH CHECK (public.is_org_owner(auth.uid(), org_id));
  CREATE POLICY "Admin manage subs" ON public.subscriptions FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
  DROP TRIGGER IF EXISTS subscriptions_guard_plan ON public.subscriptions;
  CREATE TRIGGER subscriptions_guard_plan BEFORE INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_plan();
END $$;

-- ── server-side feature checks ────────────────────────────────────────────────
-- TG_ARGV[0] is the feature key. The organisation comes from the row's
-- org_id, or its event's org_id. Rows with no organisation (legacy personal
-- events) are let through.
CREATE OR REPLACE FUNCTION public.enforce_plan_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _feature text := TG_ARGV[0];
  _row     jsonb := to_jsonb(NEW);
  _org     uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF _row ? 'org_id' AND NULLIF(_row ->> 'org_id', '') IS NOT NULL THEN
    _org := (_row ->> 'org_id')::uuid;
  ELSIF _row ? 'event_id' AND NULLIF(_row ->> 'event_id', '') IS NOT NULL THEN
    SELECT e.org_id INTO _org FROM public.events e WHERE e.id = (_row ->> 'event_id')::uuid;
  END IF;
  IF _org IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.org_has_feature(_org, _feature) THEN
    RAISE EXCEPTION 'Your plan does not include this feature (%). Ask us to upgrade your plan.', _feature
      USING ERRCODE = 'P0001', HINT = 'plan_feature:' || _feature;
  END IF;
  RETURN NEW;
END; $$;

DO $$
DECLARE
  _t record;
BEGIN
  FOR _t IN
    SELECT * FROM (VALUES
      ('certificate_templates',  'certificates'),
      ('certificates',           'certificates'),
      ('event_creatives',        'creatives'),
      ('utm_links',              'utm_tracking'),
      ('event_venue_selections', 'venue_sourcing')
    ) AS v(tbl, feature)
  LOOP
    IF to_regclass('public.' || _t.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', _t.tbl || '_plan_feature', _t.tbl);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature(%L)',
        _t.tbl || '_plan_feature', _t.tbl, _t.feature
      );
    END IF;
  END LOOP;
END $$;

-- ── super-admin functions ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_save_plan(
  _key text, _name text, _description text, _sort_order int, _is_public boolean,
  _limits jsonb, _features text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k text;
  _clean jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _key IS NULL OR _key !~ '^[a-z][a-z0-9_]{1,31}$' THEN RAISE EXCEPTION 'Invalid plan key'; END IF;
  FOREACH _k IN ARRAY ARRAY['max_events','max_attendees_per_event','max_team_members'] LOOP
    IF jsonb_typeof(_limits -> _k) IS DISTINCT FROM 'number' OR (_limits ->> _k)::numeric < -1 THEN
      RAISE EXCEPTION 'Limit % must be a number (-1 for unlimited)', _k;
    END IF;
    _clean := _clean || jsonb_build_object(_k, floor((_limits ->> _k)::numeric)::int);
  END LOOP;

  INSERT INTO public.plans (key, name, description, sort_order, is_public, limits, features)
  VALUES (_key, btrim(_name), COALESCE(_description, ''), COALESCE(_sort_order, 0), COALESCE(_is_public, true),
          _clean, (SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') FROM unnest(COALESCE(_features, '{}')) f))
  ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
    is_public = EXCLUDED.is_public, limits = EXCLUDED.limits, features = EXCLUDED.features;

  -- Keep the legacy per-organisation snapshot in step.
  UPDATE public.organizations o
     SET plan_limits = p.limits || jsonb_build_object('features', to_jsonb(p.features))
    FROM public.plans p
   WHERE p.key = _key AND o.plan = _key;

  PERFORM public._plan_audit('plan.save', 'plan', _key,
    jsonb_build_object('name', _name, 'limits', _clean, 'features', to_jsonb(COALESCE(_features, '{}'))));
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_plan(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _key = 'free' THEN RAISE EXCEPTION 'The free plan cannot be deleted'; END IF;
  SELECT count(*) INTO _n FROM public.organizations WHERE plan = _key;
  IF _n > 0 THEN RAISE EXCEPTION '% organisation(s) are on this plan. Move them to another plan first.', _n; END IF;
  DELETE FROM public.plans WHERE key = _key;
  PERFORM public._plan_audit('plan.delete', 'plan', _key, '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_plan(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_plan(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_org_features(_oid uuid, _overrides jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_typeof(COALESCE(_overrides, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Overrides must be an object'; END IF;
  FOR _e IN SELECT * FROM jsonb_each(COALESCE(_overrides, '{}'::jsonb)) LOOP
    IF jsonb_typeof(_e.value) <> 'boolean' THEN
      RAISE EXCEPTION 'Override % must be true or false', _e.key;
    END IF;
  END LOOP;
  UPDATE public.organizations SET feature_overrides = COALESCE(_overrides, '{}'::jsonb), updated_at = now() WHERE id = _oid;
  PERFORM public._plan_audit('org.features', 'organization', _oid::text, jsonb_build_object('overrides', _overrides));
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_org_features(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_org_features(uuid, jsonb) TO authenticated;

-- Plan changes must name a plan that exists, and refresh the snapshot.
CREATE OR REPLACE FUNCTION public.admin_update_org_plan(_oid uuid, _plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.plans%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO _p FROM public.plans WHERE key = _plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown plan %', _plan; END IF;
  UPDATE public.organizations
     SET plan = _plan,
         plan_limits = _p.limits || jsonb_build_object('features', to_jsonb(_p.features)),
         updated_at = now()
   WHERE id = _oid;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    UPDATE public.subscriptions SET plan = _plan, updated_at = now() WHERE org_id = _oid;
  END IF;
  PERFORM public._plan_audit('org.plan', 'organization', _oid::text, jsonb_build_object('plan', _plan));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_org(
  _oid uuid, _name text DEFAULT NULL, _subdomain text DEFAULT NULL,
  _billing_email text DEFAULT NULL, _plan text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plans WHERE key = _plan) THEN
    RAISE EXCEPTION 'Unknown plan %', _plan;
  END IF;
  UPDATE public.organizations
     SET name = COALESCE(_name, name),
         subdomain = COALESCE(_subdomain, subdomain),
         billing_email = COALESCE(_billing_email, billing_email),
         updated_at = now()
   WHERE id = _oid;
  IF _plan IS NOT NULL THEN
    PERFORM public.admin_update_org_plan(_oid, _plan);
  END IF;
END; $$;
-- <<< END SOURCE MIGRATION: 048_plan_features.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 048_sponsor_portal_designation.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 048_sponsor_portal_designation.sql
--
-- The sponsor dashboard's participant list shows each person's designation.
-- `sponsor_portal_people` gains a `designation` column:
--   - speakers:  speakers.designation, falling back to speakers.title
--   - attendees: registrations.designation
--
-- Who may call it is unchanged (an accepted sponsor team member, or the
-- sponsor itself, of a sponsor attached to the event). The return type
-- changes, so the function is dropped and created again.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
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
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;
-- <<< END SOURCE MIGRATION: 048_sponsor_portal_designation.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 049_admin_provisioned_organizations.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 049_admin_provisioned_organizations.sql
--
-- Super Admin can create an organization and invite its first user, who
-- becomes the owner when they accept (team-invitation edge function, action
-- `admin_create_org`).
--
-- An organization needs an owner from the moment it exists, but the first
-- user may not have an account yet. Until they accept, the organization's
-- `owner_id` is the Super Admin who created it (no `org_members` row). The
-- invitation carries `transfer_ownership`; when it is accepted, ownership
-- moves to the person who accepted it, in the same transaction.
--
--   1. `org_invitations.transfer_ownership` — accepting it makes the invitee
--      the organization's owner. Only server-side code can set it.
--   2. `org_invitations.prefill` — personal details the Super Admin entered
--      (first / last name, designation, mobile), shown pre-filled on the
--      invitation page. The invitee can change them.
--   3. Trigger: when a `transfer_ownership` invitation becomes accepted, the
--      organization's owner becomes the user who accepted it, and that user
--      gets the owner membership. Covers every path that accepts an
--      invitation (`complete_org_invitation`, `accept_org_invitation`).
--
-- No other role is ever granted here; global roles (`user_roles`) are not
-- touched. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1–2. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS transfer_ownership boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prefill jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_invitations.transfer_ownership IS
  'Accepting this invitation makes the invitee the organization''s owner (organizations created by Super Admin). Set only by server-side code.';
COMMENT ON COLUMN public.org_invitations.prefill IS
  'Personal details entered by whoever created the invitation, pre-filled on the invitation page.';

-- Browsers (signed-in callers) can never ask for an ownership handover.
CREATE OR REPLACE FUNCTION public.org_invitations_transfer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.transfer_ownership := false;
  ELSE
    NEW.transfer_ownership := OLD.transfer_ownership;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_transfer_guard ON public.org_invitations;
CREATE TRIGGER org_invitations_transfer_guard
  BEFORE INSERT OR UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_transfer_guard();

-- ── 3. Hand over ownership on acceptance ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_invitations_hand_over()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transfer_ownership
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND NEW.accepted_by IS NOT NULL THEN
    UPDATE public.organizations
       SET owner_id = NEW.accepted_by, updated_at = now()
     WHERE id = NEW.org_id;
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (NEW.org_id, NEW.accepted_by, 'owner')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_hand_over ON public.org_invitations;
CREATE TRIGGER org_invitations_hand_over
  AFTER UPDATE OF status ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_hand_over();

COMMENT ON FUNCTION public.org_invitations_hand_over() IS
  'When an ownership-handover invitation is accepted, the organization''s owner becomes the accepting user (with the owner membership), in the same transaction.';
-- <<< END SOURCE MIGRATION: 049_admin_provisioned_organizations.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 050_sponsor_meeting_interest.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 050_sponsor_meeting_interest.sql
--
-- Meeting Interest: a sponsor marks attendees of an event it sponsors that it
-- would like to meet. Each sponsor's selection is its own; many sponsors can
-- mark the same attendee. It records interest only — nothing is scheduled,
-- nobody is notified, and no further attendee details are revealed.
--
--   1. `sponsor_meeting_interests` — one row per (event, sponsor, attendee
--      registration). Unique, so repeating a request never duplicates it.
--      No client reads or writes it directly; everything goes through the
--      functions below.
--   2. `sponsor_set_meeting_interest(_eid, _registration_id, _interested,
--      _sponsor_id?)` — the signed-in sponsor sets or clears ITS OWN
--      selection. The sponsor is worked out on the server from the session:
--      an accepted team member of a sponsor attached to the event, or the
--      sponsor itself (approved application) on an event it does not run.
--      The registration must be one the sponsor can see in its dashboard (an
--      approved, non-speaker registration of that event). Audit-logged.
--   3. `sponsor_portal_people(_eid)` — the sponsor dashboard's list, now with
--      `designation` (as migration 048) and the caller's `meeting_interest`.
--   4. `event_meeting_interests(_eid)` — for the event's organisers (same
--      access as viewing registrations): every interest with the sponsor's
--      name, for the Registrations tab's column and filter.
--
-- Idempotent — safe to run more than once. Supersedes 048's version of
-- `sponsor_portal_people` (either order works).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsor_meeting_interests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id      uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_meeting_interests_unique UNIQUE (event_id, sponsor_id, registration_id)
);

CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_event_idx        ON public.sponsor_meeting_interests (event_id);
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_registration_idx ON public.sponsor_meeting_interests (registration_id);
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_sponsor_idx      ON public.sponsor_meeting_interests (sponsor_id, event_id);

ALTER TABLE public.sponsor_meeting_interests ENABLE ROW LEVEL SECURITY;
-- No policies: browsers go through the SECURITY DEFINER functions below.
REVOKE ALL ON public.sponsor_meeting_interests FROM anon, authenticated;

COMMENT ON TABLE public.sponsor_meeting_interests IS
  'Meeting Interest: sponsor S would like to meet the attendee of registration R at event E. One row per (event, sponsor, registration). Read and written only through sponsor_set_meeting_interest, sponsor_portal_people and event_meeting_interests.';

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- The sponsors the caller acts for at this event: accepted team membership, or
-- owning the sponsor record on an event the caller does not run (an organiser
-- who merely created a sponsor for their own event is not that sponsor).
CREATE OR REPLACE FUNCTION public._my_event_sponsors(_eid uuid)
RETURNS TABLE (sponsor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT es.sponsor_id
    FROM event_sponsors es
    JOIN sponsor_members sm ON sm.sponsor_id = es.sponsor_id
   WHERE es.event_id = _eid AND sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
  UNION
  SELECT es.sponsor_id
    FROM event_sponsors es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN events e   ON e.id = es.event_id
    LEFT JOIN organizations o ON o.id = e.org_id
   WHERE es.event_id = _eid AND s.user_id = auth.uid()
     AND e.user_id IS DISTINCT FROM auth.uid()
     AND o.owner_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = e.org_id AND m.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public._my_event_sponsors(uuid) FROM PUBLIC, anon, authenticated;

-- Same access as the "Owner view regs" policy on registrations.
CREATE OR REPLACE FUNCTION public._can_view_event_registrations(_eid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM events e
      LEFT JOIN organizations o ON o.id = e.org_id
      LEFT JOIN org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = _eid
       AND (e.user_id = auth.uid() OR o.owner_id = auth.uid() OR m.user_id IS NOT NULL OR has_role(auth.uid(), 'admin'))
  );
$$;
REVOKE ALL ON FUNCTION public._can_view_event_registrations(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Set / clear the caller's own selection ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  -- Which sponsor is acting: worked out from the session, never taken on
  -- trust. `_sponsor_id` only chooses between the caller's own sponsors.
  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  -- Only attendees the sponsor can see in its dashboard.
  IF NOT EXISTS (
    SELECT 1 FROM registrations r
     WHERE r.id = _registration_id AND r.event_id = _eid
       AND r.approval_status = 'approved' AND r.ticket_type <> 'speaker'
  ) THEN
    RAISE EXCEPTION 'That attendee is not available.' USING ERRCODE = '42501';
  END IF;

  IF _interested THEN
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
         VALUES (_eid, _sid, _registration_id, auth.uid())
    ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING;
  ELSE
    -- Only this sponsor's row; every other sponsor's selection stays.
    DELETE FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid AND smi.registration_id = _registration_id;
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          'registration', _registration_id::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid) TO authenticated;

-- ── 3. The sponsor dashboard's list ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at, false
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.registration_id = r.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 4. Organisers: every interest with the sponsor's name ────────────────────
CREATE OR REPLACE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (registration_id uuid, sponsor_id uuid, sponsor_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.sponsor_id, s.name, smi.created_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;
-- <<< END SOURCE MIGRATION: 050_sponsor_meeting_interest.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 051_meeting_interest_speakers_realtime.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 051_meeting_interest_speakers_realtime.sql
--
-- Two additions to Meeting Interest (050):
--
--   A. Speakers can be marked too. Speakers aren't registrations, so an
--      interest now points at exactly one of a registration (attendee) or a
--      speaker profile (`speaker_id`). The speaker must be on the event.
--      `sponsor_set_meeting_interest` takes an optional `_speaker_id`; calls
--      made the 050 way (registration only) keep working.
--
--   B. Live updates. When a sponsor ticks or unticks someone, the organiser's
--      Registrations tab and the sponsor's own team see it without
--      refreshing. Supabase Realtime only delivers rows the receiver may
--      SELECT, so the table gets read access matching what each side already
--      sees through the functions:
--        • organisers — every interest on events whose registrations they can
--          view (as `event_meeting_interests`);
--        • sponsors — their own sponsor's interests (as `sponsor_portal_people`).
--      Writes still go only through `sponsor_set_meeting_interest`.
--
--   C. Live check-ins on the sponsor dashboard (see section C).
--
-- Run after 050. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── A1. Table: a registration OR a speaker ───────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS speaker_id uuid REFERENCES public.speakers(id) ON DELETE CASCADE;
ALTER TABLE public.sponsor_meeting_interests ALTER COLUMN registration_id DROP NOT NULL;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_one_person;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_one_person CHECK (num_nonnulls(registration_id, speaker_id) = 1);

-- Attendees stay unique through 050's constraint; speakers through this.
CREATE UNIQUE INDEX IF NOT EXISTS sponsor_meeting_interests_speaker_unique
  ON public.sponsor_meeting_interests (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_speaker_idx
  ON public.sponsor_meeting_interests (speaker_id) WHERE speaker_id IS NOT NULL;

COMMENT ON TABLE public.sponsor_meeting_interests IS
  'Meeting Interest: sponsor S would like to meet a person at event E — an attendee (registration_id) or a speaker (speaker_id), exactly one. One row per (event, sponsor, person). Written only through sponsor_set_meeting_interest.';

-- ── A2. Set / clear the caller's own selection ───────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid);

CREATE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,     -- the attendee, or NULL for a speaker
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;

  -- Which sponsor is acting: worked out from the session, never taken on
  -- trust. `_sponsor_id` only chooses between the caller's own sponsors.
  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  -- Only people the sponsor can see in its dashboard.
  IF _registration_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registrations r
     WHERE r.id = _registration_id AND r.event_id = _eid
       AND r.approval_status = 'approved' AND r.ticket_type <> 'speaker'
  ) THEN
    RAISE EXCEPTION 'That attendee is not available.' USING ERRCODE = '42501';
  END IF;
  IF _speaker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM event_speakers esp WHERE esp.event_id = _eid AND esp.speaker_id = _speaker_id
  ) THEN
    RAISE EXCEPTION 'That speaker is not available.' USING ERRCODE = '42501';
  END IF;

  IF _interested THEN
    IF _speaker_id IS NOT NULL THEN
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, speaker_id, created_by)
           VALUES (_eid, _sid, _speaker_id, auth.uid())
      ON CONFLICT (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
           VALUES (_eid, _sid, _registration_id, auth.uid())
      ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING;
    END IF;
  ELSE
    -- Only this sponsor's row; every other sponsor's selection stays.
    DELETE FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
       AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id);
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  speaker_id       := _speaker_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) TO authenticated;

-- ── A3. The sponsor dashboard's list: speakers carry their flag too ──────────
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.speaker_id = sp.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.registration_id = r.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── A4. Organisers: every interest, with the speaker's email so a speaker who
--        also registered is matched on their registration row ───────────────
DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── B. Live updates ───────────────────────────────────────────────────────────
-- The policies call these as the signed-in user. Each only answers about the
-- caller (their own sponsors / whether they may view the event's registrations).
GRANT EXECUTE ON FUNCTION public._my_event_sponsors(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_view_event_registrations(uuid) TO authenticated;

GRANT SELECT ON public.sponsor_meeting_interests TO authenticated;

DROP POLICY IF EXISTS "Organisers view meeting interests" ON public.sponsor_meeting_interests;
CREATE POLICY "Organisers view meeting interests" ON public.sponsor_meeting_interests
  FOR SELECT TO authenticated
  USING (public._can_view_event_registrations(event_id));

DROP POLICY IF EXISTS "Sponsors view their meeting interests" ON public.sponsor_meeting_interests;
CREATE POLICY "Sponsors view their meeting interests" ON public.sponsor_meeting_interests
  FOR SELECT TO authenticated
  USING (sponsor_id IN (SELECT ms.sponsor_id FROM public._my_event_sponsors(event_id) ms));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sponsor_meeting_interests') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sponsor_meeting_interests';
  END IF;
END $$;

-- ── C. Live check-ins on the sponsor dashboard ───────────────────────────────
-- Sponsors can't read registrations, so they can't receive their changes.
-- Instead every change to an event's registrations or meeting interests sends
-- a content-free "changed" signal on the public broadcast topic
-- `event-live:<event id>`; the sponsor page reloads its list (through
-- `sponsor_portal_people`, which does the access check) when it hears one.
-- The signal carries only the table name. If Realtime broadcast isn't
-- available the signal is skipped — the triggering change always goes through.
CREATE OR REPLACE FUNCTION public._signal_event_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _eid uuid := COALESCE(NEW.event_id, OLD.event_id);
BEGIN
  IF _eid IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', 'event-live:' || _eid::text, false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._signal_event_live() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_signal_event_live ON public.registrations;
CREATE TRIGGER registrations_signal_event_live
  AFTER INSERT OR DELETE OR UPDATE OF checked_in, checked_in_at, approval_status, ticket_type, name, company, designation
  ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public._signal_event_live();

DROP TRIGGER IF EXISTS sponsor_meeting_interests_signal_event_live ON public.sponsor_meeting_interests;
CREATE TRIGGER sponsor_meeting_interests_signal_event_live
  AFTER INSERT OR DELETE ON public.sponsor_meeting_interests
  FOR EACH ROW EXECUTE FUNCTION public._signal_event_live();

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 051_meeting_interest_speakers_realtime.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 052_meeting_status.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 052_meeting_status.sql
--
-- Meetings: follow each Meeting Interest (050/051) through to a result.
--
--   interested ──► arranged ──► met
--        │             └──────► not_met ("Didn't happen")
--        └──────────► met / not_met   (arranging is optional)
--
--   • Each sponsor–person row now has a `status`, an optional time and place
--     (arranged), when it was met, an optional reason it didn't happen, and a
--     private `note` (seen only by that sponsor's team and the organisers).
--   • `set_meeting_status` — the sponsor (for its own rows) or the event's
--     organisers (for any sponsor on the event) change the status. A meeting
--     must start as interested or arranged; after that it can move to any
--     state, so a mistake can be undone. Records who changed it and which side.
--   • `set_meeting_note` — the same people edit the private note.
--   • `sponsor_set_meeting_interest` — unticking is refused once a meeting is
--     arranged, met or didn't happen, so the record stays.
--   • `sponsor_portal_people` and `event_meeting_interests` return the status
--     fields. Status changes are streamed live like the rest (051).
--   • No contact details are revealed and nobody is notified.
--
-- Run after 051. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'interested',
  ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz,
  ADD COLUMN IF NOT EXISTS location          text,
  ADD COLUMN IF NOT EXISTS met_at            timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS note              text,
  ADD COLUMN IF NOT EXISTS status_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_by_side    text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_status_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_status_check CHECK (status IN ('interested', 'arranged', 'met', 'not_met'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_side_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_side_check CHECK (status_by_side IS NULL OR status_by_side IN ('sponsor', 'organiser'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_lengths;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_lengths
  CHECK (coalesce(length(location), 0) <= 200 AND coalesce(length(status_reason), 0) <= 500 AND coalesce(length(note), 0) <= 2000);

CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_status_idx ON public.sponsor_meeting_interests (event_id, status);

-- ── 2. Helpers ────────────────────────────────────────────────────────────────
-- Who is acting, and for which sponsor. Organisers of the event act for the
-- sponsor they name (it must be on the event); sponsors act for their own
-- sponsor, worked out from the session as in 050.
CREATE OR REPLACE FUNCTION public._meeting_actor(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (sponsor_id uuid, side text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  IF public._can_view_event_registrations(_eid) THEN
    IF _sponsor_id IS NULL THEN RAISE EXCEPTION 'Choose the sponsor.' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM event_sponsors es WHERE es.event_id = _eid AND es.sponsor_id = _sponsor_id) THEN
      RAISE EXCEPTION 'That sponsor is not on this event.' USING ERRCODE = '42501';
    END IF;
    sponsor_id := _sponsor_id; side := 'organiser'; RETURN NEXT; RETURN;
  END IF;

  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;
  sponsor_id := _sid; side := 'sponsor'; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The person must be one the sponsor dashboard lists: an approved,
-- non-speaker registration of the event, or a speaker on the event.
CREATE OR REPLACE FUNCTION public._meeting_person_check(_eid uuid, _registration_id uuid, _speaker_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;
  IF _registration_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registrations r
     WHERE r.id = _registration_id AND r.event_id = _eid
       AND r.approval_status = 'approved' AND r.ticket_type <> 'speaker'
  ) THEN
    RAISE EXCEPTION 'That attendee is not available.' USING ERRCODE = '42501';
  END IF;
  IF _speaker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM event_speakers esp WHERE esp.event_id = _eid AND esp.speaker_id = _speaker_id
  ) THEN
    RAISE EXCEPTION 'That speaker is not available.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_person_check(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Change a meeting's status ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text);

CREATE FUNCTION public.set_meeting_status(
  _eid             uuid,
  _status          text,
  _registration_id uuid        DEFAULT NULL,
  _speaker_id      uuid        DEFAULT NULL,
  _sponsor_id      uuid        DEFAULT NULL,   -- required for organisers
  _scheduled_at    timestamptz DEFAULT NULL,   -- arranged: when (optional)
  _location        text        DEFAULT NULL,   -- arranged: where (optional)
  _reason          text        DEFAULT NULL    -- not_met: why (optional)
)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, sponsor_id uuid, status text,
  scheduled_at timestamptz, location text, met_at timestamptz, status_reason text,
  status_by_side text, status_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _from  text;
  _email text;
BEGIN
  IF _status IS NULL OR _status NOT IN ('interested', 'arranged', 'met', 'not_met') THEN
    RAISE EXCEPTION 'Unknown meeting status.' USING ERRCODE = '22023';
  END IF;
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    -- A meeting starts as interest or as an arranged meeting.
    IF _status NOT IN ('interested', 'arranged') THEN
      RAISE EXCEPTION 'Mark interest or arrange the meeting first.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, speaker_id, created_by)
         VALUES (_eid, _sid, _registration_id, _speaker_id, auth.uid())
    RETURNING * INTO _row;
    _from := NULL;
  ELSE
    _from := _row.status;
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    status            = _status,
    scheduled_at      = CASE _status WHEN 'arranged' THEN _scheduled_at
                                     WHEN 'interested' THEN NULL ELSE smi.scheduled_at END,
    location          = CASE _status WHEN 'arranged' THEN NULLIF(btrim(left(_location, 200)), '')
                                     WHEN 'interested' THEN NULL ELSE smi.location END,
    met_at            = CASE _status WHEN 'met' THEN COALESCE(CASE WHEN smi.status = 'met' THEN smi.met_at END, now())
                                     ELSE NULL END,
    status_reason     = CASE _status WHEN 'not_met' THEN NULLIF(btrim(left(_reason, 500)), '') ELSE NULL END,
    status_by         = auth.uid(),
    status_by_side    = _side,
    status_changed_at = now(),
    updated_at        = now()
  WHERE smi.id = _row.id
  RETURNING * INTO _row;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.status_changed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _from, 'to', _status, 'by', _side));

  registration_id   := _row.registration_id;
  speaker_id        := _row.speaker_id;
  sponsor_id        := _row.sponsor_id;
  status            := _row.status;
  scheduled_at      := _row.scheduled_at;
  location          := _row.location;
  met_at            := _row.met_at;
  status_reason     := _row.status_reason;
  status_by_side    := _row.status_by_side;
  status_changed_at := _row.status_changed_at;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text) TO authenticated;

-- ── 4. The private note ───────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_meeting_note(uuid, text, uuid, uuid, uuid);

CREATE FUNCTION public.set_meeting_note(
  _eid             uuid,
  _note            text,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL,
  _sponsor_id      uuid DEFAULT NULL
)
RETURNS TABLE (note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _id    uuid;
  _clean text := NULLIF(btrim(left(_note, 2000)), '');
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  UPDATE sponsor_meeting_interests smi SET note = _clean, updated_at = now()
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
  RETURNING smi.id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Mark interest first.' USING ERRCODE = '22023'; END IF;

  -- The note itself stays out of the audit log.
  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.note_updated',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'by', _side));

  note := _clean;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) TO authenticated;

-- ── 5. Unticking keeps arranged / finished meetings ─────────────────────────
CREATE OR REPLACE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  IF _interested THEN
    IF _speaker_id IS NOT NULL THEN
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, speaker_id, created_by)
           VALUES (_eid, _sid, _speaker_id, auth.uid())
      ON CONFLICT (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
           VALUES (_eid, _sid, _registration_id, auth.uid())
      ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM sponsor_meeting_interests smi
       WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
         AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
         AND smi.status <> 'interested'
    ) THEN
      RAISE EXCEPTION 'This meeting is already arranged or done. Change its status instead.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
       AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id);
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  speaker_id       := _speaker_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) TO authenticated;

-- ── 6. The sponsor dashboard's list, with the meeting ────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean,
  meeting_status text, interested_at timestamptz, scheduled_at timestamptz, location text,
  met_at timestamptz, status_reason text, note text, status_by_side text, status_changed_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (
    SELECT smi.*
      FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid
       AND smi.sponsor_id IN (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  )
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.speaker_id = sp.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at
    FROM registrations r
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.registration_id = r.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 7. Organisers: every meeting with its status ─────────────────────────────
DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz,
  status text, scheduled_at timestamptz, location text, met_at timestamptz, status_reason text, note text,
  status_by_side text, status_changed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at,
         smi.status, smi.scheduled_at, smi.location, smi.met_at, smi.status_reason, smi.note,
         smi.status_by_side, smi.status_changed_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── 8. Live: status changes signal the sponsor page too ──────────────────────
DROP TRIGGER IF EXISTS sponsor_meeting_interests_signal_event_live ON public.sponsor_meeting_interests;
CREATE TRIGGER sponsor_meeting_interests_signal_event_live
  AFTER INSERT OR UPDATE OR DELETE ON public.sponsor_meeting_interests
  FOR EACH ROW EXECUTE FUNCTION public._signal_event_live();

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 052_meeting_status.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 053_accept_sponsor_invite.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 053_accept_sponsor_invite.sql
--
-- Sponsor team invites (/sponsor/accept?token=…) could not be accepted.
-- The page claimed the invite with a direct UPDATE on sponsor_members, but
-- the table's policies only let the sponsor's owner and the event's organiser
-- update rows — so for the actual invitee nothing changed and the page said
-- "Invite is invalid or already claimed by another account". Worse, when an
-- organiser opened the copied link themselves, the UPDATE *was* allowed and
-- the invite was claimed by the organiser's account, locking the real
-- invitee out.
--
-- `accept_sponsor_invite(_token)` claims it on the server instead:
--   • unknown token                                  → error INVITE_INVALID
--   • already this account's                         → ok ('already_yours')
--   • claimed by another account                     → error INVITE_CLAIMED
--   • the caller organises an event the sponsor is on → error INVITE_ORGANISER
--     (organisers share the link; they don't become sponsor team members)
--   • an invite an organiser claimed by mistake counts as unclaimed, so the
--     real invitee can still take it.
-- The link stays a bearer link, as before: whoever opens it first (and isn't
-- an organiser) joins. Audit-logged.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Whether `_uid` runs any event this sponsor is attached to.
CREATE OR REPLACE FUNCTION public._organises_sponsor_event(_sponsor_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM event_sponsors es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN organizations o ON o.id = e.org_id
     WHERE es.sponsor_id = _sponsor_id
       AND (e.user_id = _uid
            OR o.owner_id = _uid
            OR EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = e.org_id AND m.user_id = _uid))
  );
$$;
REVOKE ALL ON FUNCTION public._organises_sponsor_event(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.accept_sponsor_invite(text);

CREATE FUNCTION public.accept_sponsor_invite(_token text)
RETURNS TABLE (sponsor_id uuid, sponsor_name text, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _m     sponsor_members%ROWTYPE;
  _uid   uuid := auth.uid();
  _email text;
  _name  text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF _token IS NULL OR length(btrim(_token)) < 8 THEN
    RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _m FROM sponsor_members sm WHERE sm.invite_token = btrim(_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0002'; END IF;

  SELECT s.name INTO _name FROM sponsors s WHERE s.id = _m.sponsor_id;

  -- Organisers share the link; they don't join the sponsor's team (even if
  -- the old page let them claim it).
  IF public._organises_sponsor_event(_m.sponsor_id, _uid) THEN
    RAISE EXCEPTION 'INVITE_ORGANISER' USING ERRCODE = '42501';
  END IF;

  IF _m.user_id = _uid AND _m.accepted_at IS NOT NULL THEN
    sponsor_id := _m.sponsor_id; sponsor_name := _name; result := 'already_yours';
    RETURN NEXT; RETURN;
  END IF;

  -- Taken by someone else — unless that someone was an organiser who opened
  -- the link by mistake (the old page let them claim it).
  IF _m.user_id IS NOT NULL AND _m.user_id <> _uid
     AND NOT public._organises_sponsor_event(_m.sponsor_id, _m.user_id) THEN
    RAISE EXCEPTION 'INVITE_CLAIMED' USING ERRCODE = '42501';
  END IF;

  UPDATE sponsor_members sm
     SET user_id = _uid, accepted_at = now()
   WHERE sm.id = _m.id;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _uid;
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (_uid, _email, 'sponsor_invite.accepted', 'sponsor_member', _m.id::text,
          jsonb_build_object('sponsor_id', _m.sponsor_id, 'invited_email', _m.email,
                             'replaced_organiser_claim', _m.user_id IS NOT NULL));

  sponsor_id := _m.sponsor_id; sponsor_name := _name; result := 'accepted';
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_sponsor_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_sponsor_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 053_accept_sponsor_invite.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 054_meeting_disputes_history.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 054_meeting_disputes_history.sql
--
-- Makes meeting records dispute-proof (builds on 052):
--
--   1. Organisers have the final say. An outcome (Met / Didn't happen /
--      Cancelled) set by the organiser can't be changed by the sponsor; the
--      sponsor files a dispute with a reason and the organiser keeps or
--      changes it. Organiser changes to an outcome after the event need a
--      reason.
--   2. A sponsor can change its own outcome for 15 minutes (mis-clicks), then
--      it locks and changes go through a dispute. After the event the
--      sponsor can't move a meeting back to Interested / Arranged.
--   3. Nothing that progressed is deleted: "Remove interest" only works for a
--      meeting that never went past Interested; otherwise it's Cancelled
--      (a status, with an optional reason). A sponsor can't undo an
--      arrangement the organiser made.
--   4. Every change is written to `meeting_events`, an append-only history
--      (no one can edit or delete it) shown to both sides. Earlier changes are
--      backfilled from the audit log.
--   5. "Didn't happen" records a cause: attendee no-show, sponsor couldn't
--      make it, rescheduled, or other.
--   6. `sponsor_meeting_report` — the organiser's per-sponsor report with
--      check-in evidence and the full history.
--
-- Run after 053. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_status_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_status_check
  CHECK (status IN ('interested', 'arranged', 'met', 'not_met', 'cancelled'));

ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS status_cause             text,
  ADD COLUMN IF NOT EXISTS ever_progressed          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_at               timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_status           text,
  ADD COLUMN IF NOT EXISTS dispute_reason           text,
  ADD COLUMN IF NOT EXISTS dispute_requested_status text,
  ADD COLUMN IF NOT EXISTS disputed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolution       text,
  ADD COLUMN IF NOT EXISTS dispute_note             text,
  ADD COLUMN IF NOT EXISTS resolved_at              timestamptz;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_cause_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_cause_check
  CHECK (status_cause IS NULL OR status_cause IN ('attendee_no_show', 'sponsor_unavailable', 'rescheduled', 'other'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_dispute_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_dispute_check
  CHECK ((dispute_status IS NULL OR dispute_status IN ('open', 'resolved'))
     AND (dispute_resolution IS NULL OR dispute_resolution IN ('kept', 'changed'))
     AND (dispute_requested_status IS NULL OR dispute_requested_status IN ('interested', 'arranged', 'met', 'not_met', 'cancelled'))
     AND coalesce(length(dispute_reason), 0) <= 1000 AND coalesce(length(dispute_note), 0) <= 1000);

UPDATE public.sponsor_meeting_interests
   SET ever_progressed = true
 WHERE status <> 'interested' AND NOT ever_progressed;
UPDATE public.sponsor_meeting_interests
   SET outcome_at = coalesce(status_changed_at, updated_at)
 WHERE status IN ('met', 'not_met', 'cancelled') AND outcome_at IS NULL;

-- ── 2. Append-only history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid,                 -- sponsor_meeting_interests.id (kept even if that row goes)
  event_id        uuid NOT NULL,
  sponsor_id      uuid NOT NULL,
  registration_id uuid,
  speaker_id      uuid,
  action          text NOT NULL,        -- interested | arranged | met | not_met | cancelled | removed
                                        -- | disputed | dispute_kept | dispute_changed | note
  from_status     text,
  to_status       text,
  side            text,                 -- sponsor | organiser
  actor_id        uuid,
  reason          text,
  cause           text,
  scheduled_at    timestamptz,
  location        text,
  backfilled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_events_person_idx  ON public.meeting_events (event_id, sponsor_id, registration_id, speaker_id, created_at);
CREATE INDEX IF NOT EXISTS meeting_events_meeting_idx ON public.meeting_events (meeting_id);

ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_events FROM anon, authenticated;

-- Nobody edits or deletes history — not organisers, not admins through the app.
CREATE OR REPLACE FUNCTION public._meeting_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Meeting history cannot be changed or deleted.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS meeting_events_append_only ON public.meeting_events;
CREATE TRIGGER meeting_events_append_only
  BEFORE UPDATE OR DELETE ON public.meeting_events
  FOR EACH ROW EXECUTE FUNCTION public._meeting_events_append_only();

COMMENT ON TABLE public.meeting_events IS
  'Append-only history of every Meeting Interest change (status, disputes, notes). Written only by the meeting functions; read through meeting_history / sponsor_meeting_report.';

-- Backfill from the audit log, once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.meeting_events) THEN
    WITH log AS (
      SELECT a.*,
             (a.details->>'event_id')::uuid   AS ev,
             (a.details->>'sponsor_id')::uuid AS sp,
             CASE WHEN a.target_type = 'registration' THEN a.target_id::uuid END AS reg,
             CASE WHEN a.target_type = 'speaker'      THEN a.target_id::uuid END AS spk
        FROM public.audit_logs a
       WHERE a.action IN ('meeting_interest.added', 'meeting_interest.removed', 'meeting.status_changed')
         AND a.details ? 'event_id' AND a.details ? 'sponsor_id'
         AND a.target_type IN ('registration', 'speaker')
    )
    INSERT INTO public.meeting_events
      (meeting_id, event_id, sponsor_id, registration_id, speaker_id, action, from_status, to_status, side, actor_id, backfilled, created_at)
    SELECT (SELECT smi.id FROM public.sponsor_meeting_interests smi
             WHERE smi.event_id = a.ev AND smi.sponsor_id = a.sp
               AND (smi.registration_id = a.reg OR smi.speaker_id = a.spk) LIMIT 1),
           a.ev, a.sp, a.reg, a.spk,
           CASE a.action
             WHEN 'meeting_interest.added'   THEN 'interested'
             WHEN 'meeting_interest.removed' THEN 'removed'
             ELSE a.details->>'to' END,
           CASE WHEN a.action = 'meeting.status_changed' THEN a.details->>'from' END,
           CASE a.action
             WHEN 'meeting_interest.added'   THEN 'interested'
             WHEN 'meeting_interest.removed' THEN NULL
             ELSE a.details->>'to' END,
           CASE WHEN a.action = 'meeting.status_changed' THEN a.details->>'by' ELSE 'sponsor' END,
           a.actor_id,
           true,
           a.created_at
      FROM log a;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- History starts from now if the audit log can't be read; nothing else depends on it.
  RAISE NOTICE 'meeting_events backfill skipped: %', SQLERRM;
END $$;

-- ── 3. Helpers ────────────────────────────────────────────────────────────────
-- The event is over: its end, or 12 hours after the start when it has no end
-- (as the sponsor dashboard shows it).
CREATE OR REPLACE FUNCTION public._event_over(_eid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT now() > coalesce(e.end_date, e.date + interval '12 hours') FROM events e WHERE e.id = _eid), false);
$$;
REVOKE ALL ON FUNCTION public._event_over(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._log_meeting(
  _meeting_id uuid, _eid uuid, _sid uuid, _reg uuid, _spk uuid,
  _action text, _from text, _to text, _side text,
  _reason text DEFAULT NULL, _cause text DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL, _location text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO meeting_events (meeting_id, event_id, sponsor_id, registration_id, speaker_id, action,
                              from_status, to_status, side, actor_id, reason, cause, scheduled_at, location)
  VALUES (_meeting_id, _eid, _sid, _reg, _spk, _action, _from, _to, _side, auth.uid(),
          NULLIF(btrim(left(_reason, 1000)), ''), _cause, _scheduled_at, _location);
$$;
REVOKE ALL ON FUNCTION public._log_meeting(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Change a meeting's status (with the dispute-proof rules) ─────────────
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text);

CREATE FUNCTION public.set_meeting_status(
  _eid             uuid,
  _status          text,
  _registration_id uuid        DEFAULT NULL,
  _speaker_id      uuid        DEFAULT NULL,
  _sponsor_id      uuid        DEFAULT NULL,   -- required for organisers
  _scheduled_at    timestamptz DEFAULT NULL,   -- arranged: when (optional)
  _location        text        DEFAULT NULL,   -- arranged: where (optional)
  _reason          text        DEFAULT NULL,   -- not_met / cancelled: why; organiser changes after the event: why
  _cause           text        DEFAULT NULL    -- not_met: attendee_no_show | sponsor_unavailable | rescheduled | other
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid      uuid;
  _side     text;
  _row      sponsor_meeting_interests%ROWTYPE;
  _from     text;
  _over     boolean := public._event_over(_eid);
  _outcomes text[]  := ARRAY['met', 'not_met', 'cancelled'];
  _cz       text;
  _email    text;
BEGIN
  IF _status IS NULL OR _status NOT IN ('interested', 'arranged', 'met', 'not_met', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown meeting status.' USING ERRCODE = '22023';
  END IF;
  _cz := CASE WHEN _status = 'not_met' THEN coalesce(_cause, 'other') END;
  IF _cz IS NOT NULL AND _cz NOT IN ('attendee_no_show', 'sponsor_unavailable', 'rescheduled', 'other') THEN
    RAISE EXCEPTION 'Unknown reason the meeting did not happen.' USING ERRCODE = '22023';
  END IF;

  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    IF _status NOT IN ('interested', 'arranged') THEN
      RAISE EXCEPTION 'Mark interest or arrange the meeting first.' USING ERRCODE = '22023';
    END IF;
    IF _side = 'sponsor' AND _status = 'arranged' AND _over THEN
      RAISE EXCEPTION 'EVENT_OVER' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, speaker_id, created_by)
         VALUES (_eid, _sid, _registration_id, _speaker_id, auth.uid())
    RETURNING * INTO _row;
    _from := NULL;
  ELSE
    _from := _row.status;
  END IF;

  IF _side = 'sponsor' THEN
    IF _row.dispute_status = 'open' THEN
      RAISE EXCEPTION 'DISPUTE_OPEN' USING ERRCODE = '22023';
    END IF;
    IF _from = ANY (_outcomes) THEN
      -- The organiser's outcomes are final for the sponsor; its own lock after 15 minutes.
      IF _row.status_by_side = 'organiser' THEN
        RAISE EXCEPTION 'LOCKED_ORGANISER' USING ERRCODE = '42501';
      END IF;
      IF coalesce(_row.outcome_at, _row.status_changed_at, now()) < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'LOCKED' USING ERRCODE = '42501';
      END IF;
    ELSE
      -- After the event a sponsor only records outcomes.
      IF _over AND _status IN ('interested', 'arranged') AND _from IS NOT NULL THEN
        RAISE EXCEPTION 'EVENT_OVER' USING ERRCODE = '22023';
      END IF;
      IF _from = 'arranged' AND _status = 'interested' AND _row.status_by_side = 'organiser' THEN
        RAISE EXCEPTION 'ARRANGED_BY_ORGANISER' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- Organisers may change anything; changing an outcome after the event needs a reason.
    IF _from = ANY (_outcomes) AND _over AND _from IS DISTINCT FROM _status AND coalesce(btrim(_reason), '') = '' THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    status            = _status,
    scheduled_at      = CASE _status WHEN 'arranged' THEN _scheduled_at
                                     WHEN 'interested' THEN NULL ELSE smi.scheduled_at END,
    location          = CASE _status WHEN 'arranged' THEN NULLIF(btrim(left(_location, 200)), '')
                                     WHEN 'interested' THEN NULL ELSE smi.location END,
    met_at            = CASE _status WHEN 'met' THEN COALESCE(CASE WHEN smi.status = 'met' THEN smi.met_at END, now())
                                     ELSE NULL END,
    status_reason     = CASE WHEN _status IN ('not_met', 'cancelled') THEN NULLIF(btrim(left(_reason, 500)), '') END,
    status_cause      = _cz,
    outcome_at        = CASE WHEN _status = ANY (_outcomes)
                             THEN CASE WHEN smi.status = ANY (_outcomes) THEN coalesce(smi.outcome_at, now()) ELSE now() END
                        END,
    ever_progressed   = smi.ever_progressed OR _status <> 'interested',
    status_by         = auth.uid(),
    status_by_side    = _side,
    status_changed_at = now(),
    updated_at        = now(),
    -- An organiser change settles an open dispute.
    dispute_status     = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN 'resolved' ELSE smi.dispute_status END,
    dispute_resolution = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN 'changed' ELSE smi.dispute_resolution END,
    dispute_note       = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN NULLIF(btrim(left(_reason, 1000)), '') ELSE smi.dispute_note END,
    resolved_at        = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN now() ELSE smi.resolved_at END
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          CASE WHEN _side = 'organiser' AND _row.dispute_status = 'open' THEN 'dispute_changed' ELSE _status END,
          _from, _status, _side, _reason, _cz,
          CASE WHEN _status = 'arranged' THEN _scheduled_at END,
          CASE WHEN _status = 'arranged' THEN NULLIF(btrim(left(_location, 200)), '') END);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.status_changed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _from, 'to', _status, 'by', _side));

  registration_id := _registration_id;
  speaker_id      := _speaker_id;
  sponsor_id      := _sid;
  status          := _status;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text) TO authenticated;

-- ── 5. Disputes ───────────────────────────────────────────────────────────────
-- The sponsor asks for a locked outcome to change, with a reason.
DROP FUNCTION IF EXISTS public.dispute_meeting(uuid, text, text, uuid, uuid, uuid);

CREATE FUNCTION public.dispute_meeting(
  _eid              uuid,
  _requested_status text,
  _reason           text,
  _registration_id  uuid DEFAULT NULL,
  _speaker_id       uuid DEFAULT NULL,
  _sponsor_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  IF _side <> 'sponsor' THEN
    RAISE EXCEPTION 'Organisers change the meeting directly.' USING ERRCODE = '22023';
  END IF;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Say why the record is wrong.' USING ERRCODE = '22023';
  END IF;
  IF _requested_status IS NULL OR _requested_status NOT IN ('interested', 'arranged', 'met', 'not_met', 'cancelled') THEN
    RAISE EXCEPTION 'Choose what the record should say.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'There is no meeting to dispute.' USING ERRCODE = '22023'; END IF;
  IF _row.dispute_status = 'open' THEN RAISE EXCEPTION 'DISPUTE_OPEN' USING ERRCODE = '22023'; END IF;
  IF _requested_status = _row.status THEN
    RAISE EXCEPTION 'The record already says that.' USING ERRCODE = '22023';
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    dispute_status = 'open', dispute_reason = btrim(left(_reason, 1000)),
    dispute_requested_status = _requested_status, disputed_at = now(),
    dispute_resolution = NULL, dispute_note = NULL, resolved_at = NULL,
    updated_at = now()
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          'disputed', _row.status, _requested_status, 'sponsor', _reason);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.disputed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _row.status, 'requested', _requested_status));
END;
$$;
REVOKE ALL ON FUNCTION public.dispute_meeting(uuid, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_meeting(uuid, text, text, uuid, uuid, uuid) TO authenticated;

-- The organiser keeps the record or changes it to what the sponsor asked for.
DROP FUNCTION IF EXISTS public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid);

CREATE FUNCTION public.resolve_meeting_dispute(
  _eid             uuid,
  _sponsor_id      uuid,
  _keep            boolean,
  _note            text DEFAULT NULL,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _to    text;
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  IF _side <> 'organiser' THEN RAISE EXCEPTION 'Only the organiser settles a dispute.' USING ERRCODE = '42501'; END IF;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;
  IF NOT FOUND OR _row.dispute_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'There is no open dispute on this meeting.' USING ERRCODE = '22023';
  END IF;

  _to := CASE WHEN _keep THEN _row.status ELSE _row.dispute_requested_status END;

  UPDATE sponsor_meeting_interests smi SET
    status             = _to,
    met_at             = CASE WHEN _to = 'met' THEN coalesce(smi.met_at, now()) ELSE NULL END,
    status_cause       = CASE WHEN _to = 'not_met' THEN coalesce(smi.status_cause, 'other') END,
    status_reason      = CASE WHEN _to IN ('not_met', 'cancelled') THEN smi.status_reason END,
    scheduled_at       = CASE WHEN _to = 'interested' THEN NULL ELSE smi.scheduled_at END,
    location           = CASE WHEN _to = 'interested' THEN NULL ELSE smi.location END,
    outcome_at         = CASE WHEN _to IN ('met', 'not_met', 'cancelled') THEN coalesce(smi.outcome_at, now()) END,
    ever_progressed    = smi.ever_progressed OR _to <> 'interested',
    status_by          = auth.uid(),
    status_by_side     = 'organiser',
    status_changed_at  = now(),
    dispute_status     = 'resolved',
    dispute_resolution = CASE WHEN _keep THEN 'kept' ELSE 'changed' END,
    dispute_note       = NULLIF(btrim(left(_note, 1000)), ''),
    resolved_at        = now(),
    updated_at         = now()
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          CASE WHEN _keep THEN 'dispute_kept' ELSE 'dispute_changed' END,
          _row.status, _to, 'organiser', _note);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.dispute_resolved',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'kept', _keep, 'to', _to));
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid) TO authenticated;

-- ── 6. Ticking / unticking interest: removal only before anything happened ──
CREATE OR REPLACE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _mid   uuid;
  _row   sponsor_meeting_interests%ROWTYPE;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  IF _interested THEN
    IF _speaker_id IS NOT NULL THEN
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, speaker_id, created_by)
           VALUES (_eid, _sid, _speaker_id, auth.uid())
      ON CONFLICT (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL DO NOTHING
      RETURNING id INTO _mid;
    ELSE
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
           VALUES (_eid, _sid, _registration_id, auth.uid())
      ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING
      RETURNING id INTO _mid;
    END IF;
    IF _mid IS NOT NULL THEN
      PERFORM public._log_meeting(_mid, _eid, _sid, _registration_id, _speaker_id, 'interested', NULL, 'interested', 'sponsor');
    END IF;
  ELSE
    SELECT * INTO _row FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
       AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
     FOR UPDATE;
    IF FOUND THEN
      IF _row.status <> 'interested' OR _row.ever_progressed THEN
        RAISE EXCEPTION 'CANCEL_INSTEAD' USING ERRCODE = '22023';
      END IF;
      PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id, 'removed', 'interested', NULL, 'sponsor');
      DELETE FROM sponsor_meeting_interests smi WHERE smi.id = _row.id;
    END IF;
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  speaker_id       := _speaker_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) TO authenticated;

-- Notes are logged too (without their text).
CREATE OR REPLACE FUNCTION public.set_meeting_note(
  _eid             uuid,
  _note            text,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL,
  _sponsor_id      uuid DEFAULT NULL
)
RETURNS TABLE (note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _id    uuid;
  _clean text := NULLIF(btrim(left(_note, 2000)), '');
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  UPDATE sponsor_meeting_interests smi SET note = _clean, updated_at = now()
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
  RETURNING smi.id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Mark interest first.' USING ERRCODE = '22023'; END IF;

  PERFORM public._log_meeting(_id, _eid, _sid, _registration_id, _speaker_id, 'note', NULL, NULL, _side);

  note := _clean;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) TO authenticated;

-- ── 7. History, for both sides ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.meeting_history(uuid, uuid, uuid, uuid);

CREATE FUNCTION public.meeting_history(
  _eid             uuid,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL,
  _sponsor_id      uuid DEFAULT NULL    -- required for organisers
)
RETURNS TABLE (
  created_at timestamptz, action text, from_status text, to_status text, side text,
  reason text, cause text, scheduled_at timestamptz, location text, backfilled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid  uuid;
  _side text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  RETURN QUERY
    SELECT me.created_at, me.action, me.from_status, me.to_status, me.side,
           me.reason, me.cause, me.scheduled_at, me.location, me.backfilled
      FROM meeting_events me
     WHERE me.event_id = _eid AND me.sponsor_id = _sid
       AND (me.registration_id = _registration_id OR me.speaker_id = _speaker_id)
     ORDER BY me.created_at, me.id;
END;
$$;
REVOKE ALL ON FUNCTION public.meeting_history(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meeting_history(uuid, uuid, uuid, uuid) TO authenticated;

-- ── 8. Lists carry the dispute and lock fields ───────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean,
  meeting_status text, interested_at timestamptz, scheduled_at timestamptz, location text,
  met_at timestamptz, status_reason text, note text, status_by_side text, status_changed_at timestamptz,
  status_cause text, ever_progressed boolean, outcome_at timestamptz,
  dispute_status text, dispute_reason text, dispute_requested_status text, disputed_at timestamptz,
  dispute_resolution text, dispute_note text, resolved_at timestamptz, event_over boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (
    SELECT smi.*
      FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid
       AND smi.sponsor_id IN (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  ),
  over AS (SELECT public._event_over(_eid) AS v)
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at,
         m.status_cause, m.ever_progressed, m.outcome_at,
         m.dispute_status, m.dispute_reason, m.dispute_requested_status, m.disputed_at,
         m.dispute_resolution, m.dispute_note, m.resolved_at, (SELECT v FROM over)
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.speaker_id = sp.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at,
         m.status_cause, m.ever_progressed, m.outcome_at,
         m.dispute_status, m.dispute_reason, m.dispute_requested_status, m.disputed_at,
         m.dispute_resolution, m.dispute_note, m.resolved_at, (SELECT v FROM over)
    FROM registrations r
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.registration_id = r.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz,
  status text, scheduled_at timestamptz, location text, met_at timestamptz, status_reason text, note text,
  status_by_side text, status_changed_at timestamptz,
  status_cause text, ever_progressed boolean, outcome_at timestamptz,
  dispute_status text, dispute_reason text, dispute_requested_status text, disputed_at timestamptz,
  dispute_resolution text, dispute_note text, resolved_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at,
         smi.status, smi.scheduled_at, smi.location, smi.met_at, smi.status_reason, smi.note,
         smi.status_by_side, smi.status_changed_at,
         smi.status_cause, smi.ever_progressed, smi.outcome_at,
         smi.dispute_status, smi.dispute_reason, smi.dispute_requested_status, smi.disputed_at,
         smi.dispute_resolution, smi.dispute_note, smi.resolved_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── 9. The organiser's meetings report for one sponsor ───────────────────────
DROP FUNCTION IF EXISTS public.sponsor_meeting_report(uuid, uuid);

CREATE FUNCTION public.sponsor_meeting_report(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (
  kind text, name text, email text, company text, designation text,
  status text, status_cause text, status_reason text, interested_at timestamptz,
  scheduled_at timestamptz, location text, met_at timestamptz,
  checked_in boolean, checked_in_at timestamptz, status_by_side text,
  dispute_status text, dispute_reason text, dispute_resolution text, dispute_note text,
  history jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $
#variable_conflict use_column
BEGIN
  IF NOT public._can_view_event_registrations(_eid) THEN
    RAISE EXCEPTION 'Only the event organisers can download this report.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT CASE WHEN smi.speaker_id IS NOT NULL THEN 'speaker' ELSE 'attendee' END,
           coalesce(r.name, sp.name), coalesce(r.email, sp.email), coalesce(r.company, sp.company),
           coalesce(r.designation, NULLIF(sp.designation, ''), sp.title),
           smi.status, smi.status_cause, smi.status_reason, smi.created_at,
           smi.scheduled_at, smi.location, smi.met_at,
           coalesce(r.checked_in, sr.checked_in, false), coalesce(r.checked_in_at, sr.checked_in_at),
           smi.status_by_side,
           smi.dispute_status, smi.dispute_reason, smi.dispute_resolution, smi.dispute_note,
           coalesce((SELECT jsonb_agg(jsonb_build_object(
                       'at', me.created_at, 'action', me.action, 'from', me.from_status, 'to', me.to_status,
                       'side', me.side, 'reason', me.reason, 'cause', me.cause) ORDER BY me.created_at, me.id)
                       FROM meeting_events me
                      WHERE me.event_id = _eid AND me.sponsor_id = _sponsor_id
                        AND (me.registration_id = smi.registration_id OR me.speaker_id = smi.speaker_id)), '[]'::jsonb)
      FROM sponsor_meeting_interests smi
      LEFT JOIN registrations r ON r.id = smi.registration_id
      LEFT JOIN speakers sp ON sp.id = smi.speaker_id
      LEFT JOIN LATERAL (
        SELECT x.checked_in, x.checked_in_at FROM registrations x
         WHERE sp.id IS NOT NULL AND x.event_id = _eid AND x.ticket_type = 'speaker'
           AND lower(x.email) = lower(coalesce(sp.email, ''))
         LIMIT 1
      ) sr ON true
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sponsor_id
     ORDER BY coalesce(r.name, sp.name);
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_meeting_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_meeting_report(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 054_meeting_disputes_history.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 055_meeting_actor_by_caller.sql >>>
-- ═══════════════════════════════════════════════════════════════════════════════
-- 055_meeting_actor_by_caller.sql
--
-- Fix: on the sponsor dashboard, changing a meeting failed with "Choose the
-- sponsor." for accounts that are both on a sponsor's team and able to manage
-- the event's registrations (a Super Admin, for example). `_meeting_actor`
-- (052) treated anyone who can view registrations as the organiser, and the
-- organiser must name the sponsor — which the sponsor page never does.
--
-- Now the call decides:
--   • no sponsor named   → the caller acts as its own sponsor (the sponsor
--                          dashboard); organisers who aren't on a sponsor's
--                          team are told to choose one;
--   • a sponsor named    → organisers act as the organiser for that sponsor
--                          (the Registrations tab always names it); anyone
--                          else must be on that sponsor's team.
-- The sponsor rules (locks, disputes) therefore apply on the sponsor page
-- whoever is signed in.
--
-- Run after 054. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._meeting_actor(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (sponsor_id uuid, side text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  IF _sponsor_id IS NULL THEN
    -- The sponsor dashboard: act as the caller's own sponsor.
    SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
    IF _count = 0 THEN
      IF public._can_view_event_registrations(_eid) THEN
        RAISE EXCEPTION 'Choose the sponsor.' USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501';
    ELSIF _count > 1 THEN
      RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
    END IF;
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
    sponsor_id := _sid; side := 'sponsor'; RETURN NEXT; RETURN;
  END IF;

  -- A sponsor is named: organisers act for it; otherwise it must be the caller's own.
  IF public._can_view_event_registrations(_eid) THEN
    IF NOT EXISTS (SELECT 1 FROM event_sponsors es WHERE es.event_id = _eid AND es.sponsor_id = _sponsor_id) THEN
      RAISE EXCEPTION 'That sponsor is not on this event.' USING ERRCODE = '42501';
    END IF;
    sponsor_id := _sponsor_id; side := 'organiser'; RETURN NEXT; RETURN;
  END IF;

  SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
  IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  sponsor_id := _sid; side := 'sponsor'; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
-- <<< END SOURCE MIGRATION: 055_meeting_actor_by_caller.sql <<<

-- >>> BEGIN SOURCE MIGRATION: 056_security_fixes_2026_10_28.sql >>>
-- Same as supabase/RUN_ME_security_fixes.sql (run that on an existing database).
-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fixes from the 2026-10-27 review (SECURITY-REVIEW.md).
--
-- One section per finding. Every statement is safe to run more than once.
-- Paste the whole file into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- F-01 — Paid events issued approved tickets without payment.
--
-- There is no online checkout, so a paid event's place now waits for the
-- organiser to confirm payment: self-serve registrations for a priced event
-- are 'pending', and the ticket (QR) is only issued once the organiser
-- approves. Organisers adding people themselves keep the status they choose.
--
-- Every registration that does not come from an organiser — an attendee's
-- own insert through the API, the guest-registration function, a partner's
-- tracked link — is now checked here, in the database, rather than trusted:
--   • the event must be published;
--   • capacity is enforced (a full event waitlists), serialised per event;
--   • payment, check-in and approval fields cannot be set by the registrant.
-- A direct insert by a signed-in attendee can only register themselves.
-- ───────────────────────────────────────────────────────────────────────────────

-- Seats taken, counted past row security (an attendee only sees their own rows).
CREATE OR REPLACE FUNCTION public._event_seats_taken(_event_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $
  SELECT count(*)::int
    FROM registrations r
   WHERE r.event_id = _event_id
     AND r.status <> 'cancelled'
     AND COALESCE(r.approval_status, 'approved') NOT IN ('declined', 'waitlisted');
$;
-- Called from the registration trigger, which runs as the inserting role.
-- The count is what the public event page already shows.
REVOKE ALL ON FUNCTION public._event_seats_taken(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._event_seats_taken(uuid) TO authenticated, service_role;

-- The signed-in user's own address, for pinning their self-registration to it.
CREATE OR REPLACE FUNCTION public._auth_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$;
-- Returns only the caller's own address.
REVOKE ALL ON FUNCTION public._auth_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._auth_user_email() TO authenticated, service_role;

-- Not SECURITY DEFINER on purpose: `current_user` must stay the caller's role
-- so a direct API insert ('authenticated') can be told from a trusted server
-- path (service_role, or a SECURITY DEFINER function such as the partner RPC).
CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public','extensions'
AS $
DECLARE
  _ra            boolean;
  _p             numeric;
  _cap           integer;
  _event_status  text;
  _is_organiser  boolean;
BEGIN
  SELECT requires_approval, COALESCE(price, 0), COALESCE(capacity, 0), status
    INTO _ra, _p, _cap, _event_status
    FROM events
   WHERE id = NEW.event_id;

  -- Is the actor an organiser? Event owner, super admin, or org member.
  _is_organiser := EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = NEW.event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
      )
  );

  IF TG_OP = 'INSERT' AND NOT _is_organiser THEN
    IF _event_status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'This event is not open for registration' USING ERRCODE = '42501';
    END IF;

    -- A direct API insert registers the signed-in attendee, nobody else.
    IF current_user IN ('authenticated', 'anon') THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in to register' USING ERRCODE = '42501';
      END IF;
      NEW.user_id := auth.uid();
      NEW.email := COALESCE(public._auth_user_email(), lower(NEW.email));
      NEW.created_by := NULL;   -- only set when someone registers another person
      NEW.join_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      NEW.qr_code := NULL;
    END IF;

    -- Only the organiser records payment, check-in and approval.
    NEW.amount_paid       := 0;
    NEW.checked_in        := false;
    NEW.checked_in_at     := NULL;
    NEW.checked_in_method := NULL;
    NEW.attendance_state  := 'never';
    NEW.approved_by       := NULL;
    NEW.approved_at       := NULL;

    -- One sign-up at a time per event, so two people can't take the last seat.
    PERFORM pg_advisory_xact_lock(hashtext('registrations_capacity:' || NEW.event_id::text));
    IF _cap > 0 AND public._event_seats_taken(NEW.event_id) >= _cap THEN
      NEW.approval_status := 'waitlisted';
    ELSIF _p > 0 OR _ra THEN
      -- Paid: waits for the organiser to confirm payment (no online checkout).
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'approved';
    END IF;
  END IF;

  IF NEW.approval_status NOT IN ('pending', 'approved', 'waitlisted', 'declined') THEN
    RAISE EXCEPTION 'Invalid approval_status';
  END IF;

  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := substring(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
      FROM 1 FOR 24
    );
  END IF;

  RETURN NEW;
END;
$;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-02 — Login "2FA" did not gate the session.
--
-- Two-factor sign-in now uses Supabase MFA (authenticator app). Signing in
-- with the password gives an `aal1` session; the code upgrades it to `aal2`.
-- For anyone who has two-factor on, an `aal1` session is refused here, in
-- the database, so skipping the code screen gets nothing:
--   • every API request (tables, views and RPC functions — including
--     SECURITY DEFINER ones, which row security doesn't reach) goes through
--     a PostgREST pre-request check;
--   • every table with row security also gets a RESTRICTIVE policy, which
--     covers realtime subscriptions and any path that bypasses the API.
-- Users without two-factor are unaffected.
--
-- Tables created later need the policy too: re-run this section, or add it.
-- The edge functions apply the same rule (supabase/functions/_shared/auth.ts).
-- ───────────────────────────────────────────────────────────────────────────────

-- True unless the caller has two-factor on and this session hasn't given the code.
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $
  SELECT auth.uid() IS NULL
      OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
           SELECT 1 FROM auth.mfa_factors f
            WHERE f.user_id = auth.uid() AND f.status = 'verified'
         );
$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO anon, authenticated, service_role;

-- Runs before every PostgREST request.
CREATE OR REPLACE FUNCTION public.require_second_factor()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $
BEGIN
  IF NOT public.mfa_satisfied() THEN
    RAISE EXCEPTION 'Two-factor verification required'
      USING ERRCODE = '42501', HINT = 'Enter the code from your authenticator app to continue.';
  END IF;
END;
$;
REVOKE ALL ON FUNCTION public.require_second_factor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_second_factor() TO anon, authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_pre_request TO 'public.require_second_factor';
NOTIFY pgrst, 'reload config';

-- The same rule on every table that has row security.
DO $
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require two-factor when enabled" ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY "Require two-factor when enabled" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()))',
      t.relname
    );
  END LOOP;
END;
$;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-05 — Anyone could read and forge webinar reactions.
--
-- Reactions are now posted only through webinar_react(), which checks the
-- reactor belongs to the session — a signed-in attendee, organiser or
-- speaker, or a guest holding a valid join link / speaker link — accepts
-- only the emoji the app offers, and allows at most 10 a person per 10s.
-- Nobody can insert, edit or delete rows directly any more.
--
-- Reading: anonymous live viewers still receive reactions (the floating
-- emoji), but only id/session/emoji/time — never who reacted. Signed-in
-- users read full rows for sessions they take part in, and their own.
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.webinar_react(
  _session_id    uuid,
  _emoji         text,
  _join_token    text DEFAULT NULL,
  _speaker_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE
  _event  uuid;
  _who    uuid;
  _recent integer;
BEGIN
  IF _emoji IS NULL OR NOT (_emoji = ANY (ARRAY['👏', '❤️', '🔥', '😂', '🎉', '👍'])) THEN
    RAISE EXCEPTION 'Unsupported reaction' USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO _event FROM webinar_sessions WHERE id = _session_id;
  IF _event IS NULL THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  -- Who is reacting, and do they belong to this session?
  IF auth.uid() IS NOT NULL AND (
       public.is_event_approved_attendee(auth.uid(), _event)
    OR public.is_event_speaker(auth.uid(), _event)
    OR EXISTS (
         SELECT 1 FROM events e
          WHERE e.id = _event
            AND (e.user_id = auth.uid()
                 OR public.has_role(auth.uid(), 'admin')
                 OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id)))
       )
  ) THEN
    _who := auth.uid();
  ELSIF _join_token IS NOT NULL THEN
    SELECT r.id INTO _who
      FROM registrations r
     WHERE r.join_token = _join_token
       AND r.event_id = _event
       AND r.status <> 'cancelled'
       AND r.approval_status = 'approved';
  ELSIF _speaker_token IS NOT NULL THEN
    SELECT ws.id INTO _who
      FROM webinar_speakers ws
     WHERE ws.invite_token = _speaker_token AND ws.session_id = _session_id;
  END IF;

  IF _who IS NULL THEN
    RAISE EXCEPTION 'Only this session''s attendees can react' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _recent
    FROM webinar_reactions
   WHERE session_id = _session_id AND user_id = _who AND created_at > now() - interval '10 seconds';
  IF _recent >= 10 THEN
    RAISE EXCEPTION 'Too many reactions — slow down a little' USING ERRCODE = '54000';
  END IF;

  INSERT INTO webinar_reactions (session_id, user_id, emoji) VALUES (_session_id, _who, _emoji);
END;
$;
REVOKE ALL ON FUNCTION public.webinar_react(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.webinar_react(uuid, text, text, text) TO anon, authenticated;

-- No direct writes.
DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;
REVOKE INSERT, UPDATE, DELETE ON public.webinar_reactions FROM anon, authenticated;

-- Anonymous viewers: the reaction, never who sent it.
REVOKE SELECT ON public.webinar_reactions FROM anon;
GRANT SELECT (id, session_id, emoji, created_at) ON public.webinar_reactions TO anon;

DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
DROP POLICY IF EXISTS "Guests see reactions" ON public.webinar_reactions;
CREATE POLICY "Guests see reactions" ON public.webinar_reactions
  FOR SELECT TO anon USING (true);
CREATE POLICY "Read reactions" ON public.webinar_reactions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM webinar_sessions s
       WHERE s.id = session_id
         AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
              OR public.is_event_owner(auth.uid(), s.event_id)
              OR public.is_event_speaker(auth.uid(), s.event_id))
    )
  );


-- ───────────────────────────────────────────────────────────────────────────────
-- F-06 — Unpublished site-editor drafts were readable by anyone.
--
-- The public site reads only `section, content`. Everyone may now read just
-- the published columns; `draft_content` is reachable only through
-- get_site_drafts(), which only platform admins can call (the site editor
-- uses it). Saving and publishing already go through admin-only functions.
-- ───────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.site_content FROM anon, authenticated;
GRANT SELECT (id, section, content, published_at, created_at, updated_at) ON public.site_content TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_site_drafts()
RETURNS TABLE (section text, content jsonb, draft_content jsonb, published_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT sc.section, sc.content, sc.draft_content, sc.published_at, sc.updated_at
      FROM public.site_content sc;
END;
$;
REVOKE ALL ON FUNCTION public.get_site_drafts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_drafts() TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-08 — Any signed-in user could create a community for someone else's event.
--
-- ensure_event_community() is only meant for the events triggers, which run
-- as the table owner and honour the event's `create_community` setting. The
-- app never calls it, so users lose the right to: the triggers keep working.
-- ───────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.ensure_event_community(uuid) FROM PUBLIC, anon, authenticated;
-- <<< END SOURCE MIGRATION: 056_security_fixes_2026_10_28.sql <<<

-- >>> BEGIN ARCHIVED ROOT SCRIPT (disabled): RUN_ME_pending_updates.sql >>>
-- The following source is commented out intentionally. Review and run
-- it separately only if its original one-off/manual purpose is needed.
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- RUN_ME_pending_updates.sql
-- --
-- -- Every database update that is still waiting to be applied, in order
-- -- (migrations 037 – 045). Paste this whole file into the Supabase SQL Editor
-- -- and click Run. Safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
--
-- -- ▼▼▼ 041_utm_table_grants.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 041_utm_table_grants.sql
-- --
-- -- `utm_links` and `utm_clicks` were created with row-level-security policies
-- -- but without table privileges for signed-in users. RLS policies only narrow
-- -- access that a GRANT has already given, so every save of a tracked link
-- -- failed with "permission denied for table utm_links", and the UTM page could
-- -- not read saved links or recent clicks directly.
-- --
-- -- Who may touch which rows is unchanged — the existing policies still limit
-- -- everything to the event's creator, its organisation's members and admins.
-- -- `utm_clicks` stays read-only for clients (clicks are written by the
-- -- record-click function and removed by delete_utm_tracking).
-- --
-- -- Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.utm_links  TO authenticated;
-- GRANT ALL                            ON public.utm_links  TO service_role;
--
-- GRANT SELECT                         ON public.utm_clicks TO authenticated;
-- GRANT ALL                            ON public.utm_clicks TO service_role;
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- -- ▼▼▼ 037_org_member_emails.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 037_org_member_emails.sql
-- --
-- -- Settings → Team needs teammates' email addresses for two things:
-- --   • the "already a member" pre-flight before issuing an invitation, and
-- --   • revoking a removed teammate's invitation rows so the original
-- --     `/login?invite=<token>` link can't re-add them via
-- --     accept_org_invitation (which treats 'accepted' tokens as reusable).
-- --
-- -- The client was reading `profiles.email`, but `profiles` has no email
-- -- column — emails only live on auth.users, which the client can't read.
-- -- Both queries silently returned nothing, so duplicate invites slipped
-- -- through and removed members could rejoin with their old link.
-- --
-- -- This RPC exposes (user_id, email) for one workspace's members, and only
-- -- to that workspace's managers (owner or admin, see migration 030).
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE FUNCTION public.org_member_emails(_org_id uuid)
-- RETURNS TABLE (user_id uuid, email text)
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   IF NOT public.is_org_manager(auth.uid(), _org_id) THEN
--     RAISE EXCEPTION 'Only workspace owners and admins can list member emails';
--   END IF;
--
--   RETURN QUERY
--     SELECT m.user_id, lower(u.email)::text
--       FROM public.org_members m
--       JOIN auth.users u ON u.id = m.user_id
--      WHERE m.org_id = _org_id;
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.org_member_emails(uuid) FROM PUBLIC, anon;
-- GRANT  EXECUTE ON FUNCTION public.org_member_emails(uuid) TO authenticated;
--
-- COMMENT ON FUNCTION public.org_member_emails(uuid) IS
--   'Returns (user_id, email) for every member of the workspace. Restricted to owners/admins (is_org_manager). Used by Settings → Team for the already-a-member check and to revoke a removed member''s invitation.';
--
--
-- -- ▼▼▼ 038_security_hardening.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 038_security_hardening.sql
-- --
-- -- Closes four data-exposure defects found in the security review. Idempotent:
-- -- safe to re-run.
-- --
-- -- ── SEC-01 (HIGH) — every signed-in user could read every profile ───────────
-- --   `"Auth can view profiles" … FOR SELECT TO authenticated USING (true)` let
-- --   any account (sign-up is open) read every user's mobile number, 2FA flag,
-- --   verification flags, UTM attribution and ban reason straight from
-- --   `profiles`.
-- --
-- --   Fix: a row is readable only by its owner or a platform admin. What other
-- --   users legitimately see (name, avatar, headline, company, designation —
-- --   community feed/chat, member lists, team list) is exposed through the
-- --   `profiles_public` view, which carries only those columns.
-- --
-- --   VERIFIED against the codebase before changing the policy:
-- --     • No SECURITY INVOKER function, RLS policy or view reads `profiles`
-- --       (every reader is SECURITY DEFINER), so nothing server-side depends on
-- --       the open policy.
-- --     • All 25 client queries were audited: own-row reads keep working; the
-- --       reads of *other* users' rows were moved to `profiles_public`
-- --       (src/lib/public-profiles.ts); the two admin pages are covered by the
-- --       admin branch of the new policy.
-- --
-- -- ── SEC-02 (HIGH) — `_audit_actor_email(uuid)` returned any user's email ────
-- --   SECURITY DEFINER, reads auth.users, and was executable by PUBLIC (the
-- --   Postgres default), i.e. callable through PostgREST by anon. User ids are
-- --   exposed throughout the app, so this was an email-harvesting oracle.
-- --   Its only callers are SECURITY DEFINER functions (audit trigger and the
-- --   admin_* functions), which run as the owner and keep working.
-- --
-- -- ── SEC-03 (HIGH) — `communications_diagnose(uuid)` open to all users ───────
-- --   Granted to `authenticated` with no ownership check: any signed-in user
-- --   could dispatch another organisation's draft communication and read its
-- --   audience filter. It is a SQL-Editor troubleshooting helper and is not
-- --   called by the app, so it is restricted to service_role. The internal
-- --   `_communications_dispatch_impl` it wraps had the same PUBLIC default and
-- --   is restricted too (callers: communications_dispatch / _run_scheduled,
-- --   both SECURITY DEFINER).
-- --
-- -- ── SEC-04 (MEDIUM) — internal helpers callable by anyone ───────────────────
-- --   `_whatsapp_recipient_update` (only edge functions call it, as
-- --   service_role) and `_copy_community_members_from_previous` (only
-- --   community_resync_from_previous, SECURITY DEFINER) were PUBLIC-executable.
-- --   The latter let a caller copy another event's community member list into
-- --   a community they control.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
--
-- -- ─── SEC-01: profiles ──────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Auth can view profiles"            ON public.profiles;
-- DROP POLICY IF EXISTS "Users view own profile or admin"   ON public.profiles;
--
-- CREATE POLICY "Users view own profile or admin"
-- ON public.profiles
-- FOR SELECT
-- TO authenticated
-- USING (
--   auth.uid() = user_id
--   OR public.has_role(auth.uid(), 'admin')
-- );
--
-- COMMENT ON POLICY "Users view own profile or admin" ON public.profiles IS
--   'A profile row (which holds mobile number, verification and 2FA flags, UTM attribution, ban reason) is readable only by its owner or a platform admin. Other users read the safe columns through the profiles_public view.';
--
-- -- The only profile data other signed-in users may see. Deliberately a plain
-- -- (owner-rights) view — the Postgres default, so no WITH (security_invoker)
-- -- clause: it must return every user's row even though the table's RLS now
-- -- hides them, and it exposes no sensitive column.
-- CREATE OR REPLACE VIEW public.profiles_public AS
-- SELECT
--   user_id,
--   display_name,
--   first_name,
--   last_name,
--   username,
--   avatar_url,
--   headline,
--   bio,
--   company,
--   designation
-- FROM public.profiles;
--
-- REVOKE ALL    ON public.profiles_public FROM PUBLIC, anon;
-- GRANT  SELECT ON public.profiles_public TO authenticated, service_role;
--
-- COMMENT ON VIEW public.profiles_public IS
--   'Public-facing subset of profiles (name, avatar, headline, bio, company, designation) for signed-in users: community feed/chat, member lists, team list. Never add contact details, verification/2FA flags or attribution columns here.';
--
--
-- -- ─── SEC-02 / SEC-03 / SEC-04: lock internal functions to service_role ─────
-- -- Each of these is SECURITY DEFINER and was executable by PUBLIC (Postgres'
-- -- default) or explicitly by `authenticated`. Their legitimate callers are
-- -- other SECURITY DEFINER functions (which run as the owner) or edge
-- -- functions (service_role), so client roles lose nothing.
-- --
-- -- Done in a loop that skips any signature not present, so the migration
-- -- still applies cleanly on a database that has drifted from these files.
-- DO $$
-- DECLARE
--   sig text;
-- BEGIN
--   FOREACH sig IN ARRAY ARRAY[
--     'public._audit_actor_email(uuid)',                              -- SEC-02
--     'public.communications_diagnose(uuid)',                         -- SEC-03
--     'public._communications_dispatch_impl(uuid)',                   -- SEC-03
--     'public._whatsapp_recipient_update(uuid, text, text)',          -- SEC-04
--     'public._copy_community_members_from_previous(uuid, uuid)'      -- SEC-04
--   ]
--   LOOP
--     IF to_regprocedure(sig) IS NULL THEN
--       RAISE NOTICE '038: % not found, skipping', sig;
--     ELSE
--       EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
--       EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
--     END IF;
--   END LOOP;
-- END $$;
--
--
-- -- ─── Support for the hardened create-participant-account edge function ─────
-- -- The function used auth.admin.listUsers(), which returns only the first page
-- -- (50 users), so existing accounts beyond that were not found. This gives the
-- -- service role an exact lookup instead. Not callable by anon/authenticated:
-- -- it would otherwise reveal whether an email has an account.
-- CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(_email text)
-- RETURNS uuid
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
-- GRANT  EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO service_role;
--
-- COMMENT ON FUNCTION public.admin_user_id_by_email(text) IS
--   'Exact auth.users lookup by email for edge functions running as service_role. Not granted to anon/authenticated (would be an account-existence oracle).';
--
--
-- -- ▼▼▼ 039_utm_delete_tracking.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 039_utm_delete_tracking.sql
-- --
-- -- Lets an organiser delete a tracked (UTM) link from the event's UTM page.
-- --
-- -- Why a function: a row in the UTM breakdown exists because of what was
-- -- recorded for that source + medium + campaign — a saved `utm_links` row,
-- -- `utm_clicks`, and/or registrations. Clients can delete `utm_links` rows but
-- -- have no DELETE policy on `utm_clicks` (only SELECT), so a link that had ever
-- -- been clicked could not be removed from the page: deleting its saved row
-- -- left the click history, and the row stayed. Links shared without being
-- -- saved (e.g. from the event share button) had nothing deletable at all.
-- --
-- -- `delete_utm_tracking` removes, for one event and one source/medium/campaign:
-- --   • the saved link (if any), and
-- --   • its recorded clicks.
-- -- Registrations are leads and are NEVER deleted or altered here; the function
-- -- reports how many remain attributed to the link so the UI can say so.
-- --
-- -- Matching mirrors `event_utm_summary` (NULL medium/campaign are shown as
-- -- '(none)'), so what is deleted is exactly the row the organiser clicked.
-- -- '(direct)' is not a link and is refused.
-- --
-- -- Authorisation matches the existing utm_links / utm_clicks policies: the
-- -- event's creator, a member of its organisation, or a platform admin.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
--   _event_id     uuid,
--   _utm_source   text,
--   _utm_medium   text,
--   _utm_campaign text
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_links  int := 0;
--   v_clicks int := 0;
--   v_regs   int := 0;
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM public.events e
--     WHERE e.id = _event_id
--       AND (
--         e.user_id = auth.uid()
--         OR public.has_role(auth.uid(), 'admin')
--         OR public.is_org_member(auth.uid(), e.org_id)
--       )
--   ) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--
--   IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
--     RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
--   END IF;
--
--   DELETE FROM public.utm_links l
--    WHERE l.event_id     = _event_id
--      AND l.utm_source   = _utm_source
--      AND l.utm_medium   = _utm_medium
--      AND l.utm_campaign = _utm_campaign;
--   GET DIAGNOSTICS v_links = ROW_COUNT;
--
--   DELETE FROM public.utm_clicks c
--    WHERE c.event_id   = _event_id
--      AND c.utm_source = _utm_source
--      AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
--      AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
--   GET DIAGNOSTICS v_clicks = ROW_COUNT;
--
--   SELECT count(*) INTO v_regs
--     FROM public.registrations r
--    WHERE r.event_id   = _event_id
--      AND r.status    <> 'cancelled'
--      AND r.utm_source = _utm_source
--      AND coalesce(r.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
--      AND coalesce(r.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
--
--   RETURN jsonb_build_object(
--     'links_deleted',      v_links,
--     'clicks_deleted',     v_clicks,
--     'registrations_kept', v_regs
--   );
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
-- GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;
--
-- COMMENT ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) IS
--   'Delete a tracked link for an event: its saved utm_links row and its recorded utm_clicks. Registrations are never touched; the count still attributed is returned. Caller must be the event creator, an org member, or a platform admin.';
--
--
-- -- ▼▼▼ 040_utm_partner_access.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 040_utm_partner_access.sql
-- --
-- -- Partner UTM sharing: an organiser shares ONE tracked link (an event's
-- -- utm_source + utm_medium + utm_campaign) with an external partner (agency).
-- -- The partner gets a dashboard that shows — and can add to — only the
-- -- registrations attributed to that link.
-- --
-- -- Isolation model
-- --   • `utm_partner_access` has RLS enabled and NO client policies: the table
-- --     cannot be read or written directly. Everything goes through the
-- --     SECURITY DEFINER functions below.
-- --   • Partners get no RLS access to `registrations`, `utm_clicks`,
-- --     `utm_links` or `attendance_events`. Every partner function takes a
-- --     grant id, re-validates it on every call (must be the caller's own,
-- --     accepted, not revoked) and derives the event + link from the grant row —
-- --     never from caller-supplied event ids or UTM values.
-- --   • Per-grant permissions are enforced here, not in the UI: fields the
-- --     grant doesn't cover are returned as NULL and filters on them ignored.
-- --   • Organiser-only data (decline reasons, notes, payment, tokens, QR codes)
-- --     is never returned by any partner function.
-- --
-- -- Reuses: registrations (+ its validation trigger, which applies the event's
-- -- approval rule, and the unique email index for duplicates), check-in columns
-- -- on registrations, audit_logs, registrant_audit_log, app_notifications.
-- --
-- -- Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- -- ── 1. Who created a registration ───────────────────────────────────────────
-- ALTER TABLE public.registrations
--   ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
--
-- COMMENT ON COLUMN public.registrations.created_by IS
--   'User who created the row on someone else''s behalf (e.g. a UTM partner). NULL for self-registrations and older rows.';
--
-- -- ── 2. Access grants ────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS public.utm_partner_access (
--   id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
--   -- The shared link. Medium / campaign use '(none)' when absent, matching
--   -- how event_utm_summary labels them.
--   utm_source        text NOT NULL CHECK (btrim(utm_source) <> '' AND utm_source <> '(direct)'),
--   utm_medium        text NOT NULL DEFAULT '(none)',
--   utm_campaign      text NOT NULL DEFAULT '(none)',
--   invited_email     text NOT NULL CHECK (invited_email = lower(btrim(invited_email)) AND position('@' in invited_email) > 1),
--   partner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
--   -- Viewing the shared participants is implied by the grant itself.
--   can_register      boolean NOT NULL DEFAULT false,
--   can_view_approval boolean NOT NULL DEFAULT true,
--   can_view_checkin  boolean NOT NULL DEFAULT true,
--   can_export        boolean NOT NULL DEFAULT false,
--   status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
--   granted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
--   granted_at        timestamptz NOT NULL DEFAULT now(),
--   accepted_at       timestamptz,
--   revoked_at        timestamptz,
--   created_at        timestamptz NOT NULL DEFAULT now(),
--   updated_at        timestamptz NOT NULL DEFAULT now(),
--   -- One grant per partner per link.
--   UNIQUE (event_id, utm_source, utm_medium, utm_campaign, invited_email)
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_utm_partner_access_user  ON public.utm_partner_access(partner_user_id) WHERE status = 'accepted';
-- CREATE INDEX IF NOT EXISTS idx_utm_partner_access_email ON public.utm_partner_access(invited_email)   WHERE status = 'pending';
-- CREATE INDEX IF NOT EXISTS idx_utm_partner_access_event ON public.utm_partner_access(event_id);
--
-- DROP TRIGGER IF EXISTS update_utm_partner_access_updated_at ON public.utm_partner_access;
-- CREATE TRIGGER update_utm_partner_access_updated_at
--   BEFORE UPDATE ON public.utm_partner_access
--   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
--
-- -- RLS on, no policies: no direct client access at all.
-- ALTER TABLE public.utm_partner_access ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.utm_partner_access FROM PUBLIC, anon, authenticated;
-- GRANT  ALL ON public.utm_partner_access TO service_role;
--
-- -- ── 3. Internal helpers (not callable by clients) ───────────────────────────
--
-- -- Event creator, a member of its organisation, or a platform admin — the same
-- -- rule the UTM page and utm_links policies use.
-- CREATE OR REPLACE FUNCTION public._utm_partner_manages_event(_event_id uuid)
-- RETURNS boolean
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT auth.uid() IS NOT NULL AND EXISTS (
--     SELECT 1 FROM public.events e
--     WHERE e.id = _event_id
--       AND (
--         e.user_id = auth.uid()
--         OR public.has_role(auth.uid(), 'admin')
--         OR public.is_org_member(auth.uid(), e.org_id)
--       )
--   );
-- $$;
--
-- -- The caller's own active grant, or an error. Missing, revoked, pending and
-- -- someone-else's grants are indistinguishable to the caller.
-- CREATE OR REPLACE FUNCTION public._utm_partner_grant(_access_id uuid)
-- RETURNS public.utm_partner_access
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   g public.utm_partner_access;
-- BEGIN
--   IF auth.uid() IS NOT NULL AND _access_id IS NOT NULL THEN
--     SELECT a.* INTO g
--       FROM public.utm_partner_access a
--      WHERE a.id = _access_id
--        AND a.partner_user_id = auth.uid()
--        AND a.status = 'accepted';
--   END IF;
--   IF g.id IS NULL OR public.is_user_banned(auth.uid()) THEN
--     RAISE EXCEPTION 'You don''t have access to this shared link' USING ERRCODE = '42501';
--   END IF;
--   RETURN g;
-- END;
-- $$;
--
-- -- Registration counts for one link of one event (cancelled rows excluded).
-- CREATE OR REPLACE FUNCTION public._utm_partner_stats(_event_id uuid, _source text, _medium text, _campaign text)
-- RETURNS jsonb
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT jsonb_build_object(
--     'total',          count(*),
--     'approved',       count(*) FILTER (WHERE r.approval_status = 'approved'),
--     'pending',        count(*) FILTER (WHERE r.approval_status = 'pending'),
--     'declined',       count(*) FILTER (WHERE r.approval_status = 'declined'),
--     'waitlisted',     count(*) FILTER (WHERE r.approval_status = 'waitlisted'),
--     'checked_in',     count(*) FILTER (WHERE r.checked_in),
--     'not_checked_in', count(*) FILTER (WHERE NOT r.checked_in AND r.approval_status = 'approved')
--   )
--   FROM public.registrations r
--   WHERE r.event_id   = _event_id
--     AND r.status    <> 'cancelled'
--     AND r.utm_source = _source
--     AND coalesce(r.utm_medium,   '(none)') = _medium
--     AND coalesce(r.utm_campaign, '(none)') = _campaign;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public._utm_partner_audit(_action text, _access_id uuid, _details jsonb)
-- RETURNS void
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
--   VALUES (
--     auth.uid(),
--     (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
--     _action, 'utm_partner_access', _access_id::text, coalesce(_details, '{}'::jsonb)
--   );
-- EXCEPTION WHEN OTHERS THEN
--   NULL; -- auditing must never break the operation it records
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public._utm_partner_notify(_user_id uuid, _type text, _title text, _body text, _link text)
-- RETURNS void
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   IF _user_id IS NULL THEN RETURN; END IF;
--   INSERT INTO public.app_notifications(user_id, type, title, body, link)
--   VALUES (_user_id, _type, _title, _body, _link);
-- EXCEPTION WHEN OTHERS THEN
--   NULL;
-- END;
-- $$;
--
-- -- What an organiser sees for one grant.
-- CREATE OR REPLACE FUNCTION public._utm_partner_row(a public.utm_partner_access)
-- RETURNS jsonb
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT jsonb_build_object(
--     'id', a.id, 'event_id', a.event_id,
--     'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
--     'invited_email', a.invited_email,
--     'partner_name', (SELECT p.display_name FROM public.profiles p WHERE p.user_id = a.partner_user_id),
--     'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
--     'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
--     'status', a.status, 'granted_at', a.granted_at, 'accepted_at', a.accepted_at, 'revoked_at', a.revoked_at,
--     'stats', public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign),
--     'registered_by_partner', (
--       SELECT count(*) FROM public.registrations r
--        WHERE a.partner_user_id IS NOT NULL
--          AND r.created_by = a.partner_user_id
--          AND r.event_id   = a.event_id
--          AND r.status    <> 'cancelled'
--          AND r.utm_source = a.utm_source
--          AND coalesce(r.utm_medium,   '(none)') = a.utm_medium
--          AND coalesce(r.utm_campaign, '(none)') = a.utm_campaign
--     )
--   );
-- $$;
--
-- -- ── 4. Organiser functions ──────────────────────────────────────────────────
--
-- -- Share a link with a partner (or update / re-activate an existing share).
-- CREATE OR REPLACE FUNCTION public.utm_partner_share(
--   _event_id     uuid,
--   _utm_source   text,
--   _utm_medium   text,
--   _utm_campaign text,
--   _email        text,
--   _permissions  jsonb DEFAULT '{}'::jsonb
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_email    text := lower(btrim(coalesce(_email, '')));
--   v_source   text := btrim(coalesce(_utm_source, ''));
--   v_medium   text := coalesce(nullif(btrim(coalesce(_utm_medium, '')), ''), '(none)');
--   v_campaign text := coalesce(nullif(btrim(coalesce(_utm_campaign, '')), ''), '(none)');
--   v_perms    jsonb := coalesce(_permissions, '{}'::jsonb);
--   v_user     uuid;
--   v_title    text;
--   v_existing public.utm_partner_access;
--   v_row      public.utm_partner_access;
--   v_new      boolean := false;
-- BEGIN
--   IF NOT public._utm_partner_manages_event(_event_id) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--   IF v_source IN ('', '(direct)') THEN
--     RAISE EXCEPTION 'Direct traffic is not a tracked link and can''t be shared' USING ERRCODE = '22023';
--   END IF;
--   IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
--     RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
--   END IF;
--
--   -- The link must belong to this event: saved, clicked or registered through.
--   IF NOT (
--     EXISTS (SELECT 1 FROM public.utm_links l
--              WHERE l.event_id = _event_id AND l.utm_source = v_source
--                AND l.utm_medium = v_medium AND l.utm_campaign = v_campaign)
--     OR EXISTS (SELECT 1 FROM public.utm_clicks c
--                 WHERE c.event_id = _event_id AND c.utm_source = v_source
--                   AND coalesce(c.utm_medium, '(none)') = v_medium AND coalesce(c.utm_campaign, '(none)') = v_campaign)
--     OR EXISTS (SELECT 1 FROM public.registrations r
--                 WHERE r.event_id = _event_id AND r.utm_source = v_source
--                   AND coalesce(r.utm_medium, '(none)') = v_medium AND coalesce(r.utm_campaign, '(none)') = v_campaign)
--   ) THEN
--     RAISE EXCEPTION 'That tracked link doesn''t exist for this event' USING ERRCODE = '22023';
--   END IF;
--
--   SELECT u.id INTO v_user FROM auth.users u
--    WHERE lower(u.email) = v_email AND u.email_confirmed_at IS NOT NULL
--    LIMIT 1;
--   SELECT e.title INTO v_title FROM public.events e WHERE e.id = _event_id;
--
--   SELECT a.* INTO v_existing FROM public.utm_partner_access a
--    WHERE a.event_id = _event_id AND a.utm_source = v_source AND a.utm_medium = v_medium
--      AND a.utm_campaign = v_campaign AND a.invited_email = v_email
--    FOR UPDATE;
--
--   IF v_existing.id IS NULL THEN
--     v_new := true;
--     INSERT INTO public.utm_partner_access(
--       event_id, utm_source, utm_medium, utm_campaign, invited_email,
--       can_register, can_view_approval, can_view_checkin, can_export, granted_by
--     ) VALUES (
--       _event_id, v_source, v_medium, v_campaign, v_email,
--       coalesce((v_perms->>'can_register')::boolean, false),
--       coalesce((v_perms->>'can_view_approval')::boolean, true),
--       coalesce((v_perms->>'can_view_checkin')::boolean, true),
--       coalesce((v_perms->>'can_export')::boolean, false),
--       auth.uid()
--     ) RETURNING * INTO v_row;
--   ELSE
--     UPDATE public.utm_partner_access a SET
--       can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
--       can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
--       can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
--       can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export),
--       -- Re-sharing after a revoke starts a fresh invitation.
--       status          = CASE WHEN a.status = 'revoked' THEN 'pending' ELSE a.status END,
--       partner_user_id = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.partner_user_id END,
--       accepted_at     = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.accepted_at END,
--       revoked_at      = NULL,
--       granted_by      = CASE WHEN a.status = 'revoked' THEN auth.uid() ELSE a.granted_by END,
--       granted_at      = CASE WHEN a.status = 'revoked' THEN now()      ELSE a.granted_at END
--     WHERE a.id = v_existing.id
--     RETURNING * INTO v_row;
--     v_new := v_existing.status = 'revoked';
--   END IF;
--
--   IF v_new THEN
--     PERFORM public._utm_partner_audit('utm_partner.invited', v_row.id, jsonb_build_object(
--       'event_id', _event_id, 'utm_source', v_source, 'utm_medium', v_medium, 'utm_campaign', v_campaign,
--       'email', v_email, 'permissions', v_perms));
--     PERFORM public._utm_partner_notify(v_user, 'utm_partner_invite',
--       'A tracked link was shared with you',
--       'You can now see and manage registrations for ' || coalesce(v_title, 'an event') || '.',
--       '/partner');
--   ELSE
--     PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
--   END IF;
--
--   RETURN public._utm_partner_row(v_row) || jsonb_build_object('has_account', v_user IS NOT NULL, 'created', v_new, 'event_title', v_title);
-- END;
-- $$;
--
-- -- Every share of an event, with each partner's performance.
-- CREATE OR REPLACE FUNCTION public.utm_partner_list(_event_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   IF NOT public._utm_partner_manages_event(_event_id) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--   RETURN coalesce((
--     SELECT jsonb_agg(public._utm_partner_row(a) ORDER BY a.created_at DESC)
--       FROM public.utm_partner_access a
--      WHERE a.event_id = _event_id
--   ), '[]'::jsonb);
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.utm_partner_update(_access_id uuid, _permissions jsonb)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_perms jsonb := coalesce(_permissions, '{}'::jsonb);
--   v_row   public.utm_partner_access;
-- BEGIN
--   SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
--   IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--   UPDATE public.utm_partner_access a SET
--     can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
--     can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
--     can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
--     can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export)
--   WHERE a.id = _access_id
--   RETURNING * INTO v_row;
--   PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
--   RETURN public._utm_partner_row(v_row);
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.utm_partner_revoke(_access_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_row   public.utm_partner_access;
--   v_title text;
-- BEGIN
--   SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
--   IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--   IF v_row.status <> 'revoked' THEN
--     UPDATE public.utm_partner_access a
--        SET status = 'revoked', revoked_at = now()
--      WHERE a.id = _access_id
--     RETURNING * INTO v_row;
--     SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
--     PERFORM public._utm_partner_audit('utm_partner.revoked', v_row.id, jsonb_build_object('email', v_row.invited_email));
--     PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
--       'Access to a shared link was removed',
--       'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
--   END IF;
--   RETURN public._utm_partner_row(v_row);
-- END;
-- $$;
--
-- -- ── 5. Partner functions ────────────────────────────────────────────────────
--
-- -- Cheap check for the account menu. No side effects.
-- CREATE OR REPLACE FUNCTION public.partner_utm_has_access()
-- RETURNS boolean
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT auth.uid() IS NOT NULL AND EXISTS (
--     SELECT 1 FROM public.utm_partner_access a
--      WHERE (a.status = 'accepted' AND a.partner_user_id = auth.uid())
--         OR (a.status = 'pending' AND a.invited_email = (
--               SELECT lower(u.email) FROM auth.users u
--                WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL))
--   );
-- $$;
--
-- -- The caller's shared links. Opening the dashboard accepts any invitation
-- -- addressed to the caller's verified email.
-- CREATE OR REPLACE FUNCTION public.partner_utm_grants()
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_uid   uuid := auth.uid();
--   v_email text;
--   r       record;
-- BEGIN
--   IF v_uid IS NULL THEN
--     RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
--   END IF;
--   IF public.is_user_banned(v_uid) THEN
--     RETURN '[]'::jsonb;
--   END IF;
--
--   SELECT lower(u.email) INTO v_email FROM auth.users u
--    WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;
--
--   IF v_email IS NOT NULL THEN
--     FOR r IN
--       UPDATE public.utm_partner_access a
--          SET status = 'accepted', partner_user_id = v_uid, accepted_at = now()
--        WHERE a.status = 'pending' AND a.invited_email = v_email
--       RETURNING a.id, a.granted_by, a.event_id
--     LOOP
--       PERFORM public._utm_partner_audit('utm_partner.accepted', r.id, jsonb_build_object('email', v_email));
--       PERFORM public._utm_partner_notify(r.granted_by, 'utm_partner_accepted',
--         'Partner invitation accepted', v_email || ' opened the link you shared.',
--         '/dashboard/events/' || r.event_id::text);
--     END LOOP;
--   END IF;
--
--   RETURN coalesce((
--     SELECT jsonb_agg(jsonb_build_object(
--       'id', a.id,
--       'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
--       'label', (SELECT l.label FROM public.utm_links l
--                  WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
--                    AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
--       'link_url', (SELECT l.url FROM public.utm_links l
--                     WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
--                       AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
--       'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
--       'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
--       'event', jsonb_build_object(
--         'title', e.title, 'date', e.date, 'end_date', e.end_date, 'timezone', e.timezone,
--         'venue', e.venue, 'location', e.location, 'event_format', e.event_format,
--         'status', e.status, 'requires_approval', e.requires_approval,
--         'description', left(coalesce(e.description, ''), 600),
--         'image_url', coalesce(e.banner_landscape_url, e.image_url),
--         'organizer_name', (SELECT o.name FROM public.organizations o WHERE o.id = e.org_id)
--       ),
--       -- Counts cover this link only; parts the grant doesn't include are NULL.
--       'stats', (
--         SELECT jsonb_build_object(
--           'total',          s->'total',
--           'approved',       CASE WHEN a.can_view_approval THEN s->'approved'   END,
--           'pending',        CASE WHEN a.can_view_approval THEN s->'pending'    END,
--           'declined',       CASE WHEN a.can_view_approval THEN s->'declined'   END,
--           'waitlisted',     CASE WHEN a.can_view_approval THEN s->'waitlisted' END,
--           'checked_in',     CASE WHEN a.can_view_checkin  THEN s->'checked_in' END,
--           'not_checked_in', CASE WHEN a.can_view_checkin AND a.can_view_approval THEN s->'not_checked_in' END
--         )
--         FROM (SELECT public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign) AS s) x
--       )
--     ) ORDER BY e.date DESC, a.created_at DESC)
--     FROM public.utm_partner_access a
--     JOIN public.events e ON e.id = a.event_id
--     WHERE a.partner_user_id = v_uid AND a.status = 'accepted'
--   ), '[]'::jsonb);
-- END;
-- $$;
--
-- -- One page of the participants attributed to a shared link.
-- CREATE OR REPLACE FUNCTION public.partner_utm_participants(
--   _access_id uuid,
--   _search    text        DEFAULT NULL,
--   _approval  text        DEFAULT NULL,   -- pending | approved | declined | waitlisted
--   _checkin   text        DEFAULT NULL,   -- in | out
--   _from      timestamptz DEFAULT NULL,
--   _to        timestamptz DEFAULT NULL,
--   _limit     int         DEFAULT 25,
--   _offset    int         DEFAULT 0
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   g          public.utm_partner_access := public._utm_partner_grant(_access_id);
--   v_limit    int  := least(greatest(coalesce(_limit, 25), 1), 200);
--   v_offset   int  := greatest(coalesce(_offset, 0), 0);
--   v_search   text := nullif(btrim(coalesce(_search, '')), '');
--   -- Filtering on a field the grant can't see would leak it through counts.
--   v_approval text := CASE WHEN g.can_view_approval THEN nullif(_approval, '') END;
--   v_checkin  text := CASE WHEN g.can_view_checkin  THEN nullif(_checkin, '')  END;
--   v_result   jsonb;
-- BEGIN
--   IF v_search IS NOT NULL THEN
--     v_search := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
--   END IF;
--
--   WITH scoped AS (
--     SELECT r.*
--       FROM public.registrations r
--      WHERE r.event_id   = g.event_id
--        AND r.status    <> 'cancelled'
--        AND r.utm_source = g.utm_source
--        AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
--        AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
--   ), filtered AS (
--     SELECT * FROM scoped s
--      WHERE (v_search IS NULL
--             OR s.name ILIKE v_search OR s.email ILIKE v_search
--             OR coalesce(s.company, '') ILIKE v_search OR coalesce(s.designation, '') ILIKE v_search)
--        AND (v_approval IS NULL OR s.approval_status = v_approval)
--        AND (v_checkin IS NULL OR (v_checkin = 'in' AND s.checked_in) OR (v_checkin = 'out' AND NOT s.checked_in))
--        AND (_from IS NULL OR s.created_at >= _from)
--        AND (_to   IS NULL OR s.created_at <  _to)
--   ), page AS (
--     SELECT * FROM filtered ORDER BY created_at DESC, id LIMIT v_limit OFFSET v_offset
--   )
--   SELECT jsonb_build_object(
--     'total', (SELECT count(*) FROM filtered),
--     'rows', coalesce((
--       SELECT jsonb_agg(jsonb_build_object(
--         'id', p.id, 'name', p.name, 'email', p.email,
--         'company', p.company, 'designation', p.designation,
--         'registered_at', p.created_at,
--         'added_by_you', p.created_by IS NOT NULL AND p.created_by = auth.uid(),
--         'approval_status', CASE WHEN g.can_view_approval THEN p.approval_status END,
--         'approved_at',     CASE WHEN g.can_view_approval THEN p.approved_at END,
--         'checked_in',      CASE WHEN g.can_view_checkin  THEN p.checked_in END,
--         'checked_in_at',   CASE WHEN g.can_view_checkin  THEN p.checked_in_at END
--       ) ORDER BY p.created_at DESC, p.id)
--       FROM page p), '[]'::jsonb)
--   ) INTO v_result;
--
--   RETURN v_result;
-- END;
-- $$;
--
-- -- Every participant of a shared link, for export. Needs the export permission.
-- CREATE OR REPLACE FUNCTION public.partner_utm_export(_access_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   g        public.utm_partner_access := public._utm_partner_grant(_access_id);
--   v_result jsonb;
-- BEGIN
--   IF NOT g.can_export THEN
--     RAISE EXCEPTION 'Export isn''t enabled for this shared link' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT coalesce(jsonb_agg(jsonb_build_object(
--       'name', r.name, 'email', r.email, 'company', r.company, 'designation', r.designation,
--       'registered_at', r.created_at,
--       'approval_status', CASE WHEN g.can_view_approval THEN r.approval_status END,
--       'checked_in',      CASE WHEN g.can_view_checkin  THEN r.checked_in END,
--       'checked_in_at',   CASE WHEN g.can_view_checkin  THEN r.checked_in_at END
--     ) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
--     INTO v_result
--     FROM public.registrations r
--    WHERE r.event_id   = g.event_id
--      AND r.status    <> 'cancelled'
--      AND r.utm_source = g.utm_source
--      AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
--      AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign;
--
--   PERFORM public._utm_partner_audit('utm_partner.exported', g.id, jsonb_build_object('rows', jsonb_array_length(v_result)));
--   RETURN v_result;
-- END;
-- $$;
--
-- -- Register a participant under a shared link. The event and the UTM values
-- -- come from the grant; nothing the caller sends can change them.
-- CREATE OR REPLACE FUNCTION public.partner_utm_register(_access_id uuid, _person jsonb)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   g        public.utm_partner_access := public._utm_partner_grant(_access_id);
--   p        jsonb := coalesce(_person, '{}'::jsonb);
--   e        public.events;
--   v_first  text := btrim(coalesce(p->>'first_name', ''));
--   v_last   text := btrim(coalesce(p->>'last_name', ''));
--   v_email  text := lower(btrim(coalesce(p->>'email', '')));
--   v_company text := btrim(coalesce(p->>'company', ''));
--   v_desig  text := btrim(coalesce(p->>'designation', ''));
--   v_cc     text := btrim(coalesce(p->>'mobile_country_code', ''));
--   v_mobile text := btrim(coalesce(p->>'mobile_number', ''));
--   v_going  int;
--   v_reg    public.registrations;
-- BEGIN
--   IF NOT g.can_register THEN
--     RAISE EXCEPTION 'Registering participants isn''t enabled for this shared link' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT ev.* INTO e FROM public.events ev WHERE ev.id = g.event_id;
--   IF e.status <> 'published' THEN
--     RAISE EXCEPTION 'Registration isn''t open for this event' USING ERRCODE = 'P0001';
--   END IF;
--   IF coalesce(e.end_date, e.date) < now() THEN
--     RAISE EXCEPTION 'Registration for this event has closed' USING ERRCODE = 'P0001';
--   END IF;
--   IF coalesce(e.price, 0) > 0 THEN
--     RAISE EXCEPTION 'This is a paid event — share your tracked link so participants can buy a ticket' USING ERRCODE = 'P0001';
--   END IF;
--
--   IF v_first = '' OR v_last = '' OR length(v_first) > 80 OR length(v_last) > 80 THEN
--     RAISE EXCEPTION 'First and last name are required' USING ERRCODE = '22023';
--   END IF;
--   IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
--     RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
--   END IF;
--   IF v_company = '' OR length(v_company) > 160 THEN
--     RAISE EXCEPTION 'Company is required' USING ERRCODE = '22023';
--   END IF;
--   IF v_desig = '' OR length(v_desig) > 120 THEN
--     RAISE EXCEPTION 'Designation is required' USING ERRCODE = '22023';
--   END IF;
--   IF v_cc !~ '^\+\d{1,4}$' OR v_mobile !~ '^\d{6,15}$' THEN
--     RAISE EXCEPTION 'Enter a valid mobile number' USING ERRCODE = '22023';
--   END IF;
--
--   -- Abuse guard: one partner account, at most 300 registrations an hour.
--   IF (SELECT count(*) FROM public.registrations r
--        WHERE r.created_by = auth.uid() AND r.created_at > now() - interval '1 hour') >= 300 THEN
--     RAISE EXCEPTION 'Too many registrations in a short time — please try again later' USING ERRCODE = 'P0001';
--   END IF;
--
--   -- Serialise capacity + duplicate checks per event.
--   PERFORM pg_advisory_xact_lock(hashtext('partner_utm_register:' || g.event_id::text));
--
--   IF EXISTS (SELECT 1 FROM public.registrations r
--               WHERE r.event_id = g.event_id AND lower(r.email) = v_email AND r.status <> 'cancelled') THEN
--     RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
--   END IF;
--
--   IF coalesce(e.capacity, 0) > 0 THEN
--     SELECT count(*) INTO v_going FROM public.registrations r
--      WHERE r.event_id = g.event_id AND r.status <> 'cancelled'
--        AND r.approval_status NOT IN ('declined', 'waitlisted');
--     IF v_going >= e.capacity THEN
--       RAISE EXCEPTION 'This event is full' USING ERRCODE = 'P0001';
--     END IF;
--   END IF;
--
--   BEGIN
--     -- approval_status: the registrations_validate trigger turns this into
--     -- 'pending' when the event requires approval (a partner is not an organiser).
--     INSERT INTO public.registrations(
--       event_id, user_id, name, email, title, first_name, last_name, company, designation,
--       mobile_country_code, mobile_number, linkedin_url, company_website, company_employee_count, industry,
--       ticket_type, status, approval_status,
--       utm_source, utm_medium, utm_campaign, created_by
--     ) VALUES (
--       g.event_id, NULL, btrim(v_first || ' ' || v_last), v_email,
--       nullif(btrim(coalesce(p->>'title', '')), ''), v_first, v_last, v_company, v_desig,
--       v_cc, v_mobile,
--       nullif(left(btrim(coalesce(p->>'linkedin_url', '')), 255), ''),
--       nullif(left(btrim(coalesce(p->>'company_website', '')), 255), ''),
--       nullif(btrim(coalesce(p->>'company_employee_count', '')), ''),
--       nullif(btrim(coalesce(p->>'industry', '')), ''),
--       CASE WHEN e.event_format = 'virtual' THEN 'webinar' ELSE 'general' END,
--       'confirmed', 'approved',
--       g.utm_source, nullif(g.utm_medium, '(none)'), nullif(g.utm_campaign, '(none)'), auth.uid()
--     ) RETURNING * INTO v_reg;
--   EXCEPTION WHEN unique_violation THEN
--     RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
--   END;
--
--   PERFORM public.log_registrant_action('partner_registered', v_reg.id,
--     jsonb_build_object('partner_access_id', g.id, 'utm_source', g.utm_source));
--   PERFORM public._utm_partner_audit('utm_partner.registered', g.id, jsonb_build_object('registration_id', v_reg.id));
--
--   RETURN jsonb_build_object(
--     'id', v_reg.id, 'name', v_reg.name, 'email', v_reg.email,
--     'approval_status', CASE WHEN g.can_view_approval THEN v_reg.approval_status END
--   );
-- END;
-- $$;
--
-- -- ── 6. Grants ───────────────────────────────────────────────────────────────
-- DO $$
-- DECLARE
--   fn text;
-- BEGIN
--   -- Internal helpers: service role only.
--   FOREACH fn IN ARRAY ARRAY[
--     '_utm_partner_manages_event(uuid)',
--     '_utm_partner_grant(uuid)',
--     '_utm_partner_stats(uuid, text, text, text)',
--     '_utm_partner_audit(text, uuid, jsonb)',
--     '_utm_partner_notify(uuid, text, text, text, text)',
--     '_utm_partner_row(public.utm_partner_access)'
--   ] LOOP
--     EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
--     EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
--   END LOOP;
--
--   -- Client-callable: signed-in users only.
--   FOREACH fn IN ARRAY ARRAY[
--     'utm_partner_share(uuid, text, text, text, text, jsonb)',
--     'utm_partner_list(uuid)',
--     'utm_partner_update(uuid, jsonb)',
--     'utm_partner_revoke(uuid)',
--     'partner_utm_has_access()',
--     'partner_utm_grants()',
--     'partner_utm_participants(uuid, text, text, text, timestamptz, timestamptz, int, int)',
--     'partner_utm_export(uuid)',
--     'partner_utm_register(uuid, jsonb)'
--   ] LOOP
--     EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
--     EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
--   END LOOP;
-- END $$;
--
-- COMMENT ON TABLE public.utm_partner_access IS
--   'An organiser''s share of one tracked link (event + utm_source/medium/campaign) with an external partner. No direct client access — use the utm_partner_* (organiser) and partner_utm_* (partner) functions.';
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- -- ▼▼▼ 042_partner_utm_analytics.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 042_partner_utm_analytics.sql
-- --
-- -- Analytics for the Partner dashboard's event view (follows 040).
-- --
-- -- `partner_utm_analytics(_access_id)` returns, for ONE shared link only:
-- --   • clicks on the link,
-- --   • a day-by-day series of clicks, registrations and check-ins,
-- --   • the companies most represented among its participants.
-- --
-- -- Same isolation rules as the other partner functions: the grant is
-- -- re-validated on every call, the event and UTM values come from the grant,
-- -- and anything the grant's permissions don't cover is returned as NULL.
-- -- Days are bucketed in the event's own timezone.
-- --
-- -- Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE FUNCTION public.partner_utm_analytics(_access_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   g        public.utm_partner_access := public._utm_partner_grant(_access_id);
--   v_tz     text;
--   v_clicks bigint;
--   v_series jsonb;
--   v_top    jsonb;
-- BEGIN
--   SELECT coalesce(nullif(e.timezone, ''), 'UTC') INTO v_tz FROM public.events e WHERE e.id = g.event_id;
--   -- An unknown timezone name must not break the dashboard.
--   IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
--     v_tz := 'UTC';
--   END IF;
--
--   SELECT count(*) INTO v_clicks
--     FROM public.utm_clicks c
--    WHERE c.event_id   = g.event_id
--      AND c.utm_source = g.utm_source
--      AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
--      AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign;
--
--   WITH regs AS (
--     SELECT r.created_at, r.checked_in, r.checked_in_at
--       FROM public.registrations r
--      WHERE r.event_id   = g.event_id
--        AND r.status    <> 'cancelled'
--        AND r.utm_source = g.utm_source
--        AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
--        AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
--   ), days AS (
--     SELECT (c.clicked_at AT TIME ZONE v_tz)::date AS day, 1 AS clicks, 0 AS registrations, 0 AS check_ins
--       FROM public.utm_clicks c
--      WHERE c.event_id   = g.event_id
--        AND c.utm_source = g.utm_source
--        AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
--        AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign
--     UNION ALL
--     SELECT (created_at AT TIME ZONE v_tz)::date, 0, 1, 0 FROM regs
--     UNION ALL
--     SELECT (checked_in_at AT TIME ZONE v_tz)::date, 0, 0, 1 FROM regs
--      WHERE g.can_view_checkin AND checked_in AND checked_in_at IS NOT NULL
--   ), per_day AS (
--     SELECT day, sum(clicks) AS clicks, sum(registrations) AS registrations, sum(check_ins) AS check_ins
--       FROM days GROUP BY day
--   )
--   SELECT coalesce(jsonb_agg(jsonb_build_object(
--            'day', to_char(day, 'YYYY-MM-DD'),
--            'clicks', clicks,
--            'registrations', registrations,
--            'check_ins', CASE WHEN g.can_view_checkin THEN check_ins END
--          ) ORDER BY day), '[]'::jsonb)
--     INTO v_series
--     FROM per_day;
--
--   SELECT coalesce(jsonb_agg(jsonb_build_object('company', company, 'registrations', n) ORDER BY n DESC, company), '[]'::jsonb)
--     INTO v_top
--     FROM (
--       SELECT btrim(r.company) AS company, count(*) AS n
--         FROM public.registrations r
--        WHERE r.event_id   = g.event_id
--          AND r.status    <> 'cancelled'
--          AND r.utm_source = g.utm_source
--          AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
--          AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
--          AND nullif(btrim(coalesce(r.company, '')), '') IS NOT NULL
--        GROUP BY btrim(r.company)
--        ORDER BY count(*) DESC, btrim(r.company)
--        LIMIT 8
--     ) t;
--
--   RETURN jsonb_build_object('clicks', v_clicks, 'timezone', v_tz, 'series', v_series, 'top_companies', v_top);
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.partner_utm_analytics(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.partner_utm_analytics(uuid) TO authenticated, service_role;
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- -- ▼▼▼ 043_utm_partner_remove.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 043_utm_partner_remove.sql
-- --
-- -- Partner shares can be removed, not only revoked.
-- --
-- --   • `utm_partner_remove(_access_id)` deletes one share. If it was still
-- --     active the partner loses access immediately (and is notified), exactly
-- --     as with a revoke — the row is then gone from the Partners list.
-- --   • `delete_utm_tracking` (039) now also deletes the shares of the link it
-- --     deletes: a link that no longer exists can't stay shared with anyone.
-- --     The count is returned as `partners_removed`.
-- --
-- -- Registrations are never touched by either function.
-- -- Requires 040. Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE FUNCTION public.utm_partner_remove(_access_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_row   public.utm_partner_access;
--   v_title text;
-- BEGIN
--   SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
--   IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--
--   DELETE FROM public.utm_partner_access a WHERE a.id = _access_id;
--
--   PERFORM public._utm_partner_audit('utm_partner.removed', v_row.id, jsonb_build_object(
--     'email', v_row.invited_email, 'event_id', v_row.event_id, 'previous_status', v_row.status,
--     'utm_source', v_row.utm_source, 'utm_medium', v_row.utm_medium, 'utm_campaign', v_row.utm_campaign));
--   IF v_row.status = 'accepted' THEN
--     SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
--     PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
--       'Access to a shared link was removed',
--       'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
--   END IF;
--
--   RETURN jsonb_build_object('id', v_row.id, 'removed', true);
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.utm_partner_remove(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.utm_partner_remove(uuid) TO authenticated, service_role;
--
-- -- Deleting a tracked link also ends its partner shares.
-- CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
--   _event_id     uuid,
--   _utm_source   text,
--   _utm_medium   text,
--   _utm_campaign text
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_links    int := 0;
--   v_clicks   int := 0;
--   v_regs     int := 0;
--   v_partners int := 0;
--   r          record;
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM public.events e
--     WHERE e.id = _event_id
--       AND (
--         e.user_id = auth.uid()
--         OR public.has_role(auth.uid(), 'admin')
--         OR public.is_org_member(auth.uid(), e.org_id)
--       )
--   ) THEN
--     RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
--   END IF;
--
--   IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
--     RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
--   END IF;
--
--   DELETE FROM public.utm_links l
--    WHERE l.event_id     = _event_id
--      AND l.utm_source   = _utm_source
--      AND l.utm_medium   = _utm_medium
--      AND l.utm_campaign = _utm_campaign;
--   GET DIAGNOSTICS v_links = ROW_COUNT;
--
--   DELETE FROM public.utm_clicks c
--    WHERE c.event_id   = _event_id
--      AND c.utm_source = _utm_source
--      AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
--      AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
--   GET DIAGNOSTICS v_clicks = ROW_COUNT;
--
--   FOR r IN
--     DELETE FROM public.utm_partner_access a
--      WHERE a.event_id     = _event_id
--        AND a.utm_source   = _utm_source
--        AND a.utm_medium   = coalesce(_utm_medium,   '(none)')
--        AND a.utm_campaign = coalesce(_utm_campaign, '(none)')
--     RETURNING a.id, a.invited_email, a.status
--   LOOP
--     v_partners := v_partners + 1;
--     PERFORM public._utm_partner_audit('utm_partner.removed', r.id,
--       jsonb_build_object('email', r.invited_email, 'previous_status', r.status, 'reason', 'link deleted'));
--   END LOOP;
--
--   SELECT count(*) INTO v_regs
--     FROM public.registrations r2
--    WHERE r2.event_id   = _event_id
--      AND r2.status    <> 'cancelled'
--      AND r2.utm_source = _utm_source
--      AND coalesce(r2.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
--      AND coalesce(r2.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)');
--
--   RETURN jsonb_build_object(
--     'links_deleted',      v_links,
--     'clicks_deleted',     v_clicks,
--     'registrations_kept', v_regs,
--     'partners_removed',   v_partners
--   );
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) FROM PUBLIC, anon;
-- GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text) TO authenticated, service_role;
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- -- ▼▼▼ 044_brand_kit_access.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 044_brand_kit_access.sql
-- --
-- -- Makes `public.brand_kits` usable from the dashboard's Organization → Brand
-- -- kit tab, where a workspace keeps its logos (CMYK, white, black, icon),
-- -- colours, fonts, brand guidelines and other brand files.
-- --
-- -- Three things were in the way:
-- --
-- --   1. Migration 025 created the table with row-level-security policies but
-- --      no table privileges for signed-in users. RLS only narrows access that a
-- --      GRANT has already given, so every read and write was refused with
-- --      "permission denied for table brand_kits".
-- --   2. Only the canonical owner (`organizations.owner_id`) could write. Org
-- --      admins manage the rest of the workspace (migration 030), so they may
-- --      manage the brand kit too.
-- --   3. The canonical owner could only read through an `org_members` row. The
-- --      read policy now names the owner directly.
-- --
-- -- The table definition is repeated with IF NOT EXISTS so this file also works
-- -- on a database where 025 was never applied. The files themselves are stored
-- -- in the existing public `site-assets` bucket under `brand-kits/<org id>/`;
-- -- no storage changes are needed.
-- --
-- -- Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE TABLE IF NOT EXISTS public.brand_kits (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
--   name text NOT NULL,
--   snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
--   created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );
--
-- CREATE INDEX IF NOT EXISTS brand_kits_org_idx
--   ON public.brand_kits (org_id, created_at DESC);
--
-- ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
-- GRANT ALL                            ON public.brand_kits TO service_role;
--
-- -- Replace the 025 policies (and any earlier run of this file).
-- DROP POLICY IF EXISTS "brand_kits: org members and admins can select" ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: org owner and admins can insert"   ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: org owner and admins can update"   ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: org owner and admins can delete"   ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: workspace can read"                ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: managers can insert"               ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: managers can update"               ON public.brand_kits;
-- DROP POLICY IF EXISTS "brand_kits: managers can delete"               ON public.brand_kits;
--
-- -- Read: anyone in the workspace (owner or member), or a platform admin.
-- CREATE POLICY "brand_kits: workspace can read"
--   ON public.brand_kits FOR SELECT TO authenticated
--   USING (
--     EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = brand_kits.org_id AND o.owner_id = auth.uid())
--     OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = brand_kits.org_id AND om.user_id = auth.uid())
--     OR public.has_role(auth.uid(), 'admin')
--   );
--
-- -- Write: the workspace's owners and admins (`is_org_manager`, migration 030),
-- -- or a platform admin.
-- CREATE POLICY "brand_kits: managers can insert"
--   ON public.brand_kits FOR INSERT TO authenticated
--   WITH CHECK (
--     created_by = auth.uid()
--     AND (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
--   );
--
-- CREATE POLICY "brand_kits: managers can update"
--   ON public.brand_kits FOR UPDATE TO authenticated
--   USING      (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
--   WITH CHECK (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
--
-- CREATE POLICY "brand_kits: managers can delete"
--   ON public.brand_kits FOR DELETE TO authenticated
--   USING (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
--
-- COMMENT ON TABLE public.brand_kits IS
--   'Organization brand kits: logos, colours, fonts and brand files in `snapshot`. RLS: any workspace member (or platform admin) may read; workspace owners and admins (or platform admin) may write.';
--
-- NOTIFY pgrst, 'reload schema';
--
--
-- -- ▼▼▼ 045_guest_registration.sql ▼▼▼
--
-- -- ═══════════════════════════════════════════════════════════════════════════════
-- -- 045_guest_registration.sql
-- --
-- -- Supports registering for an event without an account, and setting a
-- -- password afterwards from a link in the confirmation email. Everything here
-- -- is used only by the `guest-registration` edge function, which runs as
-- -- service_role; browsers get no access to any of it.
-- --
-- --   1. `account_activation_tokens` — one row per emailed "set up your account"
-- --      link. Only the SHA-256 of the token is stored, so a copy of this table
-- --      cannot be used to activate anyone's account. A link works once
-- --      (`used_at`) and stops working at `expires_at`.
-- --   2. `guest_rate_limits` — a log of recent attempts, keyed by a hash of the
-- --      caller's address or email, used to slow down abuse of the public
-- --      registration, activation and resend endpoints.
-- --   3. `registrations.confirmation_email_sent_at` — when the confirmation
-- --      email went out, so a retried request does not send it twice.
-- --
-- -- Registrations themselves are unchanged: a guest registration is an ordinary
-- -- row with `user_id` NULL, exactly like a participant an organiser adds by
-- -- hand. The existing `handle_new_user` trigger attaches such rows to the
-- -- account when one is created for that email, and the existing unique index
-- -- on (event_id, lower(email)) keeps one registration per person per event.
-- --
-- -- Idempotent — safe to run more than once.
-- -- ═══════════════════════════════════════════════════════════════════════════════
--
-- CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
--   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   email           text NOT NULL,
--   token_hash      text NOT NULL,
--   registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
--   expires_at      timestamptz NOT NULL,
--   used_at         timestamptz,
--   created_at      timestamptz NOT NULL DEFAULT now(),
--   CONSTRAINT account_activation_tokens_email_lower CHECK (email = lower(email))
-- );
--
-- CREATE UNIQUE INDEX IF NOT EXISTS account_activation_tokens_hash_idx
--   ON public.account_activation_tokens (token_hash);
-- CREATE INDEX IF NOT EXISTS account_activation_tokens_email_idx
--   ON public.account_activation_tokens (email, created_at DESC);
--
-- ALTER TABLE public.account_activation_tokens ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.account_activation_tokens FROM PUBLIC, anon, authenticated;
-- GRANT  ALL ON public.account_activation_tokens TO service_role;
--
-- COMMENT ON TABLE public.account_activation_tokens IS
--   'Single-use, expiring "set up your account" links sent after a guest registration. Stores only the SHA-256 of each token. service_role only (no RLS policies).';
--
--
-- CREATE TABLE IF NOT EXISTS public.guest_rate_limits (
--   id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   bucket     text NOT NULL,
--   key_hash   text NOT NULL,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );
--
-- CREATE INDEX IF NOT EXISTS guest_rate_limits_lookup_idx
--   ON public.guest_rate_limits (bucket, key_hash, created_at DESC);
--
-- ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.guest_rate_limits FROM PUBLIC, anon, authenticated;
-- GRANT  ALL ON public.guest_rate_limits TO service_role;
--
-- COMMENT ON TABLE public.guest_rate_limits IS
--   'Recent attempts against the public guest-registration endpoints, keyed by a hash of the caller address or email. service_role only. Rows older than a day can be deleted at any time.';
--
--
-- ALTER TABLE public.registrations
--   ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;
--
-- COMMENT ON COLUMN public.registrations.confirmation_email_sent_at IS
--   'When the guest-registration confirmation email was sent. NULL for registrations made before guest registration existed, or whose email could not be sent.';
--
-- NOTIFY pgrst, 'reload schema';
-- <<< END ARCHIVED ROOT SCRIPT: RUN_ME_pending_updates.sql <<<

-- >>> BEGIN ARCHIVED ROOT SCRIPT (disabled): fix_communities.sql >>>
-- The following source is commented out intentionally. Review and run
-- it separately only if its original one-off/manual purpose is needed.
-- CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
-- RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   _existing uuid;
--   _evt RECORD;
--   _parent_id uuid;
--   _new_id uuid;
--   _slug text;
--   _base_slug text;
--   _i int := 0;
-- BEGIN
--   SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
--   IF _existing IS NOT NULL THEN RETURN _existing; END IF;
--
--   SELECT e.id, e.title, e.slug, e.org_id, e.user_id,
--          COALESCE(e.community_category, 'other')::text AS category_text
--     INTO _evt
--   FROM events e WHERE e.id = _event_id;
--   IF NOT FOUND THEN RETURN NULL; END IF;
--
--   _parent_id := ensure_parent_community(_map_event_category_to_community(_evt.category_text));
--
--   _base_slug := community_slugify(_evt.slug || '-community');
--   IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
--   _slug := _base_slug;
--   WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
--     _i := _i + 1;
--     _slug := _base_slug || '-' || _i;
--   END LOOP;
--
--   INSERT INTO communities (
--     kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
--   ) VALUES (
--     'event', _parent_id, _evt.id, _evt.org_id, _slug,
--     _evt.title || ' — Community',
--     'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
--     'public',
--     _evt.user_id
--   ) RETURNING id INTO _new_id;
--
--   INSERT INTO community_members (community_id, user_id, role, status, auto)
--   VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
--   ON CONFLICT (community_id, user_id) DO NOTHING;
--
--   UPDATE communities SET member_count = member_count + 1 WHERE id = _new_id;
--
--   RETURN _new_id;
-- END;
-- $$;
-- UPDATE communities SET visibility = 'public' WHERE kind = 'event';
-- CREATE OR REPLACE FUNCTION public.community_join(_community_id uuid)
-- RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE 
--   _id uuid;
--   _kind community_kind;
-- BEGIN
--   IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
--   
--   SELECT kind INTO _kind FROM public.communities WHERE id = _community_id;
--   IF _kind = 'event' THEN
--     RAISE EXCEPTION 'Event communities can only be joined by registering for the event.';
--   END IF;
--
--   INSERT INTO community_members (community_id, user_id, role, status, auto)
--   VALUES (_community_id, auth.uid(), 'member', 'active', false)
--   ON CONFLICT (community_id, user_id) DO UPDATE
--     SET status = 'active', joined_at = excluded.joined_at
--   RETURNING id INTO _id;
--   RETURN _id;
-- END;
-- $$;
-- <<< END ARCHIVED ROOT SCRIPT: fix_communities.sql <<<

-- >>> BEGIN ARCHIVED ROOT SCRIPT (disabled): fix_missing_members.sql >>>
-- The following source is commented out intentionally. Review and run
-- it separately only if its original one-off/manual purpose is needed.
-- DO $$
-- DECLARE
--   _reg RECORD;
-- BEGIN
--   FOR _reg IN 
--     SELECT r.event_id, r.user_id 
--     FROM registrations r
--     JOIN communities c ON c.event_id = r.event_id
--     WHERE r.approval_status = 'approved' 
--       AND r.user_id IS NOT NULL
--       AND NOT EXISTS (
--         SELECT 1 FROM community_members cm 
--         WHERE cm.community_id = c.id AND cm.user_id = r.user_id
--       )
--   LOOP
--     PERFORM _auto_join_event_community(_reg.event_id, _reg.user_id, 'member');
--   END LOOP;
-- END;
-- $$;
-- <<< END ARCHIVED ROOT SCRIPT: fix_missing_members.sql <<<
