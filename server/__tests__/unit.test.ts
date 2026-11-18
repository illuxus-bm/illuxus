import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { z } from "zod";
import { sessionSettings } from "../db/caller.js";
import { AuthError, callerFromRequest, verifyAccessToken } from "../auth/verify.js";
import { HttpError, route, toHttpError } from "../http.js";
import type { ServerEnv } from "../env.js";
import { serverEnv } from "../env.js";

const USER = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-secret-test-secret-test-secret-0123";

describe("sessionSettings", () => {
  it("runs anonymous visitors as anon with no subject", () => {
    expect(sessionSettings({ kind: "anon" })).toEqual({ role: "anon", sub: "", claims: '{"role":"anon"}' });
  });
  it("runs signed-in people as authenticated with their id", () => {
    const s = sessionSettings({ kind: "user", userId: USER, claims: { email: "a@b.c", role: "service_role" } });
    expect(s.role).toBe("authenticated");
    expect(s.sub).toBe(USER);
    // A token can't promote itself: role is always overwritten.
    expect(JSON.parse(s.claims)).toEqual({ email: "a@b.c", role: "authenticated", sub: USER });
  });
  it("refuses a subject that isn't a UUID", () => {
    expect(() => sessionSettings({ kind: "user", userId: "x'; drop table", claims: {} })).toThrow(/UUID/);
  });
});

describe("serverEnv", () => {
  it("derives the issuer and keys URL from SUPABASE_URL", () => {
    const env = serverEnv({ DATABASE_URL: "postgresql://u@h/db", SUPABASE_URL: "https://abc.supabase.co/" } as NodeJS.ProcessEnv);
    expect(env.AUTH_ISSUER).toBe("https://abc.supabase.co/auth/v1");
    expect(env.AUTH_JWKS_URL).toBe("https://abc.supabase.co/auth/v1/.well-known/jwks.json");
    expect(env.DATABASE_POOL_MAX).toBe(3);
  });
  it("names the missing setting without printing values", () => {
    expect(() => serverEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});

describe("verifyAccessToken", () => {
  let server: Server;
  let env: ServerEnv;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey as CryptoKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
    server = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    env = {
      DATABASE_URL: "postgresql://u@h/db", DATABASE_POOL_MAX: 3, AUTH_AUDIENCE: "authenticated",
      AUTH_ISSUER: "https://abc.supabase.co/auth/v1", AUTH_JWKS_URL: `http://127.0.0.1:${port}/jwks`, AUTH_JWT_SECRET: SECRET,
    };
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const es256 = (claims: Record<string, unknown>, exp = "5m") =>
    new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer(env.AUTH_ISSUER!)
      .setAudience("authenticated").setSubject(USER).setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const hs256 = (aud = "authenticated", secret = SECRET) =>
    new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(env.AUTH_ISSUER!).setAudience(aud)
      .setSubject(USER).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(secret));

  it("accepts a token signed with the project's published keys", async () => {
    expect((await verifyAccessToken(await es256({ email: "a@b.c" }), env)).sub).toBe(USER);
  });
  it("accepts a legacy HS256 token while a secret is configured", async () => {
    expect((await verifyAccessToken(await hs256(), env)).sub).toBe(USER);
  });
  it("refuses expired tokens, other audiences, wrong secrets and garbage", async () => {
    await expect(verifyAccessToken(await es256({}, "-1m"), env)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyAccessToken(await hs256("someone-else"), env)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyAccessToken(await hs256("authenticated", "x".repeat(40)), env)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyAccessToken("not.a.jwt", env)).rejects.toBeInstanceOf(AuthError);
  });
  it("refuses HS256 when no secret is configured", async () => {
    await expect(verifyAccessToken(await hs256(), { ...env, AUTH_JWT_SECRET: undefined })).rejects.toThrow(/HS256/);
  });
  it("treats no Authorization header as anonymous, and a bad one as an error", async () => {
    expect(await callerFromRequest(new Headers(), env)).toEqual({ kind: "anon" });
    await expect(callerFromRequest(new Headers({ authorization: "Basic abc" }), env)).rejects.toBeInstanceOf(AuthError);
    const caller = await callerFromRequest(new Headers({ authorization: `Bearer ${await es256({})}` }), env);
    expect(caller).toMatchObject({ kind: "user", userId: USER });
  });
});

describe("toHttpError", () => {
  it("maps failures to safe statuses", () => {
    expect(toHttpError(new HttpError(418, "x")).status).toBe(418);
    expect(toHttpError(new AuthError("bad")).status).toBe(401);
    expect(toHttpError(z.object({ a: z.string() }).safeParse({}).error).status).toBe(400);
    expect(toHttpError({ code: "P2025" }).status).toBe(404);
    expect(toHttpError({ code: "P2002" }).status).toBe(409);
    expect(toHttpError(new Error('new row violates row-level security policy for table "x"')).status).toBe(403);
    expect(toHttpError(new Error("connect ECONNREFUSED")).status).toBe(503);
    const internal = toHttpError(new Error("relation secret_table does not exist"));
    expect([internal.status, internal.message]).toEqual([500, "Something went wrong"]);
  });
});

describe("route", () => {
  const handler = route("test", {
    GET: async ({ url }) => ({ echo: url.searchParams.get("q") }),
    POST: async () => { throw new Error("database password is hunter2"); },
  });
  // The route's log lines aren't what these tests check.
  const quiet = <T>(fn: () => Promise<T>) => {
    const spies = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    return fn().finally(() => spies.forEach((s) => s.mockRestore()));
  };

  it("returns data with a request id and CORS for the app's origins", async () => {
    const res = await quiet(() => handler(new Request("https://illuxus.com/api/x?q=hi", { headers: { origin: "capacitor://localhost" } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { echo: "hi" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
  it("gives other origins no CORS access", async () => {
    const res = await quiet(() => handler(new Request("https://illuxus.com/api/x", { headers: { origin: "https://evil.example" } })));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("answers preflight and refuses unknown methods", async () => {
    expect((await quiet(() => handler(new Request("https://illuxus.com/api/x", { method: "OPTIONS" })))).status).toBe(204);
    expect((await quiet(() => handler(new Request("https://illuxus.com/api/x", { method: "DELETE" })))).status).toBe(405);
  });
  it("never leaks an internal error's message", async () => {
    const res = await quiet(() => handler(new Request("https://illuxus.com/api/x", { method: "POST" })));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });
});
