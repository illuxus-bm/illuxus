import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

import {
  callGuestRegistration, loadGuestConfirmation, passwordFormProblem, registerGuest, storeGuestConfirmation, validateGuestFields,
  type GuestFields,
} from "@/lib/guest-registration";

const fields: GuestFields = {
  first_name: "Asha", last_name: "Rao", email: " Asha.Rao@Example.com ", mobile_country_code: "+91", mobile_number: "98765 43210", company: "Acme", designation: "Director",
};

beforeEach(() => { invoke.mockReset(); window.sessionStorage.clear(); });

describe("guest registration form checks", () => {
  it("accepts a complete form", () => {
    expect(validateGuestFields(fields, true)).toEqual({});
  });

  it("names each missing or malformed field, and requires consent", () => {
    const errors = validateGuestFields({ ...fields, first_name: " ", email: "nope", mobile_number: "12", mobile_country_code: "91" }, false);
    expect(Object.keys(errors).sort()).toEqual(["consent", "email", "first_name", "mobile_country_code", "mobile_number"]);
  });

  it("checks the password and its confirmation", () => {
    expect(passwordFormProblem("short1", "short1")).toMatch(/8 characters/);
    expect(passwordFormProblem("lettersonly", "lettersonly")).toMatch(/letters and numbers/);
    expect(passwordFormProblem("good pass 1", "good pass 2")).toMatch(/do not match/);
    expect(passwordFormProblem("good pass 1", "good pass 1")).toBeNull();
  });
});

describe("talking to the registration service", () => {
  it("sends the form, attribution and consent — and no credentials", async () => {
    invoke.mockResolvedValue({ data: { ok: true, duplicate: false, status: "pending", reference: "ILX-ABCDEF12", email_sent: true }, error: null });
    const result = await registerGuest({ eventId: "event-1", fields, utm: { utm_source: "partner-a" }, website: "" });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe("guest-registration");
    expect(options.body).toMatchObject({ action: "register", event_id: "event-1", consent: true, utm: { utm_source: "partner-a" }, first_name: "Asha" });
    expect(Object.keys(options.body)).not.toContain("password");

    expect(result).toEqual({
      ok: true,
      confirmation: { duplicate: false, status: "pending", reference: "ILX-ABCDEF12", email: "asha.rao@example.com", emailSent: true },
    });
  });

  it("surfaces the server's field errors", async () => {
    const response = new Response(JSON.stringify({ ok: false, code: "invalid", errors: { email: "Enter a valid email address." } }), { status: 400 });
    invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: response } });
    const result = await registerGuest({ eventId: "event-1", fields, utm: {}, website: "" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: "Enter a valid email address." } });
  });

  it("reports an unreachable service without throwing", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const reply = await callGuestRegistration({ action: "inspect", token: "x" });
    expect(reply.status).toBe(0);
    expect(reply.body).toMatchObject({ ok: false, code: "unreachable" });
  });
});

describe("the confirmation kept for the tab", () => {
  it("round-trips per event and can be cleared", () => {
    const confirmation = { duplicate: false, status: "approved" as const, reference: "ILX-1", email: "a@b.co", emailSent: true };
    storeGuestConfirmation("event-1", confirmation);
    expect(loadGuestConfirmation("event-1")).toEqual(confirmation);
    expect(loadGuestConfirmation("event-2")).toBeNull();
    storeGuestConfirmation("event-1", null);
    expect(loadGuestConfirmation("event-1")).toBeNull();
  });

  it("ignores anything unreadable", () => {
    window.sessionStorage.setItem("guest-registration:event-1", "{not json");
    expect(loadGuestConfirmation("event-1")).toBeNull();
    window.sessionStorage.setItem("guest-registration:event-1", JSON.stringify({ status: "approved" }));
    expect(loadGuestConfirmation("event-1")).toBeNull();
  });
});
