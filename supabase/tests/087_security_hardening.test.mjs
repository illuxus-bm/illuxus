// Tests migration 087 (platform audit fixes) against the production schema.
// Run:  node supabase/tests/087_security_hardening.test.mjs
//       node supabase/tests/087_security_hardening.test.mjs --before
//         (skips the migration: the attack checks should then fail, which
//          shows each one is real on the schema as it was)
import {
  loadProdSchema, migrationSection, asAnon, asUser, asService, checker, eq, rejects,
} from "./_prod_schema.mjs";

const before = process.argv.includes("--before");
const db = await loadProdSchema();

const OWNER = "11111111-1111-4111-8111-111111111111";    // owns the organisation
const VIEWER = "22222222-2222-4222-8222-222222222222";   // read-only teammate
const VENDOR_USER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";
const ATTENDEE = "66666666-6666-4666-8666-666666666666";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "abababab-abab-4bab-8bab-abababababab";
const EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_EVENT = "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc";
const VENDOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RFQ = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BOOKING = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const BOOKING2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const ESCROW = "12121212-1212-4212-8212-121212121212";
const SERVICE = "13131313-1313-4313-8313-131313131313";

const seed = `
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${OWNER}', 'owner@example.com', now()), ('${VIEWER}', 'viewer@example.com', now()),
    ('${VENDOR_USER}', 'vendor@example.com', now()), ('${STRANGER}', 'stranger@example.com', now()),
    ('${ADMIN}', 'admin@example.com', now()), ('${ATTENDEE}', 'attendee@example.com', now()),
    -- audit_booking_status_change logs this placeholder actor when nobody is
    -- signed in; production has no such user, so there a service-role status
    -- change fails on the foreign key (a separate, existing bug).
    ('00000000-0000-0000-0000-000000000000', null, null);
  INSERT INTO public.profiles (user_id, display_name)
    SELECT id, split_part(email, '@', 1) FROM auth.users WHERE email IS NOT NULL;
  INSERT INTO public.user_roles (user_id, role) VALUES ('${ADMIN}', 'admin');
  INSERT INTO public.organizations (id, name, slug, owner_id) VALUES
    ('${ORG}', 'Org', 'org', '${OWNER}'), ('${OTHER_ORG}', 'Other', 'other', '${STRANGER}');
  INSERT INTO public.org_members (org_id, user_id, role) VALUES
    ('${ORG}', '${OWNER}', 'owner'), ('${ORG}', '${VIEWER}', 'viewer'), ('${OTHER_ORG}', '${STRANGER}', 'owner');
  INSERT INTO public.events (id, title, slug, date, user_id, org_id, status, price, capacity) VALUES
    ('${EVENT}', 'Launch', 'launch', now() + interval '30 days', '${OWNER}', '${ORG}', 'published', 0, 0),
    ('${OTHER_EVENT}', 'Theirs', 'theirs', now() + interval '30 days', '${STRANGER}', '${OTHER_ORG}', 'published', 0, 0);
  INSERT INTO public.vendors (id, business_name, verification_status, commission_rate, rating_avg, rating_count,
                              bank_name, bank_account_number, bank_routing, bank_country, tax_id)
    VALUES ('${VENDOR}', 'Halls Ltd', 'verified', 12.00, 4.20, 7,
            'First Bank', '12345678', 'ROUT-01', 'IN', 'TAX-99');
  INSERT INTO public.vendor_email_allowlist (email) SELECT 'vendor@example.com'
    WHERE to_regclass('public.vendor_email_allowlist') IS NOT NULL;
  INSERT INTO public.vendor_members (vendor_id, user_id, role) VALUES ('${VENDOR}', '${VENDOR_USER}', 'owner');
  INSERT INTO public.rfqs (id, org_id, event_id, requirements, event_date) VALUES
    ('${RFQ}', '${ORG}', '${EVENT}', 'A hall for 200', current_date + 30);
  INSERT INTO public.quotes (id, rfq_id, vendor_id, total, valid_until, status) VALUES
    ('${QUOTE}', '${RFQ}', '${VENDOR}', 100000, current_date + 10, 'sent');
  INSERT INTO public.vendor_bookings (id, org_id, vendor_id, event_id, total, commission_amount, commission_rate, status, event_date)
    VALUES ('${BOOKING}', '${ORG}', '${VENDOR}', '${EVENT}', 50000, 6000, 12.00, 'confirmed', current_date + 40);
  INSERT INTO public.payment_escrow (id, booking_id, amount, status) VALUES ('${ESCROW}', '${BOOKING}', 15000, 'held');
  INSERT INTO public.vendor_services (id, vendor_id, title, is_instant_book, base_price, unit) VALUES
    ('${SERVICE}', '${VENDOR}', 'Main hall', true, 80000, 'per_event');
`;
for (const stmt of seed.split(/;\n/).map((x) => x.trim()).filter(Boolean)) {
  try { await db.exec(stmt); } catch (err) { console.error(`Seeding failed: ${err.message}\n  ${stmt.slice(0, 160)}`); process.exit(1); }
}

