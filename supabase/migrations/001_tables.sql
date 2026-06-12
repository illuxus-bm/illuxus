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
