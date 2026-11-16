// Tests migration 088 (the rest of the platform audit) against the production schema.
// Run:  node supabase/tests/088_audit_followups.test.mjs
//       node supabase/tests/088_audit_followups.test.mjs --before   (088 skipped: its checks fail)
import {
  loadProdSchema, migrationSection, asAnon, asUser, asService, checker, eq, rejects,
} from "./_prod_schema.mjs";

const before = process.argv.includes("--before");
const db = await loadProdSchema();

const OWNER = "11111111-1111-4111-8111-111111111111";
const VENDOR_USER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const GUEST = "66666666-6666-4666-8666-666666666666";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_EVENT = "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc";
const VENDOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_VENDOR = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const VENUE = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const OTHER_VENUE = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
const BOOKING = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SESSION = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";

// Supabase Storage, as far as these policies need it, in its state before
// 088 (the policy from supabase/install.sql).
await db.exec(`
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
    owner uuid DEFAULT auth.uid(), owner_id text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
  INSERT INTO storage.buckets VALUES ('venue-media', 'venue-media', true,
    ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml','application/pdf','video/mp4','video/webm','video/quicktime']);
  CREATE POLICY "venue_media_auth_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'venue-media');
`);

const seed = `
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${OWNER}', 'owner@example.com', now()), ('${VENDOR_USER}', 'vendor@example.com', now()),
    ('${STRANGER}', 'stranger@example.com', now()), ('${GUEST}', 'guest@example.com', now());
  INSERT INTO public.profiles (user_id, display_name) SELECT id, split_part(email, '@', 1) FROM auth.users;
  INSERT INTO public.organizations (id, name, slug, owner_id) VALUES ('${ORG}', 'Org', 'org', '${OWNER}');
  INSERT INTO public.org_members (org_id, user_id, role) VALUES ('${ORG}', '${OWNER}', 'owner');
  INSERT INTO public.events (id, title, slug, date, user_id, org_id, status, price, capacity, event_format) VALUES
    ('${EVENT}', 'Launch', 'launch', now() + interval '30 days', '${OWNER}', '${ORG}', 'published', 0, 0, 'virtual'),
    ('${OTHER_EVENT}', 'Other', 'other', now() + interval '30 days', '${OWNER}', '${ORG}', 'published', 0, 0, 'virtual');
  INSERT INTO public.vendors (id, business_name) VALUES ('${VENDOR}', 'Halls Ltd'), ('${OTHER_VENDOR}', 'Rival Rooms');
  INSERT INTO public.vendor_email_allowlist (email) SELECT 'vendor@example.com'
    WHERE to_regclass('public.vendor_email_allowlist') IS NOT NULL;
  INSERT INTO public.vendor_members (vendor_id, user_id, role) VALUES ('${VENDOR}', '${VENDOR_USER}', 'owner');
  INSERT INTO public.venues (id, vendor_id, name) VALUES ('${VENUE}', '${VENDOR}', 'Main hall'), ('${OTHER_VENUE}', '${OTHER_VENDOR}', 'Their hall');
  INSERT INTO public.vendor_bookings (id, org_id, vendor_id, event_id, total, commission_amount, commission_rate, status, event_date)
    VALUES ('${BOOKING}', '${ORG}', '${VENDOR}', '${EVENT}', 50000, 6000, 12.00, 'pending', current_date + 40);
  INSERT INTO public.whatsapp_templates (org_id, name, language, status) VALUES ('${ORG}', 'reminder', 'en', 'APPROVED');
  INSERT INTO public.webinar_sessions (id, event_id, livekit_room, created_by, status) VALUES
    ('${SESSION}', '${EVENT}', 'room-launch', '${OWNER}', 'scheduled');
  INSERT INTO public.webinar_speakers (session_id, email, display_name, role, invite_token) VALUES
    ('${SESSION}', 'speaker@example.com', 'Sam Speaker', 'speaker', 'speaker-token-1');
  -- (registrations_validate approves inserts for free events; the UPDATE below
  -- makes one pending.)
  INSERT INTO public.registrations (event_id, name, email, join_token, approval_status, status) VALUES
    ('${EVENT}', 'Gita Guest', 'guest@example.com', 'join-ok', 'approved', 'confirmed'),
    ('${EVENT}', 'Pat Pending', 'pending@example.com', 'join-pending', 'pending', 'confirmed'),
    ('${EVENT}', 'Cal Cancelled', 'cancelled@example.com', 'join-cancelled', 'approved', 'cancelled'),
    ('${OTHER_EVENT}', 'Otto Other', 'other@example.com', 'join-other-event', 'approved', 'confirmed');
  UPDATE public.registrations SET approval_status = 'pending' WHERE join_token = 'join-pending';
`;
for (const stmt of seed.split(/;\n/).map((x) => x.trim()).filter(Boolean)) {
  try { await db.exec(stmt); } catch (err) { console.error(`Seeding failed: ${err.message}\n  ${stmt.slice(0, 160)}`); process.exit(1); }
}

await db.exec(migrationSection("087_security_hardening.sql"));
if (!before) await db.exec(migrationSection("088_audit_followups.sql"));
const { check, finish } = checker();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const status = async () => (await one(`SELECT status FROM public.vendor_bookings WHERE id = $1`, [BOOKING])).status;