if (!before) await db.exec(migrationSection("087_security_hardening.sql"));
const { check, finish } = checker();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// ── C1: bank details ─────────────────────────────────────────────────────────
await check("anonymous callers no longer see bank details or tax IDs", async () => {
  const row = await asAnon(db, () => one(`SELECT bank_account_number, bank_routing, tax_id FROM public.vendors WHERE id = $1`, [VENDOR]));
  eq(row, { bank_account_number: null, bank_routing: null, tax_id: null }, "public vendor row");
});
await check("select * on vendors still works for anonymous callers", async () => {
  const row = await asAnon(db, () => one(`SELECT * FROM public.vendors WHERE id = $1`, [VENDOR]));
  eq(row.business_name, "Halls Ltd", "business_name");
});
await check("anonymous callers cannot read vendor_payout_details", async () => {
  await rejects(() => asAnon(db, () => db.query(`SELECT * FROM public.vendor_payout_details`)), /permission denied|does not exist/, "anon read");
});
await check("other signed-in users see no payout details", async () => {
  const r = await asUser(db, STRANGER, () => db.query(`SELECT * FROM public.vendor_payout_details`));
  eq(r.rows.length, 0, "rows");
});
await check("the vendor's team sees the moved details", async () => {
  const row = await asUser(db, VENDOR_USER, () => one(`SELECT bank_name, bank_account_number, bank_routing, bank_country, tax_id FROM public.vendor_payout_details WHERE vendor_id = $1`, [VENDOR]));
  eq(row, { bank_name: "First Bank", bank_account_number: "12345678", bank_routing: "ROUT-01", bank_country: "IN", tax_id: "TAX-99" }, "payout row");
});
await check("saving bank details through vendors stores them privately", async () => {
  await asUser(db, VENDOR_USER, () => db.query(`UPDATE public.vendors SET bank_account_number = '99990000', tagline = 'Big rooms' WHERE id = $1`, [VENDOR]));
  const pub = await one(`SELECT bank_account_number, tagline FROM public.vendors WHERE id = $1`, [VENDOR]);
  const priv = await one(`SELECT bank_account_number, bank_name FROM public.vendor_payout_details WHERE vendor_id = $1`, [VENDOR]);
  eq(pub, { bank_account_number: null, tagline: "Big rooms" }, "vendors row");
  eq(priv, { bank_account_number: "99990000", bank_name: "First Bank" }, "private row");
});

// ── H2: columns only the platform sets ──────────────────────────────────────
await check("a vendor cannot change its own verification, commission or rating", async () => {
  await asUser(db, VENDOR_USER, () => db.query(
    `UPDATE public.vendors SET verification_status = 'rejected', commission_rate = 5, rating_avg = 5, rating_count = 999, website = 'https://halls.example' WHERE id = $1`, [VENDOR]));
  const row = await one(`SELECT verification_status, commission_rate::text, rating_avg::text, rating_count, website FROM public.vendors WHERE id = $1`, [VENDOR]);
  eq(row, { verification_status: "verified", commission_rate: "12.00", rating_avg: "4.20", rating_count: 7, website: "https://halls.example" }, "vendor row");
});
await check("the platform can still verify vendors and recount ratings", async () => {
  // Admin tools and recompute_vendor_rating run server-side (service role or
  // SECURITY DEFINER), where the guard does not apply.
  await asService(db, () => db.query(`UPDATE public.vendors SET verification_status = 'pending', rating_count = 8 WHERE id = $1`, [VENDOR]));
  eq(await one(`SELECT verification_status, rating_count FROM public.vendors WHERE id = $1`, [VENDOR]), { verification_status: "pending", rating_count: 8 }, "vendor row");
  await db.query(`UPDATE public.vendors SET verification_status = 'verified', rating_count = 7 WHERE id = $1`, [VENDOR]);
});
// (Booking status is left alone here: on the production schema a status
// change made straight through the API already fails, because the
// audit_booking_status_change trigger can't write vendor_audit_log.)
await check("a vendor cannot cut the commission on a booking", async () => {
  await asUser(db, VENDOR_USER, () => db.query(`UPDATE public.vendor_bookings SET commission_amount = 0, commission_rate = 0, contract_url = 'https://x.example/c.pdf' WHERE id = $1`, [BOOKING]));
  const row = await one(`SELECT commission_amount::int, commission_rate::text, contract_url FROM public.vendor_bookings WHERE id = $1`, [BOOKING]);
  eq(row, { commission_amount: 6000, commission_rate: "12.00", contract_url: "https://x.example/c.pdf" }, "booking");
});
await check("a booking cannot be moved to another organisation or vendor", async () => {
  await asUser(db, OWNER, () => db.query(`UPDATE public.vendor_bookings SET org_id = $2 WHERE id = $1`, [BOOKING, OTHER_ORG]));
  eq((await one(`SELECT org_id FROM public.vendor_bookings WHERE id = $1`, [BOOKING])).org_id, ORG, "org");
});
await check("a new total keeps the booked commission rate", async () => {
  await asUser(db, OWNER, () => db.query(`UPDATE public.vendor_bookings SET total = 60000 WHERE id = $1`, [BOOKING]));
  eq((await one(`SELECT commission_amount::int FROM public.vendor_bookings WHERE id = $1`, [BOOKING])).commission_amount, 7200, "commission");
});

