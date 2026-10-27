/**
 * team-invitation
 *
 * Inviting people to a workspace, and joining one from an invitation.
 *
 * This file is self-contained (no `_shared` imports) so it can be pasted
 * straight into the Supabase Dashboard editor and deployed.
 *
 * ── Actions (POST JSON, `action` field) ────────────────────────────────────
 *   Signed in as a workspace owner/admin with a verified email:
 *     send     { org_id, email, role }  → creates (or reopens) the invitation
 *                                         and emails the link.
 *     resend   { invitation_id }        → new link, new expiry, emailed again.
 *   Anyone holding the link:
 *     inspect  { token }                → what the invitation is for.
 *     accept   { token, first_name, last_name, designation,
 *                mobile_country_code, mobile_number, password }
 *              → creates the account for the invited email and adds it to
 *                the workspace. No company details, no second email.
 *   Signed in as the invited email (an account that already existed):
 *     accept_existing { token }         → adds that account to the workspace.
 *   Signed in as Super Admin (global `admin` role, verified email):
 *     admin_create_org { org: { name, subdomain, contact_email?, plan, plan_limits },
 *                        user: { first_name, last_name, email, designation?,
 *                                mobile_country_code?, mobile_number? } }
 *              → creates the organization (plan, limits, subscription) and
 *                invites its first user, who becomes the owner on accepting.
 *                Until then the Super Admin is the placeholder owner (no
 *                membership), so Resend works for them. Sending the same
 *                request again returns the organization already created.
 *
 * ── How identity is kept straight ──────────────────────────────────────────
 *   • The link carries a 256-bit secret; only its SHA-256 is stored. It is
 *     bound to one email, one workspace and one role, expires after
 *     INVITE_TTL_DAYS, and works once.
 *   • Workspace, role and email always come from the stored invitation —
 *     never from the request.
 *   • The link only went to the invited mailbox, so redeeming it proves the
 *     invitee controls that address: the new account is created already
 *     verified, here on the server. A browser cannot ask for that.
 *   • An email that already has an account is never created or changed
 *     here. Its owner signs in first, and `accept_existing` checks the
 *     signed-in email against the invitation.
 *   • The invitation is locked while an acceptance runs, and the membership
 *     and "accepted" mark are written together by `complete_org_invitation`.
 *     If that fails the new account is removed and the link still works.
 *   • Only owners and admins with a verified email can invite; admins
 *     cannot invite owners.
 *
 * ── Required Supabase secrets ──────────────────────────────────────────────
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (provided by the runtime)
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM (optional)
 *   PUBLIC_DOMAIN (optional)  site the email links point at; default illuxus.com
 *   ALLOWED_ORIGINS (optional) extra browser origins allowed to call this
 *
 * Needs migrations 045 (rate limits) and 046 (invitation columns);
 * `admin_create_org` also needs 049 (ownership handover).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ─── Limits ─────────────────────────────────────────────────────────────────

export const INVITE_TTL_DAYS = 14;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** An acceptance that started this long ago and never finished has failed. */
const CLAIM_STALE_SECONDS = 120;
export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** [bucket, window in seconds, attempts allowed in the window] */
const LIMITS = {
  inspectIp: ["invite-inspect:ip", 900, 30],
  acceptIp: ["invite-accept:ip", 900, 10],
  acceptToken: ["invite-accept:token", 900, 5],
  sendUser: ["invite-send:user", 3600, 50],
} as const;
type Limit = (typeof LIMITS)[keyof typeof LIMITS];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvitationRow {
  id: string;
  org_id: string;
  org_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  claimed_at: string | null;
  /** Accepting makes the invitee the owner (organizations made by Super Admin). */
  transfer_ownership?: boolean;
  /** Personal details entered by whoever created the invitation. */
  prefill?: Record<string, string>;
}

export interface CallerUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface IssueFields {
  org_id: string;
  email: string;
  role: Role;
  invited_by: string;
  token_hash: string;
  expires_at: string;
  transfer_ownership?: boolean;
  prefill?: Record<string, string>;
}

export interface NewOrganization {
  name: string;
  slug: string;
  subdomain: string;
  owner_id: string;
  plan: string;
  plan_limits: PlanLimits;
  billing_email: string | null;
}

export interface PlanLimits {
  max_events: number;
  max_attendees_per_event: number;
  max_team_members: number;
  features: string[];
}

export interface AuditEntry {
  actor_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  /** Never tokens, passwords or other secrets. */
  details: Record<string, unknown>;
}

