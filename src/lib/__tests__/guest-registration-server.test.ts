/**
 * The guest-registration edge function, exercised end to end against an
 * in-memory store: registering without an account, approval, duplicates,
 * activation links, and the limits that protect the public endpoints.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildConfirmationEmail, createHandler, passwordProblem, registrationReference, sanitizeUtm, sha256Hex,
  validateRegistration, TOKEN_TTL_HOURS,
  type Deps, type EventRow, type NewRegistration, type RegistrationRow, type Store, type TokenRow,
} from "../../../supabase/functions/guest-registration/index";

const EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPROVAL_EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DRAFT_EVENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAST_EVENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SMALL_EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOW = new Date("2026-10-13T10:00:00Z");

const event = (id: string, over: Partial<EventRow> = {}): EventRow => ({
  id, title: "Leadership Summit", status: "published", date: "2026-11-01T04:30:00Z", end_date: null, timezone: "Asia/Kolkata",
  venue: "Grand Hall", location: "Mumbai", capacity: 100, requires_approval: false, event_format: "physical",
  banner_url: null, org_name: "Sample Events Co", org_logo_url: null, ...over,
});

interface World {
  events: Map<string, EventRow>;
  registrations: (RegistrationRow & { utm: NewRegistration["utm"]; confirmationSent: boolean })[];
  users: Map<string, { id: string; password: string; meta: Record<string, string> }>;
  tokens: (TokenRow & { token_hash: string })[];
  hits: Map<string, number>;
  outbox: { to: string; subject: string; html: string; text: string }[];
  emailWorks: boolean;
  createUserWorks: boolean;
  now: Date;
  issued: string[];
}

function makeWorld(): World {
  return {
    events: new Map([
      [EVENT, event(EVENT)],
      [APPROVAL_EVENT, event(APPROVAL_EVENT, { requires_approval: true })],
      [DRAFT_EVENT, event(DRAFT_EVENT, { status: "draft" })],
      [PAST_EVENT, event(PAST_EVENT, { date: "2026-09-01T04:30:00Z" })],
      [SMALL_EVENT, event(SMALL_EVENT, { capacity: 1 })],
    ]),
    registrations: [], users: new Map(), tokens: [], hits: new Map(), outbox: [],
    emailWorks: true, createUserWorks: true, now: new Date(NOW), issued: [],
  };
}

function makeDeps(w: World): Deps {
  let seq = 0;
  const store: Store = {
    async allow(bucket, key, _window, max) {
      const k = `${bucket}:${key}`;
      const n = w.hits.get(k) ?? 0;
      if (n >= max) return false;
      w.hits.set(k, n + 1);
      return true;
    },
    async getEvent(id) { return w.events.get(id) ?? null; },
    async countGoing(eventId) { return w.registrations.filter((r) => r.event_id === eventId && r.approval_status !== "declined" && r.approval_status !== "waitlisted").length; },
    async findRegistration(eventId, email) { return w.registrations.find((r) => r.event_id === eventId && r.email === email) ?? null; },
    async latestRegistration(email) { return [...w.registrations].reverse().find((r) => r.email === email) ?? null; },
    async insertRegistration(row) {
      // Mirrors the database: one registration per email per event, and the
      // trigger decides the approval state.
      if (w.registrations.some((r) => r.event_id === row.event_id && r.email === row.email)) return { duplicate: true };
      const ev = w.events.get(row.event_id)!;
      seq += 1;
      const id = `0000000${seq}-0000-4000-8000-000000000000`;
      const saved = {
        id, event_id: row.event_id, email: row.email, name: row.name, first_name: row.first_name, last_name: row.last_name,
        designation: row.designation, company: row.company, mobile_country_code: row.mobile_country_code, mobile_number: row.mobile_number,
        approval_status: ev.requires_approval ? "pending" : row.approval_status, qr_code: `qr-${seq}`, join_token: `join-${seq}`,
        user_id: null, utm: row.utm, confirmationSent: false,
      };
      w.registrations.push(saved);
      return { row: saved };
    },
    async markConfirmationSent(id) { const r = w.registrations.find((x) => x.id === id); if (r) r.confirmationSent = true; },
    async findUserIdByEmail(email) { return w.users.get(email)?.id ?? null; },
    async replaceToken(email, registrationId, tokenHash, expiresAt) {
      for (const t of w.tokens) if (t.email === email && !t.used_at) t.used_at = w.now.toISOString();
      w.tokens.push({ id: `t${w.tokens.length + 1}`, email, registration_id: registrationId, token_hash: tokenHash, expires_at: expiresAt, used_at: null });
      return true;
    },
    async findToken(tokenHash) { return w.tokens.find((t) => t.token_hash === tokenHash) ?? null; },
    async claimToken(id, at) { const t = w.tokens.find((x) => x.id === id); if (!t || t.used_at) return false; t.used_at = at; return true; },
    async releaseToken(id) { const t = w.tokens.find((x) => x.id === id); if (t) t.used_at = null; },
    async createUser(email, password, meta) {
      if (!w.createUserWorks) return { error: "database unavailable" };
      if (w.users.has(email)) return { error: "User already registered", exists: true };
      const id = `user-${w.users.size + 1}`;
      w.users.set(email, { id, password, meta });
      return { id };
    },
    async linkRegistrations(email, userId) { for (const r of w.registrations) if (r.email === email && !r.user_id) r.user_id = userId; },
  };
  return {
    store,
    async sendEmail(msg) { if (!w.emailWorks) return { ok: false, error: "smtp down" }; w.outbox.push(msg); return { ok: true }; },
    now: () => w.now,
    newToken: () => { const t = (w.issued.length + 1).toString(16).padStart(64, "0"); w.issued.push(t); return t; },
    origin: "https://illuxus.test",
  };
}

const form = (over: Record<string, unknown> = {}) => ({
  action: "register", event_id: EVENT, first_name: "Asha", last_name: "Rao", email: "Asha.Rao@Example.com",
  mobile_country_code: "+91", mobile_number: "98765 43210", company: "Acme", designation: "Director", consent: true, ...over,
});

let w: World;
let handle: ReturnType<typeof createHandler>;
beforeEach(() => { w = makeWorld(); handle = createHandler(makeDeps(w)); });

const lastToken = () => w.issued[w.issued.length - 1];

describe("registering without an account", () => {
  it("saves the registration, confirms it and emails the ticket with an account link", async () => {
    const res = await handle(form({ utm: { utm_source: "partner-a", utm_campaign: "launch", evil: "x" } }), "1.1.1.1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, duplicate: false, status: "approved", email_sent: true });
    expect(res.body.reference).toBe(registrationReference(w.registrations[0].id));

    expect(w.registrations).toHaveLength(1);
    const reg = w.registrations[0];
    expect(reg).toMatchObject({ email: "asha.rao@example.com", name: "Asha Rao", user_id: null, mobile_number: "9876543210", confirmationSent: true });
    // Attribution is saved with the registration; unknown keys are dropped.
    expect(reg.utm).toEqual({ utm_source: "partner-a", utm_campaign: "launch" });
    // No account was created by registering.
    expect(w.users.size).toBe(0);

    expect(w.outbox).toHaveLength(1);
    const mail = w.outbox[0];
    expect(mail.to).toBe("asha.rao@example.com");
    expect(mail.subject).toBe("Your ticket for Leadership Summit");
    expect(mail.html).toContain("Set Up Your Illuxus Account");
    expect(mail.html).toContain(`https://illuxus.test/activate?token=${lastToken()}`);
    expect(mail.html).toContain("create-qr-code");
    expect(mail.html).toContain(String(res.body.reference));
    expect(mail.text).toContain("Asha Rao");
    // The response never says whether the email has an account.
    expect(JSON.stringify(res.body)).not.toMatch(/account|token/i);
  });

  it("only the hash of the activation token is stored", async () => {
    await handle(form(), "1.1.1.1");
    expect(w.tokens[0].token_hash).toBe(await sha256Hex(lastToken()));
    expect(w.tokens[0].token_hash).not.toBe(lastToken());
    const ttlHours = (new Date(w.tokens[0].expires_at).getTime() - NOW.getTime()) / 3600_000;
    expect(ttlHours).toBe(TOKEN_TTL_HOURS);
  });

  it("keeps approval-based registrations pending and sends no ticket", async () => {
    const res = await handle(form({ event_id: APPROVAL_EVENT }), "1.1.1.1");
    expect(res.body).toMatchObject({ ok: true, status: "pending" });
    expect(w.registrations[0].approval_status).toBe("pending");
    const mail = w.outbox[0];
    expect(mail.subject).toBe("Application received: Leadership Summit");
    expect(mail.html).toContain("pending approval");
    expect(mail.html).not.toContain("create-qr-code");
    expect(mail.text).not.toContain("Ticket code");
    // The account link is still offered.
    expect(mail.html).toContain("/activate?token=");
  });

  it("does not create a second registration for the same email and event", async () => {
    await handle(form(), "1.1.1.1");
    const again = await handle(form({ email: "asha.rao@example.com", first_name: "Someone", last_name: "Else" }), "2.2.2.2");
    expect(again.body).toMatchObject({ ok: true, duplicate: true });
    expect(w.registrations).toHaveLength(1);
    expect(w.registrations[0].name).toBe("Asha Rao");
    // The details go to the registered inbox again, not to the caller.
    expect(w.outbox).toHaveLength(2);
    expect(w.outbox[1].to).toBe("asha.rao@example.com");
  });

  it("lets the same person register for a different event", async () => {
    await handle(form(), "1.1.1.1");
    const other = await handle(form({ event_id: APPROVAL_EVENT }), "1.1.1.1");
    expect(other.body).toMatchObject({ ok: true, duplicate: false });
    expect(w.registrations).toHaveLength(2);
  });

  it("keeps the registration when the email cannot be sent, and does not duplicate it on retry", async () => {
    w.emailWorks = false;
    const res = await handle(form(), "1.1.1.1");
    expect(res.body).toMatchObject({ ok: true, duplicate: false, email_sent: false });
    expect(w.registrations).toHaveLength(1);
    expect(w.registrations[0].confirmationSent).toBe(false);

    w.emailWorks = true;
    const retry = await handle(form(), "1.1.1.1");
    expect(retry.body).toMatchObject({ ok: true, duplicate: true, email_sent: true });
    expect(w.registrations).toHaveLength(1);
    expect(w.outbox).toHaveLength(1);
  });

  it("refuses unpublished, finished and full events", async () => {
    expect((await handle(form({ event_id: DRAFT_EVENT }), "1.1.1.1")).body.code).toBe("not_found");
    expect((await handle(form({ event_id: PAST_EVENT }), "1.1.1.1")).body.code).toBe("closed");
    await handle(form({ event_id: SMALL_EVENT }), "1.1.1.1");
    const full = await handle(form({ event_id: SMALL_EVENT, email: "second@example.com" }), "1.1.1.1");
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("full");
    expect(w.registrations).toHaveLength(1);
  });

  it("validates on the server", async () => {
    const res = await handle(form({ email: "not-an-email", first_name: " ", mobile_number: "12", consent: false }), "1.1.1.1");
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors as object).sort()).toEqual(["consent", "email", "first_name", "mobile_number"]);
    expect(w.registrations).toHaveLength(0);
    expect(validateRegistration(form({ email: "%@example.com" })).ok).toBe(false);
  });

  it("ignores submissions that fill the hidden field", async () => {
    const res = await handle(form({ website: "http://spam.example" }), "1.1.1.1");
    expect(res.status).toBe(200);
    expect(w.registrations).toHaveLength(0);
    expect(w.outbox).toHaveLength(0);
  });

  it("limits how often one email or one address can register", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await handle(form({ event_id: i % 2 ? EVENT : APPROVAL_EVENT }), `9.9.9.${i}`)).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe("an email that already has an account", () => {
  beforeEach(() => { w.users.set("asha.rao@example.com", { id: "existing-user", password: "original-pass1", meta: {} }); });

  it("registers without issuing an activation link", async () => {
    const res = await handle(form(), "1.1.1.1");
    expect(res.body).toMatchObject({ ok: true, duplicate: false, status: "approved" });
    expect(w.tokens).toHaveLength(0);
    expect(w.outbox[0].html).not.toContain("/activate?token=");
    expect(w.outbox[0].html).toContain("Sign in to Illuxus");
    // The registration is not attached to the account by an anonymous request.
    expect(w.registrations[0].user_id).toBeNull();
    expect(w.users.get("asha.rao@example.com")!.password).toBe("original-pass1");
  });

  it("answers exactly as it does for an email with no account", async () => {
    const withAccount = await handle(form(), "1.1.1.1");
    const fresh = makeWorld();
    const without = await createHandler(makeDeps(fresh))(form(), "1.1.1.1");
    expect(Object.keys(withAccount.body).sort()).toEqual(Object.keys(without.body).sort());
    expect({ ...withAccount.body, reference: null }).toEqual({ ...without.body, reference: null });
  });
});

describe("setting up an account from the email link", () => {
  beforeEach(async () => { await handle(form({ utm: { utm_source: "partner-a" } }), "1.1.1.1"); });

  it("reports a good link as usable", async () => {
    const res = await handle({ action: "inspect", token: lastToken() }, "1.1.1.1");
    expect(res.body).toEqual({ ok: true, valid: true, email: "asha.rao@example.com" });
  });

  it("creates the account, keeps the registration and its attribution, and makes no duplicates", async () => {
    await handle(form({ event_id: APPROVAL_EVENT }), "1.1.1.1");
    const res = await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1");
    expect(res).toEqual({ status: 200, body: { ok: true, email: "asha.rao@example.com" } });

    const user = w.users.get("asha.rao@example.com")!;
    expect(user.password).toBe("correct horse 42");
    expect(user.meta).toMatchObject({ account_type: "attendee", first_name: "Asha", last_name: "Rao", company: "Acme", designation: "Director", mobile_number: "9876543210" });
    // Both registrations now belong to the account; none were added or changed.
    expect(w.registrations).toHaveLength(2);
    expect(w.registrations.every((r) => r.user_id === user.id)).toBe(true);
    expect(w.registrations[0]).toMatchObject({ qr_code: "qr-1", approval_status: "approved", utm: { utm_source: "partner-a" } });
    expect(w.registrations[1].approval_status).toBe("pending");
    expect(w.users.size).toBe(1);
  });

  it("works only once", async () => {
    const token = lastToken();
    await handle({ action: "activate", token, password: "correct horse 42" }, "1.1.1.1");
    w.users.clear(); // even if the account were gone, the link stays spent
    const again = await handle({ action: "activate", token, password: "another pass 99" }, "1.1.1.1");
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("used");
    expect(w.users.size).toBe(0);
    expect((await handle({ action: "inspect", token }, "1.1.1.1")).body).toMatchObject({ valid: false, reason: "used", can_resend: false });
  });

  it("expires", async () => {
    w.now = new Date(NOW.getTime() + (TOKEN_TTL_HOURS + 1) * 3600_000);
    const res = await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1");
    expect(res.body).toMatchObject({ ok: false, code: "expired", can_resend: true });
    expect(w.users.size).toBe(0);
  });

  it("rejects made-up, malformed and superseded tokens", async () => {
    for (const token of ["f".repeat(64), "short", "", "z".repeat(64)]) {
      const res = await handle({ action: "activate", token, password: "correct horse 42" }, "1.1.1.1");
      expect(res.body.code).toBe("invalid");
    }
    const first = lastToken();
    await handle({ action: "resend", token: first }, "1.1.1.1");
    expect(lastToken()).not.toBe(first);
    // The older link stopped working when the new one was issued.
    expect((await handle({ action: "activate", token: first, password: "correct horse 42" }, "1.1.1.1")).body.code).toBe("used");
    expect((await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1")).body.ok).toBe(true);
    expect(w.users.size).toBe(1);
  });

  it("cannot take over an account created after the link was sent", async () => {
    w.users.set("asha.rao@example.com", { id: "owner", password: "owners-pass1", meta: {} });
    const res = await handle({ action: "activate", token: lastToken(), password: "attacker pass 1" }, "1.1.1.1");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("account_exists");
    expect(w.users.get("asha.rao@example.com")!.password).toBe("owners-pass1");
    expect(w.registrations[0].user_id).toBeNull();
  });

  it("enforces the password rules", async () => {
    for (const password of ["short1", "allletters", "12345678", 12345678, undefined]) {
      const res = await handle({ action: "activate", token: lastToken(), password }, "1.1.1.1");
      expect(res.body.code).toBe("weak_password");
    }
    expect(w.users.size).toBe(0);
    // A rejected password does not use the link up.
    expect(w.tokens[0].used_at).toBeNull();
    expect(passwordProblem("good pass 1")).toBeNull();
  });

  it("hands the link back if the account could not be created", async () => {
    w.createUserWorks = false;
    const failed = await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1");
    expect(failed.status).toBe(500);
    w.createUserWorks = true;
    expect((await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1")).body.ok).toBe(true);
  });

  it("limits password attempts", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await handle({ action: "activate", token: "f".repeat(64), password: "correct horse 42" }, "7.7.7.7")).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});

describe("asking for a new link", () => {
  it("replaces an expired link, and answers the same way whatever it finds", async () => {
    await handle(form(), "1.1.1.1");
    const expired = lastToken();
    w.now = new Date(NOW.getTime() + (TOKEN_TTL_HOURS + 1) * 3600_000);

    const known = await handle({ action: "resend", token: expired }, "1.1.1.1");
    const unknownToken = await handle({ action: "resend", token: "f".repeat(64) }, "1.1.1.1");
    const unknownEmail = await handle({ action: "resend", event_id: EVENT, email: "nobody@example.com" }, "1.1.1.1");
    expect(unknownToken).toEqual(known);
    expect(unknownEmail).toEqual(known);

    // Only the real one produced an email, with a link that works.
    expect(w.outbox).toHaveLength(2);
    expect(w.outbox[1].subject).toBe("Set up your Illuxus account");
    expect((await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1")).body.ok).toBe(true);
  });

  it("sends nothing for an email that already has an account, or for a spent link", async () => {
    await handle(form(), "1.1.1.1");
    await handle({ action: "activate", token: lastToken(), password: "correct horse 42" }, "1.1.1.1");
    const sentBefore = w.outbox.length;
    await handle({ action: "resend", token: lastToken() }, "1.1.1.1");
    await handle({ action: "resend", event_id: EVENT, email: "asha.rao@example.com" }, "1.1.1.1");
    expect(w.outbox).toHaveLength(sentBefore);
  });

  it("is rate limited per email", async () => {
    await handle(form(), "1.1.1.1");
    for (let i = 0; i < 6; i++) await handle({ action: "resend", event_id: EVENT, email: "asha.rao@example.com" }, `3.3.3.${i}`);
    // 1 confirmation + at most 3 resends in the hour.
    expect(w.outbox).toHaveLength(4);
  });
});

describe("helpers", () => {
  it("caps and filters UTM values", () => {
    expect(sanitizeUtm({ utm_source: "  news\nletter ", utm_medium: "", utm_term: "x".repeat(600), org_id: "1" })).toEqual({
      utm_source: "news letter", utm_term: "x".repeat(512),
    });
    expect(sanitizeUtm("nope")).toEqual({});
  });

  it("escapes event and attendee text in the email", () => {
    const mail = buildConfirmationEmail({
      event: event(EVENT, { title: "<script>alert(1)</script>", event_format: "virtual" }),
      registration: {
        id: "12345678-0000-4000-8000-000000000000", event_id: EVENT, email: "a@b.co", name: "<b>Bob</b>", first_name: "<b>Bob</b>", last_name: "",
        designation: null, company: null, mobile_country_code: null, mobile_number: null, approval_status: "approved", qr_code: "qr", join_token: "jt", user_id: null,
      },
      origin: "https://illuxus.test", activationUrl: null,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>Bob</b>");
    // Online events include the personal join link once approved.
    expect(mail.html).toContain(`https://illuxus.test/e/${EVENT}/live?join=jt`);
    expect(mail.html).toContain("ILX-12345678");
  });
});
