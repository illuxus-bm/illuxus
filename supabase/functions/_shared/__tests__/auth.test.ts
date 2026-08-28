/**
 * Regression tests for `_shared/auth.ts` — the authorization primitives that
 * close the P0/P1 edge-function findings.
 *
 * These are not incidental coverage. Each block below pins a specific
 * vulnerability that existed in this repository and must not return:
 *
 *   1. `requireUser` rejects a request with no bearer token, and rejects a
 *      token that resolves to no `auth.users` row. That second case is the
 *      important one: the public anon key shipped in the browser bundle is a
 *      validly-signed JWT, so `verify_jwt = true` admits it. It resolves to
 *      no user, which is the only thing distinguishing it from a real
 *      session.
 *
 *   2. `assertEventAccess` returns 403 (never 404) for a non-existent event,
 *      so responses cannot be used to enumerate which event ids are real.
 *
 *   3. Every predicate FAILS CLOSED. A thrown client error or a Postgres
 *      error must deny access, never fall through to the authorized path.
 *      This is the class of bug that turns a transient DB blip into an
 *      authorization bypass.
 *
 *   4. `assertRegistrationAccess` returns the resolved `eventId` so callers
 *      can scope writes. `create-participant-account` previously updated
 *      every registration matching an email across the whole platform; the
 *      returned id is what constrains that to a single event.
 *
 * The Supabase client is stubbed structurally. `auth.ts` declares its client
 * parameter as a structural type and imports nothing, which is what makes it
 * testable outside Deno.
 */

import { describe, it, expect } from "vitest";

import {
  assertCommunicationAccess,
  assertEventAccess,
  assertOrgAccess,
  assertRegistrationAccess,
  assertRegistrationSelfOrOwner,
  isPlatformAdmin,
  readBearerToken,
  requirePlatformAdmin,
  requireUser,
  type AuthFailure,
  type AuthResult,
  type AuthzResult,
  type MinimalSupabaseClient,
} from "../auth";

// ─── Stub builder ───────────────────────────────────────────────────────────

interface TableFixture {
  /** Row returned by `.maybeSingle()`. `null` means "no row". */
  row?: Record<string, unknown> | null;
  /** Postgres-style error. When set, `.maybeSingle()` resolves with it. */
  error?: { message: string } | null;
  /** When true, the query builder throws instead of resolving. */
  throws?: boolean;
}

/**
 * Self-referential chainable builder. Declared as a named interface because
 * an inline object literal cannot reference itself in its own return types,
 * and `MinimalSupabaseClient.from()` requires a real chainable shape.
 */
interface StubQueryBuilder {
  select(columns?: string): StubQueryBuilder;
  eq(column?: string, value?: unknown): StubQueryBuilder;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
}

/**
 * Minimal chainable stand-in for `supabase.from(...).select(...).eq(...)`.
 * Records nothing — these tests assert on the returned decision, not on the
 * query shape, so that a refactor of the query itself doesn't break them.
 */
/**
 * Builds a stub that structurally satisfies `MinimalSupabaseClient`.
 *
 * The return type is annotated deliberately rather than inferred: it makes
 * `tsc` verify that this stub still matches the interface the production
 * helpers consume. If `MinimalSupabaseClient` gains a method, this file stops
 * compiling instead of the tests passing against a shape that no longer
 * reflects reality.
 */
function makeClient(opts: {
  user?: { id: string; email?: string | null } | null;
  userError?: { message: string } | null;
  authThrows?: boolean;
  tables?: Record<string, TableFixture>;
}): MinimalSupabaseClient {
  const tables = opts.tables ?? {};

  const builderFor = (table: string): StubQueryBuilder => {
    const fixture = tables[table] ?? { row: null };
    if (fixture.throws) {
      throw new Error(`stub: ${table} exploded`);
    }
    // Every chainable method returns the same object, so call order and the
    // exact filter chain are irrelevant to these tests. That is intentional:
    // the assertions are about the authorization DECISION, so a refactor of
    // the underlying query shape should not break them.
    const chain: StubQueryBuilder = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({
          data: fixture.row ?? null,
          error: fixture.error ?? null,
        }),
    };
    return chain;
  };

  return {
    auth: {
      getUser: (_jwt: string) => {
        if (opts.authThrows) return Promise.reject(new Error("network down"));
        return Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.userError ?? null,
        });
      },
    },
    from: (table: string) => builderFor(table),
  };
}

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/fn", { method: "POST", headers });
}