/** Everything the handler needs from the outside world. */
export interface Store {
  /** Records an attempt; false when the caller is over the limit. */
  allow(bucket: string, key: string, windowSeconds: number, max: number): Promise<boolean>;
  /** The signed-in user behind an access token, or null. */
  userFromJwt(jwt: string): Promise<CallerUser | null>;
  /** 'owner' for the workspace's owner, else their member role, else null. */
  roleInOrg(orgId: string, userId: string): Promise<string | null>;
  orgName(orgId: string): Promise<string | null>;
  displayName(userId: string): Promise<string | null>;
  /** Throws if it cannot tell. */
  findUserIdByEmail(email: string): Promise<string | null>;
  findInvitation(orgId: string, email: string): Promise<InvitationRow | null>;
  findInvitationById(id: string): Promise<InvitationRow | null>;
  findInvitationByHash(tokenHash: string): Promise<InvitationRow | null>;
  /** Writes a fresh pending invitation (into `existingId` when given). */
  issueInvitation(existingId: string | null, fields: IssueFields): Promise<{ id: string } | { error: string }>;
  /** Locks the invitation for one acceptance. False when it is not free. */
  claimInvitation(id: string, at: string, staleBefore: string): Promise<boolean>;
  releaseInvitation(id: string): Promise<void>;
  createUser(email: string, password: string, meta: Record<string, string>): Promise<{ id: string } | { error: string; exists?: boolean }>;
  deleteUser(id: string): Promise<void>;
  /** Membership + "accepted", in one transaction. */
  completeInvitation(id: string, userId: string, newAccount: boolean): Promise<{ org_id: string; role: string } | { error: string }>;
  /** Holds the global Super Admin (`admin`) role. */
  isSuperAdmin(userId: string): Promise<boolean>;
  findOrgBySubdomain(subdomain: string): Promise<{ id: string; owner_id: string; name: string } | null>;
  /** Organization + its subscription. `conflict` when the slug or subdomain is taken. */
  createOrganization(org: NewOrganization): Promise<{ id: string } | { error: string; conflict?: boolean }>;
  deleteOrganization(id: string): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface Deps {
  store: Store;
  sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  now(): Date;
  newToken(): string;
  /** Site the links in emails point at, e.g. https://illuxus.com */
  origin: string;
}

export interface Context {
  ip: string;
  /** The caller's access token, when the request carried one. */
  jwt: string | null;
}

export interface Reply { status: number; body: Record<string, unknown> }

// ─── Pure helpers ───────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@,;<>"*%\\]+@[^\s@,;<>"*%\\]+\.[^\s@,;<>"*%\\]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export const normalizeEmail = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");
const clean = (v: unknown, max: number): string =>
  typeof v === "string"
    // Control characters become spaces, then runs of whitespace collapse.
    ? Array.from(v, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 256 bits from the platform's secure generator, as 64 hex characters. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface MemberDetails {
  first_name: string;
  last_name: string;
  designation: string;
  mobile_country_code: string;
  mobile_number: string;
}

/** The only details an invitee is asked for. Anything else sent is ignored. */
export function validateMemberDetails(body: Record<string, unknown>): { ok: true; value: MemberDetails } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value: MemberDetails = {
    first_name: clean(body.first_name, 80),
    last_name: clean(body.last_name, 80),
    designation: clean(body.designation, 120),
    mobile_country_code: clean(body.mobile_country_code, 6),
    mobile_number: clean(body.mobile_number, 20).replace(/[\s()-]/g, ""),
  };
  if (!value.first_name) errors.first_name = "Enter your first name.";
  if (!value.last_name) errors.last_name = "Enter your last name.";
  if (!value.designation) errors.designation = "Enter your designation.";
  if (!/^\+\d{1,4}$/.test(value.mobile_country_code)) errors.mobile_country_code = "Choose a country code.";
  if (!/^\d{6,15}$/.test(value.mobile_number)) errors.mobile_number = "Enter a valid mobile number.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use a mix of letters and numbers.";
  return null;
}

export const PLANS = ["free", "starter", "pro", "business"] as const;
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export const slugify = (v: string): string =>
  v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "org";

export interface ProvisionInput {
  org: { name: string; subdomain: string; contact_email: string | null; plan: string; plan_limits: PlanLimits };
  user: { first_name: string; last_name: string; email: string; designation: string; mobile_country_code: string; mobile_number: string };
}

