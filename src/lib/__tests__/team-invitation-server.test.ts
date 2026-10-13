/**
 * The team-invitation edge function, exercised end to end against an
 * in-memory store that behaves like the database (including
 * `complete_org_invitation`): who may invite, what an invitee is asked for,
 * how the account and membership are created, and how links are protected.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createHandler, invitationState, sha256Hex, supabaseStore, validateMemberDetails, INVITE_TTL_DAYS,
  type CallerUser, type Context, type Deps, type InvitationRow, type Store,
} from "../../../supabase/functions/team-invitation/index";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-10-13T10:00:00Z");

interface User { id: string; email: string; password: string; verified: boolean; meta: Record<string, string> }
interface Invite { id: string; org_id: string; email: string; role: string; status: string; expires_at: string; claimed_at: string | null; token_hash: string | null; invited_by: string; accepted_at: string | null; accepted_by: string | null }

interface World {
  orgs: Map<string, { name: string; owner_id: string }>;
  members: { org_id: string; user_id: string; role: string }[];
  users: User[];
  /** access token → user id */
  sessions: Map<string, string>;
  invites: Invite[];
  outbox: { to: string; subject: string; html: string; text: string }[];
  hits: Map<string, number>;
  issued: string[];
  now: Date;
  createUserWorks: boolean;
  completeWorks: boolean;
  deleted: string[];
}

function makeWorld(): World {
  const w: World = {
    orgs: new Map([[ORG, { name: "Acme Events", owner_id: "u-owner" }], [OTHER_ORG, { name: "Other Co", owner_id: "u-other" }]]),
    members: [],
    users: [],
    sessions: new Map(),
    invites: [],
    outbox: [],
    hits: new Map(),
    issued: [],
    now: new Date(NOW),
    createUserWorks: true,
    completeWorks: true,
    deleted: [],
  };
  const addUser = (id: string, email: string, verified: boolean, orgRole?: [string, string]) => {
    w.users.push({ id, email, password: "Existing123", verified, meta: {} });
    w.sessions.set(`jwt-${id}`, id);
    if (orgRole) w.members.push({ org_id: orgRole[0], user_id: id, role: orgRole[1] });
  };
  addUser("u-owner", "owner@acme.test", true, [ORG, "owner"]);
  addUser("u-admin", "admin@acme.test", true, [ORG, "admin"]);
  addUser("u-unverified", "new-admin@acme.test", false, [ORG, "admin"]);
  addUser("u-member", "member@acme.test", true, [ORG, "member"]);
  addUser("u-other", "boss@other.test", true, [OTHER_ORG, "owner"]);
  addUser("u-existing", "existing@elsewhere.test", true);
  return w;
}

const toRow = (w: World, i: Invite): InvitationRow => ({
  id: i.id, org_id: i.org_id, org_name: w.orgs.get(i.org_id)?.name ?? "", email: i.email, role: i.role,
  status: i.status, expires_at: i.expires_at, claimed_at: i.claimed_at,
});

