// Tests migration 091 (webinar fixes) against the production schema.
// Run:  node supabase/tests/091_webinar_fixes.test.mjs
import {
  loadProdSchema, migrationSection, asAnon, asUser, checker, eq, rejects,
} from "./_prod_schema.mjs";

const db = await loadProdSchema();
for (const m of ["087_security_hardening.sql", "088_audit_followups.sql", "089_advisor_fixes.sql"]) {
  await db.exec(migrationSection(m));
}
await db.exec(migrationSection("091_webinar_fixes.sql"));
// Running it twice must be harmless.
await db.exec(migrationSection("091_webinar_fixes.sql"));

const OWNER = "11111111-1111-4111-8111-111111111111";
const ATTENDEE = "22222222-2222-4222-8222-222222222222";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const QUESTION = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";

const seed = `
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${OWNER}', 'owner@example.com', now()), ('${ATTENDEE}', 'ann@example.com', now()),
    ('${STRANGER}', 'stranger@example.com', now());
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name) VALUES
    ('${OWNER}', 'owner', 'Olga', 'Owner'), ('${ATTENDEE}', 'ann', 'Ann', 'Attendee'), ('${STRANGER}', 'stranger', NULL, NULL);
  INSERT INTO public.organizations (id, name, slug, owner_id) VALUES ('${ORG}', 'Org', 'org', '${OWNER}');
  INSERT INTO public.org_members (org_id, user_id, role) VALUES ('${ORG}', '${OWNER}', 'owner');
  INSERT INTO public.events (id, title, slug, date, user_id, org_id, status, price, capacity, event_format) VALUES
    ('${EVENT}', 'Launch', 'launch', now() + interval '30 days', '${OWNER}', '${ORG}', 'published', 0, 0, 'virtual');
  INSERT INTO public.webinar_sessions (id, event_id, livekit_room, created_by, status) VALUES
    ('${SESSION}', '${EVENT}', 'room-launch', '${OWNER}', 'live');
  INSERT INTO public.webinar_speakers (session_id, email, display_name, role, invite_token) VALUES
    ('${SESSION}', 'speaker@example.com', 'Sam Speaker', 'speaker', 'speaker-token-1');
  INSERT INTO public.registrations (event_id, user_id, name, email, join_token, approval_status, status) VALUES
    ('${EVENT}', '${ATTENDEE}', 'Ann Attendee', 'ann@example.com', 'join-ann', 'approved', 'confirmed'),
    ('${EVENT}', NULL, 'Gita Guest', 'guest@example.com', 'join-ok', 'approved', 'confirmed'),
    ('${EVENT}', NULL, 'Pat Pending', 'pending@example.com', 'join-pending', 'approved', 'confirmed');
  UPDATE public.registrations SET approval_status = 'pending' WHERE join_token = 'join-pending';
  INSERT INTO public.webinar_qa (id, session_id, user_id, question) VALUES
    ('${QUESTION}', '${SESSION}', '${ATTENDEE}', 'When is the replay?');
  INSERT INTO public.webinar_chat (session_id, user_id, message) VALUES ('${SESSION}', '${ATTENDEE}', 'hi');
`;
for (const stmt of seed.split(/;\n/).map((x) => x.trim()).filter(Boolean)) {
  try { await db.exec(stmt); } catch (err) { console.error(`Seeding failed: ${err.message}\n  ${stmt.slice(0, 160)}`); process.exit(1); }
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const { check, finish } = checker();
const guestId = (await one(`SELECT id FROM public.registrations WHERE join_token = 'join-ok'`)).id;

await check("attendee upvotes a question, pressing again undoes it", async () => {
  eq((await asUser(db, ATTENDEE, () => one(`SELECT public.webinar_qa_vote($1) AS n`, [QUESTION]))).n, 1, "first vote");
  eq((await asUser(db, OWNER, () => one(`SELECT public.webinar_qa_vote($1) AS n`, [QUESTION]))).n, 2, "second voter");
  eq((await asUser(db, ATTENDEE, () => one(`SELECT public.webinar_qa_vote($1) AS n`, [QUESTION]))).n, 1, "undo");
  eq((await one(`SELECT upvotes FROM public.webinar_qa WHERE id = $1`, [QUESTION])).upvotes, 1, "stored count");
});

await check("guest with a join link can vote and sees their vote", async () => {
  eq((await asAnon(db, () => one(`SELECT public.webinar_qa_vote($1, 'join-ok') AS n`, [QUESTION]))).n, 2, "guest vote");
  const mine = await asAnon(db, () => db.query(`SELECT * FROM public.webinar_my_qa_votes($1, 'join-ok') AS id`, [SESSION]));
  eq(mine.rows.map((r) => r.id), [QUESTION], "guest's votes");
});

await check("strangers, pending registrations and anonymous callers can't vote", async () => {
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public.webinar_qa_vote($1)`, [QUESTION])), /attendees can vote/, "stranger");
  await rejects(() => asAnon(db, () => db.query(`SELECT public.webinar_qa_vote($1, 'join-pending')`, [QUESTION])), /attendees can vote/, "pending");
  await rejects(() => asAnon(db, () => db.query(`SELECT public.webinar_qa_vote($1)`, [QUESTION])), /attendees can vote/, "anon");
});

await check("nobody can touch the votes table or the internal helpers directly", async () => {
  await rejects(() => asUser(db, ATTENDEE, () => db.query(`SELECT * FROM public.webinar_qa_votes`)), /permission denied/, "votes table");
  await rejects(() => asUser(db, ATTENDEE, () => db.query(`SELECT * FROM public.webinar_member($1)`, [SESSION])), /permission denied/, "member helper");
  await rejects(() => asAnon(db, () => db.query(`SELECT * FROM public.webinar_names_for($1, ARRAY['x'])`, [SESSION])), /permission denied/, "names helper");
});

await check("heartbeats record attendance once per stretch, for users and guests", async () => {
  await asUser(db, ATTENDEE, () => db.query(`SELECT public.webinar_heartbeat($1)`, [SESSION]));
  await asUser(db, ATTENDEE, () => db.query(`SELECT public.webinar_heartbeat($1)`, [SESSION]));
  await asAnon(db, () => db.query(`SELECT public.webinar_heartbeat($1, 'join-ok')`, [SESSION]));
  const rows = (await db.query(`SELECT identity, display_name, role FROM public.webinar_attendance WHERE session_id = $1 ORDER BY identity`, [SESSION])).rows;
  eq(rows, [
    { identity: ATTENDEE, display_name: "Ann Attendee", role: "viewer" },
    { identity: `guest-${guestId}`, display_name: "Gita Guest", role: "viewer" },
  ], "attendance rows");
  eq((await one(`SELECT viewer_peak FROM public.webinar_sessions WHERE id = $1`, [SESSION])).viewer_peak, 2, "peak");
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public.webinar_heartbeat($1)`, [SESSION])), /attendees can join/, "stranger");
});

