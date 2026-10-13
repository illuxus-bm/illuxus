/**
 * Client side of guest registration: registering for an event without an
 * account, and setting a password afterwards from the emailed link. All of
 * the rules are enforced by the `guest-registration` edge function; what is
 * here only talks to it and gives quick feedback while typing.
 */
import { supabase } from "@/integrations/supabase/client";
import type { UtmParams } from "@/lib/utm";

export interface GuestFields {
  first_name: string;
  last_name: string;
  email: string;
  mobile_country_code: string;
  mobile_number: string;
  company: string;
  designation: string;
}

export type GuestFieldErrors = Partial<Record<keyof GuestFields | "consent" | "event_id", string>>;

export interface GuestConfirmation {
  /** Registered before with this email — nothing new was created. */
  duplicate: boolean;
  status: "approved" | "pending" | "waitlisted" | "declined" | null;
  reference: string | null;
  email: string;
  emailSent: boolean;
}

export interface GuestReply {
  status: number;
  body: Record<string, unknown>;
}

/** Same checks as the server, for immediate feedback. The server decides. */
export function validateGuestFields(fields: GuestFields, consent: boolean): GuestFieldErrors {
  const errors: GuestFieldErrors = {};
  const email = fields.email.trim();
  if (!fields.first_name.trim()) errors.first_name = "Enter your first name.";
  if (!fields.last_name.trim()) errors.last_name = "Enter your last name.";
  if (!/^[^\s@,;<>"*%\\]+@[^\s@,;<>"*%\\]+\.[^\s@,;<>"*%\\]{2,}$/.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  if (!/^\+\d{1,4}$/.test(fields.mobile_country_code)) errors.mobile_country_code = "Choose a country code.";
  if (!/^\d{6,15}$/.test(fields.mobile_number.replace(/[\s()-]/g, ""))) errors.mobile_number = "Enter a valid mobile number.";
  if (!fields.company.trim()) errors.company = "Enter your company.";
  if (!fields.designation.trim()) errors.designation = "Enter your designation.";
  if (!consent) errors.consent = "Please agree to the terms to register.";
  return errors;
}

/** Why this password cannot be used, or null. Mirrors the server rule. */
export function passwordFormProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use a mix of letters and numbers.";
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

/** Calls the edge function and returns its answer whatever the HTTP status. */
export async function callGuestRegistration(body: Record<string, unknown>): Promise<GuestReply> {
  const { data, error } = await supabase.functions.invoke("guest-registration", { body });
  if (!error) return { status: 200, body: (data ?? {}) as Record<string, unknown> };
  // Non-2xx answers arrive as an error carrying the real response.
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    try {
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    } catch { /* fall through */ }
  }
  return { status: 0, body: { ok: false, code: "unreachable", error: "We could not reach the registration service. Check your connection and try again." } };
}

export async function registerGuest(args: {
  eventId: string;
  fields: GuestFields;
  utm: UtmParams;
  /** Hidden field; real visitors leave it empty. */
  website: string;
}): Promise<{ ok: true; confirmation: GuestConfirmation } | { ok: false; error: string; fieldErrors?: GuestFieldErrors }> {
  const reply = await callGuestRegistration({
    action: "register",
    event_id: args.eventId,
    ...args.fields,
    consent: true,
    utm: args.utm,
    website: args.website,
  });
  const b = reply.body;
  if (b.ok === true) {
    return {
      ok: true,
      confirmation: {
        duplicate: b.duplicate === true,
        status: (typeof b.status === "string" ? b.status : null) as GuestConfirmation["status"],
        reference: typeof b.reference === "string" ? b.reference : null,
        email: args.fields.email.trim().toLowerCase(),
        emailSent: b.email_sent === true,
      },
    };
  }
  // The service itself is missing (not deployed on this backend yet).
  if (reply.status === 404 && b.code === "NOT_FOUND") {
    return { ok: false, error: "Registering without an account isn't available right now. Please sign in to register." };
  }
  return {
    ok: false,
    error: typeof b.error === "string" ? b.error : "We could not complete your registration. Please check the form and try again.",
    fieldErrors: (b.errors as GuestFieldErrors | undefined) ?? undefined,
  };
}

// The confirmation is kept for the tab so a refresh shows it again instead of
// an empty form. It holds nothing but what the visitor just saw.
const confirmationKey = (eventId: string) => `guest-registration:${eventId}`;

export function loadGuestConfirmation(eventId: string): GuestConfirmation | null {
  try {
    const raw = window.sessionStorage.getItem(confirmationKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestConfirmation>;
    if (typeof parsed.email !== "string") return null;
    return {
      duplicate: parsed.duplicate === true,
      status: (parsed.status ?? null) as GuestConfirmation["status"],
      reference: typeof parsed.reference === "string" ? parsed.reference : null,
      email: parsed.email,
      emailSent: parsed.emailSent === true,
    };
  } catch {
    return null;
  }
}

export function storeGuestConfirmation(eventId: string, confirmation: GuestConfirmation | null): void {
  try {
    if (confirmation) window.sessionStorage.setItem(confirmationKey(eventId), JSON.stringify(confirmation));
    else window.sessionStorage.removeItem(confirmationKey(eventId));
  } catch { /* storage unavailable — the page still works */ }
}