function makeStore(w: World): Store {
  const userBy = (pred: (u: User) => boolean) => w.users.find(pred) ?? null;
  return {
    async allow(bucket, key, _window, max) {
      const k = `${bucket}:${key}`;
      const n = w.hits.get(k) ?? 0;
      if (n >= max) return false;
      w.hits.set(k, n + 1);
      return true;
    },
    async userFromJwt(jwt) {
      const id = w.sessions.get(jwt);
      const u = id ? userBy((x) => x.id === id) : null;
      return u ? ({ id: u.id, email: u.email, emailVerified: u.verified } satisfies CallerUser) : null;
    },
    async roleInOrg(orgId, userId) {
      if (w.orgs.get(orgId)?.owner_id === userId) return "owner";
      return w.members.find((m) => m.org_id === orgId && m.user_id === userId)?.role ?? null;
    },
    async orgName(orgId) { return w.orgs.get(orgId)?.name ?? null; },
    async displayName(userId) { return userId === "u-admin" ? "Priya Admin" : null; },
    async findUserIdByEmail(email) { return userBy((u) => u.email === email.toLowerCase())?.id ?? null; },
    async findInvitation(orgId, email) { const i = w.invites.find((x) => x.org_id === orgId && x.email === email); return i ? toRow(w, i) : null; },
    async findInvitationById(id) { const i = w.invites.find((x) => x.id === id); return i ? toRow(w, i) : null; },
    async findInvitationByHash(hash) { const i = w.invites.find((x) => x.token_hash === hash); return i ? toRow(w, i) : null; },
    async issueInvitation(existingId, f) {
      const fresh = { ...f, status: "pending", claimed_at: null, accepted_at: null, accepted_by: null };
      if (existingId) {
        const i = w.invites.find((x) => x.id === existingId)!;
        Object.assign(i, fresh);
        return { id: i.id };
      }
      const id = `${(w.invites.length + 1).toString().padStart(8, "0")}-0000-4000-8000-000000000000`;
      w.invites.push({ id, ...fresh });
      return { id };
    },
    async claimInvitation(id, at, staleBefore) {
      const i = w.invites.find((x) => x.id === id);
      if (!i || i.status !== "pending") return false;
      if (i.claimed_at && i.claimed_at >= staleBefore) return false;
      i.claimed_at = at;
      return true;
    },
    async releaseInvitation(id) { const i = w.invites.find((x) => x.id === id); if (i && i.status === "pending") i.claimed_at = null; },
    async createUser(email, password, meta) {
      if (!w.createUserWorks) return { error: "database unavailable" };
      if (userBy((u) => u.email === email)) return { error: "A user with this email address has already been registered", exists: true };
      const id = `u-new-${w.users.length + 1}`;
      // The real store creates the account already confirmed (see the
      // supabaseStore test below).
      w.users.push({ id, email, password, verified: true, meta });
      return { id };
    },
    async deleteUser(id) { w.deleted.push(id); w.users = w.users.filter((u) => u.id !== id); },
    // Mirrors complete_org_invitation (migration 046).
    async completeInvitation(id, userId) {
      if (!w.completeWorks) return { error: "insert into org_members failed" };
      const i = w.invites.find((x) => x.id === id);
      const u = userBy((x) => x.id === userId);
      if (!i || i.status !== "pending") return { error: "invitation_not_pending" };
      if (new Date(i.expires_at) <= w.now) return { error: "invitation_expired" };
      if (!u || u.email !== i.email.toLowerCase()) return { error: "email_mismatch" };
      let m = w.members.find((x) => x.org_id === i.org_id && x.user_id === userId);
      if (!m) { m = { org_id: i.org_id, user_id: userId, role: i.role }; w.members.push(m); }
      Object.assign(i, { status: "accepted", accepted_at: w.now.toISOString(), accepted_by: userId, claimed_at: null });
      return { org_id: i.org_id, role: m.role };
    },
  };
}

function makeDeps(w: World): Deps {
  return {
    store: makeStore(w),
    async sendEmail(msg) { w.outbox.push(msg); return { ok: true }; },
    now: () => w.now,
    newToken: () => { const t = (w.issued.length + 1).toString(16).padStart(64, "a"); w.issued.push(t); return t; },
    origin: "https://illuxus.test",
  };
}

let w: World;
let handle: ReturnType<typeof createHandler>;
beforeEach(() => { w = makeWorld(); handle = createHandler(makeDeps(w)); });

const as = (userId: string | null, ip = "203.0.113.5"): Context => ({ ip, jwt: userId ? `jwt-${userId}` : null });
const lastToken = () => w.issued[w.issued.length - 1];
const details = (over: Record<string, unknown> = {}) => ({
  first_name: "Neha", last_name: "Kapoor", designation: "Marketing Lead",
  mobile_country_code: "+91", mobile_number: "98765 43210", password: "Welcome2026", ...over,
});
const invite = async (email = "neha@acme.test", role = "member", by = "u-admin") =>
  handle({ action: "send", org_id: ORG, email, role }, as(by));
const accept = (over: Record<string, unknown> = {}, ctx: Context = as(null)) =>
  handle({ action: "accept", token: lastToken(), ...details(), ...over }, ctx);
const memberOf = (email: string) => {
  const u = w.users.find((x) => x.email === email);
  return u ? w.members.filter((m) => m.user_id === u.id) : [];
};