/**
 * Asserts a result is a denial carrying `expectedStatus`.
 *
 * Exists because this project compiles with `strict: false` (hence
 * `strictNullChecks: false`), under which TypeScript does not reliably narrow
 * a boolean-literal discriminated union — `if (!res.ok)` fails to narrow
 * `AuthResult` to `AuthFailure`, so `res.status` is reported as missing.
 *
 * Concentrating the one necessary assertion here keeps every call site both
 * type-clean and more readable than the `expect(...).toBe(false); if (!res.ok)`
 * pair it replaces, and it asserts the status is a real denial code rather
 * than trusting the caller to pass a sensible number.
 */
function expectDenied(
  res: AuthResult | AuthzResult | (AuthzResult & { eventId?: string }),
  expectedStatus: number,
): void {
  expect(res.ok).toBe(false);
  expect((res as AuthFailure).status).toBe(expectedStatus);
}

/** Asserts a result is a grant. Mirror of `expectDenied`. */
function expectGranted(res: AuthResult | AuthzResult): void {
  expect(res.ok).toBe(true);
}

const VIEWER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const EVENT = "33333333-3333-3333-3333-333333333333";

// ─── readBearerToken ────────────────────────────────────────────────────────

describe("readBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(readBearerToken(reqWith({ Authorization: "Bearer abc.def.ghi" }))).toBe(
      "abc.def.ghi",
    );
  });

  it("is case-insensitive on the header name", () => {
    expect(readBearerToken(reqWith({ authorization: "Bearer tok" }))).toBe("tok");
  });

  it("returns empty string when the header is absent", () => {
    expect(readBearerToken(reqWith())).toBe("");
  });

  it("returns empty string for a non-Bearer scheme", () => {
    // A bare `apikey`-style header must not be mistaken for a session.
    expect(readBearerToken(reqWith({ Authorization: "Basic dXNlcjpwYXNz" }))).toBe("");
  });
});

// ─── requireUser ────────────────────────────────────────────────────────────