// ── 1. Booking status changes ────────────────────────────────────────────────
await check("a vendor can confirm its booking, logged as itself", async () => {
  await asUser(db, VENDOR_USER, () => db.query(`UPDATE public.vendor_bookings SET status = 'confirmed' WHERE id = $1`, [BOOKING]));
  eq(await status(), "confirmed", "status");
  const log = await one(`SELECT actor_id, metadata->>'to' AS "to" FROM public.vendor_audit_log WHERE entity_id = $1 AND action = 'booking_status_changed'`, [BOOKING]);
  eq(log, { actor_id: VENDOR_USER, to: "confirmed" }, "audit row");
});
await check("the platform can change a booking's status, logged with no actor", async () => {
  await asService(db, () => db.query(`UPDATE public.vendor_bookings SET status = 'completed' WHERE id = $1`, [BOOKING]));
  eq(await status(), "completed", "status");
  const log = await one(`SELECT actor_id FROM public.vendor_audit_log WHERE entity_id = $1 AND metadata->>'to' = 'completed'`, [BOOKING]);
  eq(log.actor_id, null, "system actor");
});
await check("a stranger still cannot change someone's booking", async () => {
  await asUser(db, STRANGER, () => db.query(`UPDATE public.vendor_bookings SET status = 'cancelled' WHERE id = $1`, [BOOKING]));
  eq(await status(), "completed", "status");
});

// ── 2. venue-media uploads ───────────────────────────────────────────────────
const upload = (uid, name) => asUser(db, uid, () => db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('venue-media', $1)`, [name]));
await check("a vendor team uploads into its own venue's folder", async () => {
  await upload(VENDOR_USER, `${VENUE}/photo.jpg`);
});
await check("nobody else can upload into that venue's folder", async () => {
  await rejects(() => upload(STRANGER, `${VENUE}/fake.jpg`), /row-level security/, "stranger");
});
await check("a vendor team cannot upload into another vendor's venue", async () => {
  await rejects(() => upload(VENDOR_USER, `${OTHER_VENUE}/fake.jpg`), /row-level security/, "other venue");
});
await check("uploads outside a venue folder are refused", async () => {
  await rejects(() => upload(VENDOR_USER, `free-hosting/file.html`), /row-level security/, "no venue folder");
  await rejects(() => upload(VENDOR_USER, `top-level.jpg`), /row-level security/, "top level");
});
await check("venue-media no longer accepts SVG", async () => {
  const b = await one(`SELECT 'image/svg+xml' = ANY (allowed_mime_types) AS svg, 'image/jpeg' = ANY (allowed_mime_types) AS jpeg FROM storage.buckets WHERE id = 'venue-media'`);
  eq(b, { svg: false, jpeg: true }, "mime types");
});

// ── 3. WhatsApp templates ────────────────────────────────────────────────────
await check("an organisation's team sees its WhatsApp templates", async () => {
  const r = await asUser(db, OWNER, () => db.query(`SELECT name FROM public.whatsapp_templates_list($1)`, [ORG]));
  eq(r.rows.map((x) => x.name), ["reminder"], "templates");
});
await check("other users don't see an organisation's WhatsApp templates", async () => {
  const r = await asUser(db, STRANGER, () => db.query(`SELECT name FROM public.whatsapp_templates_list($1)`, [ORG]));
  eq(r.rows.length, 0, "rows");
  await rejects(() => asAnon(db, () => db.query(`SELECT * FROM public.whatsapp_templates_list($1)`, [ORG])), /permission denied/, "anon");
});

// ── 4. Webinar links without signing in ──────────────────────────────────────
const access = (join, speaker, event = EVENT) =>
  asAnon(db, () => one(`SELECT public.webinar_link_access($1, $2, $3) AS a`, [event, join, speaker])).then((r) => r.a);
await check("a guest's join link loads the session and their name", async () => {
  const a = await access("join-ok", null);
  eq([a?.session?.id, a?.visitor_name, a?.visitor_role], [SESSION, "Gita Guest", "attendee"], "access");
});
await check("a speaker's invite link loads the session and their name", async () => {
  const a = await access(null, "speaker-token-1");
  eq([a?.session?.id, a?.visitor_name, a?.visitor_role], [SESSION, "Sam Speaker", "speaker"], "access");
});
await check("links that don't belong to this event, or aren't approved, load nothing", async () => {
  eq(await access("join-other-event", null), null, "other event's link");
  eq(await access("join-pending", null), null, "pending registration");
  eq(await access("join-cancelled", null), null, "cancelled registration");
  eq(await access("speaker-token-1", null, OTHER_EVENT), null, "speaker link on another event");
  eq(await access("not-a-token", "not-a-token"), null, "made-up tokens");
  eq(await access(null, null), null, "no tokens");
});

if (!before) {
  await check("running 088 a second time changes nothing", async () => {
    await db.exec(migrationSection("088_audit_followups.sql"));
    const r = await db.query(`SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'`);
    eq(r.rows.map((x) => x.policyname), ["venue_media_team_insert"], "storage policies");
  });
}

finish(before ? "088 (before the migration)" : "088_audit_followups");