/** The organization and first-user fields of `admin_create_org`; anything else is ignored. */
export function validateProvision(body: Record<string, unknown>): { ok: true; value: ProvisionInput } | { ok: false; errors: Record<string, string> } {
  const org = (body.org && typeof body.org === "object" ? body.org : {}) as Record<string, unknown>;
  const user = (body.user && typeof body.user === "object" ? body.user : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const contact = normalizeEmail(org.contact_email);
  const limits = (org.plan_limits && typeof org.plan_limits === "object" ? org.plan_limits : {}) as Record<string, unknown>;
  const value: ProvisionInput = {
    org: {
      name: clean(org.name, 120),
      subdomain: typeof org.subdomain === "string" ? org.subdomain.trim().toLowerCase() : "",
      contact_email: contact || null,
      plan: typeof org.plan === "string" ? org.plan : "",
      plan_limits: {
        max_events: Number(limits.max_events),
        max_attendees_per_event: Number(limits.max_attendees_per_event),
        max_team_members: Number(limits.max_team_members),
        features: Array.isArray(limits.features) ? limits.features.filter((f): f is string => typeof f === "string").slice(0, 40) : [],
      },
    },
    user: {
      first_name: clean(user.first_name, 80),
      last_name: clean(user.last_name, 80),
      email: normalizeEmail(user.email),
      designation: clean(user.designation, 120),
      mobile_country_code: clean(user.mobile_country_code, 6),
      mobile_number: clean(user.mobile_number, 20).replace(/[\s()-]/g, ""),
    },
  };
  const o = value.org, u = value.user;
  if (o.name.length < 2) errors["org.name"] = "Enter the organization name.";
  if (!SUBDOMAIN_RE.test(o.subdomain)) errors["org.subdomain"] = "Use 3–63 lowercase letters, numbers or hyphens, not starting or ending with a hyphen.";
  if (o.contact_email && (o.contact_email.length > 254 || !EMAIL_RE.test(o.contact_email))) errors["org.contact_email"] = "Enter a valid email address.";
  if (!(PLANS as readonly string[]).includes(o.plan)) errors["org.plan"] = "Choose a plan.";
  const l = o.plan_limits;
  if (![l.max_events, l.max_attendees_per_event, l.max_team_members].every((n) => Number.isInteger(n) && n >= -1)) errors["org.plan"] = "The plan's limits are not valid.";
  if (!u.first_name) errors["user.first_name"] = "Enter the first name.";
  if (!u.last_name) errors["user.last_name"] = "Enter the last name.";
  if (!u.email || u.email.length > 254 || !EMAIL_RE.test(u.email)) errors["user.email"] = "Enter a valid email address.";
  if (u.mobile_number || u.mobile_country_code) {
    if (!/^\+\d{1,4}$/.test(u.mobile_country_code)) errors["user.mobile_country_code"] = "Choose a country code.";
    if (!/^\d{6,15}$/.test(u.mobile_number)) errors["user.mobile_number"] = "Enter a valid mobile number.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export type InvitationState = "pending" | "expired" | "accepted" | "revoked" | "invalid";

export function invitationState(inv: Pick<InvitationRow, "status" | "expires_at"> | null, now: Date): InvitationState {
  if (!inv) return "invalid";
  if (inv.status === "accepted") return "accepted";
  if (inv.status === "revoked") return "revoked";
  if (inv.status !== "pending") return "invalid";
  const expires = new Date(inv.expires_at).getTime();
  return Number.isFinite(expires) && expires > now.getTime() ? "pending" : "expired";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ROLE_LABEL: Record<string, string> = { owner: "an owner", admin: "an admin", member: "a member", viewer: "a viewer" };

// Same rule as greetingName() in ../_shared/greeting.ts (this file can't import it).
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|shri|smt)\.?$/i;
/** "Hi Sarvesh," when the invitee's name is known, else "Hi there,". */
export function greetingLine(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  const first = words[0] && !words[0].includes("@") ? words[0] : "";
  const shown = first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
  return `Hi ${shown || "there"},`;
}

type InvitationEmailContext = { orgName: string; inviter: string; role: string; url: string; provisioned?: boolean; inviteeName?: string | null };

export function buildInvitationEmail(ctx: InvitationEmailContext): { subject: string; html: string; text: string } {
  if (ctx.provisioned) return buildProvisionedEmail(ctx);
  const subject = `You're invited to join ${ctx.orgName} on Illuxus`;
  const roleText = ROLE_LABEL[ctx.role] ?? "a member";
  const hi = greetingLine(ctx.inviteeName);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:10px;"><tr><td style="padding:32px;">
      <p style="font-size:13px;font-weight:700;letter-spacing:.02em;color:#111827;margin:0 0 24px;">illuxus</p>
      <p style="font-size:21px;font-weight:700;color:#111827;margin:0 0 10px;">Join ${escapeHtml(ctx.orgName)}</p>
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 10px;">${escapeHtml(hi)}</p>
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 22px;"><strong style="color:#111827;">${escapeHtml(ctx.inviter)}</strong> has invited you to join <strong style="color:#111827;">${escapeHtml(ctx.orgName)}</strong> on Illuxus as ${roleText}.</p>
      <a href="${escapeHtml(ctx.url)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Accept invitation</a>
      <p style="font-size:12px;line-height:1.55;color:#6b7280;margin:22px 0 0;">New to Illuxus? You'll add your name, designation, mobile number and a password — that's all. This link is just for you: it works once and expires in ${INVITE_TTL_DAYS} days.</p>
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0;">If you weren't expecting this invitation, you can ignore this email.</p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  const text = [
    hi,
    "",
    `${ctx.inviter} has invited you to join ${ctx.orgName} on Illuxus as ${roleText}.`,
    "",
    `Accept the invitation: ${ctx.url}`,
    "",
    `New to Illuxus? You'll add your name, designation, mobile number and a password — that's all. This link is just for you: it works once and expires in ${INVITE_TTL_DAYS} days.`,
    "",
    "If you weren't expecting this invitation, you can ignore this email.",
  ].join("\n");
  return { subject, html, text };
}

/** The first user of an organization Super Admin created: they will own it. */
function buildProvisionedEmail(ctx: InvitationEmailContext): { subject: string; html: string; text: string } {
  const subject = `${ctx.orgName} is ready for you on Illuxus`;
  const hi = greetingLine(ctx.inviteeName);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:10px;"><tr><td style="padding:32px;">
      <p style="font-size:13px;font-weight:700;letter-spacing:.02em;color:#111827;margin:0 0 24px;">illuxus</p>
      <p style="font-size:21px;font-weight:700;color:#111827;margin:0 0 10px;">${escapeHtml(ctx.orgName)} is ready</p>
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 10px;">${escapeHtml(hi)}</p>
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 22px;"><strong style="color:#111827;">${escapeHtml(ctx.inviter)}</strong> from Illuxus has set up <strong style="color:#111827;">${escapeHtml(ctx.orgName)}</strong> for you. Accept to become its owner.</p>
      <a href="${escapeHtml(ctx.url)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Accept and set up your account</a>
      <p style="font-size:12px;line-height:1.55;color:#6b7280;margin:22px 0 0;">New to Illuxus? Check your details and choose a password. Already have an account? Sign in with this email to accept. This link is just for you: it works once and expires in ${INVITE_TTL_DAYS} days.</p>
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0;">If you weren't expecting this, you can ignore this email.</p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  const text = [
    hi,
    "",
    `${ctx.inviter} from Illuxus has set up ${ctx.orgName} for you. Accept to become its owner.`,
    "",
    `Accept and set up your account: ${ctx.url}`,
    "",
    `New to Illuxus? Check your details and choose a password. Already have an account? Sign in with this email to accept. This link is just for you: it works once and expires in ${INVITE_TTL_DAYS} days.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  return { subject, html, text };
}

// ─── Handler ────────────────────────────────────────────────────────────────

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const tooMany = () => reply(429, { ok: false, code: "rate_limited", error: "Too many attempts. Please wait a little and try again." });

const STATE_ERRORS: Record<Exclude<InvitationState, "pending">, string> = {
  invalid: "This invitation link is not valid. Check that you opened the full link from your email.",
  expired: "This invitation has expired. Ask the person who invited you to send a new one.",
  revoked: "This invitation was withdrawn. Ask the workspace admin if you should still join.",
  accepted: "This invitation has already been used. Sign in to open the workspace.",
};
const ACCOUNT_EXISTS = "An Illuxus account already uses this email. Sign in to accept the invitation.";

export function createHandler(deps: Deps) {
  const { store } = deps;
  const within = async (limit: Limit, key: string) => store.allow(limit[0], await sha256Hex(key), limit[1], limit[2]);
  const nowIso = () => deps.now().toISOString();

  /** The signed-in caller, if they may manage invitations for this workspace. */
  async function inviter(ctx: Context, orgId: string): Promise<{ user: CallerUser; role: string } | Reply> {
    const user = ctx.jwt ? await store.userFromJwt(ctx.jwt) : null;
    if (!user) return reply(401, { ok: false, code: "unauthenticated", error: "Sign in to invite team members." });
    if (!user.emailVerified) {
      return reply(403, { ok: false, code: "inviter_unverified", error: "Verify your own email address before inviting team members." });
    }
    const role = await store.roleInOrg(orgId, user.id);
    if (role !== "owner" && role !== "admin") {
      return reply(403, { ok: false, code: "forbidden", error: "Only workspace owners and admins can invite team members." });
    }
    return { user, role };
  }

  /** Puts a new link on the invitation and emails it. */
  async function issueAndSend(
    existingId: string | null, orgId: string, email: string, role: Role, by: CallerUser,
    extra: { transfer_ownership?: boolean; prefill?: Record<string, string>; provisioned?: boolean; inviteeName?: string } = {},
  ): Promise<Reply> {
    const token = deps.newToken();
    const expires = new Date(deps.now().getTime() + INVITE_TTL_DAYS * 86400_000).toISOString();
    const fields: IssueFields = { org_id: orgId, email, role, invited_by: by.id, token_hash: await sha256Hex(token), expires_at: expires };
    if (extra.transfer_ownership) fields.transfer_ownership = true;
    if (extra.prefill) fields.prefill = extra.prefill;
    const saved = await store.issueInvitation(existingId, fields);
    if ("error" in saved) return reply(500, { ok: false, code: "save_failed", error: "We could not save the invitation. Please try again." });

    const orgName = (await store.orgName(orgId)) || "your team";
    const inviterName = (await store.displayName(by.id)) || by.email;
    // The invitee's name: their own profile when they already have an account,
    // else what Super Admin typed when setting up their organization.
    const inviteeId = await store.findUserIdByEmail(email);
    const inviteeName = (inviteeId ? await store.displayName(inviteeId) : null)
      || extra.prefill?.first_name || extra.inviteeName || null;
    const mail = buildInvitationEmail({ orgName, inviter: inviterName, role, url: `${deps.origin}/invite?token=${token}`, provisioned: extra.provisioned, inviteeName });
    let emailSent = false;
    try { emailSent = (await deps.sendEmail({ to: email, ...mail })).ok; } catch { emailSent = false; }
    return reply(200, { ok: true, invitation_id: saved.id, expires_at: expires, email_sent: emailSent });
  }

  async function send(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    const orgId = typeof body.org_id === "string" ? body.org_id : "";
    if (!UUID_RE.test(orgId)) return reply(400, { ok: false, code: "invalid", error: "Unknown workspace." });
    const who = await inviter(ctx, orgId);
    if ("status" in who) return who;

    const email = normalizeEmail(body.email);
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return reply(400, { ok: false, code: "invalid_email", error: "Enter a valid email address." });
    const role = body.role as Role;
    if (!ROLES.includes(role)) return reply(400, { ok: false, code: "invalid_role", error: "Choose a role." });
    if (role === "owner" && who.role !== "owner") return reply(403, { ok: false, code: "forbidden", error: "Only owners can invite another owner." });
    if (!(await within(LIMITS.sendUser, who.user.id))) return tooMany();

    if (email === normalizeEmail(who.user.email)) return reply(409, { ok: false, code: "already_member", error: "You're already part of this workspace." });
    const existingUser = await store.findUserIdByEmail(email);
    if (existingUser && (await store.roleInOrg(orgId, existingUser))) {
      return reply(409, { ok: false, code: "already_member", error: `${email} is already part of this workspace.` });
    }

    const existing = await store.findInvitation(orgId, email);
    if (existing && invitationState(existing, deps.now()) === "pending" && existing.role === role) {
      return reply(409, { ok: false, code: "already_invited", invitation_id: existing.id, error: `${email} already has a pending invitation as ${role}. Use Resend to send a new link.` });
    }
    return issueAndSend(existing?.id ?? null, orgId, email, role, who.user);
  }

  async function resend(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    const id = typeof body.invitation_id === "string" ? body.invitation_id : "";
    const inv = UUID_RE.test(id) ? await store.findInvitationById(id) : null;
    if (!inv) return reply(404, { ok: false, code: "not_found", error: "That invitation no longer exists." });
    const who = await inviter(ctx, inv.org_id);
    if ("status" in who) return who;
    if (inv.role === "owner" && who.role !== "owner") return reply(403, { ok: false, code: "forbidden", error: "Only owners can resend an owner invitation." });
    if (inv.status !== "pending") return reply(409, { ok: false, code: "not_pending", error: "This invitation is no longer open. Send a new invitation instead." });
    if (!(await within(LIMITS.sendUser, who.user.id))) return tooMany();
    if (!ROLES.includes(inv.role as Role)) return reply(409, { ok: false, code: "invalid_role", error: "This invitation has an unknown role. Send a new invitation instead." });
    return issueAndSend(inv.id, inv.org_id, normalizeEmail(inv.email), inv.role as Role, who.user, { provisioned: !!inv.transfer_ownership, inviteeName: inv.prefill?.first_name });
  }

  async function lookup(raw: unknown): Promise<{ inv: InvitationRow | null; state: InvitationState }> {
    const token = typeof raw === "string" ? raw : "";
    const inv = TOKEN_RE.test(token) ? await store.findInvitationByHash(await sha256Hex(token)) : null;
    return { inv, state: invitationState(inv, deps.now()) };
  }

  async function inspect(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    if (!(await within(LIMITS.inspectIp, ctx.ip))) return tooMany();
    const { inv, state } = await lookup(body.token);
    if (state !== "pending") {
      return reply(200, { ok: true, valid: false, reason: state, org_name: inv?.org_name ?? null });
    }
    const email = normalizeEmail(inv!.email);
    return reply(200, {
      ok: true, valid: true, org_name: inv!.org_name, email, role: inv!.role, expires_at: inv!.expires_at,
      account_exists: !!(await store.findUserIdByEmail(email)),
      becomes_owner: !!inv!.transfer_ownership,
      prefill: inv!.prefill ?? {},
    });
  }

  /** Runs `work` while holding the invitation's lock; releases it on failure. */
  async function claimed(inv: InvitationRow, work: () => Promise<Reply>): Promise<Reply> {
    const staleBefore = new Date(deps.now().getTime() - CLAIM_STALE_SECONDS * 1000).toISOString();
    if (!(await store.claimInvitation(inv.id, nowIso(), staleBefore))) {
      return reply(409, { ok: false, code: "busy", error: "This invitation is already being accepted. Wait a moment, then sign in." });
    }
    try {
      const result = await work();
      if (result.body.ok !== true) await store.releaseInvitation(inv.id);
      return result;
    } catch (err) {
      await store.releaseInvitation(inv.id);
      throw err;
    }
  }

  async function accept(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    const raw = typeof body.token === "string" ? body.token : "";
    if (!(await within(LIMITS.acceptIp, ctx.ip)) || !(await within(LIMITS.acceptToken, raw.slice(0, 64)))) return tooMany();

    const { inv, state } = await lookup(raw);
    if (state !== "pending") return reply(400, { ok: false, code: state, error: STATE_ERRORS[state] });

    const details = validateMemberDetails(body);
    if ("errors" in details) return reply(400, { ok: false, code: "invalid", errors: details.errors, error: "Check the highlighted fields." });
    const weak = passwordProblem(body.password);
    if (weak) return reply(400, { ok: false, code: "weak_password", errors: { password: weak }, error: weak });

    // The account is always for the invited address; any email in the
    // request is ignored.
    const email = normalizeEmail(inv!.email);
    if (await store.findUserIdByEmail(email)) return reply(409, { ok: false, code: "account_exists", error: ACCOUNT_EXISTS });

    return claimed(inv!, async () => {
      const d = details.value;
      const created = await store.createUser(email, body.password as string, {
        first_name: d.first_name,
        last_name: d.last_name,
        display_name: `${d.first_name} ${d.last_name}`,
        designation: d.designation,
        mobile_country_code: d.mobile_country_code,
        mobile_number: d.mobile_number,
        account_type: "attendee",
      });
      if ("error" in created) {
        if (created.exists) return reply(409, { ok: false, code: "account_exists", error: ACCOUNT_EXISTS });
        return reply(500, { ok: false, code: "create_failed", error: "We could not create your account. Please try again." });
      }
      const done = await store.completeInvitation(inv!.id, created.id, true);
      if ("error" in done) {
        // Nothing half-made is left behind: the account goes, the link stays.
        await store.deleteUser(created.id);
        return reply(500, { ok: false, code: "accept_failed", error: "We could not add you to the workspace. Please try again." });
      }
      return reply(200, { ok: true, email, org_id: done.org_id, role: done.role });
    });
  }

  async function acceptExisting(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    if (!(await within(LIMITS.acceptIp, ctx.ip))) return tooMany();
    const user = ctx.jwt ? await store.userFromJwt(ctx.jwt) : null;
    if (!user) return reply(401, { ok: false, code: "unauthenticated", error: "Sign in to accept the invitation." });

    const { inv, state } = await lookup(body.token);
    if (state !== "pending") return reply(400, { ok: false, code: state, error: STATE_ERRORS[state] });
    if (normalizeEmail(user.email) !== normalizeEmail(inv!.email)) {
      return reply(403, { ok: false, code: "email_mismatch", error: `This invitation is for ${normalizeEmail(inv!.email)}, but you're signed in as ${normalizeEmail(user.email)}. Sign out, then open the link again.` });
    }
    if (!user.emailVerified) return reply(403, { ok: false, code: "unverified", error: "Verify your email address, then open the invitation again." });

    return claimed(inv!, async () => {
      const done = await store.completeInvitation(inv!.id, user.id, false);
      if ("error" in done) return reply(500, { ok: false, code: "accept_failed", error: "We could not add you to the workspace. Please try again." });
      return reply(200, { ok: true, email: user.email, org_id: done.org_id, role: done.role });
    });
  }

  /**
   * Super Admin: create an organization and invite its first user, who
   * becomes the owner on accepting. Repeating the same request returns the
   * organization already created instead of a second one.
   */
  async function adminCreateOrg(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    const user = ctx.jwt ? await store.userFromJwt(ctx.jwt) : null;
    if (!user) return reply(401, { ok: false, code: "unauthenticated", error: "Sign in as Super Admin to create organizations." });
    if (!(await store.isSuperAdmin(user.id))) return reply(403, { ok: false, code: "forbidden", error: "Only Super Admin can create organizations." });
    if (!user.emailVerified) return reply(403, { ok: false, code: "inviter_unverified", error: "Verify your own email address first." });
    if (!(await within(LIMITS.sendUser, user.id))) return tooMany();

    const input = validateProvision(body);
    if ("errors" in input) return reply(400, { ok: false, code: "invalid", errors: input.errors, error: "Check the highlighted fields." });
    const { org, user: first } = input.value;
    if (first.email === normalizeEmail(user.email)) {
      return reply(400, { ok: false, code: "invalid", errors: { "user.email": "Enter the first user's email, not your own." }, error: "Check the highlighted fields." });
    }
    // Throws if the lookup fails — nothing has been created yet.
    const accountExists = !!(await store.findUserIdByEmail(first.email));

    const taken = await store.findOrgBySubdomain(org.subdomain);
    if (taken) {
      const inv = await store.findInvitation(taken.id, first.email);
      if (taken.owner_id === user.id && inv?.transfer_ownership && inv.status === "pending") {
        // The same request again (a double click, a retry after a timeout).
        return reply(200, { ok: true, already_created: true, org_id: taken.id, org_name: taken.name, subdomain: org.subdomain, invitation_id: inv.id, expires_at: inv.expires_at, email_sent: null, account_exists: accountExists });
      }
      return reply(409, { ok: false, code: "subdomain_taken", errors: { "org.subdomain": "This URL is already used by another organization." }, error: "This URL is already used by another organization." });
    }

    const created = await store.createOrganization({
      name: org.name,
      slug: `${slugify(org.name)}-${deps.now().getTime().toString(36)}`,
      subdomain: org.subdomain,
      owner_id: user.id,
      plan: org.plan,
      plan_limits: org.plan_limits,
      billing_email: org.contact_email,
    });
    if ("error" in created) {
      if (created.conflict) return reply(409, { ok: false, code: "subdomain_taken", errors: { "org.subdomain": "This URL is already used by another organization." }, error: "This URL is already used by another organization." });
      return reply(500, { ok: false, code: "create_failed", error: "We could not create the organization. Nothing was saved; please try again." });
    }

    const prefill: Record<string, string> = { first_name: first.first_name, last_name: first.last_name };
    if (first.designation) prefill.designation = first.designation;
    if (first.mobile_number) { prefill.mobile_country_code = first.mobile_country_code; prefill.mobile_number = first.mobile_number; }
    const sent = await issueAndSend(null, created.id, first.email, "owner", user, { transfer_ownership: true, prefill, provisioned: true });
    if (sent.body.ok !== true) {
      // No organization without its invitation: undo, so a retry starts clean.
      await store.deleteOrganization(created.id);
      return reply(500, { ok: false, code: "create_failed", error: "We could not save the invitation, so the organization was not created. Please try again." });
    }

    const result = {
      org_id: created.id, org_name: org.name, subdomain: org.subdomain, plan: org.plan,
      invitation_id: sent.body.invitation_id as string, expires_at: sent.body.expires_at as string,
      email_sent: sent.body.email_sent === true, account_exists: accountExists,
    };
    try {
      await store.audit({
        actor_id: user.id, actor_email: user.email, action: "organization.provisioned", target_type: "organization", target_id: created.id,
        details: { name: org.name, subdomain: org.subdomain, plan: org.plan, invite_email: first.email, role: "owner", invitation_id: result.invitation_id, email_sent: result.email_sent, account_exists: accountExists },
      });
    } catch { /* the organization and invitation stand without the log line */ }
    return reply(200, { ok: true, ...result });
  }

  return async function handle(body: Record<string, unknown>, ctx: Context): Promise<Reply> {
    switch (body.action) {
      case "send": return send(body, ctx);
      case "resend": return resend(body, ctx);
      case "inspect": return inspect(body, ctx);
      case "accept": return accept(body, ctx);
      case "accept_existing": return acceptExisting(body, ctx);
      case "admin_create_org": return adminCreateOrg(body, ctx);
      default: return reply(400, { ok: false, code: "invalid", error: "Unknown action." });
    }
  };
}

