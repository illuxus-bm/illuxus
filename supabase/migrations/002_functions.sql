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