// ── C2: marketplace functions ────────────────────────────────────────────────
// release_escrow, accept_quote and instant_book_service already fail on the
// production schema (release_escrow writes payment_escrow.payout_amount,
// which doesn't exist; the other two use an ON CONFLICT that matches no
// unique index). So for those, "allowed" means getting past the new check to
// that existing error, and "refused" means stopping at the check.
const escrowStatus = async () => (await one(`SELECT status FROM public.payment_escrow WHERE id = $1`, [ESCROW])).status;
await check("anonymous callers cannot release escrow", async () => {
  await rejects(() => asAnon(db, () => db.query(`SELECT public.release_escrow($1, $2)`, [ESCROW, OWNER])), /permission denied/, "anon release");
});
await check("a vendor cannot release its own escrow", async () => {
  await rejects(() => asUser(db, VENDOR_USER, () => db.query(`SELECT public.release_escrow($1, $2)`, [ESCROW, OWNER])), /Not authorized/, "vendor release");
});
await check("a read-only teammate cannot release escrow", async () => {
  await rejects(() => asUser(db, VIEWER, () => db.query(`SELECT public.release_escrow($1, $2)`, [ESCROW, OWNER])), /Not authorized/, "viewer release");
});
await check("the organisation gets past the escrow check", async () => {
  await rejects(() => asUser(db, OWNER, () => db.query(`SELECT public.release_escrow($1, $2)`, [ESCROW, STRANGER])), /payout_amount/, "owner release");
  eq(await escrowStatus(), "held", "escrow");
});
await check("a vendor cannot accept its own quote", async () => {
  await rejects(() => asUser(db, VENDOR_USER, () => db.query(`SELECT public.accept_quote($1)`, [QUOTE])), /Not authorized/, "vendor accept");
  await rejects(() => asUser(db, VENDOR_USER, () => db.query(`SELECT public.accept_quote($1, $2)`, [QUOTE, OWNER])), /Not authorized/, "vendor accept (actor)");
  await rejects(() => asAnon(db, () => db.query(`SELECT public.accept_quote($1)`, [QUOTE])), /permission denied/, "anon accept");
});
await check("the organisation gets past the quote check", async () => {
  await rejects(() => asUser(db, OWNER, () => db.query(`SELECT public.accept_quote($1, $2)`, [QUOTE, STRANGER])), /ON CONFLICT/, "owner accept");
});
await check("a stranger cannot instant-book for another organisation", async () => {
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public.instant_book_service($1, $2, $3, current_date + 50, $4)`, [SERVICE, ORG, EVENT, STRANGER])), /Not authorized/, "stranger book");
});
await check("an organisation cannot instant-book for someone else's event", async () => {
  await rejects(() => asUser(db, OWNER, () => db.query(`SELECT public.instant_book_service($1, $2, $3, current_date + 51, $4)`, [SERVICE, ORG, OTHER_EVENT, OWNER])), /does not belong/, "other event");
});
await check("the organisation gets past the instant-book check", async () => {
  await rejects(() => asUser(db, OWNER, () => db.query(`SELECT public.instant_book_service($1, $2, $3, current_date + 52, $4)`, [SERVICE, ORG, EVENT, STRANGER])), /ON CONFLICT/, "owner book");
});
await check("a stranger cannot cancel a booking", async () => {
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public.cancel_booking($1, $2, 'x')`, [BOOKING, STRANGER])), /Not authorized/, "stranger cancel");
  await rejects(() => asUser(db, VIEWER, () => db.query(`SELECT public.cancel_booking($1, $2, 'x')`, [BOOKING, OWNER])), /Not authorized/, "viewer cancel");
  await rejects(() => asAnon(db, () => db.query(`SELECT public.cancel_booking($1, $2, 'x')`, [BOOKING, STRANGER])), /permission denied/, "anon cancel");
  eq((await one(`SELECT status FROM public.vendor_bookings WHERE id = $1`, [BOOKING])).status, "confirmed", "booking");
});
await check("the vendor can cancel its booking, logged as itself", async () => {
  await asUser(db, VENDOR_USER, () => db.query(`SELECT public.cancel_booking($1, $2, 'Double booked')`, [BOOKING, OWNER]));
  eq((await one(`SELECT status FROM public.vendor_bookings WHERE id = $1`, [BOOKING])).status, "cancelled", "booking");
  eq(await escrowStatus(), "refunded", "escrow");
  const log = await one(`SELECT actor_id FROM public.vendor_audit_log WHERE entity_id = $1 AND action = 'booking_cancelled'`, [BOOKING]);
  eq(log.actor_id, VENDOR_USER, "audit actor");
});
await check("the service role still passes its own actor", async () => {
  await db.exec(`INSERT INTO public.vendor_bookings (id, org_id, vendor_id, total, commission_amount, commission_rate, status)
                 VALUES ('${BOOKING2}', '${ORG}', '${VENDOR}', 1000, 120, 12.00, 'pending')`);
  await asService(db, () => db.query(`SELECT public.cancel_booking($1, $2, 'ops')`, [BOOKING2, ADMIN]));
  const log = await one(`SELECT actor_id FROM public.vendor_audit_log WHERE entity_id = $1 AND action = 'booking_cancelled'`, [BOOKING2]);
  eq(log.actor_id, ADMIN, "audit actor");
});