describe("1. a verified administrator can invite a team member", () => {
  it("saves a pending invitation bound to the email, workspace and role, and emails the link", async () => {
    const r = await invite("Neha@Acme.test", "member");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, email_sent: true });
    expect(w.invites).toHaveLength(1);
    const inv = w.invites[0];
    expect(inv).toMatchObject({ org_id: ORG, email: "neha@acme.test", role: "member", status: "pending", invited_by: "u-admin" });
    expect(new Date(inv.expires_at).getTime() - NOW.getTime()).toBe(INVITE_TTL_DAYS * 86400_000);
    expect(w.outbox).toHaveLength(1);
    expect(w.outbox[0].to).toBe("neha@acme.test");
    expect(w.outbox[0].text).toContain(`https://illuxus.test/invite?token=${lastToken()}`);
    expect(w.outbox[0].subject).toContain("Acme Events");
    expect(w.outbox[0].text).toContain("Priya Admin");
  });

  it("stores only a hash of the link's secret", async () => {
    await invite();
    expect(w.invites[0].token_hash).toBe(await sha256Hex(lastToken()));
    expect(JSON.stringify(w.invites)).not.toContain(lastToken());
  });

  it("an owner can invite another owner", async () => {
    expect((await invite("co-owner@acme.test", "owner", "u-owner")).status).toBe(200);
  });

  it("resend gives a new link and expiry; the old link stops working", async () => {
    await invite();
    const first = lastToken();
    w.now = new Date(NOW.getTime() + 3 * 86400_000);
    const r = await handle({ action: "resend", invitation_id: w.invites[0].id }, as("u-admin"));
    expect(r.status).toBe(200);
    expect(lastToken()).not.toBe(first);
    expect(new Date(w.invites[0].expires_at).getTime()).toBe(w.now.getTime() + INVITE_TTL_DAYS * 86400_000);
    const old = await handle({ action: "inspect", token: first }, as(null));
    expect(old.body).toMatchObject({ valid: false, reason: "invalid" });
  });

  it("a second invite for the same email and role points to Resend instead of duplicating", async () => {
    await invite();
    const again = await invite();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("already_invited");
    expect(w.invites).toHaveLength(1);
  });
});

describe("2. an unverified administrator cannot send an invitation", () => {
  it("refuses send with a clear message and saves nothing", async () => {
    const r = await invite("neha@acme.test", "member", "u-unverified");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("inviter_unverified");
    expect(String(r.body.error)).toMatch(/verify your own email/i);
    expect(w.invites).toHaveLength(0);
    expect(w.outbox).toHaveLength(0);
  });

  it("refuses resend as well", async () => {
    await invite();
    const sent = w.outbox.length;
    const r = await handle({ action: "resend", invitation_id: w.invites[0].id }, as("u-unverified"));
    expect(r.body.code).toBe("inviter_unverified");
    expect(w.outbox).toHaveLength(sent);
  });
});

