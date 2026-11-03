import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/friendly-error";

describe("friendlyError", () => {
  it("passes through messages written for people", () => {
    expect(friendlyError({ code: "P0001", message: "Not a moderator" })).toBe("Not a moderator");
    expect(friendlyError(new Error("Your request is already waiting for a decision"))).toBe(
      "Your request is already waiting for a decision",
    );
    expect(friendlyError({ code: "42501", message: "Only a platform admin can change a ban" })).toBe(
      "Only a platform admin can change a ban",
    );
  });

  it("hides Postgres internals", () => {
    expect(
      friendlyError({ code: "23505", message: 'duplicate key value violates unique constraint "registrations_event_email_unique"' }),
    ).toBe("This already exists.");
    expect(friendlyError({ code: "42501", message: 'new row violates row-level security policy for table "events"' })).toBe(
      "You don't have permission to do that.",
    );
    expect(friendlyError({ code: "42703", message: 'column events.foo does not exist' })).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(friendlyError({ code: "PGRST202", message: "Could not find the function public.x in the schema cache" })).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(friendlyError({ code: "22P02", message: 'invalid input syntax for type uuid: "abc"' })).toBe(
      "Some of the values entered aren't valid.",
    );
  });

  it("maps network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("Network problem. Check your connection and try again.");
  });

  it("uses the fallback when there is no message", () => {
    expect(friendlyError(null, "Could not save")).toBe("Could not save");
    expect(friendlyError({}, "Could not save")).toBe("Could not save");
    expect(friendlyError(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("never shows more than the first line", () => {
    expect(friendlyError(new Error("Boom\n    at foo (file.ts:1:1)"))).toBe("Boom");
  });
});