// ─── Supabase-backed store ──────────────────────────────────────────────────

// `*` so the handover columns (migration 049) are read when present without
// breaking invitations before that migration is applied.
const INVITE_COLUMNS = "*, organizations:org_id(name)";
const likeExact = (email: string) => email.replace(/[\\%_]/g, "\\$&");

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInvitation(data: any): InvitationRow | null {
  if (!data) return null;
  const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
  return {
    id: data.id, org_id: data.org_id, org_name: org?.name ?? "", email: data.email, role: data.role,
    status: data.status, expires_at: data.expires_at, claimed_at: data.claimed_at ?? null,
    transfer_ownership: !!data.transfer_ownership,
    prefill: data.prefill && typeof data.prefill === "object" ? data.prefill : {},
  };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseStore(db: any): Store {
  return {
    async allow(bucket, key, windowSeconds, max) {
      const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
      const { count, error } = await db.from("guest_rate_limits").select("id", { count: "exact", head: true })
        .eq("bucket", bucket).eq("key_hash", key).gte("created_at", since);
      // If the limiter itself is unavailable, refuse rather than run unlimited.
      if (error) return false;
      if ((count ?? 0) >= max) return false;
      await db.from("guest_rate_limits").insert({ bucket, key_hash: key });
      return true;
    },
    async userFromJwt(jwt) {
      const { data, error } = await db.auth.getUser(jwt);
      const u = data?.user;
      if (error || !u?.id || !u.email) return null;
      return { id: u.id, email: u.email, emailVerified: !!u.email_confirmed_at };
    },
    async roleInOrg(orgId, userId) {
      const { data: org } = await db.from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
      if (org?.owner_id === userId) return "owner";
      const { data } = await db.from("org_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      return data?.role ?? null;
    },
    async orgName(orgId) {
      const { data } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
      return data?.name ?? null;
    },
    async displayName(userId) {
      const { data } = await db.from("profiles").select("display_name, first_name, last_name").eq("user_id", userId).maybeSingle();
      if (!data) return null;
      return data.display_name || [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
    },
    async findUserIdByEmail(email) {
      const { data, error } = await db.rpc("admin_user_id_by_email", { _email: email });
      if (error) throw new Error(`account lookup failed: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async findInvitation(orgId, email) {
      const { data } = await db.from("org_invitations").select(INVITE_COLUMNS).eq("org_id", orgId).ilike("email", likeExact(email)).limit(1).maybeSingle();
      return toInvitation(data);
    },
    async findInvitationById(id) {
      const { data } = await db.from("org_invitations").select(INVITE_COLUMNS).eq("id", id).maybeSingle();
      return toInvitation(data);
    },
    async findInvitationByHash(tokenHash) {
      const { data } = await db.from("org_invitations").select(INVITE_COLUMNS).eq("token_hash", tokenHash).maybeSingle();
      return toInvitation(data);
    },
    async issueInvitation(existingId, f) {
      const row = {
        ...f,
        status: "pending",
        // The older uuid link of this row stops being the current one.
        token: crypto.randomUUID(),
        accepted_at: null,
        accepted_by: null,
        claimed_at: null,
      };
      const q = existingId
        ? db.from("org_invitations").update(row).eq("id", existingId).select("id").single()
        : db.from("org_invitations").insert(row).select("id").single();
      const { data, error } = await q;
      if (error || !data) return { error: error?.message ?? "not saved" };
      return { id: data.id };
    },
    async claimInvitation(id, at, staleBefore) {
      const { data } = await db.from("org_invitations").update({ claimed_at: at })
        .eq("id", id).eq("status", "pending")
        .or(`claimed_at.is.null,claimed_at.lt."${staleBefore}"`)
        .select("id");
      return Array.isArray(data) && data.length === 1;
    },
    async releaseInvitation(id) {
      await db.from("org_invitations").update({ claimed_at: null }).eq("id", id).eq("status", "pending");
    },
    async createUser(email, password, meta) {
      // email_confirm: redeeming the invitation proved the mailbox, so no
      // second verification email is sent.
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
      if (error || !data?.user) {
        const message = error?.message ?? "unknown error";
        return { error: message, exists: /already|registered|exists/i.test(message) };
      }
      return { id: data.user.id };
    },
    async deleteUser(id) {
      await db.auth.admin.deleteUser(id);
    },
    async completeInvitation(id, userId, newAccount) {
      const { data, error } = await db.rpc("complete_org_invitation", { _invitation_id: id, _user_id: userId, _new_account: newAccount });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return { error: error?.message ?? "not completed" };
      return { org_id: row.accepted_org_id, role: row.assigned_role };
    },
    async isSuperAdmin(userId) {
      const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !error && data === true;
    },
    async findOrgBySubdomain(subdomain) {
      const { data } = await db.from("organizations").select("id, owner_id, name").ilike("subdomain", likeExact(subdomain)).limit(1).maybeSingle();
      return data ? { id: data.id, owner_id: data.owner_id, name: data.name } : null;
    },
    async createOrganization(org) {
      const { data, error } = await db.from("organizations").insert(org).select("id").single();
      if (error || !data) return { error: error?.message ?? "not created", conflict: error?.code === "23505" };
      // Same records public signup makes: the organization and its subscription.
      const { error: subError } = await db.from("subscriptions").insert({ org_id: data.id, plan: org.plan, status: "active" });
      if (subError) {
        await db.from("organizations").delete().eq("id", data.id);
        return { error: subError.message };
      }
      return { id: data.id };
    },
    async deleteOrganization(id) {
      await db.from("organizations").delete().eq("id", id);
    },
    async audit(entry) {
      await db.from("audit_logs").insert(entry);
    },
  };
}

// ─── HTTP entry point (Deno only) ───────────────────────────────────────────

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runtime = (globalThis as any).Deno;

if (runtime?.serve) {
  const env = (name: string): string => runtime.env.get(name) ?? "";

  const siteOrigin = (): string => {
    const raw = (env("PUBLIC_DOMAIN") || env("VITE_PUBLIC_DOMAIN") || "illuxus.com").replace(/\/+$/, "");
    return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  };

  const corsHeaders = (req: Request): Record<string, string> => {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = new Set<string>(["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173", siteOrigin()]);
    for (const o of env("ALLOWED_ORIGINS").split(",")) if (o.trim()) allowed.add(o.trim().replace(/\/+$/, ""));
    const site = siteOrigin().replace(/^https:\/\//, "");
    allowed.add(`https://www.${site.replace(/^www\./, "")}`);
    const ok = allowed.has(origin) || /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
    return {
      "Access-Control-Allow-Origin": ok ? origin : "null",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
  };

  const log = (level: "info" | "error", msg: string, fields: Record<string, unknown> = {}) => {
    // Never pass tokens, passwords or email bodies in here.
    // deno-lint-ignore no-console
    // eslint-disable-next-line no-console
    console[level](JSON.stringify({ level, fn: "team-invitation", msg, ...fields }));
  };

  const sendEmail: Deps["sendEmail"] = async (msg) => {
    if (!(env("SMTP_HOST") && env("SMTP_USERNAME") && env("SMTP_PASSWORD"))) return { ok: false, error: "SMTP not configured" };
    const explicit = env("SMTP_FROM") || env("SMTP_USERNAME");
    const from = explicit.includes("<") ? explicit : `Illuxus <${explicit}>`;
    const port = Number(env("SMTP_PORT") || "465");
    let client: SMTPClient | null = null;
    try {
      client = new SMTPClient({ connection: { hostname: env("SMTP_HOST"), port, tls: port === 465, auth: { username: env("SMTP_USERNAME"), password: env("SMTP_PASSWORD") } } });
      await client.send({ from, to: [msg.to], subject: msg.subject, content: msg.text, html: msg.html });
      return { ok: true };
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      log("error", "email send failed", { error_message: error });
      return { ok: false, error };
    } finally {
      if (client) { try { await client.close(); } catch { /* noop */ } }
    }
  };

  runtime.serve(async (req: Request) => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method !== "POST") return json({ status: 405, body: { ok: false, error: "Method not allowed" } });

    try {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") return json({ status: 400, body: { ok: false, code: "invalid", error: "Invalid request." } });

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
      const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
      const handle = createHandler({ store: supabaseStore(db), sendEmail, now: () => new Date(), newToken: randomToken, origin: siteOrigin() });

      const result = await handle(body, { ip, jwt: bearer });
      log(result.status >= 500 ? "error" : "info", "handled", { action: String(body.action ?? ""), status: result.status, code: result.body.code ?? null });
      return json(result);
    } catch (err) {
      log("error", "unhandled", { error_message: err instanceof Error ? err.message : String(err) });
      return json({ status: 500, body: { ok: false, code: "server_error", error: "Something went wrong. Please try again." } });
    }
  });
}