describe("3–8. accepting as a new person", () => {
  it("3/4. needs only name, designation, mobile and password — no company details", async () => {
    await invite();
    const r = await accept();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, email: "neha@acme.test", org_id: ORG, role: "member" });
    const user = w.users.find((u) => u.email === "neha@acme.test")!;
    expect(user.password).toBe("Welcome2026");
    expect(user.meta).toMatchObject({ first_name: "Neha", last_name: "Kapoor", designation: "Marketing Lead", mobile_country_code: "+91", mobile_number: "9876543210" });
    expect(user.meta).not.toHaveProperty("company");
  });

  it("4. the server's form rules have no company field at all", () => {
    const v = validateMemberDetails(details());
    expect(v.ok).toBe(true);
    const missing = validateMemberDetails({});
    expect("errors" in missing && Object.keys(missing.errors).sort()).toEqual(["designation", "first_name", "last_name", "mobile_country_code", "mobile_number"]);
  });

  it("reports each missing or invalid field and creates nothing", async () => {
    await invite();
    const r = await accept({ first_name: " ", designation: "", mobile_number: "12" });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errors as object).sort()).toEqual(["designation", "first_name", "mobile_number"]);
    expect(w.users.some((u) => u.email === "neha@acme.test")).toBe(false);
    expect(w.invites[0].status).toBe("pending");
  });

  it("enforces the password policy", async () => {
    await invite();
    for (const password of ["short1", "lettersonly", "12345678", "x".repeat(129) + "1"]) {
      const r = await accept({ password });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe("weak_password");
    }
    expect(w.invites[0].status).toBe("pending");
  });

  it("5. the workspace comes from the invitation, whatever the request says", async () => {
    await invite();
    const r = await accept({ org_id: OTHER_ORG, orgId: OTHER_ORG, company: "Evil Corp", team_id: OTHER_ORG });
    expect(r.body.org_id).toBe(ORG);
    const ms = memberOf("neha@acme.test");
    expect(ms).toEqual([expect.objectContaining({ org_id: ORG })]);
    expect(w.orgs.size).toBe(2); // no workspace was created
  });

  it("6. the invitee gets exactly the invited role, even if the request asks for more", async () => {
    await invite("neha@acme.test", "viewer");
    const r = await accept({ role: "owner", assigned_role: "owner" });
    expect(r.body.role).toBe("viewer");
    expect(memberOf("neha@acme.test")).toEqual([{ org_id: ORG, user_id: expect.any(String), role: "viewer" }]);
  });

  it("7/8. the account is verified by the invitation — no verification email is sent", async () => {
    await invite();
    const before = w.outbox.length;
    await accept({ email_verified: false, emailVerified: true });
    expect(w.users.find((u) => u.email === "neha@acme.test")!.verified).toBe(true);
    expect(w.outbox).toHaveLength(before);
  });

  it("marks the invitation accepted with who and when", async () => {
    await invite();
    await accept();
    const user = w.users.find((u) => u.email === "neha@acme.test")!;
    expect(w.invites[0]).toMatchObject({ status: "accepted", accepted_by: user.id, accepted_at: NOW.toISOString(), claimed_at: null });
  });
});

describe("8. the verified state comes only from the server", () => {
  it("supabaseStore creates the invitee with email_confirm set by the server", async () => {
    const calls: unknown[] = [];
    const db = { auth: { admin: { createUser: async (args: unknown) => { calls.push(args); return { data: { user: { id: "new" } }, error: null }; } } } };
    const created = await supabaseStore(db).createUser("neha@acme.test", "Welcome2026", { first_name: "Neha" });
    expect(created).toEqual({ id: "new" });
    expect(calls).toEqual([{ email: "neha@acme.test", password: "Welcome2026", email_confirm: true, user_metadata: { first_name: "Neha" } }]);
  });
});

describe("9. invalid, expired and revoked links are refused", () => {
  it("an unknown or malformed token", async () => {
    await invite();
    for (const token of ["f".repeat(64), "not-a-token", "", undefined]) {
      const r = await handle({ action: "accept", token, ...details() }, as(null));
      expect(r.status).toBe(400);
      expect(r.body.code).toBe("invalid");
    }
    const i = await handle({ action: "inspect", token: "f".repeat(64) }, as(null));
    expect(i.body).toMatchObject({ valid: false, reason: "invalid" });
  });

  it("an expired invitation", async () => {
    await invite();
    w.now = new Date(NOW.getTime() + (INVITE_TTL_DAYS * 86400_000) + 1000);
    const i = await handle({ action: "inspect", token: lastToken() }, as(null));
    expect(i.body).toMatchObject({ valid: false, reason: "expired", org_name: "Acme Events" });
    const r = await accept();
    expect(r.body.code).toBe("expired");
    expect(w.users.some((u) => u.email === "neha@acme.test")).toBe(false);
  });

  it("a revoked invitation", async () => {
    await invite();
    w.invites[0].status = "revoked";
    expect((await handle({ action: "inspect", token: lastToken() }, as(null))).body.reason).toBe("revoked");
    expect((await accept()).body.code).toBe("revoked");
    expect(w.members.some((m) => m.user_id.startsWith("u-new"))).toBe(false);
  });

  it("an expired invitation can be sent again by an admin", async () => {
    await invite();
    w.now = new Date(NOW.getTime() + 20 * 86400_000);
    const again = await invite();
    expect(again.status).toBe(200);
    expect((await accept()).status).toBe(200);
  });

  it("invitationState covers every status", () => {
    const future = new Date(NOW.getTime() + 1000).toISOString();
    expect(invitationState(null, NOW)).toBe("invalid");
    expect(invitationState({ status: "pending", expires_at: future }, NOW)).toBe("pending");
    expect(invitationState({ status: "pending", expires_at: NOW.toISOString() }, NOW)).toBe("expired");
    expect(invitationState({ status: "accepted", expires_at: future }, NOW)).toBe("accepted");
    expect(invitationState({ status: "revoked", expires_at: future }, NOW)).toBe("revoked");
    expect(invitationState({ status: "weird", expires_at: future }, NOW)).toBe("invalid");
  });
});

