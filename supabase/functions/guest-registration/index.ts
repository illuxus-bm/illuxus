/**
 * guest-registration
 *
 * Lets a visitor register for a published event without an account, and set
 * a password afterwards from a link in the confirmation email.
 *
 * This file is self-contained (no `_shared` imports) so it can be pasted
 * straight into the Supabase Dashboard editor and deployed.
 *
 * ── Actions (POST JSON, `action` field) ────────────────────────────────────
 *   register  { event_id, first_name, last_name, email, mobile_country_code,
 *               mobile_number, company, designation, consent, utm?, website? }
 *             → saves the registration and emails the confirmation.
 *   inspect   { token }            → is this activation link still usable?
 *   activate  { token, password }  → creates the account for the link's email.
 *   resend    { token } | { event_id, email }
 *             → emails a fresh activation link. Always answers the same way.
 *
 * ── How identity is kept straight ──────────────────────────────────────────
 *   • A guest registration is an ordinary `registrations` row with `user_id`
 *     NULL — the same shape as a participant an organiser adds by hand.
 *   • One registration per email per event is enforced by the existing unique
 *     index, so a retried or repeated request cannot create a second one.
 *   • An activation link proves the visitor controls the inbox. Only then is
 *     an account created, and only if that email has no account yet — an
 *     existing account can never be claimed or have its password changed
 *     here. The `handle_new_user` trigger then attaches every registration
 *     made with that email to the new account.
 *   • Nothing in a response says whether an email already has an account.
 *
 * ── Required Supabase secrets ──────────────────────────────────────────────
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (provided by the runtime)
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM (optional)
 *   PUBLIC_DOMAIN (optional)  site the email links point at; default illuxus.com
 *   ALLOWED_ORIGINS (optional) extra browser origins allowed to call this
 *
 * Needs migration 045 (activation tokens, rate limits).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ─── Limits ─────────────────────────────────────────────────────────────────

export const TOKEN_TTL_HOURS = 72;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const UTM_MAX = 512;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** [bucket, window in seconds, attempts allowed in the window] */
const LIMITS = {
  registerIp: ["register:ip", 3600, 20],
  registerEmail: ["register:email", 3600, 5],
  detailsEmail: ["details:email", 86400, 3],
  resendEmail: ["resend:email", 3600, 3],
  resendIp: ["resend:ip", 3600, 10],
  activateIp: ["activate:ip", 900, 10],
  activateToken: ["activate:token", 900, 5],
  inspectIp: ["inspect:ip", 900, 30],
} as const;
type Limit = (typeof LIMITS)[keyof typeof LIMITS];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EventRow {
  id: string;
  title: string | null;
  status: string | null;
  date: string | null;
  end_date: string | null;
  timezone: string | null;
  venue: string | null;
  location: string | null;
  capacity: number | null;
  requires_approval: boolean | null;
  /** Ticket price; above zero the place waits for the organiser to confirm payment. */
  price?: number | null;
  event_format: string | null;
  banner_url: string | null;
  org_name: string | null;
  org_logo_url: string | null;
}

export interface RegistrationRow {
  id: string;
  event_id: string;
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  company: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  approval_status: string;
  qr_code: string | null;
  join_token: string | null;
  user_id: string | null;
}

export interface TokenRow {
  id: string;
  email: string;
  registration_id: string | null;
  expires_at: string;
  used_at: string | null;
}

export interface NewRegistration {
  event_id: string;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  designation: string;
  company: string;
  mobile_country_code: string;
  mobile_number: string;
  approval_status: "pending" | "approved";
  utm: Partial<Record<(typeof UTM_KEYS)[number], string>>;
}

/** Everything the handler needs from the outside world. */
export interface Store {
  /** Records an attempt; false when the caller is over the limit. */
  allow(bucket: string, key: string, windowSeconds: number, max: number): Promise<boolean>;
  getEvent(id: string): Promise<EventRow | null>;
  countGoing(eventId: string): Promise<number>;
  findRegistration(eventId: string, email: string): Promise<RegistrationRow | null>;
  latestRegistration(email: string): Promise<RegistrationRow | null>;
  insertRegistration(row: NewRegistration): Promise<{ row: RegistrationRow } | { duplicate: true } | { error: string }>;
  markConfirmationSent(registrationId: string): Promise<void>;
  findUserIdByEmail(email: string): Promise<string | null>;
  /** Stores a new token for the email and retires any earlier unused ones. */
  replaceToken(email: string, registrationId: string | null, tokenHash: string, expiresAt: string): Promise<boolean>;
  findToken(tokenHash: string): Promise<TokenRow | null>;
  /** Marks the token used. False when someone else used it first. */
  claimToken(id: string, at: string): Promise<boolean>;
  releaseToken(id: string): Promise<void>;
  createUser(email: string, password: string, meta: Record<string, string>): Promise<{ id: string } | { error: string; exists?: boolean }>;
  linkRegistrations(email: string, userId: string): Promise<void>;
}