describe("requireUser", () => {
  it("401s when no Authorization header is present", async () => {
    const res = await requireUser(reqWith(), makeClient({}));
    expectDenied(res, 401);
  });

  it("401s when the token resolves to no user (the anon-key case)", async () => {
    // This is the regression that matters most. `verify_jwt = true` admits
    // the public anon key because it is signed by the project secret, but it
    // maps to no auth.users row. Every service-role function depends on this
    // returning a failure.
    const res = await requireUser(
      reqWith({ Authorization: "Bearer anon-publishable-key" }),
      makeClient({ user: null }),
    );
    expectDenied(res, 401);
  });

  it("401s when getUser reports an error", async () => {
    const res = await requireUser(
      reqWith({ Authorization: "Bearer expired" }),
      makeClient({ user: null, userError: { message: "jwt expired" } }),
    );
    expect(res.ok).toBe(false);
  });

  it("fails closed when the auth call throws", async () => {
    // A network blip talking to the auth server must not fall through into an
    // authorized code path.
    const res = await requireUser(
      reqWith({ Authorization: "Bearer tok" }),
      makeClient({ authThrows: true }),
    );
    expectDenied(res, 401);
  });

  it("resolves the user on a valid session", async () => {
    const res = await requireUser(
      reqWith({ Authorization: "Bearer good" }),
      makeClient({ user: { id: VIEWER, email: "a@b.test" } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.id).toBe(VIEWER);
      expect(res.user.email).toBe("a@b.test");
    }
  });

  it("tolerates a user with no email", async () => {
    const res = await requireUser(
      reqWith({ Authorization: "Bearer good" }),
      makeClient({ user: { id: VIEWER } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.email).toBeNull();
  });
});

// ─── isPlatformAdmin / requirePlatformAdmin ─────────────────────────────────

describe("isPlatformAdmin", () => {
  it("is true when a user_roles admin row exists", async () => {
    const client = makeClient({ tables: { user_roles: { row: { role: "admin" } } } });
    await expect(isPlatformAdmin(client, VIEWER)).resolves.toBe(true);
  });

  it("is false when no admin row exists", async () => {
    const client = makeClient({ tables: { user_roles: { row: null } } });
    await expect(isPlatformAdmin(client, VIEWER)).resolves.toBe(false);
  });

  it("fails closed on a query error", async () => {
    const client = makeClient({
      tables: { user_roles: { row: null, error: { message: "permission denied" } } },
    });
    await expect(isPlatformAdmin(client, VIEWER)).resolves.toBe(false);
  });

  it("fails closed when the query throws", async () => {
    const client = makeClient({ tables: { user_roles: { throws: true } } });
    await expect(isPlatformAdmin(client, VIEWER)).resolves.toBe(false);
  });
});

describe("requirePlatformAdmin", () => {
  it("403s a non-admin", async () => {
    const res = await requirePlatformAdmin(
      makeClient({ tables: { user_roles: { row: null } } }),
      VIEWER,
    );
    expectDenied(res, 403);
  });

  it("allows an admin", async () => {
    const res = await requirePlatformAdmin(
      makeClient({ tables: { user_roles: { row: { role: "admin" } } } }),
      VIEWER,
    );
    expect(res.ok).toBe(true);
  });
});

// ─── assertEventAccess ──────────────────────────────────────────────────────

describe("assertEventAccess", () => {
  it("400s when no event id is supplied", async () => {
    const res = await assertEventAccess(makeClient({}), VIEWER, null);
    expectDenied(res, 400);
  });

  it("allows the event owner without consulting user_roles", async () => {
    const res = await assertEventAccess(
      makeClient({ tables: { events: { row: { user_id: VIEWER } } } }),
      VIEWER,
      EVENT,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.viaAdmin).toBe(false);
  });

  it("allows a platform admin who does not own the event", async () => {
    const res = await assertEventAccess(
      makeClient({
        tables: {
          events: { row: { user_id: OTHER } },
          user_roles: { row: { role: "admin" } },
        },
      }),
      VIEWER,
      EVENT,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.viaAdmin).toBe(true);
  });

  it("403s a caller who is neither owner nor admin", async () => {
    const res = await assertEventAccess(
      makeClient({
        tables: {
          events: { row: { user_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      EVENT,
    );
    expectDenied(res, 403);
  });

  it("403s rather than 404s for a missing event, so ids cannot be enumerated", async () => {
    const res = await assertEventAccess(
      makeClient({ tables: { events: { row: null } } }),
      VIEWER,
      EVENT,
    );
    // A 404 here would confirm "this id does not exist", letting a caller
    // distinguish real ids from fake ones. Must stay 403.
    expectDenied(res, 403);
  });

  it("fails closed when the event lookup throws", async () => {
    const res = await assertEventAccess(
      makeClient({ tables: { events: { throws: true } } }),
      VIEWER,
      EVENT,
    );
    expectDenied(res, 403);
  });
});

// ─── assertRegistrationAccess ───────────────────────────────────────────────

describe("assertRegistrationAccess", () => {
  it("400s when no registration id is supplied", async () => {
    const res = await assertRegistrationAccess(makeClient({}), VIEWER, undefined);
    expectDenied(res, 400);
  });

  it("returns the resolved eventId so callers can scope their writes", async () => {
    // `create-participant-account` uses this id to constrain its
    // registration re-link to one event. Without it, the update swept every
    // registration matching an email platform-wide.
    const res = await assertRegistrationAccess(
      makeClient({
        tables: {
          registrations: { row: { event_id: EVENT } },
          events: { row: { user_id: VIEWER } },
        },
      }),
      VIEWER,
      "reg-1",
    );
    expect(res.ok).toBe(true);
    expect(res.eventId).toBe(EVENT);
  });

  it("403s when the caller does not own the registration's event", async () => {
    const res = await assertRegistrationAccess(
      makeClient({
        tables: {
          registrations: { row: { event_id: EVENT } },
          events: { row: { user_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      "reg-1",
    );
    expectDenied(res, 403);
    // No event id leaks on the failure path.
    expect(res.eventId).toBeUndefined();
  });

  it("403s for an unknown registration", async () => {
    const res = await assertRegistrationAccess(
      makeClient({ tables: { registrations: { row: null } } }),
      VIEWER,
      "nope",
    );
    expectDenied(res, 403);
  });
});

// ─── assertOrgAccess ────────────────────────────────────────────────────────

describe("assertOrgAccess", () => {
  it("400s when no org id is supplied", async () => {
    const res = await assertOrgAccess(makeClient({}), VIEWER, "");
    expectDenied(res, 400);
  });

  it("allows a member", async () => {
    const res = await assertOrgAccess(
      makeClient({ tables: { org_members: { row: { user_id: VIEWER } } } }),
      VIEWER,
      "org-1",
    );
    expect(res.ok).toBe(true);
  });

  it("allows the org owner even with no org_members row", async () => {
    // Owners are not guaranteed to have a membership row, so ownership has
    // to be checked separately or they lose access to their own org.
    const res = await assertOrgAccess(
      makeClient({
        tables: {
          org_members: { row: null },
          organizations: { row: { owner_id: VIEWER } },
        },
      }),
      VIEWER,
      "org-1",
    );
    expect(res.ok).toBe(true);
  });

  it("403s an unrelated caller", async () => {
    const res = await assertOrgAccess(
      makeClient({
        tables: {
          org_members: { row: null },
          organizations: { row: { owner_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      "org-1",
    );
    expectDenied(res, 403);
  });
});

// ─── assertCommunicationAccess ──────────────────────────────────────────────

describe("assertCommunicationAccess", () => {
  it("400s when no communication id is supplied", async () => {
    const res = await assertCommunicationAccess(makeClient({}), VIEWER, null);
    expectDenied(res, 400);
  });

  it("allows a member of the owning org", async () => {
    const res = await assertCommunicationAccess(
      makeClient({
        tables: {
          communications: { row: { org_id: "org-1" } },
          org_members: { row: { user_id: VIEWER } },
        },
      }),
      VIEWER,
      "comm-1",
    );
    expect(res.ok).toBe(true);
  });

  it("403s a caller from a different org (cross-tenant send)", async () => {
    // The regression: send-email / send-communication-email / send-whatsapp
    // all took `communication_id` from the request body under the
    // service-role key with no ownership check, so any caller could fan out
    // another tenant's message to that tenant's recipient list.
    const res = await assertCommunicationAccess(
      makeClient({
        tables: {
          communications: { row: { org_id: "org-other" } },
          org_members: { row: null },
          organizations: { row: { owner_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      "comm-1",
    );
    expectDenied(res, 403);
  });

  it("403s for an unknown communication", async () => {
    const res = await assertCommunicationAccess(
      makeClient({ tables: { communications: { row: null } } }),
      VIEWER,
      "comm-x",
    );
    expectDenied(res, 403);
  });
});

// ─── assertRegistrationSelfOrOwner ──────────────────────────────────────────

describe("assertRegistrationSelfOrOwner", () => {
  it("400s when no registration id is supplied", async () => {
    const res = await assertRegistrationSelfOrOwner(makeClient({}), VIEWER, null);
    expectDenied(res, 400);
  });

  it("allows the attendee on their OWN registration without owning the event", async () => {
    // The regression this helper exists to prevent. `EventRsvpCard.tsx` fires
    // send-ticket-email as the attendee right after RSVP. The attendee does
    // NOT own the event, so the organizer-only check would 403 every
    // attendee's own ticket email. No user_roles fixture is provided here on
    // purpose: the self branch must resolve without any extra lookup.
    const res = await assertRegistrationSelfOrOwner(
      makeClient({
        tables: { registrations: { row: { event_id: EVENT, user_id: VIEWER } } },
      }),
      VIEWER,
      "reg-1",
    );
    expect(res.ok).toBe(true);
    expect(res.isSelf).toBe(true);
    expect(res.eventId).toBe(EVENT);
  });

  it("allows the event owner acting on someone else's registration", async () => {
    // The organizer flows: ImportRegistrationsDialog, AddParticipantDialog,
    // RegistrationsSection approval.
    const res = await assertRegistrationSelfOrOwner(
      makeClient({
        tables: {
          registrations: { row: { event_id: EVENT, user_id: OTHER } },
          events: { row: { user_id: VIEWER } },
        },
      }),
      VIEWER,
      "reg-1",
    );
    expect(res.ok).toBe(true);
    expect(res.isSelf).toBe(false);
    expect(res.eventId).toBe(EVENT);
  });

  it("403s a third party who is neither the attendee nor the organizer", async () => {
    const res = await assertRegistrationSelfOrOwner(
      makeClient({
        tables: {
          registrations: { row: { event_id: EVENT, user_id: OTHER } },
          events: { row: { user_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      "reg-1",
    );
    expectDenied(res, 403);
  });

  it("does not treat a null registration user_id as a self match", async () => {
    // Imported / organizer-added registrations can have user_id NULL before
    // the attendee ever signs in. A null must never satisfy the self branch,
    // otherwise any caller would match it.
    const res = await assertRegistrationSelfOrOwner(
      makeClient({
        tables: {
          registrations: { row: { event_id: EVENT, user_id: null } },
          events: { row: { user_id: OTHER } },
          user_roles: { row: null },
        },
      }),
      VIEWER,
      "reg-1",
    );
    expectDenied(res, 403);
  });

  it("403s for an unknown registration", async () => {
    const res = await assertRegistrationSelfOrOwner(
      makeClient({ tables: { registrations: { row: null } } }),
      VIEWER,
      "nope",
    );
    expectDenied(res, 403);
  });

  it("fails closed when the registration lookup throws", async () => {
    const res = await assertRegistrationSelfOrOwner(
      makeClient({ tables: { registrations: { throws: true } } }),
      VIEWER,
      "reg-1",
    );
    expectDenied(res, 403);
  });
});