await check("heartbeats don't count once the session has ended", async () => {
  await db.exec(`UPDATE public.webinar_sessions SET status = 'ended' WHERE id = '${SESSION}'`);
  await asUser(db, OWNER, () => db.query(`SELECT public.webinar_heartbeat($1)`, [SESSION]));
  eq((await one(`SELECT count(*)::int AS n FROM public.webinar_attendance WHERE identity = $1`, [OWNER])).n, 0, "no row");
  await db.exec(`UPDATE public.webinar_sessions SET status = 'live' WHERE id = '${SESSION}'`);
});

await check("analytics return the fields the dashboard reads", async () => {
  const a = (await asUser(db, OWNER, () => one(`SELECT public.get_webinar_analytics($1) AS a`, [SESSION]))).a;
  eq(a.kpis.peak_viewers, 2, "peak_viewers");
  eq(a.kpis.unique_viewers, 2, "unique_viewers");
  eq(a.kpis.chat_count, 1, "chat_count");
  eq(a.kpis.qa_count, 1, "qa_count");
  eq(typeof a.kpis.avg_watch_minutes, "number", "avg_watch_minutes");
  eq(Array.isArray(a.timeline) && a.timeline.length > 0, true, "timeline");
  eq(a.top_attendees.map((t) => t.name).sort(), ["Ann Attendee", "Gita Guest"], "top attendee names");
  await rejects(() => asUser(db, ATTENDEE, () => db.query(`SELECT public.get_webinar_analytics($1)`, [SESSION])), /Forbidden/, "attendee");
});

await check("names resolve for session members only, never emails", async () => {
  const sp = (await one(`SELECT id FROM public.webinar_speakers WHERE invite_token = 'speaker-token-1'`)).id;
  const ids = [ATTENDEE, OWNER, `guest-${guestId}`, `guest-${sp}`, "not-a-uuid"];
  const rows = (await asUser(db, ATTENDEE, () =>
    db.query(`SELECT id, name FROM public.webinar_participant_names($1, $2) ORDER BY name`, [SESSION, ids]))).rows;
  eq(rows.map((r) => r.name), ["Ann Attendee", "Gita Guest", "Olga Owner", "Sam Speaker"], "names");
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT * FROM public.webinar_participant_names($1, $2)`, [SESSION, ids])), /can see names/, "stranger");
  const viaSpeakerLink = (await asAnon(db, () =>
    db.query(`SELECT name FROM public.webinar_participant_names($1, $2, NULL, 'speaker-token-1')`, [SESSION, [ATTENDEE]]))).rows;
  eq(viaSpeakerLink.map((r) => r.name), ["Ann Attendee"], "guest speaker");
});

finish("091_webinar_fixes");