describe("10. a link cannot be used twice", () => {
  it("the second use is refused and creates nothing", async () => {
    await invite();
    expect((await accept()).status).toBe(200);
    const users = w.users.length;
    const second = await accept({ password: "Another2026" });
    expect(second.status).toBe(400);
    expect(second.body.code).toBe("accepted");
    expect(w.users).toHaveLength(users);
    expect(w.users.find((u) => u.email === "neha@acme.test")!.password).toBe("Welcome2026");
  });
});

describe("11. a link cannot verify or join a different email", () => {
  it("an email in the request is ignored — the account is for the invited address only", async () => {
    await invite();
    const r = await accept({ email: "attacker@evil.test" });
    expect(r.body.email).toBe("neha@acme.test");
    expect(w.users.some((u) => u.email === "attacker@evil.test")).toBe(false);
  });

  it("a signed-in account with another email cannot accept it", async () => {
    await invite();
    const r = await handle({ action: "accept_existing", token: lastToken() }, as("u-existing"));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("email_mismatch");
    expect(w.members.some((m) => m.user_id === "u-existing")).toBe(false);
    expect(w.invites[0].status).toBe("pending");
  });
});

describe("12. existing accounts cannot be taken over", () => {
  it("the new-account path refuses an email that already has an account and leaves it untouched", async () => {
    await invite("existing@elsewhere.test");
    const r = await accept({ password: "Hijacked2026" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("account_exists");
    const u = w.users.find((x) => x.email === "existing@elsewhere.test")!;
    expect(u.password).toBe("Existing123");
    expect(w.members.some((m) => m.user_id === u.id)).toBe(false);
    // The invitation still works for its owner once they sign in.
    expect(w.invites[0]).toMatchObject({ status: "pending", claimed_at: null });
    const i = await handle({ action: "inspect", token: lastToken() }, as(null));
    expect(i.body).toMatchObject({ valid: true, account_exists: true });
  });

  it("the owner of that account joins after signing in, without any password change", async () => {
    await invite("existing@elsewhere.test", "admin");
    const r = await handle({ action: "accept_existing", token: lastToken() }, as("u-existing"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ org_id: ORG, role: "admin" });
    expect(w.users.find((x) => x.id === "u-existing")!.password).toBe("Existing123");
    expect(w.invites[0]).toMatchObject({ status: "accepted", accepted_by: "u-existing" });
  });

  it("accept_existing needs a signed-in session", async () => {
    await invite("existing@elsewhere.test");
    const r = await handle({ action: "accept_existing", token: lastToken() }, as(null));
    expect(r.status).toBe(401);
  });

  it("an account created elsewhere between opening and submitting is not touched", async () => {
    await invite();
    w.users.push({ id: "u-race", email: "neha@acme.test", password: "Theirs2026", verified: true, meta: {} });
    const r = await accept();
    expect(r.body.code).toBe("account_exists");
    expect(w.users.find((u) => u.id === "u-race")!.password).toBe("Theirs2026");
  });
});

describe("13. no duplicate accounts or memberships", () => {
  it("two submissions at the same moment create one account and one membership", async () => {
    await invite();
    const [a, b] = await Promise.all([accept(), accept({ password: "Second2026" })]);
    const oks = [a, b].filter((r) => r.body.ok === true);
    expect(oks).toHaveLength(1);
    expect(w.users.filter((u) => u.email === "neha@acme.test")).toHaveLength(1);
    expect(memberOf("neha@acme.test")).toHaveLength(1);
  });

  it("someone who is already a member is not invited again", async () => {
    const r = await invite("member@acme.test");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("already_member");
    expect(w.invites).toHaveLength(0);
  });

  it("an existing member accepting keeps a single membership and their role", async () => {
    // Invited before they were added another way.
    await invite("existing@elsewhere.test", "viewer");
    w.members.push({ org_id: ORG, user_id: "u-existing", role: "admin" });
    await handle({ action: "accept_existing", token: lastToken() }, as("u-existing"));
    expect(w.members.filter((m) => m.user_id === "u-existing")).toEqual([{ org_id: ORG, user_id: "u-existing", role: "admin" }]);
  });
});

describe("14. ordinary public signup keeps its own verification", () => {
  it("the invitation function never touches the public signup path", async () => {
    // Public signup lives in LoginPage (supabase.auth.signUp + emailed code).
    // This function exposes no action that creates an account without a
    // valid invitation.
    for (const action of ["signup", "register", "create_user", "activate"]) {
      const r = await handle({ action, email: "someone@new.test", password: "Welcome2026" }, as(null));
      expect(r.status).toBe(400);
    }
    expect(w.users.some((u) => u.email === "someone@new.test")).toBe(false);
  });
});

describe("15. unauthorized callers cannot invite or change workspace and role", () => {
  it("no session", async () => {
    const r = await invite("x@acme.test", "member", null as unknown as string);
    expect(r.status).toBe(401);
  });

  it("a plain member or viewer", async () => {
    const r = await invite("x@acme.test", "member", "u-member");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("forbidden");
  });

  it("an owner of a different workspace", async () => {
    const r = await invite("x@acme.test", "member", "u-other");
    expect(r.status).toBe(403);
  });

  it("an admin trying to invite an owner", async () => {
    const r = await invite("x@acme.test", "owner", "u-admin");
    expect(r.status).toBe(403);
    expect(w.invites).toHaveLength(0);
  });

  it("an unknown role", async () => {
    const r = await invite("x@acme.test", "superuser", "u-owner");
    expect(r.status).toBe(400);
  });

  it("resending someone else's workspace invitation", async () => {
    await invite();
    const r = await handle({ action: "resend", invitation_id: w.invites[0].id }, as("u-other"));
    expect(r.status).toBe(403);
  });

  it("an admin resending an owner invitation", async () => {
    await invite("co-owner@acme.test", "owner", "u-owner");
    const r = await handle({ action: "resend", invitation_id: w.invites[0].id }, as("u-admin"));
    expect(r.status).toBe(403);
  });
});

describe("16. a failed membership never leaves the invitation accepted", () => {
  it("removes the new account and keeps the link usable", async () => {
    await invite();
    w.completeWorks = false;
    const r = await accept();
    expect(r.status).toBe(500);
    expect(r.body.code).toBe("accept_failed");
    expect(w.invites[0]).toMatchObject({ status: "pending", accepted_at: null, claimed_at: null });
    expect(w.users.some((u) => u.email === "neha@acme.test")).toBe(false);
    expect(w.deleted).toHaveLength(1);

    w.completeWorks = true;
    const retry = await accept();
    expect(retry.status).toBe(200);
    expect(memberOf("neha@acme.test")).toHaveLength(1);
  });

  it("a failed account creation releases the link too", async () => {
    await invite();
    w.createUserWorks = false;
    expect((await accept()).body.code).toBe("create_failed");
    expect(w.invites[0]).toMatchObject({ status: "pending", claimed_at: null });
  });

  it("a stuck acceptance stops blocking the link after a while", async () => {
    await invite();
    w.invites[0].claimed_at = NOW.toISOString();
    expect((await accept()).body.code).toBe("busy");
    w.now = new Date(NOW.getTime() + 5 * 60_000);
    expect((await accept()).status).toBe(200);
  });
});

describe("abuse limits", () => {
  it("limits guesses per address", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await handle({ action: "accept", token: i.toString(16).padStart(64, "0"), ...details() }, as(null))).status;
    expect(last).toBe(429);
  });
});