export interface Deps {
  store: Store;
  sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  now(): Date;
  newToken(): string;
  /** Site the links in emails point at, e.g. https://illuxus.com */
  origin: string;
}

export interface Reply { status: number; body: Record<string, unknown> }

// ─── Pure helpers ───────────────────────────────────────────────────────────

// No wildcard characters: the address is also used in a pattern match.
const EMAIL_RE = /^[^\s@,;<>"*%\\]+@[^\s@,;<>"*%\\]+\.[^\s@,;<>"*%\\]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const registrationReference = (id: string): string => `ILX-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

/** Only the five known keys, trimmed and capped; anything else is dropped. */
export function sanitizeUtm(input: unknown): NewRegistration["utm"] {
  const out: NewRegistration["utm"] = {};
  if (!input || typeof input !== "object") return out;
  for (const key of UTM_KEYS) {
    const value = clean((input as Record<string, unknown>)[key], UTM_MAX);
    if (value) out[key] = value;
  }
  return out;
}

export interface RegistrationInput {
  event_id: string;
  email: string;
  first_name: string;
  last_name: string;
  designation: string;
  company: string;
  mobile_country_code: string;
  mobile_number: string;
  utm: NewRegistration["utm"];
}

export function validateRegistration(body: Record<string, unknown>): { ok: true; value: RegistrationInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value: RegistrationInput = {
    event_id: typeof body.event_id === "string" ? body.event_id : "",
    email: normalizeEmail(body.email),
    first_name: clean(body.first_name, 80),
    last_name: clean(body.last_name, 80),
    designation: clean(body.designation, 120),
    company: clean(body.company, 160),
    mobile_country_code: clean(body.mobile_country_code, 6),
    mobile_number: clean(body.mobile_number, 20).replace(/[\s()-]/g, ""),
    utm: sanitizeUtm(body.utm),
  };
  if (!UUID_RE.test(value.event_id)) errors.event_id = "Unknown event.";
  if (!value.email || value.email.length > 254 || !EMAIL_RE.test(value.email)) errors.email = "Enter a valid email address.";
  if (!value.first_name) errors.first_name = "Enter your first name.";
  if (!value.last_name) errors.last_name = "Enter your last name.";
  if (!value.designation) errors.designation = "Enter your designation.";
  if (!value.company) errors.company = "Enter your company.";
  if (!/^\+\d{1,4}$/.test(value.mobile_country_code)) errors.mobile_country_code = "Choose a country code.";
  if (!/^\d{6,15}$/.test(value.mobile_number)) errors.mobile_number = "Enter a valid mobile number.";
  if (body.consent !== true) errors.consent = "Please agree to the terms to register.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use a mix of letters and numbers.";
  return null;
}

export function isEventOver(event: Pick<EventRow, "date" | "end_date">, now: Date): boolean {
  const ts = new Date(event.end_date || event.date || "").getTime();
  return Number.isFinite(ts) && ts < now.getTime();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDateInTz(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_COPY: Record<string, { label: string; color: string; heading: string; message: string }> = {
  approved: { label: "Confirmed", color: "#16a34a", heading: "You're registered", message: "your registration is confirmed. See you there!" },
  pending: { label: "Pending approval", color: "#d97706", heading: "Application received", message: "your application has been received and is pending approval by the organiser. This is not a ticket yet — we'll email you as soon as there is a decision." },
  waitlisted: { label: "Waitlisted", color: "#6b7280", heading: "You're on the waitlist", message: "you are on the waitlist. We'll email you if a place opens up." },
  declined: { label: "Not approved", color: "#dc2626", heading: "Registration update", message: "the organiser was not able to approve this registration." },
};

/** A paid event's place waits for the organiser to confirm payment (there is no online checkout). */
const PAYMENT_PENDING_COPY = {
  label: "Awaiting payment",
  color: "#d97706",
  heading: "Place reserved",
  message: "your place is reserved. The organiser will confirm it once your payment is received — this is not a ticket yet, and we'll email your ticket as soon as it is confirmed.",
};

export interface ConfirmationContext {
  event: EventRow;
  registration: RegistrationRow;
  origin: string;
  /** Present when the email has no account yet. */
  activationUrl: string | null;
}

/** The confirmation email. The ticket (QR code) is included only once approved. */
export function buildConfirmationEmail(ctx: ConfirmationContext): { subject: string; html: string; text: string } {
  const { event, registration: reg, origin, activationUrl } = ctx;
  const awaitingPayment = reg.approval_status === "pending" && Number(event.price) > 0;
  const status = awaitingPayment ? PAYMENT_PENDING_COPY : STATUS_COPY[reg.approval_status] ?? STATUS_COPY.pending;
  const approved = reg.approval_status === "approved";
  const title = event.title || "the event";
  const firstName = reg.first_name || reg.name.split(" ")[0] || "there";
  const reference = registrationReference(reg.id);
  const dateText = event.date ? formatDateInTz(event.date, event.timezone) : "";
  const venueText = [event.venue, event.location].filter(Boolean).join(" · ");
  const online = event.event_format && event.event_format !== "physical";
  const joinUrl = approved && online && reg.join_token ? `${origin}/e/${event.id}/live?join=${reg.join_token}` : null;
  const ticketUrl = `${origin}/t/${reg.id}`;
  const signInUrl = `${origin}/login?next=${encodeURIComponent(`/t/${reg.id}`)}`;
  const orgName = event.org_name || "The organising team";
  const qrValue = reg.qr_code || reg.id;

  const subject = approved ? `Your ticket for ${title}` : reg.approval_status === "pending" ? `Application received: ${title}` : `Your registration for ${title}`;

  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:110px;vertical-align:top;">${label}</td><td style="padding:5px 0;font-size:13px;color:#111827;">${value}</td></tr>` : "";

  const banner = event.banner_url
    ? `<img src="${escapeHtml(event.banner_url)}" alt="" width="560" style="width:100%;max-width:560px;display:block;" />`
    : `<div style="background:#111827;height:96px;"></div>`;

  const qrBlock = approved
    ? `<div style="margin:24px 0;text-align:center;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Your ticket — show this QR code at check-in</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&amp;data=${encodeURIComponent(qrValue)}" alt="Ticket QR code" width="160" height="160" style="display:inline-block;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" />
      </div>`
    : "";

  const account = activationUrl
    ? `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:8px 0 20px;text-align:center;">
        <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 6px;">Set up your Illuxus account</p>
        <p style="font-size:13px;line-height:1.55;color:#4b5563;margin:0 0 16px;">Your registration is recorded. Set a password to access your Illuxus account, view your tickets, and manage your registrations. No additional registration form is required.</p>
        <a href="${escapeHtml(activationUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Set Up Your Illuxus Account</a>
        <p style="font-size:11px;color:#9ca3af;margin:12px 0 0;">This link works once and expires in ${TOKEN_TTL_HOURS} hours. Setting up an account is optional — your registration stands either way.</p>
      </div>`
    : `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:8px 0 20px;text-align:center;">
        <p style="font-size:13px;line-height:1.55;color:#4b5563;margin:0 0 16px;">Sign in to your Illuxus account to view your tickets and manage your registrations.</p>
        <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Sign in to Illuxus</a>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">
      <tr><td>${banner}</td></tr>
      <tr><td style="padding:28px 32px 24px;">
        <div style="display:inline-block;background:${status.color}1a;color:${status.color};font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.04em;">${status.label}</div>
        <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 6px;">${status.heading}</p>
        <p style="font-size:15px;line-height:1.55;color:#4b5563;margin:0 0 20px;">Hi <strong>${escapeHtml(firstName)}</strong>, ${status.message}</p>
        <p style="font-size:19px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(title)}</p>
        <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Organised by <strong style="color:#374151;">${escapeHtml(orgName)}</strong></p>
        <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          ${row("When", escapeHtml(dateText))}
          ${row("Where", escapeHtml(venueText))}
          ${row("Join online", joinUrl ? `<a href="${escapeHtml(joinUrl)}" style="color:#111827;">Open your personal join link</a> (works on one device at a time — don't share it)` : "")}
          ${row("Name", escapeHtml(reg.name))}
          ${row("Reference", `<span style="font-family:monospace;">${reference}</span>`)}
          ${row("Status", escapeHtml(status.label))}
        </table>
        ${qrBlock}
        ${account}
        ${approved ? `<p style="font-size:12px;color:#6b7280;margin:0 0 12px;text-align:center;">Once signed in you can also open your ticket at <a href="${escapeHtml(ticketUrl)}" style="color:#374151;">${escapeHtml(ticketUrl)}</a></p>` : ""}
        <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">Questions about the event? Contact the organiser, ${escapeHtml(orgName)}. If you did not register for this event, you can ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;"><p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    `Hi ${firstName},`,
    "",
    `${status.heading}: ${title}`,
    `Status: ${status.label}`,
    awaitingPayment
      ? "Your place is reserved and awaits payment confirmation by the organiser. This is not a ticket yet."
      : reg.approval_status === "pending" ? "Your application is pending approval by the organiser. This is not a ticket yet." : "",
    "",
    dateText ? `When: ${dateText}` : "",
    venueText ? `Where: ${venueText}` : "",
    joinUrl ? `Join online (personal link, do not share): ${joinUrl}` : "",
    `Name: ${reg.name}`,
    `Reference: ${reference}`,
    approved ? `Ticket code (use at check-in): ${qrValue}` : "",
    "",
    activationUrl
      ? `Set up your Illuxus account: ${activationUrl}\nYour registration is recorded. Set a password to access your Illuxus account, view your tickets, and manage your registrations. No additional registration form is required. The link works once and expires in ${TOKEN_TTL_HOURS} hours.`
      : `Sign in to view your tickets and manage your registrations: ${signInUrl}`,
    "",
    `— ${orgName}`,
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n").trim();

  return { subject, html, text };
}

export function buildActivationEmail(activationUrl: string): { subject: string; html: string; text: string } {
  const subject = "Set up your Illuxus account";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${subject}</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:10px;"><tr><td style="padding:32px;text-align:center;">
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Set up your Illuxus account</p>
      <p style="font-size:14px;line-height:1.55;color:#4b5563;margin:0 0 20px;">Here is a new link to set your password. Your registrations are already recorded — no additional registration form is required.</p>
      <a href="${escapeHtml(activationUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Set Up Your Illuxus Account</a>
      <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">This link works once and expires in ${TOKEN_TTL_HOURS} hours. If you did not ask for it, you can ignore this email.</p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  const text = `Set up your Illuxus account: ${activationUrl}\n\nYour registrations are already recorded. This link works once and expires in ${TOKEN_TTL_HOURS} hours. If you did not ask for it, you can ignore this email.`;
  return { subject, html, text };
}

// ─── Handler ────────────────────────────────────────────────────────────────

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const tooMany = () => reply(429, { ok: false, code: "rate_limited", error: "Too many attempts. Please wait a little and try again." });

export function createHandler(deps: Deps) {
  const { store } = deps;
  const within = async (limit: Limit, key: string) => store.allow(limit[0], await sha256Hex(key), limit[1], limit[2]);

  /** A fresh activation link for the email — or null if it already has an account. */
  async function issueActivation(email: string, registrationId: string | null): Promise<string | null> {
    if (await store.findUserIdByEmail(email)) return null;
    const token = deps.newToken();
    const expires = new Date(deps.now().getTime() + TOKEN_TTL_HOURS * 3600_000).toISOString();
    const stored = await store.replaceToken(email, registrationId, await sha256Hex(token), expires);
    return stored ? `${deps.origin}/activate?token=${token}` : null;
  }

  async function sendConfirmation(event: EventRow, registration: RegistrationRow): Promise<boolean> {
    // A registration that already belongs to an account gets a sign-in link.
    const activationUrl = registration.user_id ? null : await issueActivation(registration.email, registration.id);
    const mail = buildConfirmationEmail({ event, registration, origin: deps.origin, activationUrl });
    const sent = await deps.sendEmail({ to: registration.email, ...mail });
    if (sent.ok) await store.markConfirmationSent(registration.id);
    return sent.ok;
  }

  async function register(body: Record<string, unknown>, ip: string): Promise<Reply> {
    // Hidden field real visitors never see. Bots that fill it get a plausible
    // answer and nothing is saved or sent.
    if (typeof body.website === "string" && body.website.trim()) return reply(200, { ok: true, duplicate: false, status: "pending", reference: null, email_sent: true });

    const parsed = validateRegistration(body);
    if ("errors" in parsed) return reply(400, { ok: false, code: "invalid", errors: parsed.errors });
    const input = parsed.value;

    if (!(await within(LIMITS.registerIp, ip)) || !(await within(LIMITS.registerEmail, input.email))) return tooMany();

    const event = await store.getEvent(input.event_id);
    if (!event || event.status !== "published") return reply(404, { ok: false, code: "not_found", error: "This event is not open for registration." });
    if (isEventOver(event, deps.now())) return reply(409, { ok: false, code: "closed", error: "Registration for this event is closed." });

    // Already registered with this email: nothing new is created. The details
    // are sent to that inbox again (a few times a day at most), so only its
    // owner learns anything.
    const alreadyRegistered = async (existing: RegistrationRow): Promise<Reply> => {
      const emailSent = (await within(LIMITS.detailsEmail, `${existing.event_id}:${existing.email}`))
        ? await sendConfirmation(event, existing)
        : false;
      return reply(200, { ok: true, duplicate: true, email_sent: emailSent });
    };
    const existing = await store.findRegistration(event.id, input.email);
    if (existing) return alreadyRegistered(existing);

    const capacity = Number(event.capacity) || 0;
    if (capacity > 0 && (await store.countGoing(event.id)) >= capacity) {
      return reply(409, { ok: false, code: "full", error: "All tickets for this event have been claimed." });
    }

    const inserted = await store.insertRegistration({
      event_id: event.id,
      email: input.email,
      name: `${input.first_name} ${input.last_name}`.trim(),
      first_name: input.first_name,
      last_name: input.last_name,
      designation: input.designation,
      company: input.company,
      mobile_country_code: input.mobile_country_code,
      mobile_number: input.mobile_number,
      // The database trigger has the final say: approval-required and paid
      // events become 'pending' whatever is sent here.
      approval_status: event.requires_approval || Number(event.price) > 0 ? "pending" : "approved",
      utm: input.utm,
    });
    if ("duplicate" in inserted) {
      // Lost a race with an identical request — treat as already registered.
      const row = await store.findRegistration(event.id, input.email);
      return row ? alreadyRegistered(row) : reply(200, { ok: true, duplicate: true, email_sent: false });
    }
    if ("error" in inserted) return reply(500, { ok: false, code: "save_failed", error: "We could not save your registration. Please try again." });

    // The registration is saved; an email problem from here on never undoes it.
    let emailSent = false;
    try { emailSent = await sendConfirmation(event, inserted.row); } catch { emailSent = false; }

    return reply(200, {
      ok: true,
      duplicate: false,
      status: inserted.row.approval_status,
      reference: registrationReference(inserted.row.id),
      email_sent: emailSent,
    });
  }

  /** Why a token cannot be used, or null if it can. */
  function tokenProblem(token: TokenRow | null): "invalid" | "used" | "expired" | null {
    if (!token) return "invalid";
    if (token.used_at) return "used";
    if (new Date(token.expires_at).getTime() <= deps.now().getTime()) return "expired";
    return null;
  }

  const TOKEN_ERRORS: Record<string, string> = {
    invalid: "This link is not valid. Check that you opened the full link from your email.",
    used: "This link has already been used. Sign in with the password you set, or reset it from the sign-in page.",
    expired: "This link has expired. Ask for a new one below.",
  };

  async function inspect(body: Record<string, unknown>, ip: string): Promise<Reply> {
    if (!(await within(LIMITS.inspectIp, ip))) return tooMany();
    const raw = typeof body.token === "string" ? body.token : "";
    const token = /^[0-9a-f]{64}$/.test(raw) ? await store.findToken(await sha256Hex(raw)) : null;
    const problem = tokenProblem(token);
    if (problem) return reply(200, { ok: true, valid: false, reason: problem, can_resend: problem === "expired" });
    return reply(200, { ok: true, valid: true, email: token!.email });
  }

  async function activate(body: Record<string, unknown>, ip: string): Promise<Reply> {
    const raw = typeof body.token === "string" ? body.token : "";
    if (!(await within(LIMITS.activateIp, ip)) || !(await within(LIMITS.activateToken, raw.slice(0, 64)))) return tooMany();
    if (!/^[0-9a-f]{64}$/.test(raw)) return reply(400, { ok: false, code: "invalid", error: TOKEN_ERRORS.invalid });

    const weak = passwordProblem(body.password);
    if (weak) return reply(400, { ok: false, code: "weak_password", error: weak });

    const token = await store.findToken(await sha256Hex(raw));
    const problem = tokenProblem(token);
    if (problem) return reply(400, { ok: false, code: problem, error: TOKEN_ERRORS[problem], can_resend: problem === "expired" });

    // The link was issued for an email with no account. If one exists now, it
    // belongs to whoever created it — this link must not touch it.
    if (await store.findUserIdByEmail(token!.email)) {
      await store.claimToken(token!.id, deps.now().toISOString());
      return reply(409, { ok: false, code: "account_exists", error: "An account already exists for this email. Sign in, or reset your password from the sign-in page." });
    }

    // Use the link up before creating anything, so two submissions at the
    // same moment cannot both go through.
    if (!(await store.claimToken(token!.id, deps.now().toISOString()))) {
      return reply(400, { ok: false, code: "used", error: TOKEN_ERRORS.used });
    }

    const reg = await store.latestRegistration(token!.email);
    const meta: Record<string, string> = { account_type: "attendee" };
    if (reg) {
      for (const key of ["first_name", "last_name", "designation", "company", "mobile_country_code", "mobile_number"] as const) {
        if (reg[key]) meta[key] = reg[key] as string;
      }
      meta.display_name = reg.name;
    }

    const created = await store.createUser(token!.email, body.password as string, meta);
    if ("error" in created) {
      if (created.exists) return reply(409, { ok: false, code: "account_exists", error: "An account already exists for this email. Sign in, or reset your password from the sign-in page." });
      // Nothing was created, so the link is handed back for another try.
      await store.releaseToken(token!.id);
      return reply(500, { ok: false, code: "create_failed", error: "We could not set up your account. Please try again." });
    }

    // The signup trigger attaches this email's registrations to the account;
    // this repeats it in case the trigger is missing on this database.
    await store.linkRegistrations(token!.email, created.id);
    return reply(200, { ok: true, email: token!.email });
  }

  async function resend(body: Record<string, unknown>, ip: string): Promise<Reply> {
    // One answer for every outcome, so this cannot be used to find out who
    // is registered or who has an account.
    const same = reply(200, { ok: true, message: "If that email has a registration without an account, a new link is on its way." });
    if (!(await within(LIMITS.resendIp, ip))) return tooMany();

    let email = "";
    let registrationId: string | null = null;
    const raw = typeof body.token === "string" ? body.token : "";
    if (/^[0-9a-f]{64}$/.test(raw)) {
      const token = await store.findToken(await sha256Hex(raw));
      // A used link is spent for good; an expired one may be replaced.
      if (!token || token.used_at) return same;
      email = token.email;
      registrationId = token.registration_id;
    } else {
      email = normalizeEmail(body.email);
      const eventId = typeof body.event_id === "string" ? body.event_id : "";
      if (!EMAIL_RE.test(email) || !UUID_RE.test(eventId)) return same;
      const reg = await store.findRegistration(eventId, email);
      if (!reg) return same;
      registrationId = reg.id;
    }

    if (!(await within(LIMITS.resendEmail, email))) return same;
    const url = await issueActivation(email, registrationId);
    if (url) {
      try { await deps.sendEmail({ to: email, ...buildActivationEmail(url) }); } catch { /* same answer either way */ }
    }
    return same;
  }

  return async function handle(body: Record<string, unknown>, ip: string): Promise<Reply> {
    switch (body.action) {
      case "register": return register(body, ip);
      case "inspect": return inspect(body, ip);
      case "activate": return activate(body, ip);
      case "resend": return resend(body, ip);
      default: return reply(400, { ok: false, code: "invalid", error: "Unknown action." });
    }
  };
}

// ─── Supabase-backed store ──────────────────────────────────────────────────

const REG_COLUMNS = "id, event_id, email, name, first_name, last_name, designation, company, mobile_country_code, mobile_number, approval_status, qr_code, join_token, user_id";

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
    async getEvent(id) {
      const { data } = await db.from("events")
        .select("id, title, status, date, end_date, timezone, venue, location, capacity, requires_approval, price, event_format, image_url, banner_landscape_url, organizations:org_id(name, logo_url)")
        .eq("id", id).maybeSingle();
      if (!data) return null;
      const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
      return {
        id: data.id, title: data.title, status: data.status, date: data.date, end_date: data.end_date,
        timezone: data.timezone, venue: data.venue, location: data.location, capacity: data.capacity,
        price: data.price,
        requires_approval: data.requires_approval, event_format: data.event_format,
        banner_url: data.banner_landscape_url || data.image_url || null,
        org_name: org?.name ?? null, org_logo_url: org?.logo_url ?? null,
      };
    },
    async countGoing(eventId) {
      const { count } = await db.from("registrations").select("id", { count: "exact", head: true })
        .eq("event_id", eventId).neq("status", "cancelled").neq("approval_status", "declined").neq("approval_status", "waitlisted");
      return count ?? 0;
    },
    async findRegistration(eventId, email) {
      const { data } = await db.from("registrations").select(REG_COLUMNS).eq("event_id", eventId).ilike("email", email.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
      return data ?? null;
    },
    async latestRegistration(email) {
      const { data } = await db.from("registrations").select(REG_COLUMNS).ilike("email", email.replace(/[\\%_]/g, "\\$&")).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async insertRegistration(row) {
      const { utm, ...fields } = row;
      const { data, error } = await db.from("registrations")
        .insert({ ...fields, ...utm, user_id: null, ticket_type: "general", status: "confirmed" })
        .select(REG_COLUMNS).single();
      if (error) return error.code === "23505" ? { duplicate: true } : { error: error.message };
      return { row: data };
    },
    async markConfirmationSent(registrationId) {
      await db.from("registrations").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", registrationId);
    },
    async findUserIdByEmail(email) {
      const { data, error } = await db.rpc("admin_user_id_by_email", { _email: email });
      // Unknown is treated as "has an account": the safe side is to never
      // issue or honour an activation link when this cannot be checked.
      if (error) return "unknown";
      return (data as string | null) ?? null;
    },
    async replaceToken(email, registrationId, tokenHash, expiresAt) {
      const now = new Date().toISOString();
      await db.from("account_activation_tokens").update({ used_at: now }).eq("email", email).is("used_at", null);
      const { error } = await db.from("account_activation_tokens").insert({ email, registration_id: registrationId, token_hash: tokenHash, expires_at: expiresAt });
      return !error;
    },
    async findToken(tokenHash) {
      const { data } = await db.from("account_activation_tokens").select("id, email, registration_id, expires_at, used_at").eq("token_hash", tokenHash).maybeSingle();
      return data ?? null;
    },
    async claimToken(id, at) {
      const { data } = await db.from("account_activation_tokens").update({ used_at: at }).eq("id", id).is("used_at", null).select("id");
      return Array.isArray(data) && data.length === 1;
    },
    async releaseToken(id) {
      await db.from("account_activation_tokens").update({ used_at: null }).eq("id", id);
    },
    async createUser(email, password, meta) {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
      if (error || !data?.user) {
        const message = error?.message ?? "unknown error";
        return { error: message, exists: /already|registered|exists/i.test(message) };
      }
      return { id: data.user.id };
    },
    async linkRegistrations(email, userId) {
      await db.from("registrations").update({ user_id: userId }).ilike("email", email.replace(/[\\%_]/g, "\\$&")).is("user_id", null);
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
    console[level](JSON.stringify({ level, fn: "guest-registration", msg, ...fields }));
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
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
      const handle = createHandler({ store: supabaseStore(db), sendEmail, now: () => new Date(), newToken: randomToken, origin: siteOrigin() });

      const result = await handle(body, ip);
      log(result.status >= 500 ? "error" : "info", "handled", { action: String(body.action ?? ""), status: result.status, code: result.body.code ?? null });
      return json(result);
    } catch (err) {
      log("error", "unhandled", { error_message: err instanceof Error ? err.message : String(err) });
      return json({ status: 500, body: { ok: false, code: "server_error", error: "Something went wrong. Please try again." } });
    }
  });
}