// ── H1: internal helpers ─────────────────────────────────────────────────────
const community = async () => (await one(`SELECT id FROM public.communities WHERE event_id = $1`, [EVENT]))?.id;
await check("nobody can make themselves a community moderator", async () => {
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public._auto_join_event_community($1, $2, 'moderator')`, [EVENT, STRANGER])), /permission denied/, "signed-in");
  await rejects(() => asAnon(db, () => db.query(`SELECT public._auto_join_event_community($1, $2, 'moderator')`, [EVENT, STRANGER])), /permission denied/, "anonymous");
  const r = await db.query(`SELECT 1 FROM public.community_members WHERE community_id = $1 AND user_id = $2`, [await community(), STRANGER]);
  eq(r.rows.length, 0, "stranger membership of the event's community");
});
await check("registering still joins the event community", async () => {
  if (!(await community())) throw new Error("the event has no community to join");
  await asUser(db, ATTENDEE, () => db.query(`INSERT INTO public.registrations (event_id, name, email) VALUES ($1, 'Ana', 'attendee@example.com')`, [EVENT]));
  const m = await one(`SELECT role::text, status FROM public.community_members WHERE community_id = $1 AND user_id = $2`, [await community(), ATTENDEE]);
  eq(m, { role: "member", status: "active" }, "membership");
});
await check("recount helpers are not callable through the API", async () => {
  await rejects(() => asAnon(db, () => db.query(`SELECT public._recompute_tickets_sold($1)`, [EVENT])), /permission denied/, "tickets");
  await rejects(() => asUser(db, STRANGER, () => db.query(`SELECT public.ensure_parent_community('tech')`)), /permission denied|invalid input/, "parent community");
});

// ── The migration can be run again ───────────────────────────────────────────
if (!before) {
  await check("running 087 a second time changes nothing", async () => {
    await db.exec(migrationSection("087_security_hardening.sql"));
    const row = await one(`SELECT bank_account_number FROM public.vendor_payout_details WHERE vendor_id = $1`, [VENDOR]);
    eq(row.bank_account_number, "99990000", "payout details kept");
  });
}

finish(before ? "087 (before the migration)" : "087_security_hardening");
